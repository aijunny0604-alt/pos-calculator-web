export function positiveMoney(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('금액은 1원 이상의 정수로 입력하세요.');
  return amount;
}

export function paymentRows(result, expected = 1) {
  if (!Array.isArray(result) || result.length !== expected || result.some(row => !row?.id)) {
    throw new Error('저장 결과를 확인하지 못했습니다. 내역을 새로고침하여 확인한 뒤 진행해주세요.');
  }
  return result;
}

export function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDate(value = new Date()) {
  return toLocalDateTime(value).slice(0, 10);
}

export function validateAllocation(allocation, amount, customerId) {
  const total = positiveMoney(amount);
  if (!allocation.length) throw new Error('배분할 미수가 없습니다.');
  const ids = new Set();
  let allocated = 0;
  for (const item of allocation) {
    if (!item.record?.id || ids.has(String(item.record.id)) || String(item.record.customer_id) !== String(customerId)) {
      throw new Error('업체와 배분 내역을 다시 확인해주세요.');
    }
    ids.add(String(item.record.id));
    allocated += positiveMoney(item.apply);
    if (item.apply > Number(item.record.balance)) throw new Error('잔액을 초과한 배분입니다.');
  }
  if (allocated !== total) throw new Error('입금액이 총 미수금을 초과합니다. 배분할 금액으로 수정해주세요.');
}
