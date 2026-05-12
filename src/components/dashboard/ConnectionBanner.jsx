import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

// 대시보드 상단 노드 그래프 컨스텔레이션 (2026-05-12 v2).
// SVG로 7개 노드 + 연결선 + 데이터 패킷 흐름을 표현.
// - 온라인: 노드들이 부드럽게 떠다니고 데이터 패킷이 선을 따라 흐름 (초록/청록 톤)
// - 오프라인: 연결선 끊김 + 노드 흩어짐 + 빨강 톤 + 패킷 멈춤

// 노드 좌표 (viewBox 360 x 100). 중심 노드는 0번 (좌측, 큰 노드 = 서버).
const NODES = [
  { id: 0, x: 30, y: 50, r: 6 },   // 서버 (중심, 큰 도트)
  { id: 1, x: 80, y: 25, r: 3.5 },
  { id: 2, x: 80, y: 75, r: 3.5 },
  { id: 3, x: 140, y: 50, r: 4 },  // 허브
  { id: 4, x: 200, y: 25, r: 3.5 },
  { id: 5, x: 200, y: 75, r: 3.5 },
  { id: 6, x: 260, y: 50, r: 3.5 },
];

// 연결선 (from → to)
const EDGES = [
  [0, 1], [0, 2], [0, 3],
  [1, 3], [2, 3],
  [3, 4], [3, 5], [3, 6],
  [4, 6], [5, 6],
];

// 데이터 패킷이 흐르는 경로 (노드 id 시퀀스)
const PACKET_PATHS = [
  { nodes: [0, 1, 3, 4, 6], dur: 4 },
  { nodes: [0, 2, 3, 5, 6], dur: 5 },
  { nodes: [0, 3, 6], dur: 3.5 },
];

function pathStr(nodeIds) {
  return nodeIds.map((id, i) => {
    const n = NODES[id];
    return `${i === 0 ? 'M' : 'L'}${n.x},${n.y}`;
  }).join(' ');
}

export default function ConnectionBanner({ isOnline }) {
  const prevRef = useRef(isOnline);
  const [shake, setShake] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(() => (isOnline ? new Date() : null));
  const [, forceTick] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = isOnline;
    if (prev === isOnline) return;
    if (prev === true && isOnline === false) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 700);
      return () => clearTimeout(t);
    }
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

  // 색상 토큰
  const lineColor = isOnline ? 'var(--success)' : 'var(--destructive)';
  const nodeColor = isOnline ? 'var(--success)' : 'var(--destructive)';
  const accentColor = isOnline ? '#22d3ee' : '#fb923c'; // cyan / orange (데이터 패킷)

  return (
    <div
      className={`relative overflow-hidden rounded-xl border animate-connection-banner-in ${shake ? 'animate-connection-shake-once' : ''}`}
      style={{
        background: isOnline
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 8%, var(--card)) 0%, var(--card) 70%, color-mix(in srgb, #22d3ee 6%, var(--card)) 100%)'
          : 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
        borderColor: isOnline
          ? 'color-mix(in srgb, var(--success) 30%, var(--border))'
          : 'color-mix(in srgb, var(--destructive) 55%, var(--border))',
        borderWidth: isOnline ? 1 : 2,
        boxShadow: isOnline
          ? '0 0 0 1px color-mix(in srgb, var(--success) 12%, transparent)'
          : '0 0 0 1px color-mix(in srgb, var(--destructive) 25%, transparent), 0 8px 24px -8px color-mix(in srgb, var(--destructive) 35%, transparent)',
      }}
      role={isOnline ? 'status' : 'alert'}
      aria-live={isOnline ? 'polite' : 'assertive'}
    >
      <div className="relative flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
        {/* 좌측: SVG 노드 그래프 */}
        <div className="relative flex-1 min-w-0 max-w-[60%]">
          <svg
            viewBox="0 0 290 100"
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-[72px] sm:h-[80px]"
            aria-hidden="true"
          >
            {/* 연결선 */}
            <g
              stroke={lineColor}
              strokeWidth="1.2"
              fill="none"
              style={{
                opacity: isOnline ? 0.5 : 0.25,
                transition: 'opacity 0.6s ease',
              }}
            >
              {EDGES.map(([from, to], i) => {
                const a = NODES[from], b = NODES[to];
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    strokeDasharray={isOnline ? '0' : '3 3'}
                    style={{
                      animation: isOnline
                        ? `connection-edge-pulse ${2 + (i % 3) * 0.4}s ease-in-out infinite`
                        : `connection-edge-fail ${0.9 + (i % 3) * 0.2}s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                );
              })}
            </g>

            {/* 노드 */}
            <g>
              {NODES.map((n) => (
                <g key={n.id}>
                  {/* 외곽 펄스 ring (서버 노드만) */}
                  {n.id === 0 && isOnline && (
                    <circle
                      cx={n.x} cy={n.y} r={n.r}
                      fill="none"
                      stroke={nodeColor}
                      strokeWidth="1.5"
                      style={{
                        animation: 'connection-node-pulse 2s ease-out infinite',
                        transformOrigin: `${n.x}px ${n.y}px`,
                      }}
                    />
                  )}
                  <circle
                    cx={n.x} cy={n.y} r={n.r}
                    fill={nodeColor}
                    style={{
                      opacity: isOnline ? 1 : (n.id === 0 ? 0.9 : 0.5),
                      animation: isOnline
                        ? `connection-node-drift ${3 + (n.id * 0.3)}s ease-in-out infinite alternate`
                        : (n.id !== 0 ? 'connection-node-blink 1.2s ease-in-out infinite' : 'none'),
                      animationDelay: `${n.id * 0.2}s`,
                      transformOrigin: `${n.x}px ${n.y}px`,
                      transition: 'opacity 0.6s ease',
                    }}
                  />
                </g>
              ))}
            </g>

            {/* 데이터 패킷 (온라인 시만) */}
            {isOnline && PACKET_PATHS.map((p, i) => (
              <g key={i}>
                <path
                  id={`packet-path-${i}`}
                  d={pathStr(p.nodes)}
                  fill="none"
                  stroke="none"
                />
                <circle r="2.2" fill={accentColor}
                  style={{ filter: `drop-shadow(0 0 3px ${accentColor})` }}
                >
                  <animateMotion
                    dur={`${p.dur}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.6}s`}
                    rotate="auto"
                  >
                    <mpath href={`#packet-path-${i}`} />
                  </animateMotion>
                </circle>
              </g>
            ))}
          </svg>
        </div>

        {/* 우측: 상태 텍스트 + 뱃지 */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right min-w-0">
            {isOnline ? (
              <>
                <div className="flex items-center justify-end gap-1.5 font-bold text-sm sm:text-base" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>클라우드 실시간 연결</span>
                </div>
                <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Supabase · 마지막 동기화: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{syncAgo()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1.5 font-bold text-sm sm:text-base" style={{ color: 'var(--destructive)' }}>
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 animate-connection-blink-red" />
                  <span>오프라인 — 연결 끊김</span>
                </div>
                <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  자동 재연결 시도 중... 작업은 로컬에 임시 저장됩니다
                </div>
              </>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0"
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
      </div>
    </div>
  );
}
