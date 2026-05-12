import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

// 대시보드 상단 연결 상태 카드 (2026-05-12 v3 — 단순 정적 형태).
// 사용자 요청: 노드 그래프 SVG + 애니메이션 모두 제거. 깔끔한 텍스트 + 뱃지만.
export default function ConnectionBanner({ isOnline }) {
  const [lastSyncAt, setLastSyncAt] = useState(() => (isOnline ? new Date() : null));
  const prevRef = useRef(isOnline);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = isOnline;
    if (prev === false && isOnline === true) setLastSyncAt(new Date());
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isOnline]);

  const syncAgo = () => {
    if (!lastSyncAt) return '대기 중';
    const d = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
    if (d < 5) return '방금';
    if (d < 60) return `${d}초 전`;
    if (d < 3600) return `${Math.floor(d / 60)}분 전`;
    return `${Math.floor(d / 3600)}시간 전`;
  };

  return (
    <div
      className="rounded-xl border px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3"
      style={{
        background: isOnline
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 10%, var(--card)) 0%, var(--card) 70%)'
          : 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
        borderColor: isOnline
          ? 'color-mix(in srgb, var(--success) 30%, var(--border))'
          : 'color-mix(in srgb, var(--destructive) 55%, var(--border))',
        borderWidth: isOnline ? 1 : 2,
      }}
      role={isOnline ? 'status' : 'alert'}
      aria-live={isOnline ? 'polite' : 'assertive'}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isOnline ? (
          <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" style={{ color: 'var(--success)' }} />
        ) : (
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" style={{ color: 'var(--destructive)' }} />
        )}
        <div className="min-w-0">
          <div className="font-bold text-sm sm:text-base" style={{ color: isOnline ? 'var(--success)' : 'var(--destructive)' }}>
            {isOnline ? '클라우드 실시간 연결' : '오프라인 — 연결 끊김'}
          </div>
          <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {isOnline ? (
              <>Supabase · 마지막 동기화: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{syncAgo()}</span></>
            ) : (
              '자동 재연결 시도 중... 작업은 로컬에 임시 저장됩니다'
            )}
          </div>
        </div>
      </div>

      <div
        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
        style={{
          background: isOnline
            ? 'color-mix(in srgb, var(--success) 18%, transparent)'
            : 'color-mix(in srgb, var(--destructive) 22%, transparent)',
          color: isOnline ? 'var(--success)' : 'var(--destructive)',
        }}
      >
        {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </div>
    </div>
  );
}
