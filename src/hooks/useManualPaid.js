import { useCallback, useEffect, useState } from 'react';

// pos-payments와 공유: aijunny0604-alt.github.io 오리진 localStorage 공유
export const MANUAL_PAID_KEY = 'pos-payments.manual-paid-orders.v1';

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

export default function useManualPaid() {
  const [map, setMap] = useState(() => loadMap());

  // 다른 탭/앱에서 변경 시 동기화
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MANUAL_PAID_KEY) setMap(loadMap());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 저장
  useEffect(() => { saveMap(map); }, [map]);

  const setPaid = useCallback((orderId, method) => {
    if (!orderId || !method) return;
    setMap((prev) => ({ ...prev, [orderId]: { method, paidAt: new Date().toISOString() } }));
  }, []);

  const clearPaid = useCallback((orderId) => {
    if (!orderId) return;
    setMap((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const getInfo = useCallback((orderId) => map[orderId] || null, [map]);

  return { map, getInfo, setPaid, clearPaid, methods: PAYMENT_METHODS, methodMap: METHOD_MAP };
}
