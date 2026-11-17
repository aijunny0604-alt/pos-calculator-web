// 포장 체크는 상품 행의 순서에 연결된다. 상품·옵션·수량이 바뀌면 기존 체크를 신뢰할 수 없다.
export function packingItemsSignature(items) {
  if (!Array.isArray(items)) return null;
  return JSON.stringify(items.map(item => [String(item?.id ?? ''), String(item?.name ?? ''), String(item?.option ?? ''), Number(item?.quantity ?? 0)]));
}

export function packingItemsChanged(before, after) {
  if (!Array.isArray(after)) return false;
  return !Array.isArray(before) || packingItemsSignature(before) !== packingItemsSignature(after);
}

// 과거에 품목 수가 달라진 채 남아 있는 포장완료 배지도 안전하게 숨긴다.
export function validPackingBadge(status, items) {
  if (!status || !Array.isArray(items) || items.length === 0) return null;
  const count = Number(status.itemCount), checked = Number(status.checkedCount);
  if (count !== items.length || !Number.isInteger(checked) || checked < 0 || checked > count) return null;
  return { ...status, done: !!status.done && checked === count };
}
