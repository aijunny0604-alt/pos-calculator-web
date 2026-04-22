import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { supabase, supabaseClient } from '@/lib/supabase';

/**
 * useManualPaid — 수동 완불 체크 훅
 *
 * 저장 전략 (Path Y):
 *   - Ground Truth: Supabase `manual_paid_orders` 테이블
 *   - Cache: localStorage `pos-payments.manual-paid-orders.v1` (오프라인/즉시 UI 반영)
 *   - Cross-device sync: Supabase Realtime (postgres_changes)
 *   - Audit: localStorage `pos-payments.audit-log.v1` (FIFO 500건)
 *
 * 공개 API (하위 호환):
 *   - map, getInfo(orderId), setPaid(orderId, method), clearPaid(orderId),
 *     methods, methodMap
 */

export const MANUAL_PAID_KEY = 'pos-payments.manual-paid-orders.v1';
export const AUDIT_LOG_KEY = 'pos-payments.audit-log.v1';
const MIGRATION_FLAG_KEY = 'pos-payments.supabase-migrated.v1';
const AUDIT_MAX_ENTRIES = 500;
const SYNC_EVENT = 'pos.manualPaidChanged';

export const PAYMENT_METHODS = [
  { key: 'card', label: '카드', emoji: '💳', color: '#3b82f6' },
  { key: 'cash', label: '현금', emoji: '💵', color: '#22c55e' },
  { key: 'transfer', label: '계좌이체', emoji: '🏦', color: '#a855f7' },
  { key: 'other', label: '기타', emoji: '📝', color: '#64748b' },
];
export const METHOD_MAP = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m]));

// ===== localStorage 유틸 =====
function loadLocalMap() {
  try {
    const raw = localStorage.getItem(MANUAL_PAID_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'loadLocalMap' } });
    return {};
  }
}

function saveLocalMap(obj) {
  try {
    localStorage.setItem(MANUAL_PAID_KEY, JSON.stringify(obj));
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'saveLocalMap' } });
  }
}

function broadcast() {
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT)); } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'broadcast' } });
  }
}

function appendAuditLog(entry) {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    let log = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) log = parsed;
      } catch (parseErr) {
        Sentry.captureException(parseErr, { tags: { feature: 'manual-paid', op: 'audit-parse' } });
        log = [];
      }
    }
    log.push(entry);
    if (log.length > AUDIT_MAX_ENTRIES) log = log.slice(log.length - AUDIT_MAX_ENTRIES);
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'audit-append' } });
  }
}

function buildAuditEntry(action, orderId, extras = {}) {
  return {
    ts: new Date().toISOString(),
    action,
    orderId: String(orderId),
    ...extras,
    ua: (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '').slice(0, 80),
  };
}

// Supabase row → 로컬 map 형태로 변환
function rowsToMap(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!r || !r.order_id) continue;
    out[String(r.order_id)] = {
      method: r.method,
      paidAt: r.paid_at || r.updated_at || new Date().toISOString(),
    };
  }
  return out;
}

// 기존 localStorage 데이터를 Supabase로 1회 마이그레이션 (세션당 1회)
async function migrateLocalToSupabaseOnce() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return { migrated: 0, skipped: true };
    const local = loadLocalMap();
    const ids = Object.keys(local);
    if (ids.length === 0) {
      localStorage.setItem(MIGRATION_FLAG_KEY, '1');
      return { migrated: 0, skipped: false };
    }
    // 기존 서버 데이터 읽어서 중복 체크
    const serverRows = await supabase.getManualPaidAll();
    const serverIds = new Set((serverRows || []).map((r) => String(r.order_id)));
    let migrated = 0;
    for (const id of ids) {
      if (serverIds.has(id)) continue; // 이미 서버에 있음
      const entry = local[id];
      if (!entry?.method) continue;
      const res = await supabase.upsertManualPaid(id, entry.method);
      if (res) migrated++;
    }
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return { migrated, skipped: false };
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'migrate' } });
    return { migrated: 0, error: err?.message || String(err) };
  }
}

export default function useManualPaid() {
  const [map, setMap] = useState(() => loadLocalMap());
  const channelRef = useRef(null);

  // 초기 로드 + 마이그레이션 + Realtime 구독
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1) 기존 localStorage → Supabase 마이그레이션 (세션당 1회)
      await migrateLocalToSupabaseOnce();

      // 2) Supabase에서 ground truth fetch
      try {
        const rows = await supabase.getManualPaidAll();
        if (cancelled) return;
        const serverMap = rowsToMap(rows);
        saveLocalMap(serverMap);
        setMap(serverMap);
        broadcast();
      } catch (err) {
        Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'init-fetch' } });
      }

      // 3) Realtime 구독 (postgres_changes)
      try {
        const ch = supabaseClient
          .channel('manual-paid-orders')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'manual_paid_orders' },
            async () => {
              // 변경 감지 → 전체 refetch (단순/안전)
              try {
                const rows2 = await supabase.getManualPaidAll();
                if (cancelled) return;
                const m = rowsToMap(rows2);
                saveLocalMap(m);
                setMap(m);
                broadcast();
              } catch (err) {
                Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'realtime-refetch' } });
              }
            }
          )
          .subscribe();
        channelRef.current = ch;
      } catch (err) {
        Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'realtime-subscribe' } });
      }
    }

    init();

    // 타 탭/윈도우(storage) + 같은 윈도우 내 다른 훅(custom event) 동기화
    const sync = () => setMap(loadLocalMap());
    const onStorage = (e) => { if (e.key === MANUAL_PAID_KEY) sync(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, sync);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, sync);
      if (channelRef.current) {
        try { supabaseClient.removeChannel(channelRef.current); } catch { /* noop */ }
        channelRef.current = null;
      }
    };
  }, []);

  const setPaid = useCallback((orderId, method) => {
    if (!orderId || !method) return;
    const current = loadLocalMap();
    const key = String(orderId);
    const prev = current[key];
    const prevMethod = prev?.method;
    const paidAt = new Date().toISOString();

    // 1) 로컬 즉시 반영 (UI 반응성)
    const next = { ...current, [key]: { method, paidAt } };
    saveLocalMap(next);
    setMap(next);
    broadcast();

    // 2) Supabase 비동기 upsert (fire-and-forget)
    supabase.upsertManualPaid(orderId, method).catch((err) => {
      Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'setPaid-upsert' }, extra: { orderId, method } });
    });

    // 3) Audit (로컬)
    if (prevMethod && prevMethod !== method) {
      appendAuditLog(buildAuditEntry('change', orderId, { method, prevMethod }));
    } else if (!prevMethod) {
      appendAuditLog(buildAuditEntry('set', orderId, { method }));
    }
    // prevMethod === method인 경우 로그 생략
  }, []);

  const clearPaid = useCallback((orderId) => {
    if (!orderId) return;
    const current = loadLocalMap();
    const key = String(orderId);
    if (!(key in current)) return;
    const prevMethod = current[key]?.method;

    // 1) 로컬 즉시 반영
    const next = { ...current };
    delete next[key];
    saveLocalMap(next);
    setMap(next);
    broadcast();

    // 2) Supabase 비동기 delete
    supabase.deleteManualPaid(orderId).catch((err) => {
      Sentry.captureException(err, { tags: { feature: 'manual-paid', op: 'clearPaid-delete' }, extra: { orderId } });
    });

    // 3) Audit
    appendAuditLog(buildAuditEntry('clear', orderId, { prevMethod }));
  }, []);

  const getInfo = useCallback((orderId) => map[String(orderId)] || null, [map]);

  return { map, getInfo, setPaid, clearPaid, methods: PAYMENT_METHODS, methodMap: METHOD_MAP };
}
