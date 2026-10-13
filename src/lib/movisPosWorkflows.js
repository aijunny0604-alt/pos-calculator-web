import { validateArguments } from './movisValidation.js';

const text = (description) => ({ type: 'string', description });
const integer = (minimum = 0) => ({ type: 'integer', minimum, maximum: 1000000000 });
const object = (properties, required = []) => ({ type: 'object', properties, required });
const date = text('YYYY-MM-DD 날짜');
const id = text('readLibrary에서 조회한 정확한 레코드 ID. 이름으로 추측하지 않는다.');
const item = object({ name: text('품명'), spec: text('규격'), qty: integer(1), unit_price: integer(), note: text('품목 메모') }, ['name', 'spec', 'qty', 'unit_price']);
const items = { type: 'array', items: item };
const definitions = {};
function define(name, title, library, table, operation, fields, required = [], note = '') {
  definitions[name] = { name, title, library, table, operation, note,
    parameters: object({ ...(operation !== 'insert' ? { id } : {}), ...fields }, [...(operation !== 'insert' ? ['id'] : []), ...required]) };
}
const poFields = { po_number: text('발주번호'), supplier_name: text('매입처'), order_date: date, title: text('제목'), memo: text('메모'), items };
define('createPurchaseOrder', '매입 발주 등록', 'purchaseOrders', 'purchase_orders', 'insert', poFields, ['po_number', 'supplier_name', 'order_date', 'items'], '발주 등록만 수행. 입고·판매 주문·상품 재고를 바꾸지 않는다.');
define('editPurchaseOrder', '매입 발주 기본정보 수정', 'purchaseOrders', 'purchase_orders', 'update', { supplier_name: text('매입처'), order_date: date, title: text('제목'), memo: text('메모') });
define('receivePurchaseItem', '발주 품목 입고 기록', 'purchaseOrders', 'purchase_orders', 'receive', { itemIndex: integer(), quantity: integer(1) }, ['itemIndex', 'quantity'], '원본 items의 0부터 시작하는 정확한 행 번호. 발주 입고량만 증가하며 상품 재고는 별도. 같은 규격의 다른 행을 변경하지 않는다.');
const ledger = { supplier_name: text('공급처'), kind: { type: 'string', enum: ['lent', 'pending', 'defect'] }, occurred_on: date, item_name: text('품명'), spec: text('규격'), qty: integer(1), unit: text('단위'), note: text('메모') };
define('createSupplierLedger', '공급처 장부 등록', 'supplierLedger', 'supplier_ledger', 'insert', ledger, ['supplier_name', 'kind', 'item_name', 'qty', 'unit']);
define('editSupplierLedger', '공급처 장부 수정', 'supplierLedger', 'supplier_ledger', 'update', ledger);
define('resolveSupplierLedger', '공급처 장부 완료·되돌림', 'supplierLedger', 'supplier_ledger', 'resolve', { resolved: { type: 'boolean' } }, ['resolved']);
define('deleteSupplierLedger', '공급처 장부 한 건 삭제', 'supplierLedger', 'supplier_ledger', 'delete', {}, [], '돌려받음 처리는 삭제가 아닌 resolveSupplierLedger를 사용한다. 명시적 삭제 요청에만 사용.');
define('createSupplierPrice', '매입 단가 이력 등록', 'supplierPrices', 'supplier_prices', 'insert', { supplier_name: text('공급처'), item_name: text('품명'), spec: text('규격'), unit_price: integer(), quoted_at: date }, ['supplier_name', 'item_name', 'spec', 'unit_price', 'quoted_at'], '소비자가·도매 판매가와 다른 공급처 매입 단가이다.');
define('deleteSupplierPrice', '매입 단가 이력 한 건 삭제', 'supplierPrices', 'supplier_prices', 'delete', {}, [], '명시적 삭제 요청에만 사용.');
const defectItems = { type: 'array', items: object({ category: text('품목'), spec: text('규격'), qty: integer(1), unit: { type: 'string', enum: ['개', '세트'] }, note: text('메모') }, ['spec', 'qty', 'unit']) };
define('createDefectReturn', '공급처 불량 반품 등록', 'defectReturns', 'defect_returns', 'insert', { return_date: date, supplier: text('공급처'), items: defectItems, memo: text('메모') }, ['return_date', 'supplier', 'items'], '고객 판매 반품과 구분한다. 상품 재고·금액은 바꾸지 않는다.');
define('editDefectReturn', '불량 반품 기본정보 수정', 'defectReturns', 'defect_returns', 'update', { return_date: date, supplier: text('공급처'), memo: text('메모') });
define('receiveDefectItem', '불량 교환품 회수 기록', 'defectReturns', 'defect_returns', 'receive', { itemIndex: integer(), quantity: integer(1) }, ['itemIndex', 'quantity'], '원본 items의 0부터 시작하는 행 번호. 회수량만 기록하며 재고는 별도.');
define('editPurchaseDocument', '매입 증빙 정보 수정', 'purchaseDocs', 'purchase_docs', 'update', { doc_date: date, supplier: text('공급처'), doc_type: { type: 'string', enum: ['견적서', '거래명세서', '세금계산서', '기타'] }, total_amount: integer(), memo: text('메모') }, [], '원본 이미지·파일은 변경하지 않는다.');
define('renameBusinessCertificate', '사업자등록증 이름 수정', 'businessCerts', 'business_certs', 'update', { name: text('보관함 표시 이름') }, ['name'], '고객 연결이나 원본 이미지 경로는 바꾸지 않는다.');
define('editSavedCartDetails', '저장 견적 연락처·일정·메모 수정', 'savedCarts', 'saved_carts', 'update', { phone: text('연락처'), address: text('주소'), delivery_date: date, memo: text('메모') });
define('editProductDetails', '상품 분류·최소재고·메모 수정', 'products', 'products', 'update', { category: text('분류'), min_stock: integer(), note: text('상품 메모') }, [], '상품명·가격·재고는 각각의 전용 도구를 사용한다.');
export const POS_WORKFLOWS = definitions;
export const POS_WORKFLOW_TOOLS = Object.values(definitions).map(d => ({ name: d.name, description: `${d.title}. 먼저 readLibrary(${d.library})로 원본과 필드를 확인하세요. 사용자 확인 후 실제 저장·재조회합니다. ${d.note}`, parameters: d.parameters }));
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const same = (a, b) => stable(a) === stable(b);
const fieldSame = (k, a, b) => same(a, b) || (k.endsWith('_at') && a && b && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));
function validate(d, args) {
  const errors = validateArguments(args, d.parameters);
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && (v.length > 4000 || (!['memo', 'note', 'title', 'phone', 'address', 'spec', 'brand', 'category'].includes(k) && !v.trim()))) errors.push(`${k}: 빈 값 또는 과도한 길이입니다.`);
    if (['order_date', 'occurred_on', 'quoted_at', 'return_date', 'doc_date', 'delivery_date'].includes(k) && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) errors.push('유효한 YYYY-MM-DD 날짜가 필요합니다.');
  }
  if ('items' in args && (!args.items.length || args.items.some(i => !String(i.spec || i.name || '').trim()))) errors.push('유효한 품목이 필요합니다.');
  if (d.operation === 'update' && Object.keys(args).length < 2) errors.push('변경할 항목이 없습니다.');
  if (errors.length) throw new Error(errors.join(' '));
}
function patchFor(d, args, before) {
  const { id: _, itemIndex, quantity, ...fields } = args;
  if (d.operation === 'receive') {
    const item = before.items?.[itemIndex];
    if (!item || !Number.isSafeInteger(Number(item.qty)) || !Number.isSafeInteger(Number(item.received_qty || 0))) throw new Error('원본 품목과 수량을 다시 확인하세요.');
    const next = Number(item.received_qty || 0) + quantity;
    if (next > Number(item.qty)) throw new Error('미입고·미회수 수량보다 많이 처리할 수 없습니다.');
    const rows = before.items.map((it, i) => i === itemIndex ? { ...it, received_qty: next } : it);
    return { items: rows, ...(d.library === 'defectReturns' ? { status: rows.every(it => Number(it.received_qty || 0) >= Number(it.qty)) ? '완료' : '진행중' } : {}) };
  }
  if (d.operation === 'resolve') return { resolved: args.resolved, resolved_at: args.resolved ? new Date().toISOString() : null };
  if (d.operation === 'insert' && ['purchaseOrders', 'defectReturns'].includes(d.library)) return { ...fields, items: fields.items.map(i => ({ ...i, received_qty: 0 })), ...(d.library === 'defectReturns' ? { status: '진행중' } : {}) };
  return fields;
}
export function preparePosWorkflow(name, args, context) {
  const d = definitions[name];
  if (!d) return null;
  try {
    validate(d, args);
    if (context.dataState?.[d.library]?.status !== 'loaded') throw new Error('해당 자료의 최신 조회가 완료되지 않았습니다. 조회 오류를 먼저 해결하세요.');
    const records = context[d.library] || [];
    const matches = records.filter(r => String(r.id) === String(args.id));
    const before = d.operation === 'insert' ? null : matches.length === 1 ? matches[0] : null;
    if (d.operation !== 'insert' && !before) throw new Error('정확한 대상 ID를 확인하지 못했습니다. 다시 조회하세요.');
    if (d.operation === 'insert' && d.library === 'purchaseOrders' && records.some(r => r.po_number === args.po_number)) throw new Error('같은 발주번호가 이미 존재합니다. 기존 발주를 확인하세요.');
    const patch = d.operation === 'delete' ? null : patchFor(d, args, before);
    const lines = d.operation === 'delete' ? [`삭제 대상: ${JSON.stringify(before)}`] : Object.entries(patch).map(([k, v]) => `${k}: ${before ? JSON.stringify(before[k] ?? null) + ' → ' : ''}${JSON.stringify(v)}`);
    return { ok: true, data: { __pending: true, action: 'posWorkflow', params: { tool: name, args, before, patch }, warnings: [d.note, ...(d.operation === 'delete' ? ['삭제 후 자동 복구되지 않습니다.'] : [])].filter(Boolean), preview: `${d.title}\n${args.id ? `대상 ID: ${args.id}\n` : ''}${lines.join('\n')}` } };
  } catch (e) { return { ok: false, error: e.message }; }
}
export async function commitPosWorkflow(params, client) {
  const d = definitions[params.tool];
  if (!d) throw new Error('등록되지 않은 업무 도구입니다.');
  validate(d, params.args);
  const { args, before } = params;
  const patch = d.operation === 'delete' ? null : patchFor(d, args, before);
  if (patch && before && 'updated_at' in before) patch.updated_at = new Date().toISOString();
  if (d.operation === 'insert' && d.library === 'purchaseOrders') {
    const duplicates = await client.from(d.table).select('id').eq('po_number', args.po_number).limit(1);
    if (duplicates.error || duplicates.data?.length) throw new Error('발주번호 중복 또는 중복 확인 실패입니다. 다시 조회하세요.');
  }
  if (d.operation !== 'insert') {
    const latest = await client.from(d.table).select('*').eq('id', args.id).single();
    if (latest.error || !latest.data || !same(latest.data, before)) throw new Error('조회 후 원본이 변경되거나 삭제되었습니다. 다시 조회해 확인하세요.');
  }
  let query;
  if (d.operation === 'insert') query = client.from(d.table).insert(patch);
  else {
    query = d.operation === 'delete' ? client.from(d.table).delete() : client.from(d.table).update(patch);
    query = query.eq('id', args.id);
    // 변경 순간에도 원본 조건을 검사해 동시 작업의 덮어쓰기를 방지한다.
    const keys = before.updated_at !== undefined ? ['updated_at', ...Object.keys(patch || {}).filter(k => k !== 'updated_at')] : Object.keys(patch || before).filter(k => k !== 'id');
    for (const k of new Set(keys)) {
      const v = before[k];
      if (v === undefined) continue;
      query = v === null ? query.is(k, null) : query.eq(k, typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  const result = await query.select('*');
  if (result.error || result.data?.length !== 1) throw new Error('변경이 확인되지 않았습니다. 충돌 또는 저장 오류를 확인하세요.');
  const saved = result.data[0];
  const check = await client.from(d.table).select('*').eq('id', saved.id).maybeSingle();
  if (check.error || (d.operation === 'delete' ? check.data !== null : !check.data || Object.entries(patch).some(([k, v]) => !fieldSame(k, check.data[k], v)))) throw new Error('저장 후 재조회 확인 실패. 적용됐을 수 있으므로 재실행 전에 확인하세요.');
  return { library: d.library, row: check.data, title: d.title, deleted: d.operation === 'delete' };
}
