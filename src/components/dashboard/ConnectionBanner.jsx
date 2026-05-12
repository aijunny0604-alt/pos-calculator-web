import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

// 대시보드 우측 상단 작은 뱃지 (2026-05-12 v4 — 미니 뱃지 형태).
// 사용자 요청: 전체 바 제거, 우측 상단에 ONLINE/OFFLINE 뱃지만 표시.
// 마우스 hover 시 부가 정보(마지막 동기화 시각) 툴팁.
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

  const tooltip = isOnline
    ? `Supabase 클라우드 실시간 연결 · 마지막 동기화: ${syncAgo()}`
    : '오프라인 — 자동 재연결 시도 중. 작업은 로컬에 임시 저장됩니다';

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0 cursor-default"
      style={{
        background: isOnline
          ? 'color-mix(in srgb, var(--success) 18%, transparent)'
          : 'color-mix(in srgb, var(--destructive) 22%, transparent)',
        color: isOnline ? 'var(--success)' : 'var(--destructive)',
        border: `1px solid ${isOnline ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'color-mix(in srgb, var(--destructive) 45%, transparent)'}`,
      }}
      role={isOnline ? 'status' : 'alert'}
      aria-live={isOnline ? 'polite' : 'assertive'}
      title={tooltip}
    >
      {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      {isOnline ? 'ONLINE' : 'OFFLINE'}
    </div>
  );
}
