// 수동 실행: 실제 매장 자료나 브라우저 저장소를 건드리지 않는 가상 품절 시나리오.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,String(v)), removeItem: k => map.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
localStorage.setItem('movis_model_v2', 'gpt-6.1-sol');
mkdirSync('tests/.artifacts', { recursive: true });
await build({ entryPoints: ['src/lib/codexAnalyst.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.artifacts/store-engine.mjs', logLevel: 'silent' });
const { askCodex } = await import('./.artifacts/store-engine.mjs');
const context = { externalProducts: [{ channel_product_no: '987654', name: '가상 테스트 자바라', status_type: 'SALE', synced_at: new Date().toISOString(), options: [{ id: 'x', name: '가상 63', stock: 0 }] }], dataState: { externalProducts: { status: 'loaded', coverage: 'complete' } } };
const result = await askCodex('가상 테스트 자바라의 품절 옵션을 조회하고 재주문 목록에 담는 확인안을 만들어줘. 실제 적용하지 마.', context, { onProgress: c => console.log('도구:', c.name), signal: AbortSignal.timeout(180000) });
console.log('모델:', result.model);
console.log('답변:', result.answer);
const pending = result.toolCalls.filter(c => c.result?.ok && c.result.data?.action === 'storeReorder');
if (result.model !== 'gpt-6.1-sol' || pending.length !== 1 || pending[0].result.data.params.after[0]?.option !== '가상 63' || localStorage.getItem('move-store-reorder-v1') !== null) throw Error('가상 품절 조회·확인안 검증 실패');
console.log('가상 품절 확인안 검증 통과');
