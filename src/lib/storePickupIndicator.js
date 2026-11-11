// 주문 병합 가능성을 고려해 이름이 아닌 내부 주문 ID와 명시된 네이버 주문번호로만 연결한다.
export function naverOrderIds(order) {
  return [...new Set([...String(order?.memo || '').matchAll(/\[\s*네\s*이\s*버[^\]]*\]\s*(\d+)/g)].map(match => match[1]))];
}

export function isVisitPickup(order, items = []) {
  if (order?.naver_dispatch_succeeded_at && order?.naver_dispatch_company_code) {
    return order.naver_dispatch_company_code === 'VISIT_RECEIPT';
  }
  const method = order?.raw_payload?.productOrder?.expectedDeliveryMethod || order?.raw_payload?.delivery?.deliveryMethod;
  return method === 'VISIT_RECEIPT' || items.some(item => (item?.raw_payload?.productOrder?.expectedDeliveryMethod || item?.raw_payload?.delivery?.deliveryMethod) === 'VISIT_RECEIPT');
}

export async function loadVisitPickupOrderIds(client, orders) {
  const entries = (orders || []).map(order => ({ id: String(order.id || order.orderNumber || ''), providerIds: naverOrderIds(order) })).filter(order => order.id);
  if (!entries.length) return new Set();
  const internalIds = [...new Set(entries.map(order => order.id))];
  const providerIds = [...new Set(entries.flatMap(order => order.providerIds))];
  const external = new Map();
  const fetchRows = async (table, fields, filter, values, naverOnly = false) => {
    const all = [];
    for (let start = 0; ; start += 1000) {
      let query = client.from(table).select(fields);
      if (naverOnly) query = query.eq('provider', 'naver');
      const { data, error } = await query.in(filter, values).order('id', { ascending: true }).range(start, start + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) return all;
    }
  };
  for (const [field, values] of [['internal_order_id', internalIds], ['provider_order_id', providerIds]]) {
    for (let offset = 0; offset < values.length; offset += 100) {
      const data = await fetchRows('external_orders', 'id,provider,provider_order_id,internal_order_id,raw_payload,naver_dispatch_company_code,naver_dispatch_succeeded_at', field, values.slice(offset, offset + 100), true);
      for (const row of data || []) if (row.id != null && row.provider === 'naver') external.set(String(row.id), row);
    }
  }
  const itemsByOrder = new Map();
  const ids = [...external.keys()];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const data = await fetchRows('external_order_items', 'external_order_id,raw_payload', 'external_order_id', ids.slice(offset, offset + 100));
    for (const item of data || []) {
      const id = String(item.external_order_id);
      if (!itemsByOrder.has(id)) itemsByOrder.set(id, []);
      itemsByOrder.get(id).push(item);
    }
  }
  const visit = [...external.values()].filter(order => isVisitPickup(order, itemsByOrder.get(String(order.id)) || []));
  return new Set(entries.filter(entry => visit.some(row => String(row.internal_order_id || '') === entry.id || entry.providerIds.includes(String(row.provider_order_id || '')))).map(entry => entry.id));
}
