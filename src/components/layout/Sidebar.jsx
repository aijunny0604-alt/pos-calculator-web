import { useState } from 'react';
import { LayoutDashboard, ShoppingBag, ClipboardList, ShoppingCart, Users, Package, Truck, Brain, Settings, Calculator, CircleDollarSign, FileText } from 'lucide-react';
import QuickCalculator from '@/pages/QuickCalculator';

const navItems = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'pos', label: '제품 주문', icon: ShoppingBag },
  { id: 'orders', label: '주문 내역', icon: ClipboardList },
  { id: 'saved-carts', label: '저장된 장바구니', icon: ShoppingCart },
  { id: 'shipping', label: '택배 송장', icon: Truck },
  { id: 'customers', label: '거래처 관리', icon: Users },
  { id: 'invoices', label: '명세서', icon: FileText },
  { id: 'stock', label: '재고 현황', icon: Package },
  { id: 'burnway-stock', label: '번웨이 다운파이프', icon: Package },
  { id: 'ai-order', label: 'AI 주문 인식', icon: Brain },
  { id: 'admin', label: '관리자', icon: Settings },
];

function CountBadge({ count, isActive }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-auto flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none"
      style={{
        backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : 'var(--destructive)',
        color: isActive ? 'var(--primary-foreground)' : '#fff',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Sidebar({ currentPage, onNavigate, isOnline, orderCount = 0, savedCartCount = 0, shippingCount = 0 }) {
  const [showCalc, setShowCalc] = useState(false);
  const badgeMap = {
    orders: orderCount,
    'saved-carts': savedCartCount,
    shipping: shippingCount,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-center h-14 px-4 border-b border-[var(--border)]">
        <img
          src={`${import.meta.env.BASE_URL}move-logo.png`}
          alt="MOVE Motors"
          className="h-9 object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = currentPage === id;
          const badgeCount = badgeMap[id] || 0;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
              <CountBadge count={badgeCount} isActive={isActive} />
            </button>
          );
        })}
      </nav>

      {/* Quick Calculator + Connection Status */}
      <div className="p-3 border-t border-[var(--border)] space-y-2">
        <button
          onClick={() => setShowCalc(true)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white"
          style={{ background: 'var(--warning)' }}
        >
          <Calculator className="w-5 h-5 flex-shrink-0" />
          빠른 계산기
        </button>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'}`} />
          {isOnline ? '클라우드 연결됨' : '오프라인'}
        </div>
      </div>

      {showCalc && <QuickCalculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}
