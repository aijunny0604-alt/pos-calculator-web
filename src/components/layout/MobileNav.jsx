import { LayoutDashboard, ShoppingBag, ClipboardList, ShoppingCart, Users, Settings } from 'lucide-react';

const mobileNavItems = [
  { id: 'dashboard', label: '홈', icon: LayoutDashboard },
  { id: 'pos', label: '주문', icon: ShoppingBag },
  { id: 'orders', label: '내역', icon: ClipboardList },
  { id: 'saved-carts', label: '장바구니', icon: ShoppingCart },
  { id: 'customers', label: '거래처', icon: Users },
  { id: 'admin', label: '관리', icon: Settings },
];

function MobileBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="absolute -top-1 -right-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full text-[9px] font-bold leading-none"
      style={{
        backgroundColor: 'var(--destructive)',
        color: '#fff',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function MobileNav({ currentPage, onNavigate, orderCount = 0, savedCartCount = 0, shippingCount = 0 }) {
  const badgeMap = {
    orders: orderCount,
    'saved-carts': savedCartCount,
    shipping: shippingCount,
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[var(--card)] border-t border-[var(--border)] no-print">
      <div className="flex">
        {mobileNavItems.map(({ id, label, icon: Icon }) => {
          const isActive = currentPage === id;
          const badgeCount = badgeMap[id] || 0;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[52px] py-2.5 text-xs transition-colors ${
                isActive ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5 mb-0.5" />
                <MobileBadge count={badgeCount} />
              </div>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
