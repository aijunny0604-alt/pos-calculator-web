import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import OrderDetail from '../src/pages/OrderDetail';
import CustomerList from '../src/pages/CustomerList';
import { getTodayKST } from '../src/lib/utils';
import '../src/index.css';
import '../src/styles/move-design.css';

const name = '교환 검증 샘플 업체';
const time = new Date().toISOString();
const query = new URLSearchParams(location.search);
const multi = query.has('multiple');
const full = multi || query.has('full');
const items = [{ id: 1, name: '기존 머플러팁', price: 92400, quantity: 4 }];
const firstReturn = { returnId: 'RET-existing', returnedAt: time, itemId: 1, itemName: items[0].name, quantity: 1, price: 92400, total: 92400 };
const order = {
  id: 'DEMO-ORIGINAL', orderNumber: 'DEMO-ORIGINAL', createdAt: time, customerName: name, priceType: 'wholesale',
  items, totalAmount: 369600, totalReturned: full ? 369600 : 92400,
  returns: full && !multi
    ? [{ ...firstReturn, quantity: 4, total: 369600 }]
    : [firstReturn, ...(multi ? [{ ...firstReturn, returnId: 'RET-second', quantity: 3, total: 277200 }] : [])],
};
const exchangeOrder = {
  id: 'DEMO-EXCHANGE', orderNumber: 'DEMO-EXCHANGE', createdAt: getTodayKST() + 'T00:30:00+09:00', customerName: name, priceType: 'wholesale',
  items: [{ id: 2, name: '교체 머플러팁 SNPK 114D-S', price: 100320, quantity: 4 }], totalAmount: 401280,
};
const older = { ...exchangeOrder, id: 'DEMO-OLDER', orderNumber: 'DEMO-OLDER', createdAt: '2025-09-17T15:05:00Z',
  items: [{ id: 3, name: '이전 주문 상품', price: 100320, quantity: 4 }] };

function Fixture() {
  const [current, setCurrent] = useState(order);
  const [fail, setFail] = useState(true);
  const [open, setOpen] = useState(true);
  const orders = [current, exchangeOrder, older];
  const onSave = async (source, operation) => {
    if (fail) {
      setFail(false);
      throw new Error('샘플 저장 실패');
    }
    const { action, details, returnId, selections } = operation;
    const newRows = selections.map(({ index, quantity }) => ({
      returnId, itemId: source.items[index].id, itemName: source.items[index].name, quantity,
      price: source.items[index].price, total: source.items[index].price * quantity, returnedAt: time, returnDetails: details,
    }));
    const returns = action === 'add' ? [...source.returns, ...newRows] : source.returns.map(row => row.returnId === returnId ? { ...row, returnDetails: details } : row);
    const updated = { ...source, returns, totalReturned: returns.reduce((sum, row) => sum + row.total, 0) };
    setCurrent(updated);
    return updated;
  };
  const customer = query.has('customer');
  return <>
    <output aria-label="반품 금액 저장값" className="sr-only">{current.totalReturned}</output>
    {customer ? <CustomerList customers={[{ id: 'demo', name }]} orders={orders} onSaveOrderReturn={onSave} onBack={() => {}} />
      : <OrderDetail isOpen={open} order={current} orders={orders} onSaveOrderReturn={onSave} onClose={() => setOpen(false)} />}
  </>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
