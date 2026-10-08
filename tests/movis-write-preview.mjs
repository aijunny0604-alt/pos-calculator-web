import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fixture } from './movis-fixtures.mjs';
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
  outfile: 'tests/.artifacts/write-engine.mjs',
  logLevel: 'silent'
});
const {
  askCodex
} = await import('./.artifacts/write-engine.mjs');
const result = await askCodex('JSR에 발주했던 스텐 밴딩 54-30 10개가 실제로 방금 도착했어. 현재 재고에 10개 더하는 미리보기를 만들어줘. 내가 확인하기 전에는 적용하지 마. 판매 주문이 아니야.', fixture, {
  onProgress: c => console.log('TOOL', c.name),
  signal: AbortSignal.timeout(180000)
});
const pending = result.toolCalls.filter(c => c.result?.data?.__pending);
console.log(result.answer);
console.log('PENDING', JSON.stringify(pending.map(c => ({
  tool: c.name,
  intent: c.result.data.businessIntent,
  params: c.result.data.params,
  preconditions: c.result.data.preconditions
}))));
writeFileSync('tests/.artifacts/write-preview.json', JSON.stringify({
  answer: result.answer,
  tools: result.toolCalls.map(c => ({
    name: c.name,
    ok: c.result.ok,
    error: c.result.error
  })),
  pending: pending.map(c => c.result.data)
}, null, 2));
if (pending.length !== 1 || pending[0].result.data.action !== 'updateProductStock' || pending[0].result.data.params.newStock !== 14) throw Error('입고/발주/재고 계산 시나리오 검증 실패');
