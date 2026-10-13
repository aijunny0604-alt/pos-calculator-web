export function orderContactPatch(params) {
  const patch = {};
  for (const [key, column, max] of [['phone', 'customer_phone', 80], ['address', 'customer_address', 1000]]) {
    if (params[key] === undefined) continue;
    if (typeof params[key] !== 'string' || params[key].trim().length > max) throw new Error(`${key}: 입력 형식 또는 길이가 올바르지 않습니다.`);
    patch[column] = params[key].trim();
  }
  if (!Object.keys(patch).length) throw new Error('변경할 연락처 또는 주소가 필요합니다.');
  return patch;
}

export function prepareOrderContact(args, orders = []) {
  const number = String(args.orderNumber || '').trim();
  if (!number) return { ok: false, error: '먼저 주문을 조회하고 정확한 주문번호를 지정하세요.' };
  const matches = orders.filter(o => String(o.orderNumber || o.id) === number);
  if (matches.length !== 1 || matches[0].id == null) return { ok: false, error: '주문번호에 해당하는 원본 주문을 하나로 확인하지 못했습니다. 다시 조회하세요.' };
  const order = matches[0];
  let patch;
  try { patch = orderContactPatch(args); } catch (e) { return { ok: false, error: e.message }; }
  const before = { customer_phone: order.customer_phone ?? order.customerPhone ?? null, customer_address: order.customer_address ?? order.customerAddress ?? null };
  if (Object.entries(patch).every(([k, v]) => (before[k] ?? '') === v)) return { ok: false, error: '주문에 이미 같은 연락처·주소가 저장되어 있습니다.' };
  const params = { orderId: order.id, customerName: order.customerName || order.customer_name || '' };
  if ('customer_phone' in patch) params.phone = patch.customer_phone;
  if ('customer_address' in patch) params.address = patch.customer_address;
  return { ok: true, data: { __pending: true, action: 'updateOrderContact', params,
    warnings: ['해당 주문만 변경합니다. 거래처 기본정보와 다른 주문은 변경하지 않습니다.'],
    preview: `주문 배송정보 수정\n• 주문: ${number} (${params.customerName})\n` + Object.entries(patch).map(([k, v]) => `• ${k === 'customer_phone' ? '연락처' : '주소'}: ${before[k] || '(없음)'} → ${v || '(삭제)'}`).join('\n') } };
}

// 저장 응답만 믿지 않고 원본을 다시 읽은 후에만 완료를 알린다.
export async function commitOrderContact(params, api, client) {
  const patch = orderContactPatch(params);
  const saved = await api.updateOrder(params.orderId, patch);
  if (!Array.isArray(saved) || saved.length !== 1) throw new Error('주문 저장 결과를 확인하지 못했습니다. 다시 조회한 뒤 재시도하세요.');
  const { data, error } = await client.from('orders').select('*').eq('id', params.orderId).single();
  if (error || !data || Object.entries(patch).some(([k, v]) => data[k] !== v)) throw new Error('저장 요청 후 주문 재조회가 일치하지 않습니다. 저장되었을 수 있으므로 재실행 전에 주문을 확인하세요.');
  return data;
}
