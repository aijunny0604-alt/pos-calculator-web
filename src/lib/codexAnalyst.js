import { navigationBlocked } from './movisReliability';
import { POS_WORKFLOW_TOOLS, POS_WORKFLOWS, preparePosWorkflow } from './movisPosWorkflows';
import { GEMINI_TOOLS, WRITE_TOOLS, executeTool } from './geminiTools';
import { MOVIS_DATA_TOOLS, executeDataTool } from './movisDataTools';
import { validateArguments, validatePending, validateIntent, MUTATION_INTENTS, verifyWork } from './movisValidation';
import { capturePreconditions } from './movisActionGuard';
import { checkToolData } from './movisToolData';
import { listMovisImages } from './movisLibraries';
import { fetchMovis } from './movisTransport';
import { selectMovisModel } from './movisModels';
import { MOVIS_STORE_TOOLS, executeMovisStoreTool, fetchStoreQuestions, fetchStoreSettlements, fetchMovisFinanceDetails } from './movisStoreTools';
export function getMovisModel() {
  return localStorage.getItem('movis_model_v2') || 'auto';
}
export function setMovisModel(model) {
  localStorage.setItem('movis_model_v2', model);
  clearMovisThread();
}
export function clearMovisThread() {
  sessionStorage.removeItem('movis_thread_v2');
}
export async function movisRequest(route, body, signal) {
  try {
    const res = await fetchMovis(route, body, signal || AbortSignal.timeout(60000));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'MOVIS 연결 오류');
    return data;
  } catch (error) {
    if (error.name === 'TypeError' || error.name === 'TimeoutError') throw new Error('매장 PC 연결 프로그램에 접속하지 못했습니다. MOVE POS (자동 연결) 바로가기로 열어주세요. 웹 주소에서는 브라우저의 로컬 네트워크 접근 허용도 확인해주세요.');
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
  } : t), ...MOVIS_DATA_TOOLS, ...POS_WORKFLOW_TOOLS, ...MOVIS_STORE_TOOLS, { name: 'listAvailableTools', description: '현재 연결된 전체 POS 도구와 변경 확인 필요 여부를 조회합니다. 도구가 없다고 답하기 전에 확인하세요. 자료 조회 권한과 수정 기능은 서로 다릅니다.', parameters: { type: 'object', properties: {} } }];
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
    const preference = getMovisModel();
    const state = await movisRequest('status', undefined, options.signal);
    if (!state.connected) throw new Error('ChatGPT 계정 연결이 필요합니다. 연결 설정을 확인해주세요.');
    const selected = selectMovisModel(state.models, preference);
    if (!selected) throw new Error('선택한 모델을 현재 계정에서 찾지 못했습니다. 모델을 자동 선택으로 바꾸거나 목록에서 다시 선택해주세요.');
    const res = await fetchMovis('turn', {
      requestKey, question, tools, threadId, model:selected.model, history:options.history||[],
      actions:(options.history||[]).filter(m=>m.role==='system').slice(-20), dataState:context.dataState||{}, image:options.image
    },options.signal);
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
            const storeEvidence = name === 'prepareStoreReorder' && !calls.some(c => c.result?.ok && (args.operation === 'add' ? c.name === 'getStoreShortages' && c.result.data.items.some(r => r.productId === args.productId) : c.name === 'getStoreReorders' && c.result.data.items.some(r => r.key === args.key)));
            output = navigationBlocked(name, calls) || checkToolData(name, context) || (storeEvidence ? { ok: false, error: '변경할 정확한 품절 상품 또는 재주문 항목을 먼저 조회하세요.' } : null) || (name === 'listAvailableTools' ? { ok: true, data: { tools: tools.map(t => ({ name: t.name, description: t.description, requiresConfirmation: WRITE_TOOLS.has(t.name) || !!POS_WORKFLOWS[t.name] || t.name === 'prepareStoreReorder' })), note: '이 목록은 실제 전달된 도구입니다. 미구현 작업은 임의 SQL이나 다른 작업으로 대체하지 마세요.' } } : name === 'verifyWork' ? verifyWork(calls, context) : name === 'listImageFiles' ? await listMovisImages(args, options.signal) : name === 'getStoreQuestions' ? await fetchStoreQuestions(args) : name === 'getStoreSettlements' ? await fetchStoreSettlements(args) : name === 'getStoreFinanceDetails' ? await fetchMovisFinanceDetails(args) : executeMovisStoreTool(name, args, context) || preparePosWorkflow(name, args, context) || executeDataTool(name, args, context) || (await executeTool(name, args, {
              ...context,
              question,
              enforceLegacyIntent: false
            })));
            if (name === 'listImageFiles' && output.ok) context.storageFiles = [...(context.storageFiles || []), ...output.data.records];
            if (POS_WORKFLOWS[name] && output?.data?.__pending && !calls.some(c => ['readLibrary', 'getRecord'].includes(c.name) && c.args?.library === POS_WORKFLOWS[name].library && c.result?.ok)) output = { ok: false, error: `변경 전에 readLibrary(${POS_WORKFLOWS[name].library})로 해당 원본을 조회하세요.` };
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
