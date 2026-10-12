import { GEMINI_TOOLS, WRITE_TOOLS, executeTool } from './geminiTools';
import { MOVIS_DATA_TOOLS, executeDataTool } from './movisDataTools';
import { validateArguments, validatePending, validateIntent, MUTATION_INTENTS, verifyWork } from './movisValidation';
import { capturePreconditions } from './movisActionGuard';
import { checkToolData } from './movisToolData';
import { listMovisImages } from './movisLibraries';
const ENDPOINT = 'http://127.0.0.1:43127/api/movis';
let sessionToken;
export function getMovisModel() {
  return localStorage.getItem('movis_model_v2') || 'gpt-6-astra';
}
export function setMovisModel(model) {
  localStorage.setItem('movis_model_v2', model);
  clearMovisThread();
}
export function clearMovisThread() {
  sessionStorage.removeItem('movis_thread_v2');
}
async function headers() {
  if (!sessionToken) {
    const res = await fetch(`${ENDPOINT}/session`, {
      headers: {
        'X-Movis-Client': 'pos'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('매장 PC의 MOVIS 실행 바로가기로 열어주세요.');
    sessionToken = (await res.json()).token;
  }
  return {
    Authorization: `Bearer ${sessionToken}`,
    'Content-Type': 'application/json'
  };
}
export async function movisRequest(route, body, signal) {
  try {
    const res = await fetch(`${ENDPOINT}/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: await headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal || AbortSignal.timeout(60000)
    });
    if (res.status === 401) sessionToken = null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'MOVIS 연결 오류');
    return data;
  } catch (error) {
    if (error.name === 'TypeError') throw new Error('매장 PC 연결 프로그램이 꺼져 있습니다. MOVIS 실행 바로가기를 열어주세요.');
    throw error;
  }
}
export async function askCodex(question, context, options = {}) {
  const tools = [...GEMINI_TOOLS.map(t => WRITE_TOOLS.has(t.name) ? {
    ...t,
    parameters: {
      ...t.parameters,
      properties: {
        ...t.parameters.properties,
        businessIntent: {
          type: 'string',
          enum: MUTATION_INTENTS,
          description: '사용자가 요청한 업무 목적. 발주/판매/입고/재고정정을 구분한다.'
        }
      },
      required: [...(t.parameters.required || []), 'businessIntent']
    }
  } : t), ...MOVIS_DATA_TOOLS];
  const byName = new Map(tools.map(t => [t.name, t]));
  const calls = [],
    seenPending = new Set();
  const requestKey = crypto.randomUUID();
  const onAbort = () => {
    movisRequest('cancel', {
      requestKey
    }).catch(() => {});
  };
  options.signal?.addEventListener('abort', onAbort, {
    once: true
  });
  let threadId = sessionStorage.getItem('movis_thread_v2'),
    completed = false,
    result;
  try {
    const res = await fetch(`${ENDPOINT}/turn`, {
      method: 'POST',
      headers: await headers(),
      signal: options.signal,
      body: JSON.stringify({
        requestKey,
        question,
        tools,
        threadId,
        model: getMovisModel(),
        history: options.history || [],
        actions: (options.history || []).filter(m => m.role === 'system').slice(-20),
        dataState: context.dataState || {},
        image: options.image
      })
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || '연결에 실패했습니다.');
    }
    const reader = res.body.getReader(),
      decoder = new TextDecoder();
    let buffer = '';
    async function consume(line) {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'thread') {
        threadId = event.threadId;
        sessionStorage.setItem('movis_thread_v2', threadId);
      }
      if (event.type === 'delta') options.onDelta?.(event.text, event.itemId);
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'cancelled') throw new DOMException('중지됨', 'AbortError');
      if (event.type === 'tool') {
        const {
          name,
          args,
          requestId
        } = event;
        options.onProgress?.({
          name,
          args
        });
        let output;
        const definition = byName.get(name);
        const errors = definition ? validateArguments(args, definition.parameters) : ['허용되지 않은 도구입니다.'];
        if (definition && WRITE_TOOLS.has(name)) errors.push(...validateIntent(name, args?.businessIntent, args));
        if (errors.length) output = {
          ok: false,
          error: errors.join('\n')
        };else {
          try {
            output = checkToolData(name, context) || (name === 'verifyWork' ? verifyWork(calls, context) : name === 'listImageFiles' ? await listMovisImages(args, options.signal) : executeDataTool(name, args, context) || (await executeTool(name, args, {
              ...context,
              question,
              enforceLegacyIntent: false
            })));
            if (name === 'listImageFiles' && output.ok) context.storageFiles = [...(context.storageFiles || []), ...output.data.records];
            output = validatePending(output, calls);
            if (output?.data?.__pending) {
              const signature = name + JSON.stringify(output.data.params);
              if (seenPending.has(signature)) output = {
                ok: false,
                error: '동일한 변경 미리보기가 이미 대기 중입니다. 중복 요청하지 마세요.'
              };else {
                seenPending.add(signature);
                output.data.preconditions = capturePreconditions(output.data, context);
                output.data.businessIntent = args.businessIntent;
              }
            }
          } catch (error) {
            output = {
              ok: false,
              error: error.message
            };
          }
        }
        calls.push({
          name,
          args,
          result: output
        });
        await movisRequest('tool', {
          requestKey,
          requestId,
          result: output
        }, options.signal);
      }
      if (event.type === 'done') {
        completed = true;
        result = {
          answer: event.answer,
          model: event.model,
          threadId,
          provider: 'codex',
          toolCalls: calls,
          iterations: calls.length,
          verification: verifyWork(calls, context).data
        };
      }
    }
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), {
        stream: !chunk.done
      });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) await consume(line);
      if (chunk.done) break;
    }
    if (buffer.trim()) await consume(buffer);
    if (!completed || !result?.answer?.trim()) throw new Error('답변이 끝나기 전에 연결이 종료되었습니다. 다시 요청하세요.');
    return result;
  } catch (error) {
    onAbort();
    if (error.name === 'TypeError') throw new Error('MOVIS PC 연결을 확인해주세요. 유료 API로 자동 전환하지 않습니다.');
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}
