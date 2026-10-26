export const CATALOG_STATES = {
  soldout: { label: '상품 품절', color: 'var(--destructive)' },
  options: { label: '옵션 품절', color: 'var(--warning)' },
  suspended: { label: '판매중지', color: 'var(--muted-foreground)' },
  sale: { label: '판매중', color: 'var(--success)' },
  other: { label: '기타 상태', color: 'var(--muted-foreground)' },
};
export function optionStock(option) {
  const value = option?.stock;
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export const catalogOptions = row => Array.isArray(row?.options) ? row.options.filter(o => o && typeof o === 'object' && !Array.isArray(o)) : [];
export const soldOutOptions = row => catalogOptions(row).filter(o => o.usable !== false && optionStock(o) === 0);
export function catalogState(row) {
  if (row.status_type === 'OUTOFSTOCK') return 'soldout';
  if (row.status_type === 'SUSPENSION') return 'suspended';
  if (row.status_type !== 'SALE') return 'other';
  return soldOutOptions(row).length ? 'options' : 'sale';
}
export function catalogSourceStatus(row) {
  return { SALE: '판매중', OUTOFSTOCK: '품절', SUSPENSION: '판매중지', CLOSE: '판매종료' }[row.status_type] || row.status_type || '상태 미확인';
}
export function catalogUrl(row) {
  const id = String(row.channel_product_no || '');
  return /^\d+$/.test(id) ? `https://smartstore.naver.com/main/products/${id}` : null;
}
export function catalogOld(row, now = Date.now()) {
  const time = Date.parse(row.synced_at);
  return !Number.isFinite(time) || now - time > 86400000;
}
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s_-]/g, '');
export function filterCatalog(rows, query, state) {
  const tokens = String(query || '').trim().split(/\s+/).filter(Boolean).map(normalize);
  return rows.filter(row => {
    const status = catalogState(row);
    if (state === 'attention' ? !['soldout', 'options'].includes(status) : state !== 'all' && status !== state) return false;
    const text = normalize([row.name, row.channel_product_no, row.category_name, row.seller_management_code,
      ...catalogOptions(row).map(o => o.name)].join(' '));
    return tokens.every(token => text.includes(token));
  }).sort((a, b) => {
    const priority = { soldout: 0, options: 1, suspended: 2, other: 3, sale: 4 };
    return priority[catalogState(a)] - priority[catalogState(b)] || String(a.name).localeCompare(String(b.name), 'ko');
  });
}
export function catalogCounts(rows) {
  const counts = { all: rows.length, attention: 0, soldout: 0, options: 0, suspended: 0, sale: 0, other: 0, zeroOptions: 0 };
  rows.forEach(row => {
    const state = catalogState(row);
    counts[state]++;
    if (state === 'soldout' || state === 'options') counts.attention++;
    if (state === 'options') counts.zeroOptions += soldOutOptions(row).length;
  });
  return counts;
}
export function catalogCSV(rows) {
  const records = [['상품번호', '상품명', '관리 구분', '네이버 판매상태', '판매가', '옵션명', '옵션 재고', '옵션 사용', '동기화 시각', '상품 링크']];
  rows.forEach(row => {
    const options = catalogOptions(row);
    (options.length ? options : [null]).forEach(option => records.push([
      row.channel_product_no, row.name, CATALOG_STATES[catalogState(row)].label, catalogSourceStatus(row), row.sale_price,
      option?.name || '', option ? optionStock(option) ?? '미확인' : '', option ? option.usable === false ? '사용 안 함' : '사용' : '',
      row.synced_at || '미확인', catalogUrl(row) || '',
    ]));
  });
  const cell = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + records.map(row => row.map(cell).join(',')).join('\r\n');
}
