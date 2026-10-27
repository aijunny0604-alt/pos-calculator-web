// 네이버 실시간 원본만 사용한다. 누락된 옵션 속성은 추정하지 않는다.
const idOk = value => /^\d{1,15}$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value));
const stockOk = value => Number.isInteger(value) && value >= 0 && value <= 99999999;
export function productSnapshot(data, expectedOrigin, verifiedOrigin) {
  const origin = data?.originProduct || data?.data?.originProduct;
  const originNo = verifiedOrigin;
  if (!origin || !idOk(expectedOrigin) || !idOk(originNo) || String(originNo) !== String(expectedOrigin)) throw new Error('원상품 번호를 확인할 수 없습니다. 상품 동기화 후 다시 시도해주세요.');
  if (typeof origin.statusType !== 'string' || !stockOk(origin.stockQuantity)) throw new Error('현재 판매 상태 또는 재고를 확인할 수 없습니다.');
  const info = origin.detailAttribute?.optionInfo || {};
  const options = [];
  for (const [type, key] of [['combination', 'optionCombinations'], ['standard', 'optionStandards']]) {
    if (info[key] != null && !Array.isArray(info[key])) throw new Error('옵션 정보를 확인할 수 없습니다.');
    for (const option of info[key] || []) {
      const name = [option.optionName1, option.optionName2, option.optionName3, option.optionName4].filter(Boolean).join(' / ');
      options.push({ type, id: String(option.id ?? ''), name, stock: option.stockQuantity, price: option.price, usable: option.usable });
    }
  }
  return { originNo: String(originNo), name: String(origin.name || ''), status: origin.statusType, stock: origin.stockQuantity, stockManagement: info.useStockManagement, options };
}
export function prepareProductChange(snapshot, change) {
  if (change?.kind === 'status') {
    const allowed = (change.status === 'SUSPENSION' && ['SALE', 'OUTOFSTOCK', 'WAIT'].includes(snapshot.status)) || (change.status === 'SALE' && ['SUSPENSION', 'OUTOFSTOCK'].includes(snapshot.status) && snapshot.stock > 0);
    if (!allowed) throw new Error('이 상태 변경은 안전하게 처리할 수 없습니다. 품절 상품의 판매 재개는 네이버 관리자에서 재고를 확인해주세요.');
    const body = { statusType: change.status };
    if (snapshot.status === 'OUTOFSTOCK' && change.status === 'SALE') body.stockQuantity = snapshot.stock;
    return { path: 'change-status', body, description: `${snapshot.status} → ${change.status}${body.stockQuantity != null ? ` · 확인된 재고 ${body.stockQuantity}개` : ''}` };
  }
  if (change?.kind !== 'option' || !stockOk(change.stock) || !idOk(change.optionId)) throw new Error('옵션과 재고 수량을 확인해주세요.');
  const matches = snapshot.options.filter(o => o.id === String(change.optionId) && o.type === change.optionType);
  if (matches.length !== 1) throw new Error('변경할 옵션을 확인할 수 없습니다.');
  const o = matches[0];
  if (!stockOk(o.stock) || typeof o.usable !== 'boolean' || (o.type === 'combination' && !Number.isInteger(o.price)) || (o.type === 'standard' && snapshot.stockManagement !== true)) throw new Error('옵션 가격·사용 여부 또는 재고 관리 설정을 확인할 수 없어 변경할 수 없습니다.');
  if (o.stock === change.stock) throw new Error('현재 재고와 같은 수량입니다.');
  const fields = { id: Number(o.id), stockQuantity: change.stock, usable: o.usable };
  if (o.type === 'combination') fields.price = o.price;
  const optionInfo = o.type === 'combination' ? { optionCombinations: [fields] } : { optionStandards: [fields], useStockManagement: true };
  return { path: 'option-stock', body: { optionInfo }, description: `${o.name || '옵션'}: ${o.stock}개 → ${change.stock}개` };
}
export const productFingerprint = snapshot => JSON.stringify(snapshot);
