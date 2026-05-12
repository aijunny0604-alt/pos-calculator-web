import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';

// 연결 상태 변경 시 화면 상단에 슬라이드 인 토스트 표시.
// - 오프라인 전환(true → false): 지속 표시 (자동으로 사라지지 않음, 복구되면 자동 dismiss)
// - 온라인 복구(false → true): 3초 후 자동 사라짐
// - 첫 마운트(prev undefined): 토스트 표시 안 함 (앱 시작 시 깜빡임 방지)
export default function ConnectionToast({ isOnline }) {
  const prevRef = useRef(isOnline);
  const [toast, setToast] = useState(null); // { type: 'offline' | 'recovered', leaving: boolean }
  const autoDismissRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = isOnline;
    if (prev === isOnline) return;

    // 자동 dismiss 타이머 정리
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }

    if (prev === true && isOnline === false) {
      // 온라인 → 오프라인 전환: 지속 표시
      setToast({ type: 'offline', leaving: false });
    } else if (prev === false && isOnline === true) {
      // 오프라인 → 온라인 복구: 3초 후 자동 사라짐
      setToast({ type: 'recovered', leaving: false });
      autoDismissRef.current = setTimeout(() => {
        setToast((t) => (t ? { ...t, leaving: true } : null));
        setTimeout(() => setToast(null), 320); // slide-out 애니메이션 후 unmount
      }, 3000);
    }
  }, [isOnline]);

  useEffect(() => () => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
  }, []);

  if (!toast) return null;

  const isOffline = toast.type === 'offline';
  const animClass = toast.leaving ? 'animate-toast-slide-down-out' : 'animate-toast-slide-down-in';

  return (
    <div
      className={`fixed top-3 left-1/2 z-[200] px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md flex items-center gap-3 min-w-[280px] max-w-[90vw] ${animClass}`}
      style={{
        background: isOffline
          ? 'color-mix(in srgb, var(--destructive) 92%, transparent)'
          : 'color-mix(in srgb, var(--success) 92%, transparent)',
        borderColor: isOffline
          ? 'color-mix(in srgb, var(--destructive) 50%, white)'
          : 'color-mix(in srgb, var(--success) 50%, white)',
        color: 'white',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex-shrink-0">
        {isOffline ? (
          <div className="relative w-6 h-6 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
          </div>
        ) : (
          <Wifi className="w-5 h-5" strokeWidth={2.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isOffline ? (
          <>
            <div className="font-bold text-sm leading-tight">오프라인 전환됨</div>
            <div className="text-[11px] opacity-90 mt-0.5 leading-tight">자동 재연결 시도 중...</div>
          </>
        ) : (
          <>
            <div className="font-bold text-sm leading-tight">연결 복구됨</div>
            <div className="text-[11px] opacity-90 mt-0.5 leading-tight">클라우드 동기화 정상</div>
          </>
        )}
      </div>
      {isOffline && (
        <button
          onClick={() => {
            setToast((t) => (t ? { ...t, leaving: true } : null));
            setTimeout(() => setToast(null), 320);
          }}
          className="ml-1 px-1.5 text-lg leading-none opacity-80 hover:opacity-100 flex-shrink-0"
          aria-label="알림 닫기"
          title="알림 닫기"
        >
          ×
        </button>
      )}
    </div>
  );
}
