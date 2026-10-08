import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
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
  outfile: 'tests/.artifacts/vision-engine.mjs',
  logLevel: 'silent'
});
const {
  askCodex
} = await import('./.artifacts/vision-engine.mjs');
const image = 'data:image/png;base64,' + readFileSync('tests/.artifacts/movis-1366.png').toString('base64');
const r = await askCodex('첨부 화면의 프로그램 이름과 한국어 작업 버튼 세 개의 이름을 읽어줘. 화면에서 보이는 것만 짧게 말해줘.', fixture, {
  image,
  signal: AbortSignal.timeout(120000)
});
console.log(r.answer);
writeFileSync('tests/.artifacts/vision-result.json', JSON.stringify({
  model: r.model,
  answer: r.answer
}, null, 2));
if (!/MOVIS/i.test(r.answer) || !r.answer.includes('매장 브리핑') || !r.answer.includes('발주 판단') || !r.answer.includes('정산 점검')) throw Error('이미지 판독 검증 실패');
