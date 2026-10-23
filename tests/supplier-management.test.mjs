import test from 'node:test';
import assert from 'node:assert/strict';
import { quantityLabel, filterReturnRecords } from '../src/lib/supplierManagement.js';

test('대여·불량 합계는 개/세트와 기타 단위를 보존한다', () => {
  assert.equal(quantityLabel([{ qty: 2, unit: '개' }, { qty: 3, unit: '세트' }, { qty: 4, unit: '개' }]), '6개 + 3세트');
  assert.equal(quantityLabel([{ qty: '5', unit: '세트' }, { qty: 1, unit: '개' }, { qty: '잘못된 값' }]), '5세트 + 1개');
  assert.equal(quantityLabel([]), '0개');
});

test('반품 검색은 코드 표기 차이를 허용하고 수령 상태 필터를 함께 적용한다', () => {
  const rows = [
    { id: 1, supplier: 'JSR', return_date: '2026-08-19', status: '진행중', items: [{ spec: 'NPK 89S-B', qty: 6, received_qty: 2 }] },
    { id: 2, supplier: 'JSR', return_date: '2026-07-19', status: '완료', items: [{ spec: 'NPK89S_B', qty: 1, received_qty: 1 }] },
  ];
  assert.deepEqual(filterReturnRecords(rows, 'NPK89S_B', 'open').map(r => r.id), [1]);
  assert.deepEqual(filterReturnRecords(rows, 'NPK 89S-B', 'done').map(r => r.id), [2]);
  assert.deepEqual(filterReturnRecords(rows, '20260819', 'all').map(r => r.id), [1]);
  assert.deepEqual(filterReturnRecords(rows, '없는제품', 'all'), []);
  assert.equal(rows[0].items[0].received_qty, 2);
});
