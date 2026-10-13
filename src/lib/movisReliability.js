export const READ_DOMAINS = {
  getCustomerInfo: ['customers'], searchCustomers: ['customers'],
  getProductInfo: ['products'], searchProducts: ['products'], getPriceHistory: ['products'], getProductsByStockStatus: ['products'],
  searchOrders: ['orders']
};
const ACTION_DOMAINS = {
 addProduct: ['products'], bulkAddProduct: ['products'], addCustomer: ['customers'], bulkAddCustomer: ['customers'],
 updateCustomer: ['customers'], bulkUpdateCustomer: ['customers'], updateProductStock: ['products'], bulkUpdateProductStock: ['products'],
 updateProductPrice: ['products'], bulkUpdateProductPrice: ['products'], updateProductName: ['products'], bulkUpdateProductName: ['products'],
 updateOrderMemo: ['orders'], updateOrderContact: ['orders'], markOrderPaid: ['orders'], createReturn: ['orders'], saveOrder: ['products']
};
export const NON_EVIDENCE_TOOLS = new Set(['verifyWork', 'calculate', 'listAvailableTools', 'listLibraries', 'getSystemHealth', 'navigatePage', 'draftMessage']);
export function evidenceDomains(call) {
 if (!call.result?.ok || call.result?.data?.__pending || NON_EVIDENCE_TOOLS.has(call.name)) return [];
 if (['readLibrary', 'getRecord'].includes(call.name)) return [call.args?.library].filter(Boolean);
 return READ_DOMAINS[call.name] || [];
}
export function missingActionEvidence(action, calls) {
 const required = ACTION_DOMAINS[action.action] || [];
 const actual = new Set(calls.flatMap(evidenceDomains));
 return required.filter(key => !actual.has(key));
}
export function isPersistedResult(value) {
 const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
 return rows.length > 0 && rows.every(row => row && row.id !== undefined && row.id !== null);
}
export async function commitOrderMemo(params, api, client) {
 const result = await api.updateOrder(params.orderId, { memo: params.memo });
 if (!isPersistedResult(result)) throw new Error('메모 저장 결과가 확인되지 않았습니다. 다시 조회하세요.');
 const { data, error } = await client.from('orders').select('*').eq('id', params.orderId).single();
 if (error || !data || data.memo !== params.memo) throw new Error('메모 저장 후 재조회 확인 실패. 저장되었을 수 있으므로 주문을 다시 확인하세요.');
 return data;
}
export async function verifyOrderPaid(orderId, client) {
 const { data, error } = await client.from('payment_records').select('id,balance,total_amount,paid_amount').eq('order_id', orderId).limit(2);
 if (error || data?.length !== 1 || data[0].balance == null || !Number.isFinite(Number(data[0].balance)) || Number(data[0].balance) !== 0 || Number(data[0].paid_amount) < Number(data[0].total_amount)) throw new Error('입금 처리 후 완불 상태를 확인하지 못했습니다. 일부 기록이 저장됐을 수 있으니 정산 내역부터 확인하세요.');
 return data[0];
}
export function turnNavigation(calls, hasPending) {
 const nav = calls.find(c => c.result?.ok && c.result?.data?.__navigate)?.result.data;
 return !nav ? {} : hasPending ? { notice: `확인 대기 작업을 보호하기 위해 ${nav.label || nav.page} 화면 이동을 보류했습니다. 확인을 마친 뒤 이동을 요청해주세요.` } : { page: nav.page };
}

export function navigationBlocked(name, calls) {
 return name === 'navigatePage' && calls.some(c => c.result?.ok && c.result?.data?.__pending)
  ? { ok: false, error: '확인 대기 작업이 있어 화면 이동을 실행하지 않았습니다. 열었다고 답하지 마세요. 먼저 변경 확인을 마친 뒤 이동해야 합니다.' }
  : null;
}
