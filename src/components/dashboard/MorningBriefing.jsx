// 모닝 브리핑 카드 — 오늘 할 일 자동 요약
import { useMemo } from 'react';
import { Truck, AlertTriangle, Users, Package, TrendingUp, Sun } from 'lucide-react';
import { formatPrice, getTodayKST } from '@/lib/utils';

export default function MorningBriefing({ orders = [], savedCarts = [], products = [], customers = [], setCurrentPage }) {
  const briefing = useMemo(() => {
    const today = getTodayKST();
    const items = [];

    // 1. 오늘 출고 예정 장바구니
    const todayShipments = savedCarts.filter(c => {
      if (!c.delivery_date) return false;
      return c.delivery_date === today;
    });
    if (todayShipments.length > 0) {
      items.push({
        icon: Truck,
        color: 'var(--primary)',
        bg: 'color-mix(in srgb, var(--primary) 8%, transparent)',
        label: `오늘 출고 예정 ${todayShipments.length}건`,
        detail: todayShipments.slice(0, 3).map(c => c.name).join(', '),
        action: () => setCurrentPage?.('saved-carts'),
      });
    }

    // 2. 지연된 장바구니
    const overdue = savedCarts.filter(c => {
      if (!c.delivery_date || c.status === 'completed' || c.status === 'cancelled') return false;
      return c.delivery_date < today;
    });
    if (overdue.length > 0) {
      items.push({
        icon: AlertTriangle,
        color: 'var(--destructive)',
        bg: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
        label: `배송 지연 ${overdue.length}건`,
        detail: overdue.slice(0, 3).map(c => c.name).join(', '),
        action: () => setCurrentPage?.('saved-carts'),
      });
    }

    // 3. 재고 부족 (5개 이하)
    const lowStock = products.filter(p => {
      const stock = p.stock ?? 50;
      return stock > 0 && stock <= 5 && p.stock_status !== 'incoming';
    });
    if (lowStock.length > 0) {
      items.push({
        icon: Package,
        color: 'var(--warning)',
        bg: 'color-mix(in srgb, var(--warning) 8%, transparent)',
        label: `재고 부족 ${lowStock.length}개 제품`,
        detail: lowStock.slice(0, 3).map(p => `${p.name}(${p.stock}개)`).join(', '),
        action: () => setCurrentPage?.('stock'),
      });
    }

    // 4. 미수금 높은 거래처 (상위 3곳)
    const withDebt = customers
      .filter(c => (c.outstanding_amount || 0) > 0)
      .sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0));
    if (withDebt.length > 0) {
      const totalDebt = withDebt.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
      items.push({
        icon: Users,
        color: '#f59e0b',
        bg: 'color-mix(in srgb, #f59e0b 8%, transparent)',
        label: `미수금 ${formatPrice(totalDebt)}원 (${withDebt.length}곳)`,
        detail: withDebt.slice(0, 3).map(c => `${c.name} ${formatPrice(c.outstanding_amount)}원`).join(', '),
        action: () => setCurrentPage?.('customers'),
      });
    }

    // 5. 오늘 매출 현황
    const todayOrders = orders.filter(o => {
      const d = o.createdAt || o.created_at || '';
      return d.startsWith(today);
    });
    if (todayOrders.length > 0) {
      const todaySales = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      items.push({
        icon: TrendingUp,
        color: 'var(--success)',
        bg: 'color-mix(in srgb, var(--success) 8%, transparent)',
        label: `오늘 매출 ${formatPrice(todaySales)}원 (${todayOrders.length}건)`,
        action: () => setCurrentPage?.('orders'),
      });
    }

    return items;
  }, [orders, savedCarts, products, customers, setCurrentPage]);

  if (briefing.length === 0) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '오늘도 힘내세요' : '수고하셨어요';

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'color-mix(in srgb, var(--primary) 3%, var(--card))', borderColor: 'color-mix(in srgb, var(--primary) 15%, var(--border))' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Sun className="w-4 h-4" style={{ color: '#f59e0b' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
          {greeting} — 오늘의 브리핑
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--primary)', color: 'white' }}>
          {briefing.length}
        </span>
      </div>
      <div className="space-y-2">
        {briefing.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              onClick={item.action}
              className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-all hover:shadow-sm active:scale-[0.99]"
              style={{ background: item.bg }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: item.color }}>{item.label}</p>
                {item.detail && (
                  <p className="text-[10px] mt-0.5 break-words leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {item.detail}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
