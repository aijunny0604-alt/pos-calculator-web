from pathlib import Path
import sys
if len(sys.argv) != 3:
    raise SystemExit('사용법: python bridge/prepare-naver-delivery-sync.py 기존-sync.js 새-sync.js')
source, target = (Path(arg) for arg in sys.argv[1:])
if source.resolve() == target.resolve() or target.exists():
    raise SystemExit('원본을 덮어쓰지 않도록 새 출력 파일 경로를 지정하세요.')
data = source.read_bytes()
newline = b'\r\n' if b'\r\n' in data else b'\n'
def replace_once(old, new):
    global data
    old = old.encode('utf8').replace(b'\n', newline)
    new = new.encode('utf8').replace(b'\n', newline)
    if data.count(old) != 1:
        raise RuntimeError(f'Expected exactly one source anchor: {old[:90]!r}')
    data = data.replace(old,new,1)
replace_once("import { fileURLToPath } from 'url';", "import { fileURLToPath } from 'url';\nimport { createDeliveryRefresher } from './naver-delivery-refresh.mjs';")
replace_once("async function sbDelete(table, filter) {", """// 상태 변경 후에도 최신 상품 상세만 갱신하며, 동시에 수정된 행은 건드리지 않는다.
async function patchDeliveryCas(item, patch) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/external_order_items`);
  url.searchParams.set('id', `eq.${item.id}`);
  url.searchParams.set('external_order_id', `eq.${item.external_order_id}`);
  url.searchParams.set('provider_product_order_id', `eq.${item.provider_product_order_id}`);
  url.searchParams.set('detail_fetched_at', item.detail_fetched_at ? `eq.${item.detail_fetched_at}` : 'is.null');
  url.searchParams.set('raw_payload->productOrder->>productOrderStatus', `eq.${item.raw_payload.productOrder.productOrderStatus}`);
  url.searchParams.set('select', 'id');
  const response = await fetch(url, { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(patch), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`배송 상태 저장 실패 (HTTP ${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('배송 상태 저장 응답 오류');
  return rows.length === 1;
}
const dryDelivery = process.argv.includes('--delivery-dry-run');
const deliveryRefresh = createDeliveryRefresher({sbGet,callNaver,patchCas:dryDelivery ? async () => true : patchDeliveryCas});
async function runDeliveryRefresh() {
  const result = await deliveryRefresh();
  console.log(`[배송상태 재확인${dryDelivery ? ' 미리보기' : ''}] 대상=${result.candidates || 0}, 확인=${result.checked || 0}, ${dryDelivery ? '변경예정' : '변경'}=${result.updated || 0}, 경합=${result.conflicted || 0}`);
  return result;
}
async function sbDelete(table, filter) {""")
replace_once("// 카탈로그 단독 실행 (테스트/최초 backfill): node sync.js --catalog [--no-options]", """// 배송 상태만 독립 확인. 기존 발송·발주·취소 큐는 실행하지 않는다.
if (args.includes('--delivery-dry-run') || args.includes('--delivery-refresh')) {
  try { await runDeliveryRefresh(); }
  catch (error) { console.error('[배송상태 재확인 실패]', error.message); process.exitCode = 1; }
  process.exit(process.exitCode || 0);
}
// 카탈로그 단독 실행 (테스트/최초 backfill): node sync.js --catalog [--no-options]""")
replace_once("  setInterval(runOnce, SYNC_INTERVAL_MS);", """  setInterval(runOnce, SYNC_INTERVAL_MS);
  // 네이버 변경 알림에 없는 배송완료를 15분마다 상세 조회로 보완한다.
  const checkDelivery = () => runDeliveryRefresh().catch(error => console.warn('[배송상태 재확인 실패]', error.message));
  setTimeout(checkDelivery, 15000);
  setInterval(checkDelivery, 15 * 60 * 1000);""")
target.write_bytes(data)
print('준비된 sync 파일 생성 완료')
