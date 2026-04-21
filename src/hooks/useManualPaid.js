import { useCallback, useEffect, useState } from 'react';

// pos-payments와 공유: aijunny0604-alt.github.io 오리진 localStorage 공유
export const MANUAL_PAID_KEY = 'pos-payments.manual-paid-orders.v1';
const SYNC_EVENT = 'pos.manualPaidChanged';

export const PAYMENT_METHODS = [
  { key: 'card', label: '카드', emoji: '💳', color: '#3b82f6' },
  { key: 'cash', label: '현금', emoji: '💵', color: '#22c55e' },
  { key: 'transfer', label: '계좌이체', emoji: '🏦', color: '#a855f7' },
  { key: 'other', label: '기타', emoji: '📝', color: '#64748b' },
];
export const METHOD_MAP = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, m]));

function loadMap() {
  try {
    const raw = localStorage.getItem(MANUAL_PAID_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}

function saveMap(obj) {
  try { localStorage.setItem(MANUAL_PAID_KEY, JSON.stringify(obj)); } catch {}
}

function broadcast() {
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT)); } catch {}
}

export default function useManualPaid() {
  const [map, setMap] = useState(() => loadMap());

  // 타 탭/윈도우(storage) + 같은 윈도우 내 다른 훅(custom event) 동기화
  useEffect(() => {
    const sync = () => setMap(loadMap());
    const onStorage = (e) => { if (e.key === MANUAL_PAID_KEY) sync(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, []);

  const setPaid = useCallback((orderId, method) => {
    if (!orderId || !method) return;
    // 최신 localStorage 기준으로 머지 — 다른 탭/훅 변경사항 유지
    const current = loadMap();
    const next = { ...current, [String(orderId)]: { method, paidAt: new Date().toISOString() } };
    saveMap(next);
    setMap(next);
    broadcast();
  }, []);

  const clearPaid = useCallback((orderId) => {
    if (!orderId) return;
    const current = loadMap();
    const key = String(orderId);
    if (!(key in current)) return;
    const next = { ...current };
    delete next[key];
    saveMap(next);
    setMap(next);
    broadcast();
  }, []);

  const getInfo = useCallback((orderId) => map[String(orderId)] || null, [map]);

  return { map, getInfo, setPaid, clearPaid, methods: PAYMENT_METHODS, methodMap: METHOD_MAP };
}
