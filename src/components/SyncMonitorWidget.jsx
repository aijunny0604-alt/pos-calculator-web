// 스마트스토어 sync 모니터링 위젯 (Codex B 권장)
// 마지막 sync 시각 / 24h 성공률 / LIVE/STALE 상태 / [지금 동기화] 수동 트리거

import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase, supabaseClient } from '@/lib/supabase';

const REFRESH_INTERVAL_MS = 30_000;
const LIVE_WINDOW_MS = 6 * 60 * 1000; // 6분 안에 sync 있으면 LIVE (5분 cron + 1분 여유)

export default function SyncMonitorWidget({ showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const reload = useCallback(async () => {
    try {
      const url = `https://jubzppndcclhnvgbvrxr.supabase.co/rest/v1/external_sync_logs?provider=eq.naver&order=started_at.desc&limit=288`;
      const res = await fetch(url, {
        headers: {
          apikey: 'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU',
          Authorization: 'Bearer sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU',
        },
      });
      const logs = await res.json();
      if (!Array.isArray(logs)) throw new Error('logs not array');

      const now = Date.now();
      const last24h = logs.filter((l) => new Date(l.started_at).getTime() > now - 24 * 3600 * 1000);
      const success = last24h.filter((l) => l.status === 'success' || l.status === 'no-changes').length;
      const failed = last24h.filter((l) => l.status === 'failed' || l.status === 'no-token').length;
      const total = success + failed;
      const successRate = total > 0 ? Math.round((success / total) * 100) : 100;

      const lastLog = logs[0];
      const lastSyncMs = lastLog ? new Date(lastLog.started_at).getTime() : 0;
      const isLive = lastSyncMs > 0 && (now - lastSyncMs) < LIVE_WINDOW_MS;

      // 가장 최근 success 로그
      const lastSuccess = logs.find((l) => l.status === 'success' || l.status === 'no-changes');
      const lastOrderCount = last24h.reduce((s, l) => s + (l.orders_inserted || 0), 0);

      setStats({
        lastSyncAt: lastLog?.started_at || null,
        lastSyncStatus: lastLog?.status || null,
        successRate,
        isLive,
        last24hTotal: total,
        last24hOrderCount: lastOrderCount,
      });
    } catch (e) {
      console.warn('SyncMonitorWidget reload failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, REFRESH_INTERVAL_MS);
    // Realtime — 새 sync_logs row 도착 시 즉시 갱신
    const channel = supabaseClient
      .channel('sync_logs_monitor')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'external_sync_logs' },
        () => reload()
      )
      .subscribe();
    return () => {
      clearInterval(id);
      supabaseClient.removeChannel(channel);
    };
  }, [reload]);

  const handleManualSync = async () => {
    setTriggering(true);
    try {
      // RPC 호출 → 매장 PC가 다음 사이클(최대 5분)에 즉시 처리
      const { error } = await supabaseClient.rpc('request_naver_sync_now');
      if (error) throw error;
      showToast?.('동기화 요청됨 — 매장 PC가 다음 사이클에 처리 (최대 5분)', 'success');
      reload();
    } catch (e) {
      showToast?.(`동기화 요청 실패: ${e.message}`, 'error');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return null;

  const fmtRelative = (iso) => {
    if (!iso) return '-';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return '방금 전';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
    return `${Math.floor(diff / 86400_000)}일 전`;
  };

  const statusInfo = stats?.isLive
    ? { label: 'LIVE', color: '#00ff88', bg: 'rgba(0,255,136,0.12)', icon: CheckCircle2 }
    : { label: 'STALE', color: '#ffaa00', bg: 'rgba(255,170,0,0.12)', icon: AlertTriangle };
  const StatusIcon = statusInfo.icon;

  return (
    <div className="rounded-lg border p-3 mb-3 flex flex-wrap items-center gap-3"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

      {/* LIVE/STALE 배지 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
        style={{ background: statusInfo.bg, color: statusInfo.color }}>
        <StatusIcon className="w-3.5 h-3.5" />
        {statusInfo.label}
      </div>

      {/* 마지막 sync */}
      <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--foreground)' }}>
        <Clock className="w-3.5 h-3.5 opacity-60" />
        <span className="opacity-70">마지막 sync:</span>
        <span className="font-medium">{fmtRelative(stats?.lastSyncAt)}</span>
      </div>

      {/* 24h 성공률 */}
      <div className="text-sm">
        <span className="opacity-70">24h 성공률:</span>
        <span className="font-medium ml-1" style={{ color: stats?.successRate >= 95 ? '#00ff88' : stats?.successRate >= 80 ? '#ffaa00' : '#ff4d6d' }}>
          {stats?.successRate}%
        </span>
        <span className="opacity-50 ml-1">({stats?.last24hTotal}회)</span>
      </div>

      {/* 24h 신규 주문수 */}
      {stats?.last24hOrderCount > 0 && (
        <div className="text-sm">
          <span className="opacity-70">24h 신규:</span>
          <span className="font-medium ml-1" style={{ color: '#4dffff' }}>{stats.last24hOrderCount}건</span>
        </div>
      )}

      {/* 수동 동기화 버튼 */}
      <button
        onClick={handleManualSync}
        disabled={triggering}
        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
        style={{ background: 'var(--primary)', color: 'white' }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} />
        {triggering ? '요청 중...' : '지금 동기화'}
      </button>
    </div>
  );
}
