// 스마트스토어 sync 모니터링 위젯 (Codex B 권장)
// 마지막 sync 시각 / 24h 성공률 / LIVE/STALE 상태 / [지금 동기화] 수동 트리거

import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, Clock, Package, ClipboardCheck, Target, AlertCircle } from 'lucide-react';
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

      // === 24시간 상세 통계 (병렬 fetch) ===
      const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
      const [newOrdersRes, confirmOkRes, confirmPermFailRes, itemsRes] = await Promise.all([
        supabaseClient
          .from('external_orders')
          .select('id', { count: 'exact', head: true })
          .gte('received_at', since24h),
        supabaseClient
          .from('external_orders')
          .select('id', { count: 'exact', head: true })
          .gte('naver_confirm_succeeded_at', since24h),
        supabaseClient
          .from('external_orders')
          .select('id', { count: 'exact', head: true })
          .gte('naver_confirm_attempted_at', since24h)
          .or('naver_confirm_error.ilike.%max-retry%,naver_confirm_error.ilike.%permanent-4xx%'),
        supabaseClient
          .from('external_order_items')
          .select('match_status, created_at')
          .gte('created_at', since24h),
      ]);

      const totalItems24h = itemsRes.data?.length || 0;
      const matchedItems24h = (itemsRes.data || []).filter((i) => i.match_status === 'matched').length;
      const matchRate24h = totalItems24h > 0 ? Math.round((matchedItems24h / totalItems24h) * 100) : null;

      setStats({
        lastSyncAt: lastLog?.started_at || null,
        lastSyncStatus: lastLog?.status || null,
        successRate,
        isLive,
        last24hTotal: total,
        last24hOrderCount: lastOrderCount,
        // 24h 상세
        newOrders24h: newOrdersRes.count || 0,
        confirmOk24h: confirmOkRes.count || 0,
        confirmFail24h: confirmPermFailRes.count || 0,
        matchRate24h,
        matchedItems24h,
        totalItems24h,
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
    <div className="rounded-lg border p-3 mb-3"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

      {/* === 상단 라인: LIVE/STALE + 마지막 sync + 24h 성공률 + 수동버튼 === */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: statusInfo.bg, color: statusInfo.color }}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusInfo.label}
        </div>

        <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--foreground)' }}>
          <Clock className="w-3.5 h-3.5 opacity-60" />
          <span className="opacity-70 hidden sm:inline">마지막 sync:</span>
          <span className="font-medium">{fmtRelative(stats?.lastSyncAt)}</span>
        </div>

        <div className="text-sm">
          <span className="opacity-70 hidden sm:inline">24h 성공률:</span>
          <span className="sm:hidden opacity-70">성공률 </span>
          <span className="font-medium ml-1" style={{ color: stats?.successRate >= 95 ? '#00ff88' : stats?.successRate >= 80 ? '#ffaa00' : '#ff4d6d' }}>
            {stats?.successRate}%
          </span>
          <span className="opacity-50 ml-1">({stats?.last24hTotal}회)</span>
        </div>

        <button
          onClick={handleManualSync}
          disabled={triggering}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'white' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{triggering ? '요청 중...' : '지금 동기화'}</span>
        </button>
      </div>

      {/* === 24시간 상세 통계 그리드 === */}
      <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2"
        style={{ borderColor: 'var(--border)' }}>
        <StatBox
          icon={Package}
          label="24h 신규 주문"
          value={`${stats?.newOrders24h ?? 0}건`}
          color="#4dffff"
        />
        <StatBox
          icon={ClipboardCheck}
          label="발주확인 자동"
          value={`${stats?.confirmOk24h ?? 0}건`}
          color="#00ff88"
          sub={stats?.confirmFail24h > 0 ? `실패 ${stats.confirmFail24h}` : null}
          subColor="#ff4d6d"
        />
        <StatBox
          icon={Target}
          label="매칭률"
          value={stats?.matchRate24h !== null && stats?.matchRate24h !== undefined ? `${stats.matchRate24h}%` : '-'}
          sub={stats?.totalItems24h > 0 ? `${stats.matchedItems24h}/${stats.totalItems24h}` : null}
          color={stats?.matchRate24h >= 80 ? '#00ff88' : stats?.matchRate24h >= 50 ? '#ffaa00' : '#a78bfa'}
        />
        <StatBox
          icon={AlertCircle}
          label="확인 영구실패"
          value={`${stats?.confirmFail24h ?? 0}건`}
          color={stats?.confirmFail24h > 0 ? '#ff4d6d' : '#7e9cb8'}
          sub={stats?.confirmFail24h > 0 ? '수동 확인 필요' : 'OK'}
          subColor={stats?.confirmFail24h > 0 ? '#ff4d6d' : '#7e9cb8'}
        />
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, sub, color, subColor }) {
  return (
    <div className="rounded-lg p-2 border" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
      <div className="text-[10px] opacity-60 flex items-center gap-1 truncate">
        <Icon className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base sm:text-lg font-bold mt-0.5" style={{ color: color || 'var(--foreground)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-0.5" style={{ color: subColor || 'var(--muted-foreground)', opacity: 0.8 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
