import { useState } from 'react';
import { LayoutDashboard, ShoppingBag, ClipboardList, ShoppingCart, Users, Package, Truck, Brain, Settings, Calculator, CircleDollarSign, FileText, Sparkles, Store } from 'lucide-react';
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
  { id: 'smartstore', label: '스마트스토어 주문', icon: Store },
  { id: 'admin', label: '관리자', icon: Settings },
  // 🌟 MOVIS — 항상 맨 아래 (사용자 시선 끝점에 배치)
  { id: 'ai-analytics', label: 'MOVIS', icon: Sparkles, premium: true, sublabel: 'Quantum AI' },
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

export default function Sidebar({ currentPage, onNavigate, isOnline, orderCount = 0, savedCartCount = 0, shippingCount = 0, smartstoreCount = 0 }) {
  const [showCalc, setShowCalc] = useState(false);
  const badgeMap = {
    orders: orderCount,
    'saved-carts': savedCartCount,
    shipping: shippingCount,
    smartstore: smartstoreCount,
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
        {navItems.map(({ id, label, icon: Icon, premium, sublabel }) => {
          const isActive = currentPage === id;
          const badgeCount = badgeMap[id] || 0;

          // 🌟 Premium 메뉴 (MOVIS) — shimmer + scan-line + glow ring + 별 회전
          if (premium) {
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`group relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-bold transition-all overflow-hidden movis-menu motion-reduce:!animate-none ${
                  isActive ? 'shadow-lg shadow-cyan-500/40' : 'hover:shadow-md hover:shadow-cyan-500/30'
                }`}
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, #00d4ff 0%, #4dffff 50%, #a855f7 100%)'
                    : 'linear-gradient(135deg, rgba(0,212,255,0.10) 0%, rgba(77,255,255,0.06) 50%, rgba(168,85,247,0.10) 100%)',
                  color: isActive ? '#050b18' : 'var(--foreground)',
                  border: '1px solid rgba(0,212,255,0.35)',
                }}
              >
                {/* 🌊 Shimmer (그라데이션 좌→우 흐름) */}
                <span
                  className="absolute inset-0 pointer-events-none movis-shimmer"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)',
                    transform: 'translateX(-100%)',
                  }}
                />
                {/* ✨ Scan-line (상→하 빛 스캔) */}
                <span
                  className="absolute left-0 right-0 h-[2px] pointer-events-none movis-scan"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #4dffff, transparent)',
                    boxShadow: '0 0 8px #4dffff',
                  }}
                />
                {/* 🔆 Glow ring (외곽 펄스) */}
                <span
                  className="absolute inset-0 pointer-events-none rounded-lg movis-ring"
                  style={{
                    boxShadow: 'inset 0 0 0 1px rgba(0,212,255,0.5)',
                  }}
                />
                {/* 배경 광채 펄스 (호버 시) */}
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at 30% 50%, rgba(0,212,255,0.35), transparent 60%)',
                  }}
                />
                {/* 회전 별 아이콘 */}
                <Icon
                  className="w-5 h-5 flex-shrink-0 relative z-10"
                  style={{
                    color: isActive ? '#050b18' : '#00d4ff',
                    filter: isActive ? 'none' : 'drop-shadow(0 0 6px rgba(0,212,255,0.7))',
                    animation: isActive ? 'spin 8s linear infinite' : 'jarvis-glow-pulse 2.5s ease-in-out infinite',
                  }}
                />
                <div className="relative z-10 flex flex-col items-start leading-tight">
                  <span
                    className="font-bold tracking-wider"
                    style={{
                      letterSpacing: '0.12em',
                      fontFamily: 'JetBrains Mono, monospace',
                      textShadow: isActive ? 'none' : '0 0 8px rgba(0,212,255,0.45)',
                    }}
                  >
                    {label}
                  </span>
                  {sublabel && (
                    <span
                      className="text-[9px] font-mono uppercase tracking-widest opacity-80"
                      style={{ color: isActive ? '#050b18' : 'var(--jarvis-text-muted, #6b7c93)' }}
                    >
                      {sublabel}
                    </span>
                  )}
                </div>
                {/* 우측 라이브 도트 (온라인 상태) */}
                <span className="ml-auto relative z-10 flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      background: '#00ff88',
                      boxShadow: '0 0 6px #00ff88',
                    }}
                  />
                </span>
                <CountBadge count={badgeCount} isActive={isActive} />
              </button>
            );
          }

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
        <div className="flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          {/* 도트 + 외곽 펄스 링 (온라인) / 깜빡임 (오프라인) — 2026-05-11 */}
          <div className="relative w-2 h-2 flex-shrink-0">
            <div
              className={`absolute inset-0 rounded-full ${isOnline ? 'bg-[var(--success)]' : 'bg-[var(--destructive)] animate-connection-blink-red'}`}
            />
            {isOnline && (
              <span
                className="absolute inset-0 rounded-full bg-[var(--success)] animate-connection-pulse-ring pointer-events-none"
                aria-hidden="true"
              />
            )}
          </div>
          <span className={isOnline ? '' : 'text-[var(--destructive)] font-semibold'}>
            {isOnline ? '클라우드 연결됨' : '오프라인'}
          </span>
        </div>
      </div>

      {showCalc && <QuickCalculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}
