import { useState, useEffect } from 'react';
import { HardDrive, Trash2, Loader2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { getStorageStats, cleanupOrphans, formatBytes } from '@/lib/storageAdmin';

/**
 * 제품 이미지 Storage 모니터링 + 고아 파일 정리
 */
export default function StorageMonitor({ products, showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await getStorageStats(products);
      setStats(s);
    } catch (e) {
      showToast?.('통계 로드 실패: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCleanup = async () => {
    if (!stats?.orphanFiles?.length) return;
    const count = stats.orphanFiles.length;
    const size = formatBytes(stats.orphanBytes);
    if (!window.confirm(`고아 파일 ${count}개 (${size})를 영구 삭제합니다. 복구 불가능합니다. 진행하시겠습니까?`)) return;
    setCleaning(true);
    try {
      const result = await cleanupOrphans(stats.orphanFiles);
      showToast?.(`${result.removed}/${result.total}개 파일 정리 완료`, 'success');
      await load();
    } catch (e) {
      showToast?.('정리 실패: ' + e.message, 'error');
    } finally {
      setCleaning(false);
    }
  };

  const pct = stats?.percentUsed || 0;
  const barColor = pct > 80 ? 'var(--destructive)' : pct > 50 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="rounded-xl p-4 border bg-[var(--card)] border-[var(--border)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[var(--primary)]" />
          <h3 className="text-base font-bold">이미지 Storage 사용량</h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-[var(--muted)] disabled:opacity-40"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!stats && loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : !stats ? (
        <p className="text-sm text-center py-4 text-[var(--muted-foreground)]">통계를 불러올 수 없습니다</p>
      ) : (
        <div className="space-y-4">
          {/* 사용량 바 */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-semibold">
                {formatBytes(stats.totalBytes)} <span className="text-[var(--muted-foreground)]">/ 1 GB</span>
              </span>
              <span className="text-xs" style={{ color: barColor }}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
              />
            </div>
            {pct > 70 && (
              <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                <AlertTriangle className="w-3 h-3" />
                70% 초과 — 고아 파일 정리 또는 이미지 교체 검토 필요
              </p>
            )}
          </div>

          {/* 통계 3단 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-[var(--muted)]">
              <div className="text-lg font-bold">{stats.totalFiles}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">전체 파일</div>
            </div>
            <div className="p-2 rounded-lg bg-[var(--muted)]">
              <div className="text-lg font-bold">{stats.productCount}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">이미지 있는 제품</div>
            </div>
            <div
              className="p-2 rounded-lg"
              style={{
                background: stats.orphanFiles.length > 0
                  ? 'color-mix(in srgb, var(--destructive) 10%, var(--muted))'
                  : 'var(--muted)',
              }}
            >
              <div
                className="text-lg font-bold"
                style={{ color: stats.orphanFiles.length > 0 ? 'var(--destructive)' : 'var(--foreground)' }}
              >
                {stats.orphanFiles.length}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">고아 파일</div>
            </div>
          </div>

          {/* 고아 파일 정리 */}
          {stats.orphanFiles.length > 0 ? (
            <div className="p-3 rounded-lg border" style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))', background: 'color-mix(in srgb, var(--destructive) 5%, transparent)' }}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
                <div className="flex-1 text-xs">
                  <p className="font-semibold" style={{ color: 'var(--destructive)' }}>
                    {stats.orphanFiles.length}개 고아 파일 ({formatBytes(stats.orphanBytes)})
                  </p>
                  <p className="text-[var(--muted-foreground)] mt-0.5">
                    DB에 참조되지 않는 이미지 — 안전하게 삭제 가능합니다.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ background: 'var(--destructive)', color: 'white' }}
              >
                {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {cleaning ? '정리 중…' : `고아 파일 ${stats.orphanFiles.length}개 영구 삭제`}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 8%, transparent)' }}>
              <CheckCircle className="w-4 h-4" />
              고아 파일 없음 — 모든 이미지가 제품에 연결됨
            </div>
          )}

          <p className="text-[10px] text-[var(--muted-foreground)] text-center">
            월 1회 정리 권장 · 80% 초과 시 유료 플랜 고려
          </p>
        </div>
      )}
    </div>
  );
}
