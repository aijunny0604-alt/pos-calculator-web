import { ArrowLeft, Menu } from 'lucide-react';
export default function JarvisHeader({
  rightActions,
  onBack,
  onSidebarToggle
}) {
  return <header className="movis-header"><div className="movis-header-brand"><button className="movis-sidebar-button" onClick={onSidebarToggle} aria-label="메뉴 열기"><Menu size={20} /></button><button className="movis-back-button" onClick={onBack} aria-label="대시보드로 돌아가기"><ArrowLeft size={18} /></button><svg className="movis-monogram" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2 37 12v16L20 38 3 28V12Z" stroke="currentColor" strokeWidth="1" /><path d="M10 27V14l10 10 10-10v13" stroke="currentColor" strokeWidth="2" /><path d="m15 14 5 5 5-5" stroke="currentColor" opacity=".45" /></svg><div><span className="movis-wordmark">MOVIS<span>®</span></span><small>INTELLIGENCE SYSTEM</small></div><span className="movis-header-divider" /><span className="movis-brand-caption">MOVE MOTORS<br />OPERATIONS ASSISTANT</span></div><div className="movis-header-actions">{rightActions}</div></header>;
}
