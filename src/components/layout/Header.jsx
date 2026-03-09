import { Menu } from 'lucide-react';

const pageTitles = {
  dashboard: '대시보드',
  pos: 'POS 계산기',
  orders: '주문 내역',
  'saved-carts': '저장된 장바구니',
  customers: '거래처 관리',
  stock: '재고 현황',
  shipping: '택배 송장',
  'ai-order': 'AI 주문 인식',
  admin: '관리자',
};

export default function Header({ onMenuClick, currentPage, isOnline }) {
  return (
    <header className="flex items-center h-14 px-4 border-b border-[var(--border)] bg-[var(--card)] no-print">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <h1 className="ml-2 md:ml-0 text-lg font-bold">{pageTitles[currentPage] || 'POS Calculator'}</h1>
      <div className="flex-1" />
      <div className="flex items-center gap-2 md:hidden">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'}`} />
      </div>
    </header>
  );
}
