import { classifyOrderChannel } from './channelClassifier.js';

const quantity = (order) => (Array.isArray(order?.items) ? order.items : [])
  .reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

// 최초 동기화는 기준점만 만들고 이후 신규 주문 또는 기존 주문의 수량 증가만 알린다.
export function createOrderArrivalTracker() {
  let known = new Map();
  const local = new Map();
  const key = (id) => String(id);
  function markLocal(id, items) { if (id != null) local.set(key(id), { expiry: Date.now() + 60000, quantity: quantity({ items }) }); }
  function isLocal(row) {
    const entry = local.get(key(row.id));
    if (!entry) return false;
    if (entry.expiry < Date.now()) { local.delete(key(row.id)); return false; }
    return quantity(row) === entry.quantity;
  }
  function accept(row, customers = []) {
    if (row?.id == null) return false;
    const id = key(row.id), previous = known.get(id);
    known.set(id, row);
    if (isLocal(row) || classifyOrderChannel(row, customers) !== 'general') return false;
    return !previous || quantity(row) > quantity(previous);
  }
  return {
    markLocal,
    baseline(rows) { known = new Map((rows || []).filter(row => row?.id != null).map(row => [key(row.id), row])); },
    event(payload, customers) {
      if (payload.eventType === 'DELETE') { if (payload.old?.id != null) known.delete(key(payload.old.id)); return false; }
      if (!['INSERT', 'UPDATE'].includes(payload.eventType)) return false;
      // UPDATE의 이전 값이 아직 없다면 새 주문으로 추정하지 않는다.
      if (payload.eventType === 'UPDATE' && !known.has(key(payload.new?.id))) {
        if (payload.new?.id != null) known.set(key(payload.new.id), payload.new);
        return false;
      }
      return accept(payload.new, customers);
    },
    scan(rows, customers) { return (rows || []).filter(row => accept(row, customers)); },
  };
}
