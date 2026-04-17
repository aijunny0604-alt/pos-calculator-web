import { useMemo, useState } from 'react';
import {
  TrendingUp, ShoppingCart, Package, AlertTriangle, Users,
  ArrowRight, Calculator, ClipboardList, Brain, Truck, Eye, FileText, ExternalLink, CheckCircle2
} from 'lucide-react';
import { formatPrice, formatDateTime, getTodayKST, toDateKST } from '@/lib/utils';

export default function Dashboard({
  orders = [],
  products = [],
  savedCarts = [],
  customers = [],
  supabaseConnected,
  setCurrentPage,
  onViewOrder,
  onUpdateOrder,
  onAiOrder,
}) {
  const today = getTodayKST();
  const [aiText, setAiText] = useState('');

  const todayStats = useMemo(() => {
    const todayOrders = orders.filter(o => toDateKST(o.createdAt) === today);
    const totalRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return {
      count: todayOrders.length,
      revenue: totalRevenue,
      average: todayOrders.length > 0 ? Math.round(totalRevenue / todayOrders.length) : 0,
    };
  }, [orders, today]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);
  }, [orders]);

  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const stock = p.stock ?? 50;
      const minStock = p.min_stock ?? 5;
      return stock <= minStock;
    });
  }, [products]);

  const pendingCarts = useMemo(() => {
    return savedCarts.filter(c => c.status !== 'completed').length;
  }, [savedCarts]);

  const uncheckedMemos = useMemo(() => {
    return orders
      .filter(o => !!o.memo && !o.memoChecked)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders]);

  const StatCard = ({ icon: Icon, label, value, sub, color, onClick }) => (
    <button
      onClick={onClick}
      className="flex items-start gap-4 p-5 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 text-left w-full"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="p-3 rounded-xl" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
      </div>
    </button>
  );

  const QuickAction = ({ icon: Icon, label, onClick }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:shadow-sm hover:border-[var(--primary)]"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <Icon className="w-5 h-5" style={{ color: 'var(--primary)' }} />
      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</span>
      <ArrowRight className="w-4 h-4 ml-auto" style={{ color: 'var(--muted-foreground)' }} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>대시보드</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          {!supabaseConnected && ' · 오프라인 모드'}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="오늘 매출"
          value={`${formatPrice(todayStats.revenue)}원`}
          sub={`${todayStats.count}건 · 평균 ${formatPrice(todayStats.average)}원`}
          color="var(--primary)"
          onClick={() => setCurrentPage('orders')}
        />
        <StatCard
          icon={ShoppingCart}
          label="대기 장바구니"
          value={`${pendingCarts}건`}
          sub={`전체 ${savedCarts.length}건`}
          color="var(--warning)"
          onClick={() => setCurrentPage('saved-carts')}
        />
        <StatCard
          icon={Users}
          label="거래처"
          value={`${customers.length}곳`}
          sub={`블랙리스트 ${customers.filter(c => c.is_blacklist).length}곳`}
          color="var(--success)"
          onClick={() => setCurrentPage('customers')}
        />
        <StatCard
          icon={Package}
          label="재고 부족"
          value={`${lowStockProducts.length}건`}
          sub={lowStockProducts.length > 0 ? '확인 필요' : '정상'}
          color={lowStockProducts.length > 0 ? 'var(--destructive)' : 'var(--success)'}
          onClick={() => setCurrentPage('stock')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: AI Quick Order + Recent Orders */}
        <div className="lg:col-span-2 space-y-4">
          {/* AI Quick Order Input */}
          <div className="rounded-xl border p-4" style={{ background: 'color-mix(in srgb, var(--primary) 3%, var(--card))', borderColor: 'color-mix(in srgb, var(--primary) 20%, var(--border))' }}>
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>AI 빠른 주문</h3>
            </div>
            <div className="flex gap-2">
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="주문 내용을 붙여넣기 하세요...&#10;예: 플랜지 54 10개, y관 4개"
                className="flex-1 text-sm rounded-lg border p-2.5 resize-none focus:outline-none focus:ring-2"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)', minHeight: '52px' }}
                rows={2}
              />
              <button
                onClick={() => {
                  if (aiText.trim()) {
                    onAiOrder?.(aiText.trim());
                    setAiText('');
                  } else {
                    setCurrentPage('ai-order');
                  }
                }}
                className="self-end px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors flex-shrink-0"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Brain className="w-4 h-4" />
                인식
              </button>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="font-bold" style={{ color: 'var(--foreground)' }}>최근 주문</h2>
            <button
              onClick={() => setCurrentPage('orders')}
              className="text-xs font-medium flex items-center gap-1 hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              전체보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>주문 내역이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto custom-scroll">
              {recentOrders.map((order, i) => (
                <button
                  key={order.id || i}
                  onClick={() => onViewOrder?.(order)}
                  className="flex items-center justify-between w-full py-3 px-3 rounded-lg transition-all hover:bg-[var(--accent)] hover:shadow-sm text-left group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                        color: 'var(--primary)',
                      }}
                    >
                      {(order.customerName || '일반')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words" style={{ color: 'var(--foreground)' }}>
                        {order.customerName || '일반고객'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDateTime(order.createdAt)}
                        {order.items && ` · ${order.items.length}종`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                      {formatPrice(order.totalAmount || 0)}원
                    </span>
                    <Eye
                      className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity"
                      style={{ color: 'var(--muted-foreground)' }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Unchecked Memos - Top Priority */}
          {uncheckedMemos.length > 0 && (
            <div className="rounded-xl border p-5" style={{ background: 'color-mix(in srgb, var(--destructive) 3%, var(--card))', borderColor: 'color-mix(in srgb, var(--destructive) 20%, var(--border))' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: 'var(--destructive)' }} />
                  <h2 className="font-bold" style={{ color: 'var(--foreground)' }}>미확인 메모</h2>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--destructive)', color: 'white' }}>{uncheckedMemos.length}</span>
                </div>
                <button
                  onClick={() => setCurrentPage('orders')}
                  className="text-xs flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--primary)' }}
                >
                  전체보기 <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll">
                {uncheckedMemos.slice(0, 10).map((order) => (
                  <div
                    key={order.id || order.orderNumber}
                    className="flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer hover:shadow-sm transition-all group"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                    onClick={() => onViewOrder(order)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>{order.customerName || '미등록'}</span>
                        <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.createdAt)}</span>
                      </div>
                      <p className="text-sm break-words leading-snug line-clamp-2" style={{ color: 'var(--foreground)' }}>{order.memo}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onUpdateOrder) onUpdateOrder(order.id || order.orderNumber, { memo_checked: true });
                      }}
                      className="flex-shrink-0 p-2 -m-1 rounded-lg hover:bg-black/10 active:bg-black/20 transition-colors opacity-50 group-hover:opacity-100"
                      title="확인 완료"
                    >
                      <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low Stock Alert */}
          {lowStockProducts.length > 0 && (
            <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                <h2 className="font-bold" style={{ color: 'var(--foreground)' }}>재고 부족 알림</h2>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scroll">
                {lowStockProducts.map((p, i) => (
                  <div key={p.id || i} className="flex items-center justify-between text-sm">
                    <span className="break-words flex-1 min-w-0" style={{ color: 'var(--foreground)' }}>{p.name}</span>
                    <span className="font-medium ml-2 flex-shrink-0" style={{ color: 'var(--destructive)' }}>
                      {p.stock ?? 0}개
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="font-bold mb-3" style={{ color: 'var(--foreground)' }}>바로가기</h2>
            <div className="space-y-2">
              <QuickAction icon={Calculator} label="제품 주문하기" onClick={() => setCurrentPage('pos')} />
              <QuickAction icon={Brain} label="AI 주문 인식" onClick={() => setCurrentPage('ai-order')} />
              <QuickAction icon={Truck} label="택배 송장" onClick={() => setCurrentPage('shipping')} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <a
                href="https://docs.google.com/document/d/e/2PACX-1vTfbJ0wRV2bW5D-lJ1na9vFLjpjQzofyxh0MF5kcsrhz6KYydBqJRz7IFCvwrAuYhZeUrAHU0DBeCNj/pub"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors border"
                style={{ background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))', borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))', color: 'var(--destructive)' }}
              >
                <FileText className="w-4 h-4" />
                JSR 단가표
                <ExternalLink className="w-3 h-3 opacity-50" />
              </a>
              <a
                href="https://docs.google.com/document/d/e/2PACX-1vQbwis0GO8q03dNHA6p-G-xD1OOoENk9EP6s0PgjGBXY89ziSnP2yVPFmd4JThokUFLgYSepmL3zyPt/pub"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors border"
                style={{ background: 'color-mix(in srgb, var(--info) 10%, var(--card))', borderColor: 'color-mix(in srgb, var(--info) 30%, var(--border))', color: 'var(--info)' }}
              >
                <FileText className="w-4 h-4" />
                번웨이 단가표
                <ExternalLink className="w-3 h-3 opacity-50" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
