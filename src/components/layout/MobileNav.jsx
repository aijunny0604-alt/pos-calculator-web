import { LayoutDashboard, Calculator, ClipboardList, ShoppingCart, Users, Settings } from 'lucide-react';

const mobileNavItems = [
  { id: 'dashboard', label: '홈', icon: LayoutDashboard },
  { id: 'pos', label: 'POS', icon: Calculator },
  { id: 'orders', label: '주문', icon: ClipboardList },
  { id: 'saved-carts', label: '장바구니', icon: ShoppingCart },
  { id: 'customers', label: '거래처', icon: Users },
  { id: 'admin', label: '관리', icon: Settings },
];

export default function MobileNav({ currentPage, onNavigate }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[var(--card)] border-t border-[var(--border)] no-print">
      <div className="flex">
        {mobileNavItems.map(({ id, label, icon: Icon }) => {
          const isActive = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                isActive ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
