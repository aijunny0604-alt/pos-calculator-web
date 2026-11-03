import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderArrivalTracker } from '../src/lib/orderArrival.js';

const order = (id, qty, extra = {}) => ({ id, customer_name: '샘플 업체', items: [{ quantity: qty }], ...extra });
test('기존 주문은 알리지 않고 다른 기기의 신규 주문과 합산을 한 번씩 알린다', () => {
  const tracker = createOrderArrivalTracker();
  tracker.baseline([order('a', 1)]);
  assert.equal(tracker.event({ eventType: 'INSERT', new: order('b', 2) }, []), true);
  assert.equal(tracker.event({ eventType: 'INSERT', new: order('b', 2) }, []), false);
  assert.equal(tracker.event({ eventType: 'UPDATE', new: order('a', 3) }, []), true);
  assert.equal(tracker.event({ eventType: 'UPDATE', new: order('a', 3, { memo: '수정' }) }, []), false);
  assert.deepEqual(tracker.scan([order('a', 3), order('b', 2)], []), []);
});
test('이 기기 주문과 스토어 주문은 제외하고 다른 수량의 합산은 알린다', () => {
  const tracker = createOrderArrivalTracker();
  tracker.baseline([order('a', 1)]);
  tracker.markLocal('a', [{ quantity: 2 }]);
  assert.equal(tracker.event({ eventType: 'UPDATE', new: order('a', 2) }, []), false);
  assert.equal(tracker.event({ eventType: 'UPDATE', new: order('a', 3) }, []), true);
  assert.equal(tracker.event({ eventType: 'INSERT', new: order('n', 1, { memo: '[네이버] 주문' }) }, []), false);
});
test('연결 복구 조회에서 누락된 주문만 발견하며 알 수 없는 수정은 신규로 오인하지 않는다', () => {
  const tracker = createOrderArrivalTracker();
  tracker.baseline([order('a', 1)]);
  assert.equal(tracker.event({ eventType: 'UPDATE', new: order('x', 1) }, []), false);
  assert.deepEqual(tracker.scan([order('a', 1), order('x', 1), order('b', 1)], []).map(o => o.id), ['b']);
  assert.deepEqual(tracker.scan([order('a', 1), order('x', 1), order('b', 1)], []), []);
});
