// 저장·예약 날짜가 달라져도 원 주문 메모(채널/외부 주문번호)를 보존한다.
export function mergeOrderMemos(...memos) {
  return [...new Set(memos.flatMap((memo) => String(memo || '').split('\n')).map((line) => line.trim()).filter(Boolean))].join('\n');
}

export function loadedCustomerMemo(customer, nextName, memo) {
  const normalize = (value) => String(value || '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const sameCustomer = normalize(customer?.name) && normalize(customer.name) === normalize(nextName);
  return mergeOrderMemos(sameCustomer ? customer.memo : '', memo);
}

export function savedCartOrderPayload(cart) {
  const priceType = cart.price_type || cart.priceType || 'wholesale';
  const items = (cart.items || []).map((item) => {
    const fallback = priceType === 'wholesale' ? Number(item.wholesale) || 0 : Number(item.retail) || Number(item.wholesale) || 0;
    const hasPrice = item.price !== null && item.price !== undefined && item.price !== '' && Number.isFinite(Number(item.price));
    return { ...item, price: hasPrice ? Number(item.price) : fallback };
  });
  return {
    customer_name: cart.name || '일반고객',
    customer_phone: cart.phone || '',
    customer_address: cart.address || '',
    memo: cart.memo || '',
    items,
    total_amount: items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0),
    price_type: priceType,
  };
}

export async function confirmSavedCart(cart, saveOrder, deleteCart) {
  const result = await saveOrder(savedCartOrderPayload(cart));
  if (result && cart.id) await deleteCart(cart.id);
  return result;
}
