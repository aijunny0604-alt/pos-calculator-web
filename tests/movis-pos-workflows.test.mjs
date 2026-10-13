import test from 'node:test';
import assert from 'node:assert/strict';
import { POS_WORKFLOW_TOOLS, POS_WORKFLOWS, preparePosWorkflow, commitPosWorkflow } from '../src/lib/movisPosWorkflows.js';
const po = { id: 7, po_number: 'TEST-PO', supplier_name: '가상 공급처', memo: '원본', items: [{ name: '테스트', spec: 'A', qty: 5, received_qty: 1, unit_price: 100 }, { name: '테스트', spec: 'A', qty: 5, received_qty: 1, unit_price: 100 }] };
function context(library, rows) { return { [library]: rows, dataState: { [library]: { status: 'loaded', coverage: 'complete' } } }; }
function database(initial, { failWrite = false, stale = false, failReadback = false, zeroWrite = false } = {}) {
  let row = structuredClone(initial), writes = 0, reads = 0;
  const client = { from: () => {
    let op = 'read', patch, filters = [];
    const q = {
      insert: v => { op = 'insert'; patch = v; return q; },
      update: v => { op = 'update'; patch = v; return q; },
      delete: () => { op = 'delete'; return q; },
      select: () => q, limit: () => q, eq: (k, v) => { filters.push([k, v]); return q; }, is: (k, v) => { filters.push([k, v]); return q; },
      single: async () => { reads++; return { data: stale ? { ...row, memo: '다른 PC 수정' } : row }; },
      maybeSingle: async () => ({ data: failReadback ? { ...row, memo: '불일치' } : row, error: failReadback ? { message: 'network' } : null }),
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (op === 'read') return { data: row ? [row] : [] };
        writes++;
        if (failWrite) return { data: null, error: { message: 'fail' } };
        if (zeroWrite) return { data: [] };
        if (op !== 'insert') for (const [k, v] of filters) assert.equal(k === 'id' ? String(row[k]) : typeof row[k] === 'object' && row[k] !== null ? JSON.stringify(row[k]) : row[k], v);
        const original = row;
        row = op === 'delete' ? null : op === 'insert' ? { id: 8, ...patch } : { ...row, ...patch };
        return { data: [row || original] };
      }).then(resolve, reject)
    }; return q;
  } };
  return { client, writes: () => writes, row: () => row };
}
test('모든 확장 도구는 스키마·보관함·실행 작업을 가진다', () => {
  assert.equal(POS_WORKFLOW_TOOLS.length, 16);
  assert.equal(new Set(POS_WORKFLOW_TOOLS.map(t => t.name)).size, 16);
  for (const d of Object.values(POS_WORKFLOWS)) assert.ok(d.table && d.library && d.operation && d.parameters);
});
test('조회 실패·잘못된 ID·임의 필드·불가능 날짜를 거부한다', () => {
  for (const [args, c] of [[{ id: '7', memo: '수정' }, {}], [{ id: '없는ID', memo: '수정' }, context('purchaseOrders', [po])], [{ id: '7', paid: true }, context('purchaseOrders', [po])], [{ id: '7', order_date: '2026-02-31' }, context('purchaseOrders', [po])]]) assert.equal(preparePosWorkflow('editPurchaseOrder', args, c).ok, false);
});
test('입고는 정확한 한 행에만 적용하며 잔여 수량 초과를 거부한다', () => {
  const c = context('purchaseOrders', [po]);
  const result = preparePosWorkflow('receivePurchaseItem', { id: '7', itemIndex: 1, quantity: 2 }, c);
  assert.equal(result.data.params.patch.items[0].received_qty, 1);
  assert.equal(result.data.params.patch.items[1].received_qty, 3);
  for (const args of [{ id: '7', itemIndex: 2, quantity: 1 }, { id: '7', itemIndex: 0, quantity: 5 }, { id: '7', itemIndex: 0, quantity: -1 }]) assert.equal(preparePosWorkflow('receivePurchaseItem', args, c).ok, false);
});
test('매입 발주 등록은 입고량 0이고 기존 발주번호 중복을 거부한다', () => {
  const args = { po_number: 'NEW-PO', supplier_name: '가상', order_date: '2026-10-13', items: [{ name: '테스트', spec: 'A', qty: 2, unit_price: 100 }] };
  const r = preparePosWorkflow('createPurchaseOrder', args, context('purchaseOrders', [po]));
  assert.equal(r.data.params.patch.items[0].received_qty, 0);
  assert.equal(preparePosWorkflow('createPurchaseOrder', { ...args, po_number: 'TEST-PO' }, context('purchaseOrders', [po])).ok, false);
});
test('원본 충돌·저장 오류·0행·재조회 실패는 완료로 반환하지 않는다', async () => {
  const params = preparePosWorkflow('editPurchaseOrder', { id: '7', memo: '수정' }, context('purchaseOrders', [po])).data.params;
  for (const options of [{ stale: true }, { failWrite: true }, { zeroWrite: true }, { failReadback: true }]) {
    const db = database(po, options);
    await assert.rejects(commitPosWorkflow(params, db.client));
    if (options.stale) assert.equal(db.writes(), 0);
  }
});
test('정상 수정과 삭제 후 원본 재조회까지 검증한다', async () => {
  const params = preparePosWorkflow('editPurchaseOrder', { id: '7', memo: '수정' }, context('purchaseOrders', [po])).data.params;
  const db = database(po);
  const result = await commitPosWorkflow(params, db.client);
  assert.equal(result.row.memo, '수정');
  assert.deepEqual(result.row.items, po.items);
  const row = { id: 8, supplier_name: '가상', spec: 'A', unit_price: 1 };
  const del = preparePosWorkflow('deleteSupplierPrice', { id: '8' }, context('supplierPrices', [row]));
  assert.ok(del.data.warnings.some(w => /복구/.test(w)));
  assert.equal((await commitPosWorkflow(del.data.params, database(row).client)).deleted, true);
});

const samples = {
 createPurchaseOrder: { po_number: 'NEW-TEST', supplier_name: '가상', order_date: '2026-10-13', items: [{ name: '가상상품', spec: 'A', qty: 2, unit_price: 100 }] },
 editPurchaseOrder: { id: '7', memo: '변경' }, receivePurchaseItem: { id: '7', itemIndex: 0, quantity: 1 },
 createSupplierLedger: { supplier_name: '가상', kind: 'lent', item_name: '가상상품', qty: 2, unit: '개' },
 editSupplierLedger: { id: '7', qty: 3 }, resolveSupplierLedger: { id: '7', resolved: true }, deleteSupplierLedger: { id: '7' },
 createSupplierPrice: { supplier_name: '가상', item_name: '가상상품', spec: 'A', unit_price: 100, quoted_at: '2026-10-13' }, deleteSupplierPrice: { id: '7' },
 createDefectReturn: { return_date: '2026-10-13', supplier: '가상', items: [{ spec: 'A', qty: 2, unit: '개' }] },
 editDefectReturn: { id: '7', memo: '반품메모' }, receiveDefectItem: { id: '7', itemIndex: 0, quantity: 1 },
 editPurchaseDocument: { id: '7', doc_type: '세금계산서', memo: '증빙메모' }, renameBusinessCertificate: { id: '7', name: '테스트 상호' },
 editSavedCartDetails: { id: '7', phone: '010-0000-0000', address: '가상주소' }, editProductDetails: { id: '7', min_stock: 3, category: '테스트' }
};
for (const [name, args] of Object.entries(samples)) test(`${name}: 미리보기부터 저장·재조회까지`, async () => {
 const d = POS_WORKFLOWS[name];
 const row = d.operation === 'insert' ? null : { ...po, qty: 2, resolved: false, resolved_at: null };
 const pending = preparePosWorkflow(name, args, context(d.library, row ? [row] : []));
 assert.equal(pending.ok, true, pending.error);
 const db = database(row);
 const result = await commitPosWorkflow(pending.data.params, db.client);
 assert.equal(result.library, d.library);
 assert.equal(db.writes(), 1);
});
