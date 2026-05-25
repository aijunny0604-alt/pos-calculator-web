// 대시보드 스마트 알림 — 이상 징후 + 품절 예측 + 마진 누수 + 미수 회수
// 30분 TTL localStorage 캐시, 백그라운드 비동기 실행
// 분석 함수는 dynamic import로 로드 → 메인 번들 +0KB
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'pos_smart_alerts_v1';
const CACHE_TTL = 30 * 60 * 1000; // 30분

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(alerts, meta) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), alerts, meta }));
  } catch { /* quota 초과 시 무시 */ }
}

export default function useSmartAlerts({ orders = [], products = [], customers = [] }) {
  const [alerts, setAlerts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const runRef = useRef(false);

  const run = useCallback(async (force = false) => {
    if (runRef.current) return;
    // 캐시 확인
    if (!force) {
      const cached = readCache();
      if (cached) {
        setAlerts(cached.alerts);
        setMeta(cached.meta);
        setLoading(false);
        return;
      }
    }
    runRef.current = true;
    setLoading(true);
    try {
      // Dynamic import — 메인 번들 영향 0
      const [
        { detectAnomalies },
        { getStockCoverageForecast, getMarginLeakage },
      ] = await Promise.all([
        import('@/lib/analytics/anomalyDetector'),
        import('@/lib/analytics/advanced'),
      ]);

      // paymentRecords & customerReturns 비동기 fetch (Dashboard에 없는 데이터)
      const [prRes, crRes] = await Promise.all([
        supabase.getPaymentRecords?.({}) || Promise.resolve([]),
        supabase.getCustomerReturns?.() || Promise.resolve([]),
      ]);
      const paymentRecords = Array.isArray(prRes) ? prRes : [];
      const customerReturns = Array.isArray(crRes) ? crRes : [];

      // 1. 이상 징후 탐지
      const anomalies = detectAnomalies({ products, customers, orders, paymentRecords, customerReturns });

      // 2. 품절 예측 (14일 이내)
      const stockForecast = getStockCoverageForecast(products, orders, { periodDays: 30, maxDaysLeft: 14 });
      if (stockForecast?.count > 0) {
        const top3 = stockForecast.results.slice(0, 3);
        anomalies.push({
          level: stockForecast.count >= 5 ? 'critical' : 'warning',
          icon: '⏰',
          title: `${stockForecast.count}개 제품 2주 내 품절 예상`,
          detail: top3.map(p => `${p.name} (${p.daysLeft}일 남음, 일판매 ${p.avgDailyQty}개)`).join(' · '),
          suggestion: '발주 시급도 높은 순으로 발주 검토',
          category: 'stock-forecast',
        });
      }

      // 3. 마진 누수 점검
      const leakage = getMarginLeakage(orders, products, { periodDays: 30, minMarginRate: 0.10 });
      if (leakage?.results?.length > 0) {
        const losers = leakage.results.filter(p => p.severity === '손해' || p.severity === '심각');
        if (losers.length > 0) {
          anomalies.push({
            level: 'warning',
            icon: '💔',
            title: `마진 누수 ${losers.length}건 감지`,
            detail: losers.slice(0, 3).map(p => `${p.name} (마진율 ${p.marginRate}%)`).join(' · '),
            suggestion: '가격 인상 또는 할인 정책 재검토',
            category: 'margin-leakage',
          });
        }
      }

      // 심각도 순 정렬
      const order = { critical: 0, warning: 1, info: 2 };
      anomalies.sort((a, b) => order[a.level] - order[b.level]);

      const metaInfo = {
        lastUpdated: new Date().toISOString(),
        anomalyCount: anomalies.length,
        criticalCount: anomalies.filter(a => a.level === 'critical').length,
      };

      setAlerts(anomalies);
      setMeta(metaInfo);
      writeCache(anomalies, metaInfo);
    } catch (e) {
      console.warn('[SmartAlerts] 분석 실패:', e);
    } finally {
      setLoading(false);
      runRef.current = false;
    }
  }, [orders, products, customers]);

  useEffect(() => {
    // orders 로드 후 실행 (빈 배열이면 대기)
    if (orders.length > 0 || products.length > 0) {
      run();
    }
  }, [orders.length, products.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { alerts, meta, loading, refresh: () => run(true) };
}
