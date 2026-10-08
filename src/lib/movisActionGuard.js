import { supabaseClient } from './supabase';
import { validateAction } from './movisValidation';
export function capturePreconditions(action, context) {
  const result = [];
  const {
    params: p
  } = action;
  const ids = [p.productId, ...(p.updates || []).map(u => u.productId), ...(p.items || []).filter(i => !i.isSurcharge).map(i => i.id)].filter(v => v !== undefined && v !== null);
  for (const id of new Set(ids)) {
    const row = context.products?.find(r => String(r.id) === String(id));
    if (row) result.push({
      table: 'products',
      id: row.id,
      values: {
        name: row.name,
        stock: row.stock,
        wholesale: row.wholesale,
        retail: row.retail
      }
    });
  }
  const customerIds = [p.customerId, ...(p.updates || []).map(u => u.customerId)].filter(v => v !== undefined && v !== null);
  if (p.customerName) {
    const c = context.customers?.find(c => c.name === p.customerName);
    if (c) customerIds.push(c.id);
  }
  for (const id of new Set(customerIds)) {
    const row = context.customers?.find(r => String(r.id) === String(id));
    if (row) result.push({
      table: 'customers',
      id: row.id,
      values: {
        name: row.name,
        phone: row.phone,
        address: row.address
      }
    });
  }
  if (p.orderId) {
    const row = context.orders?.find(r => String(r.id) === String(p.orderId));
    if (row) result.push({
      table: 'orders',
      id: row.id,
      values: {
        total: row.total,
        memo: row.memo,
        paid: row.paid,
        items: row.items
      }
    });
  }
  return result;
}
export async function checkActionBeforeCommit(pending, client = supabaseClient) {
  const errors = validateAction(pending.action, pending.params);
  if (errors.length) throw new Error(errors.join(' '));
  const tables = new Set((pending.preconditions || []).map(p => p.table));
  for (const table of tables) {
    const checks = pending.preconditions.filter(p => p.table === table);
    const {
      data,
      error
    } = await client.from(table).select('*').in('id', checks.map(c => c.id));
    if (error) throw new Error('실행 전 최신 자료를 확인하지 못했습니다. 변경하지 않았습니다.');
    for (const check of checks) {
      const row = data.find(r => String(r.id) === String(check.id));
      if (!row) throw new Error('대상 자료가 삭제되었습니다. 다시 조회해 주세요.');
      for (const [key, value] of Object.entries(check.values)) if (value !== undefined && JSON.stringify(row[key]) !== JSON.stringify(value)) throw new Error(`조회 후 ${row.name || check.id}의 ${key} 값이 변경되었습니다. 최신 자료로 다시 요청해주세요.`);
    }
  }
  return true;
}
