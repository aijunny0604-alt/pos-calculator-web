import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileNav from './MobileNav';

export default function AppLayout({ children, currentPage, onNavigate, isOnline }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} isOnline={isOnline} />
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
            />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} currentPage={currentPage} isOnline={isOnline} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileNav currentPage={currentPage} onNavigate={onNavigate} />
    </div>
  );
}
