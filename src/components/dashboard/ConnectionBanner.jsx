import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Loader2, CheckCircle2 } from 'lucide-react';

// 대시보드 상단 상시 표시 연결 상태 배너 (2026-05-12).
// - 온라인: 초록 그라데이션 + 좌→우 sheen flow + 펄스 도트
// - 오프라인: 빨강 hazard stripe 흐름 + 깜빡 도트 + 흔들림(전환 시 1회) + 재연결 spinner
// - 마지막 동기화 시각 표시 (온라인 시)
export default function ConnectionBanner({ isOnline }) {
  const prevRef = useRef(isOnline);
  const [shake, setShake] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(() => (isOnline ? new Date() : null));
  const [, forceTick] = useState(0);

  // 상태 변경 감지: 온라인 → 오프라인 전환 시 1회 흔들림, 복구 시 동기화 시각 갱신
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = isOnline;
    if (prev === isOnline) return;

    if (prev === true && isOnline === false) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 700);
      return () => clearTimeout(t);
    }
    if (prev === false && isOnline === true) {
      setLastSyncAt(new Date());
    }
  }, [isOnline]);

  // "마지막 동기화: N초 전" 텍스트 매 30초마다 재계산
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const formatSyncAgo = () => {
    if (!lastSyncAt) return '대기 중';
    const diff = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
    if (diff < 5) return '방금';
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    return `${Math.floor(diff / 3600)}시간 전`;
  };

  if (isOnline) {
    return (
      <div
        className="relative overflow-hidden rounded-xl border animate-connection-banner-in"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--success) 18%, var(--card)) 0%, var(--card) 60%, color-mix(in srgb, var(--success) 8%, var(--card)) 100%)',
          borderColor: 'color-mix(in srgb, var(--success) 35%, var(--border))',
        }}
        role="status"
        aria-live="polite"
      >
        {/* 좌→우 sheen flow 오버레이 */}
        <div
          className="absolute inset-0 pointer-events-none animate-connection-sheen-flow"
          style={{
            background: 'linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--success) 22%, transparent) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
          }}
          aria-hidden="true"
        />
        <div className="relative px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* 펄스 ring 도트 */}
            <div className="relative w-3 h-3 flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-[var(--success)]" />
              <span
                className="absolute inset-0 rounded-full bg-[var(--success)] animate-connection-pulse-ring pointer-events-none"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-bold text-sm sm:text-base" style={{ color: 'var(--success)' }}>
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span>클라우드 실시간 연결</span>
              </div>
              <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                Supabase · 마지막 동기화: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{formatSyncAgo()}</span>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
            style={{ background: 'color-mix(in srgb, var(--success) 18%, transparent)', color: 'var(--success)' }}
          >
            <Wifi className="w-3.5 h-3.5" />
            ONLINE
          </div>
        </div>
      </div>
    );
  }

  // 오프라인 상태
  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 animate-connection-banner-in ${shake ? 'animate-connection-shake-once' : ''}`}
      style={{
        background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
        borderColor: 'color-mix(in srgb, var(--destructive) 60%, var(--border))',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--destructive) 25%, transparent), 0 8px 24px -8px color-mix(in srgb, var(--destructive) 35%, transparent)',
      }}
      role="alert"
      aria-live="assertive"
    >
      {/* hazard 줄무늬 흐름 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none animate-connection-hazard-flow opacity-60"
        style={{
          background: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, color-mix(in srgb, var(--destructive) 18%, transparent) 10px, color-mix(in srgb, var(--destructive) 18%, transparent) 20px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />
      <div className="relative px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* 깜빡 도트 */}
          <div className="relative w-3 h-3 flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-[var(--destructive)] animate-connection-blink-red" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-sm sm:text-base" style={{ color: 'var(--destructive)' }}>
              <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span>오프라인 — 클라우드 연결 끊김</span>
            </div>
            <div className="text-[11px] sm:text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span>자동 재연결 시도 중... 작업은 로컬에 임시 저장됩니다</span>
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
          style={{ background: 'color-mix(in srgb, var(--destructive) 22%, transparent)', color: 'var(--destructive)' }}
        >
          <WifiOff className="w-3.5 h-3.5" />
          OFFLINE
        </div>
      </div>
    </div>
  );
}
