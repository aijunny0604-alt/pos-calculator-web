// 단위가 다른 수량을 합산하지 않고 각각 표시한다.
export function quantityLabel(items = []) {
  const totals = new Map();
  for (const item of items) {
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unit = String(item.unit || '개');
    totals.set(unit, (totals.get(unit) || 0) + qty);
  }
  return [...totals].map(([unit, qty]) => `${qty.toLocaleString('ko-KR')}${unit}`).join(' + ') || '0개';
}

export function filterReturnRecords(rows, query, status) {
  const normalized = String(query || '').toLowerCase().replace(/[\s_-]/g, '');
  return rows.filter((row) => {
    if (status === 'open' && row.status === '완료') return false;
    if (status === 'done' && row.status !== '완료') return false;
    const text = [row.supplier, row.return_date, row.memo,
      ...(row.items || []).flatMap((item) => [item.category, item.spec, item.note])]
      .filter(Boolean).join(' ').toLowerCase().replace(/[\s_-]/g, '');
    return text.includes(normalized);
  });
}
