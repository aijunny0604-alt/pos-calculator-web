import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';

// 자체 레이아웃(sticky header, 패딩)을 관리하는 페이지
const fullScreenPages = ['pos', 'orders', 'customers', 'saved-carts', 'stock', 'shipping', 'burnway-stock', 'ai-order'];

export default function AppLayout({ children, currentPage, onNavigate, isOnline, orderCount = 0, savedCartCount = 0, shippingCount = 0 }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isFullScreen = fullScreenPages.includes(currentPage);

  // Listen for 'open-sidebar' custom events from fullscreen pages
  useEffect(() => {
    const handler = () => setSidebarOpen(true);
    window.addEventListener('open-sidebar', handler);
    return () => window.removeEventListener('open-sidebar', handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} isOnline={isOnline} orderCount={orderCount} savedCartCount={savedCartCount} shippingCount={shippingCount} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
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
      <div className="flex flex-1 flex-col overflow-hidden">
        {!isFullScreen && (
          <Header onMenuClick={() => setSidebarOpen(true)} currentPage={currentPage} isOnline={isOnline} />
        )}
        <main className={`flex-1 overflow-y-auto scroll-smooth ${
          isFullScreen
            ? 'pb-16 md:pb-0'
            : 'p-4 md:p-6 pb-20 md:pb-6'
        }`} style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav - POS 페이지에서 숨김 */}
      {currentPage !== 'pos' && (
        <MobileNav currentPage={currentPage} onNavigate={onNavigate} orderCount={orderCount} savedCartCount={savedCartCount} shippingCount={shippingCount} />
      )}
    </div>
  );
}
