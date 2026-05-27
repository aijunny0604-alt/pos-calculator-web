import { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';

// 자체 레이아웃(sticky header, 패딩)을 관리하는 페이지
const fullScreenPages = ['pos', 'orders', 'customers', 'saved-carts', 'stock', 'shipping', 'burnway-stock', 'ai-order', 'ai-analytics', 'smartstore'];

export default function AppLayout({ children, currentPage, onNavigate, isOnline, orderCount = 0, savedCartCount = 0, shippingCount = 0 }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isFullScreen = fullScreenPages.includes(currentPage);

  // 페이지 전환 페이드인 애니메이션
  const [fadeKey, setFadeKey] = useState(currentPage);
  const [fading, setFading] = useState(false);
  const prevPage = useRef(currentPage);
  const pageAnimationStyle = currentPage === 'ai-analytics'
    ? {
        animationDuration: '1100ms',
        animationTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
      }
    : { animationDuration: '280ms' };

  useEffect(() => {
    if (currentPage !== prevPage.current) {
      prevPage.current = currentPage;
      setFading(true);
      const t = requestAnimationFrame(() => {
        setFadeKey(currentPage);
        setFading(false);
      });
      return () => cancelAnimationFrame(t);
    }
  }, [currentPage]);

  // Listen for 'toggle-sidebar' custom events from fullscreen pages
  useEffect(() => {
    const toggleHandler = () => setSidebarOpen(prev => !prev);
    const openHandler = () => setSidebarOpen(true);
    window.addEventListener('toggle-sidebar', toggleHandler);
    window.addEventListener('open-sidebar', openHandler);
    return () => {
      window.removeEventListener('toggle-sidebar', toggleHandler);
      window.removeEventListener('open-sidebar', openHandler);
    };
  }, []);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} isOnline={isOnline} orderCount={orderCount} savedCartCount={savedCartCount} shippingCount={shippingCount} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 h-full bg-[var(--card)] shadow-xl">
            <Sidebar
              currentPage={currentPage}
              onNavigate={(page) => { onNavigate(page); setSidebarOpen(false); }}
              isOnline={isOnline}
              orderCount={orderCount}
              savedCartCount={savedCartCount}
              shippingCount={shippingCount}
            />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        {!isFullScreen && (
          // 데스크탑에서 헤더 숨김 — 페이지 내부 큰 h1로 통일 (2026-05-12 사용자 요청)
          // 모바일은 햄버거 메뉴 위해 유지
          <div className="md:hidden">
            <Header onMenuClick={() => setSidebarOpen(prev => !prev)} currentPage={currentPage} isOnline={isOnline} />
          </div>
        )}
        <main className={`flex-1 min-h-0 h-full overflow-y-auto scroll-smooth ${
          isFullScreen
            ? 'pb-16 md:pb-0'
            : 'p-2 sm:p-4 md:p-6 pb-20 md:pb-6'
        }`} style={{ WebkitOverflowScrolling: 'touch' }}>
          <div
            key={fadeKey}
            className={`animate-page-in ${isFullScreen ? 'h-full min-h-0' : 'min-h-full h-full'}`}
            style={pageAnimationStyle}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav - POS 페이지에서 숨김 */}
      {currentPage !== 'pos' && (
        <MobileNav currentPage={currentPage} onNavigate={onNavigate} orderCount={orderCount} savedCartCount={savedCartCount} shippingCount={shippingCount} />
      )}
    </div>
  );
}
