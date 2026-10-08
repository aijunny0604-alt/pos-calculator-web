import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture } from './movis-fixtures.mjs';
mkdirSync('tests/.artifacts', {
  recursive: true
});
const storage = () => {
  const m = new Map();
  return {
    getItem: k => m.get(k) || null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
await build({
  entryPoints: ['src/lib/codexAnalyst.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'tests/.artifacts/engine.mjs',
  logLevel: 'silent'
});
const {
  askCodex
} = await import('./.artifacts/engine.mjs');
const results = [];
for (const question of ['스텐 밴딩 54-30 현재 몇 개 있어? 재고하고 JSR 미입고를 각각 확인해줘. 아직 발주하거나 재고 바꾸지 마. 짧게 답해줘.', '그거 도매가로 세 개 팔면 얼마야? 방금 말한 제품 기준으로 계산만 하고 주문 등록은 하지 마.']) {
  console.log('REQUEST', question);
  const r = await askCodex(question, fixture, {
    onProgress: c => console.log('TOOL', c.name),
    signal: AbortSignal.timeout(180000)
  });
  console.log('ANSWER', r.answer);
  console.log('MODEL', r.model, 'CHECK', r.verification.status);
  results.push({
    question,
    answer: r.answer,
    model: r.model,
    tools: r.toolCalls.map(c => ({
      name: c.name,
      ok: c.result?.ok
    })),
    verification: r.verification
  });
  if (r.toolCalls.some(c => c.result?.data?.__pending)) throw Error('조회 요청에서 변경 미리보기가 생성됐습니다.');
}
writeFileSync('tests/.artifacts/live-results.json', JSON.stringify(results, null, 2));
