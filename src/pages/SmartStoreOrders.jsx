// 네이버 스마트스토어 주문 페이지 (Phase 1 MVP)
// - Realtime 구독으로 새 주문 즉시 표시
// - 자동 매칭 후보 표시 + 수동 확정
// - 내부 주문으로 전환 (saveOrder)
// - Mock 데이터 주입 (Phase 1 — API 키 받기 전 테스트용)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingBag, RefreshCw, Search, Check, X, AlertTriangle, Package, ArrowRight, Bell, BellOff, FlaskConical, ClipboardCheck, Truck, ExternalLink, Printer, Menu, Ban } from 'lucide-react';
import { supabase, supabaseClient } from '@/lib/supabase';
import { matchCustomer } from '@/lib/fuzzyMatch';
import { findProductCandidates } from '@/lib/productMatch';
import SyncMonitorWidget from '@/components/SyncMonitorWidget';

const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '-';
  try {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return s; }
};

const STATUS_LABEL = {
  received: { label: '수신', color: '#4dffff', bg: 'rgba(0,212,255,0.15)' },
  // 네이버 원본 productOrderStatus 직접 인식 (실시간 모니터링)
  PAYMENT_WAITING: { label: '입금대기', color: '#ffaa00', bg: 'rgba(255,170,0,0.15)' },
  PAYED: { label: '결제완료', color: '#4dffff', bg: 'rgba(0,212,255,0.15)' },
  DELIVERING: { label: '배송중', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  DISPATCHED: { label: '발송중', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  DELIVERED: { label: '배송완료', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  PURCHASE_DECIDED: { label: '구매확정', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  // 내부 status
  matched: { label: '매칭됨', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  confirmed: { label: '발주확인', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  converted: { label: '내부주문 전환', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  shipped: { label: '발송완료', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  cancelled: { label: '취소', color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)' },
};

// 발주확인 가능 상태 (네이버 원본 + 내부 status 모두 포함)
const PENDING_CONFIRM_STATUSES = new Set(['received', 'PAYED', 'PAYMENT_WAITING', 'matched']);

// 처리 완료 상태 (카드 기본 숨김 대상)
const DONE_STATUSES = new Set(['converted', 'shipped', 'cancelled']);

// 네이버 스토어 통합 거래처명 (실 buyer 는 memo 에 기록)
const NAVER_STORE_CUSTOMER_NAME = '엠파츠';

// 네이버 커머스 API 호환 택배사 코드 (주요)
const DELIVERY_COMPANIES = [
  { code: 'CJGLS', name: 'CJ대한통운' },
  { code: 'HANJIN', name: '한진택배' },
  { code: 'LOGEN', name: '로젠택배' },
  { code: 'EPOST', name: '우체국택배' },
  { code: 'LOTTE', name: '롯데택배' },
  { code: 'KGB', name: '경동택배' },
  { code: 'CVSNET', name: 'CU편의점택배' },
  { code: 'CUPOST', name: 'CU(BGF)' },
  { code: 'DAESIN', name: '대신택배' },
  { code: 'ILYANG', name: '일양로지스' },
];

const PROVIDER_LABEL = {
  naver: { label: '네이버', color: '#03c75a' },
  coupang: { label: '쿠팡', color: '#f37520' },
  gmarket: { label: 'G마켓', color: '#00a651' },
  mock: { label: '🧪 Mock', color: '#a78bfa' },
};

export default function SmartStoreOrders({
  products = [],
  customers = [],
  showToast,
  saveOrder: saveOrderProp,
  setCurrentPage,
}) {
  // 착불/선불 정규화 (네이버 → ShippingLabel 형식)
  const normalizeDeliveryPayType = (policy) => {
    if (!policy) return '선불';
    if (typeof policy === 'string') {
      const p = policy.toLowerCase();
      if (p.includes('cash') || p.includes('착불')) return '착불';
    }
    return '선불';
  };

  // 택배 송장 생성 — ShippingLabel localStorage에 prefill
  const handleCreateShippingLabel = (order) => {
    const items = itemsByOrder[order.id] || [];
    const productNames = items.map((i) => i.matched_product_name || i.provider_product_name).filter(Boolean).join(', ');
    const totalAmount = items.reduce((s, i) => s + (Number(i.unit_price || 0) * Number(i.quantity || 0)), 0);

    const newEntry = {
      id: `naver-${order.provider_order_id}-${Date.now()}`,
      name: order.receiver_name || order.buyer_name || '구매자',
      phone: order.buyer_phone || '',
      address: order.buyer_address || '',
      product: productNames || '네이버 주문',
      amount: String(totalAmount),
      packaging: '박스1',
      paymentType: normalizeDeliveryPayType(order.delivery_policy_type),
      sender: '엠파츠', // 네이버 스마트스토어 주문은 엠파츠 명의로 발송 (무브모터스 X)
      note: `[네이버 ${order.provider_order_id}]`,
    };
    try {
      const existing = JSON.parse(localStorage.getItem('shippingCustomEntries') || '[]');
      // 중복 방지: 같은 provider_order_id 기존 항목 제거
      const filtered = existing.filter((e) => !e.id?.startsWith(`naver-${order.provider_order_id}`));
      filtered.unshift(newEntry);
      localStorage.setItem('shippingCustomEntries', JSON.stringify(filtered));
      showToast?.('택배 송장에 추가됨 (이동 중...)', 'success');
      if (setCurrentPage) {
        setTimeout(() => setCurrentPage('shipping'), 500);
      }
    } catch (e) {
      showToast?.(`택배 송장 추가 실패: ${e.message}`, 'error');
    }
  };
  const [orders, setOrders] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({}); // { orderId: [items] }
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false); // 처리완료 카드 표시 토글
  // 위젯 클릭 → 위젯과 동일한 카운트 로직으로 필터링 (Codex Major: 카운트↔필터 일관성)
  // 'none' | 'overdue' | 'dueDday' | 'dueD1' | 'autoPending' | 'newAfterConfirm' | 'cancel'
  const [widgetFilter, setWidgetFilter] = useState('none');
  // 날짜 조회 (네이버 관리자 페이지 스타일)
  const [datePreset, setDatePreset] = useState('1w'); // today | 1w | 1m | 3m | custom
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // 뷰 모드 — localStorage 영구 저장 (주문 많을 때 컴팩트로 한눈에)
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('smartstore_view_mode') || 'card'; } catch { return 'card'; }
  });
  // 컴팩트 모드 row 클릭 펼침
  const [expandedCompactId, setExpandedCompactId] = useState(null);
  const toggleViewMode = () => {
    const next = viewMode === 'card' ? 'compact' : 'card';
    setViewMode(next);
    try { localStorage.setItem('smartstore_view_mode', next); } catch {}
  };

  // 매칭 직접 수정 (사용자 요청)
  const [editingItemId, setEditingItemId] = useState(null);
  const [matchSearch, setMatchSearch] = useState('');

  const matchSearchResults = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return (products || [])
      .filter((p) => (p.name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, matchSearch]);

  const applyManualMatch = async (item, product) => {
    await supabase.updateExternalOrderItem(item.id, {
      matched_product_id: product.id,
      matched_product_name: product.name,
      match_status: 'matched',
      match_score: 1.0,
    });
    setEditingItemId(null);
    setMatchSearch('');
    showToast?.(`매칭 변경: ${product.name}`, 'success');
    reload();
  };

  const clearMatch = async (item) => {
    await supabase.updateExternalOrderItem(item.id, {
      matched_product_id: null,
      matched_product_name: null,
      match_status: 'pending',
      match_score: null,
    });
    setEditingItemId(null);
    setMatchSearch('');
    showToast?.('매칭 해제됨 — 다시 시도 가능', 'info');
    reload();
  };

  // 발송처리 모달
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null);
  // 일괄 발송 multi-select (Task #109)
  const [selectedOrderIds, setSelectedOrderIds] = useState(() => new Set());
  const [bulkDispatchOpen, setBulkDispatchOpen] = useState(false);
  const [bulkDispatchCompany, setBulkDispatchCompany] = useState('CJGLS');
  const [bulkTrackingMap, setBulkTrackingMap] = useState({}); // { orderId: 'tracking' }
  const [dispatchCompany, setDispatchCompany] = useState('CJGLS');
  const [dispatchTracking, setDispatchTracking] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await supabase.getExternalOrders({ limit: 200 });
    setOrders(list || []);
    // 모든 주문의 items 일괄 로드
    const itemsMap = {};
    await Promise.all((list || []).map(async (o) => {
      const items = await supabase.getExternalOrderItems(o.id);
      itemsMap[o.id] = items || [];
    }));
    setItemsByOrder(itemsMap);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Realtime 구독 — 새 주문 들어오면 토스트 + 자동 reload
  useEffect(() => {
    const channel = supabaseClient
      .channel('external_orders_realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'external_orders' },
        (payload) => {
          const newOrder = payload.new;
          if (soundOn) {
            try { new Audio('data:audio/mp3;base64,').play().catch(() => {}); } catch {}
          }
          showToast?.(`🛍️ 새 주문! ${PROVIDER_LABEL[newOrder.provider]?.label || newOrder.provider} · ${newOrder.buyer_name || '구매자'}`, 'success');
          reload();
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'external_orders' },
        () => reload()
      )
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [reload, showToast, soundOn]);

  // 날짜 조회 범위 계산 (KST 기준)
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);
    if (datePreset === 'today') return { from: todayStart, to: tomorrowStart };
    if (datePreset === '1w') return { from: new Date(todayStart.getTime() - 6 * 24 * 3600 * 1000), to: tomorrowStart };
    if (datePreset === '1m') return { from: new Date(todayStart.getTime() - 29 * 24 * 3600 * 1000), to: tomorrowStart };
    if (datePreset === '3m') return { from: new Date(todayStart.getTime() - 89 * 24 * 3600 * 1000), to: tomorrowStart };
    if (datePreset === 'custom' && dateFrom && dateTo) {
      const f = new Date(dateFrom + 'T00:00:00');
      const t = new Date(dateTo + 'T23:59:59');
      return { from: f, to: t };
    }
    return null; // 전체
  }, [datePreset, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    // widgetFilter용 시간 윈도우 (stats 와 동일 로직)
    const now = Date.now();
    const todayKstStart = new Date(); todayKstStart.setHours(0, 0, 0, 0);
    const tomorrowKstStart = new Date(todayKstStart); tomorrowKstStart.setDate(todayKstStart.getDate() + 1);
    const dayAfterTomorrowKstStart = new Date(todayKstStart); dayAfterTomorrowKstStart.setDate(todayKstStart.getDate() + 2);

    return orders.filter((o) => {
      if (providerFilter !== 'all' && o.provider !== providerFilter) return false;
      if (statusFilter !== 'all' && o.order_status !== statusFilter) return false;
      // 처리완료(converted/shipped/cancelled/구매확정) 는 토글 OFF 시 숨김
      // 단, widgetFilter active 시에는 위젯 카운트 로직(converted 포함 등)이 우선이므로 우회
      if (!showCompleted && widgetFilter === 'none' && (DONE_STATUSES.has(o.order_status) || o.order_status === 'PURCHASE_DECIDED')) return false;
      // 날짜 범위 (결제일 = received_at 기준, 네이버 조회기간과 동일)
      if (dateRange && o.received_at) {
        const rec = new Date(o.received_at);
        if (rec < dateRange.from || rec >= dateRange.to) return false;
      }
      // 위젯 필터 (stats 카운트 로직과 1:1 동일)
      if (widgetFilter !== 'none') {
        const dispatchDue = o.dispatch_due_date || o.raw_payload?.productOrder?.dispatchDueDate || o.raw_payload?.dispatchDueDate;
        const isDone = DONE_STATUSES.has(o.order_status) || o.naver_dispatch_succeeded_at;
        if (widgetFilter === 'overdue') {
          if (isDone || !dispatchDue) return false;
          if (new Date(dispatchDue).getTime() >= now) return false;
        } else if (widgetFilter === 'dueDday') {
          if (isDone || !dispatchDue) return false;
          const due = new Date(dispatchDue).getTime();
          if (!(due >= todayKstStart.getTime() && due < tomorrowKstStart.getTime())) return false;
        } else if (widgetFilter === 'dueD1') {
          if (isDone || !dispatchDue) return false;
          const due = new Date(dispatchDue).getTime();
          if (!(due >= tomorrowKstStart.getTime() && due < dayAfterTomorrowKstStart.getTime())) return false;
        } else if (widgetFilter === 'autoPending') {
          if (!(o.needs_naver_confirm || o.needs_naver_dispatch)) return false;
        } else if (widgetFilter === 'newAfterConfirm') {
          if (!(o.naver_confirm_succeeded_at && !o.naver_dispatch_succeeded_at && o.order_status !== 'shipped')) return false;
        } else if (widgetFilter === 'cancel') {
          const st = o.order_status;
          const isCancel = st === 'CANCEL_REQUEST' || st === 'CANCELED' || st === 'cancelled' || /cancel/i.test(o.raw_payload?.cancelRequest || '');
          if (!isCancel) return false;
        }
      }
      return true;
    });
  }, [orders, providerFilter, statusFilter, showCompleted, dateRange, widgetFilter]);

  const completedCount = useMemo(() => orders.filter((o) =>
    DONE_STATUSES.has(o.order_status) || o.order_status === 'PURCHASE_DECIDED'
  ).length, [orders]);

  // Codex Major A fix: 위젯 stats 는 dateRange 가 적용된 filtered 가 아닌, dateRange 기간 내 전체 (현재 화면 카드와 일관)
  // dateRange 만 따르고 status/완료 토글은 무시 — 운영자가 위젯에서 "처리해야 할 항목" 카운트 보고 싶어함
  const ordersInRange = useMemo(() => {
    if (!dateRange) return orders;
    return orders.filter((o) => {
      if (!o.received_at) return false;
      const rec = new Date(o.received_at);
      return rec >= dateRange.from && rec < dateRange.to;
    });
  }, [orders, dateRange]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayOrders = ordersInRange.filter((o) => o.received_at && new Date(o.received_at).toDateString() === today);
    // 네이버 관리자 페이지 위젯 카운트 (raw_payload + DB 컬럼 조합)
    const now = Date.now();
    const todayKstStart = new Date(); todayKstStart.setHours(0, 0, 0, 0);
    const tomorrowKstStart = new Date(todayKstStart); tomorrowKstStart.setDate(todayKstStart.getDate() + 1);
    const dayAfterTomorrowKstStart = new Date(todayKstStart); dayAfterTomorrowKstStart.setDate(todayKstStart.getDate() + 2);

    let overdue = 0, autoConfirmPending = 0, newAfterConfirm = 0, dispatchDueDday = 0, dispatchDueD1 = 0, cancelRequest = 0;
    for (const o of ordersInRange) {
      // Codex Major C fix: dispatch_due_date 컬럼 우선, raw_payload 폴백
      const dispatchDue = o.dispatch_due_date || o.raw_payload?.productOrder?.dispatchDueDate || o.raw_payload?.dispatchDueDate;
      const isDone = DONE_STATUSES.has(o.order_status) || o.naver_dispatch_succeeded_at;
      if (!isDone && dispatchDue) {
        const due = new Date(dispatchDue).getTime();
        if (due < now) overdue++;
        else if (due >= todayKstStart.getTime() && due < tomorrowKstStart.getTime()) dispatchDueDday++;
        else if (due >= tomorrowKstStart.getTime() && due < dayAfterTomorrowKstStart.getTime()) dispatchDueD1++;
      }
      if (o.needs_naver_confirm || o.needs_naver_dispatch) autoConfirmPending++;
      if (o.naver_confirm_succeeded_at && !o.naver_dispatch_succeeded_at && o.order_status !== 'shipped') newAfterConfirm++;
      const status = o.order_status;
      if (status === 'CANCEL_REQUEST' || status === 'CANCELED' || /cancel/i.test(o.raw_payload?.cancelRequest || '')) cancelRequest++;
    }
    return {
      total: ordersInRange.length,
      todayCount: todayOrders.length,
      pending: ordersInRange.filter((o) => o.order_status === 'received' || o.order_status === 'PAYED').length,
      todayRevenue: todayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      overdue,
      autoConfirmPending,
      newAfterConfirm,
      dispatchDueDday,
      dispatchDueD1,
      cancelRequest,
    };
  }, [ordersInRange]);

  // Mock 데이터 주입 (Phase 1 테스트용)
  const injectMockOrder = async () => {
    const productSamples = products.slice(0, 5);
    if (productSamples.length === 0) {
      showToast?.('제품이 없어서 mock 주문 생성 불가', 'error');
      return;
    }
    const pick = productSamples[Math.floor(Math.random() * productSamples.length)];
    const buyerNames = ['김민수', '이지영', '박철호', '최서연', '정태원', '홍길동'];
    const buyer = buyerNames[Math.floor(Math.random() * buyerNames.length)];
    const orderId = `MOCK-${Date.now()}`;
    const qty = Math.floor(Math.random() * 3) + 1;
    const price = Number(pick.retail || pick.wholesale || 10000);
    const payload = {
      provider: 'mock',
      orderId,
      buyer: { name: buyer, phone: `010-${String(Math.floor(Math.random() * 9000) + 1000)}-${String(Math.floor(Math.random() * 9000) + 1000)}`, address: '서울시 어딘가' },
      orderDate: new Date().toISOString(),
      totalAmount: price * qty,
      items: [{
        productOrderId: `${orderId}-1`,
        productName: pick.name,
        option: '기본',
        quantity: qty,
        unitPrice: price,
      }],
    };
    try {
      const r = await fetch(`https://jubzppndcclhnvgbvrxr.supabase.co/functions/v1/naver-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': 'mock-secret-change-me',
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (r.ok) {
        showToast?.(`✓ Mock 주문 ${orderId} 전송 — Realtime 알림 대기`, 'success');
      } else {
        showToast?.(`Mock 전송 실패: ${data.error || r.status}`, 'error');
      }
    } catch (e) {
      showToast?.(`Mock 호출 오류: ${e.message}`, 'error');
    }
  };

  // 개별 item 매칭 (자동 + 수동)
  const autoMatchItem = async (item) => {
    const candidates = findProductCandidates(item.provider_product_name, products, 5);
    if (candidates.length === 0) {
      await supabase.updateExternalOrderItem(item.id, { match_status: 'no-candidate' });
      showToast?.(`매칭 후보 없음: ${item.provider_product_name}`, 'error');
      reload();
      return;
    }
    // top1 제안 (사용자 수동 확정 필요 - Codex 위험 분석 반영)
    const topName = candidates[0];
    const product = products.find((p) => p.name === topName);
    if (!product) return;
    await supabase.updateExternalOrderItem(item.id, {
      matched_product_id: product.id,
      matched_product_name: product.name,
      match_status: 'manual', // 자동 매칭됐지만 사용자 확인 필요
      match_score: 0.8,
    });
    showToast?.(`매칭 후보: ${product.name}`, 'success');
    reload();
  };

  const confirmMatch = async (item) => {
    await supabase.updateExternalOrderItem(item.id, { match_status: 'matched' });
    reload();
  };

  // === 발주확인 / 발송처리 (Codex 협업 설계) ===
  const callOrderAction = async (action, itemIds, extra = {}) => {
    try {
      const r = await fetch('https://jubzppndcclhnvgbvrxr.supabase.co/functions/v1/naver-order-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': 'mock-secret-change-me',
        },
        body: JSON.stringify({ action, itemIds, ...extra }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    } catch (e) {
      showToast?.(`API 호출 실패: ${e.message}`, 'error');
      return null;
    }
  };

  const confirmOrder = async (order) => {
    // 큐 방식 전환 — Edge Function (IP 차단 위험) 제거, sync.js 매장 PC bridge 가 처리
    if (order.naver_confirm_succeeded_at) {
      showToast?.('이미 발주확인 완료된 주문입니다', 'info');
      return;
    }
    await supabase.updateExternalOrder(order.id, {
      needs_naver_confirm: true,
      naver_confirm_retry_count: 0,
      naver_confirm_next_retry_at: null,
    });
    showToast?.('발주확인 대기열 등록 — 매장 PC 가 60초 내 자동 처리', 'success');
    reload();
  };

  const openDispatch = (order) => {
    setDispatchModalOrder(order);
    setDispatchCompany('CJGLS');
    setDispatchTracking('');
  };

  const submitDispatch = async () => {
    // 큐 방식 전환 — 매장 PC sync.js 가 네이버 dispatch API 호출 (IP 화이트리스트 우회)
    if (!dispatchModalOrder || !dispatchTracking.trim()) return;
    const company = DELIVERY_COMPANIES.find((c) => c.code === dispatchCompany);
    const order = dispatchModalOrder;
    // Codex Major E fix: 발주확인 안 되어 있으면 confirm 큐도 같이 등록
    // sync.js 가 confirm → dispatch 순서로 처리 (네이버는 발주확인 안 된 주문 dispatch 거부)
    const needsConfirm = !order.naver_confirm_succeeded_at;
    const patch = {
      needs_naver_dispatch: true,
      naver_dispatch_company_code: dispatchCompany,
      naver_dispatch_company_name: company?.name || dispatchCompany,
      naver_dispatch_tracking: dispatchTracking.trim(),
      naver_dispatch_retry_count: 0,
      naver_dispatch_next_retry_at: null,
    };
    if (needsConfirm) {
      patch.needs_naver_confirm = true;
      patch.naver_confirm_retry_count = 0;
      patch.naver_confirm_next_retry_at = null;
    }
    await supabase.updateExternalOrder(order.id, patch);
    showToast?.(
      needsConfirm
        ? `발주확인 + 발송처리 대기열 등록 (${company?.name} · ${dispatchTracking.trim()}) — 60초 내 순차 자동 처리`
        : `발송처리 대기열 등록 (${company?.name} · ${dispatchTracking.trim()}) — 60초 내 자동 처리`,
      'success'
    );
    setDispatchModalOrder(null);
    reload();
  };

  // 주문 취소 — needs_naver_cancel 큐 등록 + 로컬 상태 cancelled (Task #108)
  const cancelOrder = async (order) => {
    const reasonChoices = ['상품 품절', '구매자 요청', '배송 지연', '가격 오류', '기타'];
    const reason = window.prompt(
      `주문 취소 사유를 입력하세요.\n\n예시: ${reasonChoices.join(' / ')}\n\n주문: ${order.buyer_name || '구매자'} #${order.provider_order_id}`,
      '상품 품절'
    );
    if (reason === null) return; // 사용자 취소
    const trimmed = reason.trim();
    if (!trimmed) { showToast?.('취소 사유는 필수예요', 'error'); return; }
    const confirmMsg = `정말 이 주문을 취소하시겠어요?\n\n주문: ${order.buyer_name || '구매자'} #${order.provider_order_id}\n사유: ${trimmed}\n\n· 로컬 상태가 [취소] 로 변경됩니다\n· 매장 PC sync.js 가 네이버 취소 API 호출 대기열에 등록합니다 (실제 API 검증 후 동작)`;
    if (!window.confirm(confirmMsg)) return;
    const patch = {
      order_status: 'cancelled',
      needs_naver_cancel: true,
      naver_cancel_reason: trimmed,
      naver_cancel_retry_count: 0,
      naver_cancel_next_retry_at: null,
    };
    const ok = await supabase.updateExternalOrder(order.id, patch);
    if (ok) {
      showToast?.(`주문 취소 — 사유: ${trimmed}`, 'success');
      reload();
    } else {
      showToast?.('취소 처리 실패 — 다시 시도해주세요', 'error');
    }
  };

  // 일괄 발송 — 다수 주문 선택 후 한 번에 등록 (Task #109)
  const toggleOrderSelect = (id) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => { setSelectedOrderIds(new Set()); setBulkTrackingMap({}); };
  const openBulkDispatch = () => {
    if (selectedOrderIds.size === 0) {
      showToast?.('선택된 주문이 없어요', 'error');
      return;
    }
    // 선택된 주문 중 이미 발송완료 제외
    const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !DONE_STATUSES.has(o.order_status) && !o.naver_dispatch_succeeded_at);
    if (eligible.length === 0) {
      showToast?.('발송 가능한 주문이 없어요 (이미 발송완료/취소)', 'error');
      return;
    }
    // 기존 송장 prefill (재오픈 시)
    const next = {};
    eligible.forEach((o) => { if (bulkTrackingMap[o.id]) next[o.id] = bulkTrackingMap[o.id]; });
    setBulkTrackingMap(next);
    setBulkDispatchOpen(true);
  };
  const submitBulkDispatch = async () => {
    const company = DELIVERY_COMPANIES.find((c) => c.code === bulkDispatchCompany);
    const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !DONE_STATUSES.has(o.order_status) && !o.naver_dispatch_succeeded_at);
    const ready = eligible.filter((o) => (bulkTrackingMap[o.id] || '').trim().length > 0);
    if (ready.length === 0) {
      showToast?.('송장번호를 1건 이상 입력해주세요', 'error');
      return;
    }
    let success = 0, failed = 0;
    for (const order of ready) {
      const tracking = bulkTrackingMap[order.id].trim();
      const needsConfirm = !order.naver_confirm_succeeded_at;
      const patch = {
        needs_naver_dispatch: true,
        naver_dispatch_company_code: bulkDispatchCompany,
        naver_dispatch_company_name: company?.name || bulkDispatchCompany,
        naver_dispatch_tracking: tracking,
        naver_dispatch_retry_count: 0,
        naver_dispatch_next_retry_at: null,
      };
      if (needsConfirm) {
        patch.needs_naver_confirm = true;
        patch.naver_confirm_retry_count = 0;
        patch.naver_confirm_next_retry_at = null;
      }
      const ok = await supabase.updateExternalOrder(order.id, patch);
      if (ok) success++; else failed++;
    }
    showToast?.(
      failed > 0
        ? `일괄 발송 등록: 성공 ${success}건 / 실패 ${failed}건 (${company?.name}) — 60초 내 자동 처리`
        : `일괄 발송 ${success}건 대기열 등록 (${company?.name}) — 60초 내 자동 처리`,
      failed > 0 ? 'error' : 'success'
    );
    setBulkDispatchOpen(false);
    clearSelection();
    reload();
  };

  // 내부 주문으로 전환 — 네이버 스토어 주문은 "엠파츠" 거래처로 통합
  // 매칭 안 된 item 도 네이버 제품명·금액 그대로 freeform 으로 포함 (사용자 정책)
  const convertToInternalOrder = async (order) => {
    const items = itemsByOrder[order.id] || [];
    if (items.length === 0) {
      showToast?.('주문 항목이 없어요', 'error');
      return;
    }
    if (!saveOrderProp) return;

    // 거래처 = 실제 구매자 (기존 매장 거래처와 자동 매칭, 재구매 시 합쳐짐)
    // 네이버 주문 식별은 memo prefix "[엠파츠]" + "[네이버 스마트스토어]" 태그로 처리 (DB 구분)
    const isNaverOrder = order.provider === 'naver';
    const buyerName = (order.buyer_name || '').trim();
    // 기존 거래처와 fuzzy 매칭 (전화번호 우선 + 이름)
    const cm = isNaverOrder
      ? matchCustomer(buyerName, customers, { maxCandidates: 1, threshold: 0.8 })
      : matchCustomer(buyerName, customers, { maxCandidates: 1, threshold: 0.7 });
    const customerName = cm?.status === 'exact'
      ? cm.exact.name
      : (buyerName || '온라인 구매자');
    const memo = isNaverOrder
      ? `[엠파츠] [네이버 스마트스토어] ${order.provider_order_id}\n구매자: ${buyerName || '-'} / ${order.buyer_phone || '-'}${order.buyer_address ? `\n주소: ${order.buyer_address}` : ''}`
      : `[${PROVIDER_LABEL[order.provider]?.label || order.provider}] 주문번호: ${order.provider_order_id}`;

    // placeholder 제외 (detail 미도착 row 는 안전 차단)
    const usableItems = items.filter((it) =>
      it.provider_product_name && !it.provider_product_name.includes('⏳') && it.provider_product_name !== '확인 필요'
    );
    if (usableItems.length === 0) {
      showToast?.('주문 항목이 아직 준비 안 됐어요 — 잠시 후 다시 시도', 'error');
      return;
    }
    // 매칭된 item 은 product DB 연결, 매칭 안 된 item 은 freeform (네이버 제품명·금액 그대로)
    const itemsForOrder = usableItems.map((it) => {
      const isMatched = !!(it.matched_product_id && (it.match_status === 'matched' || it.match_status === 'manual'));
      const p = isMatched ? products.find((x) => x.id === it.matched_product_id) : null;
      return {
        // freeform 의 id 는 productOrderId 기반 유니크 마커 (같은 주문 합산 안 되게)
        id: isMatched ? (p?.id || it.matched_product_id) : `naver-${it.provider_product_order_id || it.id}`,
        name: it.matched_product_name || it.provider_product_name,
        price: it.unit_price, // 네이버 unitPrice = 소비자가
        wholesale: isMatched ? (Number(p?.wholesale) || it.unit_price) : it.unit_price,
        retail: isMatched ? (Number(p?.retail) || it.unit_price) : it.unit_price,
        quantity: it.quantity,
      };
    });
    const total = itemsForOrder.reduce((s, it) => s + (it.price * it.quantity), 0);

    const result = await saveOrderProp({
      customer_name: customerName,
      customer_phone: order.buyer_phone || '',
      customer_address: order.buyer_address || '',
      // 신규 거래처 등록 시 카테고리 자동 태깅 (사용자 정책)
      customer_category: isNaverOrder ? NAVER_STORE_CUSTOMER_NAME : undefined,
      price_type: 'retail', // 네이버 = 소비자가 정책
      items: itemsForOrder,
      total_amount: total,
      memo,
    });
    if (result) {
      // 네이버 발주확인 자동화 큐 — 항상 등록 (이미 confirmed 면 sync.js 가 "already" 응답 받고 깔끔히 skip)
      // Codex 권장: order_status 로컬값 의존 X → 큐 복구 보장
      const alreadyConfirmed = !!order.naver_confirm_succeeded_at;
      await supabase.updateExternalOrder(order.id, {
        order_status: 'converted',
        internal_order_id: result.id,
        needs_naver_confirm: !alreadyConfirmed,
        // retry_count 도 초기화 — 새 시도이므로 backoff 도 처음부터
        naver_confirm_retry_count: alreadyConfirmed ? undefined : 0,
        naver_confirm_next_retry_at: alreadyConfirmed ? undefined : null,
      });
      showToast?.(
        alreadyConfirmed
          ? '내부 주문으로 전환 완료 (네이버는 이미 확인됨)'
          : '내부 주문 전환 + 네이버 발주확인 대기열 등록 (최대 60초 내 자동 처리)',
        'success'
      );
      reload();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* 모바일 햄버거 메뉴 — 다른 페이지와 동일 패턴 (toggle-sidebar 이벤트) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="md:hidden p-2 -ml-1 rounded-lg transition-colors hover:bg-[var(--accent)]"
          title="메뉴 열기"
        >
          <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
        </button>
        <ShoppingBag className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        <h1 className="text-lg sm:text-xl font-bold flex-1" style={{ color: 'var(--foreground)' }}>스마트스토어 주문</h1>
        <a
          href="https://sell.smartstore.naver.com/#/home/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a', border: '1px solid rgba(3,199,90,0.3)' }}
          title="네이버 스마트스토어 관리자 페이지 (새 탭)"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">네이버 관리자</span>
        </a>
        <button
          onClick={() => setSoundOn((v) => !v)}
          className="p-2 rounded hover:bg-[var(--muted)]"
          title={soundOn ? '알림 사운드 끄기' : '알림 사운드 켜기'}
        >
          {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4 opacity-50" />}
        </button>
        <button
          onClick={reload}
          className="p-2 rounded hover:bg-[var(--muted)]"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={injectMockOrder}
          className="px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
          title="테스트용 mock 주문 1건 생성"
        >
          <FlaskConical className="w-3.5 h-3.5" />Mock 주문 테스트
        </button>
      </div>

      {/* 본문 스크롤 영역 — 헤더 외 모든 컨텐츠를 포함 (모바일 스크롤 보장) */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-20 sm:pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>

      {/* Sync 모니터링 위젯 */}
      <div className="px-3 sm:px-4 pt-3">
        <SyncMonitorWidget showToast={showToast} />
      </div>

      {/* KPI 카드 — 클릭 시 해당 필터 적용 (위젯 필터 해제) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-4 pt-3 pb-2">
        <KpiCard label="전체" value={stats.total}
          hint="모든 상태 / 전체 기간 보기"
          onClick={() => { setWidgetFilter('none'); setStatusFilter('all'); setDatePreset('all'); setProviderFilter('all'); }} />
        <KpiCard label="오늘" value={stats.todayCount} accent="#4dffff"
          hint="오늘 들어온 주문만 보기"
          onClick={() => { setWidgetFilter('none'); setStatusFilter('all'); setDatePreset('today'); }} />
        <KpiCard label="대기" value={stats.pending} accent="#ffaa00"
          hint="결제완료 / 발주확인 대기 주문 보기"
          onClick={() => { setWidgetFilter('none'); setStatusFilter('PAYED'); setDatePreset('all'); }} />
        <KpiCard label="오늘 매출" value={`${fmtNum(stats.todayRevenue)}원`} small
          hint="오늘 매출 상세 카드 보기"
          onClick={() => { setWidgetFilter('none'); setStatusFilter('all'); setDatePreset('today'); }} />
      </div>

      {/* 네이버 관리자 페이지 위젯 — 카운트 로직과 1:1 동일 필터 (Codex Major fix) */}
      <div className="px-3 sm:px-4 pb-3">
        <div className="rounded-xl border p-3 sm:p-3.5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2 sm:mb-2.5">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-70">네이버 관리자 — 빠른 확인 (클릭=필터, 다시 클릭=해제)</div>
            {widgetFilter !== 'none' && (
              <button onClick={() => setWidgetFilter('none')}
                className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}>
                필터 해제 ✕
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
            <NaverStatBox icon="⏰" label="발송기한 초과" value={stats.overdue} alert={stats.overdue > 0}
              hint="발송 기한이 지난 미발송 주문"
              active={widgetFilter === 'overdue'}
              onClick={() => { setWidgetFilter((f) => f === 'overdue' ? 'none' : 'overdue'); setStatusFilter('all'); setDatePreset('all'); }} />
            <NaverStatBox icon="🤖" label="자동처리 예정" value={stats.autoConfirmPending} accent="#a78bfa"
              hint="자동 발주확인/발송 큐에 대기 중"
              active={widgetFilter === 'autoPending'}
              onClick={() => { setWidgetFilter((f) => f === 'autoPending' ? 'none' : 'autoPending'); setStatusFilter('all'); setDatePreset('all'); }} />
            <NaverStatBox icon="🚚" label="발주 후 신규" value={stats.newAfterConfirm} accent="#03c75a"
              hint="발주확인 완료, 아직 발송 미처리"
              active={widgetFilter === 'newAfterConfirm'}
              onClick={() => { setWidgetFilter((f) => f === 'newAfterConfirm' ? 'none' : 'newAfterConfirm'); setStatusFilter('all'); setDatePreset('all'); }} />
            <NaverStatBox icon="❌" label="취소 요청" value={stats.cancelRequest} alert={stats.cancelRequest > 0}
              hint="구매자가 취소 요청한 주문 (네이버/내부 모든 cancel 상태)"
              active={widgetFilter === 'cancel'}
              onClick={() => { setWidgetFilter((f) => f === 'cancel' ? 'none' : 'cancel'); setStatusFilter('all'); setDatePreset('all'); }} />
            <NaverStatBox icon="📅" label="발송마감 D-1" value={stats.dispatchDueD1} accent="#ffaa00" alert={stats.dispatchDueD1 > 0}
              hint="내일까지 발송해야 하는 주문"
              active={widgetFilter === 'dueD1'}
              onClick={() => { setWidgetFilter((f) => f === 'dueD1' ? 'none' : 'dueD1'); setStatusFilter('all'); setDatePreset('all'); }} />
            <NaverStatBox icon="🔥" label="발송마감 D-day" value={stats.dispatchDueDday} alert={stats.dispatchDueDday > 0} accent="#ff4d6d"
              hint="오늘이 발송 마감! 우선 처리 필요"
              active={widgetFilter === 'dueDday'}
              onClick={() => { setWidgetFilter((f) => f === 'dueDday' ? 'none' : 'dueDday'); setStatusFilter('all'); setDatePreset('all'); }} />
          </div>
        </div>
      </div>

      {/* 날짜 조회 (네이버 관리자 페이지 스타일) */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 pb-2">
        <span className="text-xs opacity-70 font-mono uppercase">조회기간</span>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {[
            { v: 'today', label: '오늘' },
            { v: '1w', label: '1주일' },
            { v: '1m', label: '1개월' },
            { v: '3m', label: '3개월' },
            { v: 'all', label: '전체' },
          ].map((p) => (
            <button key={p.v} onClick={() => { setWidgetFilter('none'); setDatePreset(p.v); }}
              className="text-xs px-3 py-1 transition-colors"
              style={{
                background: datePreset === p.v ? 'var(--primary)' : 'var(--card)',
                color: datePreset === p.v ? 'white' : 'var(--foreground)',
                fontWeight: datePreset === p.v ? 700 : 400,
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" value={dateFrom}
          onChange={(e) => { setWidgetFilter('none'); setDateFrom(e.target.value); setDatePreset('custom'); }}
          className="text-xs px-2 py-1 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        <span className="text-xs opacity-50">~</span>
        <input type="date" value={dateTo}
          onChange={(e) => { setWidgetFilter('none'); setDateTo(e.target.value); setDatePreset('custom'); }}
          className="text-xs px-2 py-1 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        {dateRange && (
          <span className="text-[10px] opacity-60 font-mono ml-auto">
            {fmtDate(dateRange.from)} ~ {fmtDate(new Date(dateRange.to.getTime() - 1))} · {filtered.length}건
          </span>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2">
        <select value={providerFilter} onChange={(e) => { setWidgetFilter('none'); setProviderFilter(e.target.value); }}
          className="text-xs px-2 py-1 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 마켓</option>
          <option value="naver">네이버</option>
          <option value="mock">🧪 Mock</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setWidgetFilter('none'); setStatusFilter(e.target.value); }}
          className="text-xs px-2 py-1 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 상태</option>
          <option value="PAYED">결제완료</option>
          <option value="confirmed">발주확인</option>
          <option value="converted">전환됨</option>
          <option value="shipped">발송완료</option>
          <option value="cancelled">취소</option>
        </select>
        {/* 뷰 모드 토글 — 카드 / 컴팩트 */}
        <button
          onClick={toggleViewMode}
          className="text-xs px-2 py-1 rounded border ml-auto flex items-center gap-1 hover:bg-[var(--accent)]"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          title={viewMode === 'card' ? '컴팩트 모드로 (한 줄 표시)' : '카드 모드로 (디테일 표시)'}
        >
          {viewMode === 'card' ? '📋 컴팩트' : '🔲 카드'}
        </button>
        {/* 처리완료 카드 표시 토글 */}
        <label className="text-xs flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-current" />
          처리완료 표시
          {completedCount > 0 && <span className="opacity-60">({completedCount})</span>}
        </label>
      </div>

      {/* 주문 카드 목록 — 항상 풀 디스플레이, 모바일 우선 디자인 */}
      <div className="px-3 sm:px-4">
        {loading && <div className="text-center py-12 text-sm opacity-60">불러오는 중...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 opacity-60">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <div className="text-sm">아직 받은 주문이 없어요</div>
            <div className="text-xs mt-1">우측 상단 [Mock 주문 테스트]로 흐름 검증 가능</div>
          </div>
        )}
        {viewMode === 'compact' && (
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            {/* 일괄 선택 액션 바 (선택된 게 있을 때만) */}
            {selectedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: 'rgba(0,212,255,0.10)', borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold" style={{ color: '#4dffff' }}>{selectedOrderIds.size}건 선택</span>
                <button onClick={openBulkDispatch}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  style={{ background: '#00ff88', color: '#001a1a' }}>
                  <Truck className="w-3.5 h-3.5" />일괄 발송처리
                </button>
                <button onClick={clearSelection}
                  className="px-2 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>해제</button>
              </div>
            )}
            {/* 컴팩트 헤더 (데스크탑만) — 체크박스 컬럼 추가 */}
            <div className="hidden sm:grid grid-cols-[36px_1fr_100px_120px_120px_180px] gap-2 px-3 py-2 text-[10px] font-bold opacity-70 border-b uppercase tracking-wide"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-center">
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every((o) => selectedOrderIds.has(o.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedOrderIds(new Set(filtered.map((o) => o.id)));
                    else clearSelection();
                  }}
                  title="전체 선택/해제" />
              </span>
              <span>주문자 · 상품</span>
              <span>상태</span>
              <span className="text-right">금액</span>
              <span>날짜</span>
              <span className="text-center">액션</span>
            </div>
            {filtered.map((order) => {
              const itemsForOrder = itemsByOrder[order.id] || [];
              const productSummary = itemsForOrder.length === 0 ? '-'
                : itemsForOrder.length === 1 ? itemsForOrder[0].provider_product_name
                : `${itemsForOrder[0].provider_product_name} 외 ${itemsForOrder.length - 1}건`;
              const statusMeta = STATUS_LABEL[order.order_status] || { label: order.order_status || '-', color: '#7e9cb8', bg: 'rgba(126,156,184,0.15)' };
              const isCash = order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '');
              const isExpanded = expandedCompactId === order.id;
              return (
                <div key={order.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <div
                  className="grid grid-cols-[36px_1fr] sm:grid-cols-[36px_1fr_100px_120px_120px_180px] gap-2 px-3 py-2.5 text-sm items-center hover:bg-[var(--accent)]/30 cursor-pointer"
                  onClick={(e) => {
                    if (e.target.closest('button[title]')) return;
                    if (e.target.closest('input[type="checkbox"]')) return;
                    setExpandedCompactId(isExpanded ? null : order.id);
                  }}
                >
                  <span className="text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={() => toggleOrderSelect(order.id)}
                      title="선택" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-1.5">
                      {order.provider === 'naver' && <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }}>N</span>}
                      <span className="truncate">{order.buyer_name || '구매자'}</span>
                      <span className="text-[10px] opacity-50">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    <div className="text-[11px] opacity-70 truncate">{productSummary}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap text-center"
                      style={{ background: statusMeta.bg, color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                    {order.naver_dispatch_succeeded_at ? (
                      <span className="text-[9px] font-bold text-center" style={{ color: '#00ff88' }} title="네이버 발송완료">
                        ✓ 발송
                      </span>
                    ) : order.naver_confirm_succeeded_at ? (
                      <span className="text-[9px] font-bold text-center" style={{ color: '#a78bfa' }} title="네이버 발주확인">
                        ✓ 발주확인
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right font-bold whitespace-nowrap" style={{ color: 'var(--primary)' }}>
                    {fmtNum(order.total_amount)}원
                    {isCash && <div className="text-[10px] font-normal" style={{ color: '#ffaa00' }}>🚚 착불</div>}
                  </div>
                  <div className="text-xs opacity-70 whitespace-nowrap">{fmtDate(order.received_at)}</div>
                  <div className="flex gap-1 justify-center flex-wrap">
                    {PENDING_CONFIRM_STATUSES.has(order.order_status) && !order.naver_confirm_succeeded_at && (
                      <button onClick={() => confirmOrder(order)} className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa' }} title="발주확인">📋</button>
                    )}
                    {!DONE_STATUSES.has(order.order_status) && (
                      <button onClick={() => convertToInternalOrder(order)} className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{ background: 'var(--primary)', color: 'white' }} title="내부주문 전환">→</button>
                    )}
                    {!DONE_STATUSES.has(order.order_status) && (
                      <button onClick={() => openDispatch(order)} className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88' }} title="발송처리">🚚</button>
                    )}
                    <button onClick={() => handleCreateShippingLabel(order)} className="px-2 py-1 rounded text-[10px] font-semibold"
                      style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }} title="택배 송장">📦</button>
                    {!DONE_STATUSES.has(order.order_status) && (
                      <button onClick={() => cancelOrder(order)} className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d' }} title="주문 취소">✕</button>
                    )}
                  </div>
                </div>
                {/* 펼침 상세 패널 — 클릭 시 row 아래 표시 */}
                {isExpanded && (
                  <div className="px-3 sm:px-4 py-3 space-y-3 border-t"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                    {/* 구매자 + 처리 마커 */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="opacity-70">📞</span>
                      <span className="font-mono">{order.buyer_phone || '-'}</span>
                      <span className="opacity-50">|</span>
                      <span className="opacity-70">📍</span>
                      <span className="break-keep flex-1">{order.buyer_address || '-'}</span>
                      <span className="opacity-50 font-mono text-[10px]">#{order.provider_order_id}</span>
                    </div>
                    {order.naver_confirm_succeeded_at && (
                      <div className="text-[11px] font-semibold" style={{ color: '#a78bfa' }}>
                        ✓ 네이버 발주확인 완료 — {fmtDate(order.naver_confirm_succeeded_at)}
                      </div>
                    )}
                    {order.naver_dispatch_succeeded_at && (
                      <div className="text-[11px] font-semibold" style={{ color: '#00ff88' }}>
                        ✓ 네이버 발송완료 — {fmtDate(order.naver_dispatch_succeeded_at)}
                        {order.naver_dispatch_company_name && order.naver_dispatch_tracking && (
                          <span className="ml-2 opacity-80">{order.naver_dispatch_company_name} · {order.naver_dispatch_tracking}</span>
                        )}
                      </div>
                    )}
                    {/* 상품 리스트 */}
                    <div className="space-y-1.5">
                      {itemsForOrder.map((it) => {
                        const matched = it.match_status === 'matched';
                        const candidate = it.match_status === 'manual';
                        const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
                        return (
                          <div key={it.id} className="p-2 rounded border text-xs"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                            <div className="font-medium break-keep mb-0.5">{it.provider_product_name}</div>
                            {it.provider_product_option && (
                              <div className="text-[10px] opacity-60">옵션: {it.provider_product_option}</div>
                            )}
                            <div className="flex justify-between items-center mt-1">
                              <span className="opacity-80">×{it.quantity} · 단가 {fmtNum(it.unit_price)}원</span>
                              <span className="font-bold" style={{ color: 'var(--primary)' }}>{fmtNum(lineTotal)}원</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {matched && (
                                <span className="flex items-center gap-1 text-[10px]" style={{ color: '#00ff88' }}>
                                  <Check className="w-3 h-3" />{it.matched_product_name}
                                </span>
                              )}
                              {candidate && (
                                <span className="flex items-center gap-1 text-[10px]" style={{ color: '#ffaa00' }}>
                                  <AlertTriangle className="w-3 h-3" />후보: {it.matched_product_name}
                                </span>
                              )}
                              {it.match_status === 'no-candidate' && (
                                <span className="text-[10px]" style={{ color: '#ff4d6d' }}>매칭 후보 없음 (freeform 가능)</span>
                              )}
                              <button
                                onClick={() => { setEditingItemId(editingItemId === it.id ? null : it.id); setMatchSearch(''); }}
                                className="px-1.5 py-0.5 rounded text-[10px] ml-auto"
                                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                              >
                                {editingItemId === it.id ? '닫기' : '매칭 변경'}
                              </button>
                            </div>
                            {editingItemId === it.id && (
                              <div className="mt-2 p-2 rounded space-y-1.5" style={{ background: 'var(--background)' }}>
                                <input type="text" value={matchSearch} onChange={(e) => setMatchSearch(e.target.value)}
                                  placeholder="제품명 검색" autoFocus
                                  className="w-full px-2 py-1 text-xs rounded border"
                                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
                                <div className="max-h-32 overflow-y-auto space-y-0.5">
                                  {matchSearchResults.map((p) => (
                                    <button key={p.id} onClick={() => applyManualMatch(it, p)}
                                      className="w-full text-left px-2 py-1 rounded text-[10px] hover:bg-[var(--accent)]">
                                      {p.name} {p.retail > 0 && <span className="opacity-60">({fmtNum(p.retail)}원)</span>}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 합계 + 배송정보 */}
                    <div className="flex justify-between items-center pt-2 border-t text-sm"
                      style={{ borderColor: 'var(--border)' }}>
                      <span className="opacity-70">
                        합계 {isCash && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,170,0,0.15)', color: '#ffaa00' }}>🚚 착불</span>}
                      </span>
                      <span className="font-bold text-base" style={{ color: 'var(--primary)' }}>{fmtNum(order.total_amount)}원</span>
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
        {viewMode === 'card' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {filtered.map((order) => {
          const items = itemsByOrder[order.id] || [];
          // Codex Minor G fix: 매핑 안 된 status 는 '수신' 으로 위장하지 않고 원본 그대로 표시
          const statusMeta = STATUS_LABEL[order.order_status] || {
            label: order.order_status || '알 수 없음',
            color: '#7e9cb8',
            bg: 'rgba(126,156,184,0.15)',
          };
          const providerMeta = PROVIDER_LABEL[order.provider] || { label: order.provider, color: '#7e9cb8' };
          const matchedCount = items.filter((i) => i.match_status === 'matched').length;
          const totalCount = items.length;
          const isCashOnDelivery = order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '');

          return (
            <div key={order.id} className="rounded-xl border overflow-hidden shadow-sm"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

              {/* ① 상단 — 상태 + provider + 발주확인/발송완료 마커 + 날짜 */}
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b"
                style={{ background: statusMeta.bg, borderColor: 'var(--border)' }}>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wide flex items-center gap-1"
                  style={{ background: 'rgba(0,0,0,0.25)', color: statusMeta.color }}>
                  ● {statusMeta.label}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: `${providerMeta.color}20`, color: providerMeta.color }}>
                  {providerMeta.label}
                </span>
                {/* 네이버 측 처리 마커 — DB의 succeeded_at 기준 */}
                {order.naver_confirm_succeeded_at && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                    title={`네이버 발주확인 완료 ${fmtDate(order.naver_confirm_succeeded_at)}`}>
                    ✓ 발주확인
                  </span>
                )}
                {order.naver_dispatch_succeeded_at && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(0,255,136,0.18)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.35)' }}
                    title={`네이버 발송처리 완료 ${fmtDate(order.naver_dispatch_succeeded_at)}`}>
                    ✓ 발송완료
                  </span>
                )}
                <span className="ml-auto text-xs opacity-80 font-mono">
                  {fmtDate(order.received_at)}
                </span>
              </div>

              {/* ② 구매자 블록 — 큰 글씨 우선 */}
              <div className="px-4 py-3 space-y-1">
                <div className="text-xl font-bold leading-snug">
                  {order.buyer_name || '구매자'}
                </div>
                <div className="text-sm opacity-90 font-mono">
                  {order.buyer_phone || '전화번호 없음'}
                </div>
                <div className="text-xs sm:text-sm opacity-75 leading-snug break-keep">
                  📍 {order.buyer_address || '주소 없음'}
                </div>
                <div className="text-[10px] opacity-50 font-mono pt-1">
                  주문번호 {order.provider_order_id}
                </div>
              </div>

              {/* ③ 상품/금액 블록 */}
              <div className="px-4 py-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                {items.length === 0 && (
                  <div className="text-xs opacity-50">상품 정보 불러오는 중...</div>
                )}
                {items.map((it) => {
                  const matched = it.match_status === 'matched';
                  const candidate = it.match_status === 'manual';
                  const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
                  return (
                    <div key={it.id} className="space-y-1">
                      <div className="flex items-start gap-2">
                        <Package className="w-4 h-4 mt-0.5 opacity-60 flex-shrink-0" />
                        <div className="flex-1 text-sm font-medium leading-snug break-keep">
                          {it.provider_product_name}
                        </div>
                      </div>
                      {it.provider_product_option && (
                        <div className="text-[11px] opacity-60 ml-6">옵션: {it.provider_product_option}</div>
                      )}
                      <div className="ml-6 flex items-center justify-between text-xs">
                        <span className="opacity-80">×{it.quantity} · 단가 {fmtNum(it.unit_price)}원</span>
                        <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>
                          {fmtNum(lineTotal)}원
                        </span>
                      </div>
                      <div className="ml-6 flex items-center gap-2 text-[11px] flex-wrap">
                        {matched && (
                          <span className="flex items-center gap-1" style={{ color: '#00ff88' }}>
                            <Check className="w-3 h-3" />{it.matched_product_name}
                          </span>
                        )}
                        {candidate && (
                          <>
                            <span className="flex items-center gap-1" style={{ color: '#ffaa00' }}>
                              <AlertTriangle className="w-3 h-3" />후보: {it.matched_product_name}
                            </span>
                            <button onClick={() => confirmMatch(it)} className="px-2 py-0.5 rounded text-[10px]"
                              style={{ background: 'rgba(0,255,136,0.2)', color: '#00ff88' }}>확정</button>
                          </>
                        )}
                        {(it.match_status === 'pending' || it.match_status === 'no-candidate') && (
                          <button onClick={() => autoMatchItem(it)} className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1"
                            style={{ background: 'rgba(0,212,255,0.15)', color: '#4dffff' }}>
                            <Search className="w-3 h-3" />매칭 시도
                          </button>
                        )}
                        {it.match_status === 'no-candidate' && (
                          <span className="text-[10px]" style={{ color: '#ff4d6d' }}>매칭 후보 없음</span>
                        )}
                        {/* 매칭 직접 수정 — 모든 상태에서 [변경] 버튼 */}
                        <button
                          onClick={() => { setEditingItemId(editingItemId === it.id ? null : it.id); setMatchSearch(''); }}
                          className="px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ml-auto"
                          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                        >
                          {editingItemId === it.id ? '닫기' : (matched || candidate ? '변경' : '직접 선택')}
                        </button>
                        {matched && (
                          <button onClick={() => clearMatch(it)} className="px-2 py-0.5 rounded text-[10px]"
                            style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d' }} title="매칭 해제 후 다시 시도">
                            해제
                          </button>
                        )}
                      </div>
                      {/* 인라인 검색 + 후보 선택 패널 */}
                      {editingItemId === it.id && (
                        <div className="ml-6 mt-1 p-2 rounded-lg border space-y-1.5"
                          style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                          <input
                            type="text"
                            value={matchSearch}
                            onChange={(e) => setMatchSearch(e.target.value)}
                            placeholder="제품명 검색 (1글자 이상)"
                            autoFocus
                            className="w-full px-2 py-1.5 text-xs rounded border"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          />
                          {matchSearchResults.length === 0 && matchSearch.trim() && (
                            <div className="text-[11px] opacity-60 py-1">검색 결과 없음</div>
                          )}
                          {matchSearchResults.length === 0 && !matchSearch.trim() && (
                            <div className="text-[11px] opacity-60 py-1">제품명을 입력해주세요</div>
                          )}
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {matchSearchResults.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => applyManualMatch(it, p)}
                                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--accent)]"
                                style={{ background: it.matched_product_id === p.id ? 'rgba(0,255,136,0.12)' : 'transparent' }}
                              >
                                <div className="font-medium truncate">{p.name}</div>
                                {p.retail > 0 && (
                                  <div className="text-[10px] opacity-60">소비자가 {fmtNum(p.retail)}원</div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 배송 정보 */}
                {(order.delivery_policy_type || order.delivery_fee_amount > 0) && (
                  <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: isCashOnDelivery ? 'rgba(255,170,0,0.15)' : 'rgba(0,255,136,0.15)',
                        color: isCashOnDelivery ? '#ffaa00' : '#00ff88',
                      }}>
                      {isCashOnDelivery ? '🚚 착불' : '💰 선불'}
                    </span>
                    {order.delivery_fee_amount > 0 && (
                      <span className="text-xs opacity-75">배송비 {fmtNum(order.delivery_fee_amount)}원</span>
                    )}
                  </div>
                )}

                {/* 합계 — 크게 강조 */}
                <div className="pt-2 border-t flex items-baseline justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm opacity-70">합계</span>
                  <span className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>
                    {fmtNum(order.total_amount)}원
                  </span>
                </div>

                {totalCount > 0 && (
                  <div className="text-[11px] opacity-60">
                    매칭 {matchedCount}/{totalCount}
                  </div>
                )}
              </div>

              {/* ④ 발송 정보 (있을 때만) */}
              {items.some((i) => i.dispatched_at) && (
                <div className="px-4 py-2 border-t text-xs space-y-0.5"
                  style={{ background: 'rgba(0,255,136,0.06)', borderColor: 'var(--border)', color: '#00ff88' }}>
                  {items.filter((i) => i.dispatched_at).map((i) => (
                    <div key={i.id} className="flex items-center gap-1.5">
                      <Truck className="w-3 h-3" />
                      {i.delivery_company_name} · {i.tracking_number}
                      <span className="opacity-60 ml-1">({fmtDate(i.dispatched_at)})</span>
                      {!i.sent_to_naver && <span className="ml-auto opacity-70 text-[10px]">🧪 Mock</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* ⑤ 액션 버튼 — 모바일 2열, 데스크탑 4열 */}
              <div className="px-3 py-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2"
                style={{ borderColor: 'var(--border)' }}>
                {PENDING_CONFIRM_STATUSES.has(order.order_status) && !order.naver_confirm_succeeded_at && (
                  <button
                    onClick={() => confirmOrder(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                  >
                    <ClipboardCheck className="w-4 h-4" />발주확인
                  </button>
                )}
                {!DONE_STATUSES.has(order.order_status) && (
                  <button
                    onClick={() => convertToInternalOrder(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'var(--primary)', color: 'white' }}
                  >
                    <ArrowRight className="w-4 h-4" />내부주문
                  </button>
                )}
                {!DONE_STATUSES.has(order.order_status) && (
                  <button
                    onClick={() => openDispatch(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.4)' }}
                  >
                    <Truck className="w-4 h-4" />발송처리
                  </button>
                )}
                <button
                  onClick={() => handleCreateShippingLabel(order)}
                  className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                  style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                  title="택배 송장 페이지로 자동 이동 + 구매자 정보 prefill"
                >
                  <Printer className="w-4 h-4" />송장
                </button>
                {!DONE_STATUSES.has(order.order_status) && (
                  <button
                    onClick={() => cancelOrder(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d', border: '1px solid rgba(255,77,109,0.4)' }}
                    title="주문 취소 — 네이버 취소 큐 등록 (사유 입력 필요)"
                  >
                    <Ban className="w-4 h-4" />주문취소
                  </button>
                )}
                {order.order_status === 'shipped' && (
                  <div className="col-span-2 sm:col-span-4 py-2 text-center text-xs" style={{ color: '#00ff88' }}>
                    ✓ 발송 완료
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
        )}
      </div>

      </div>
      {/* 본문 스크롤 영역 끝 */}

      {/* 발송처리 모달 */}
      {dispatchModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDispatchModalOrder(null)}>
          <div className="rounded-xl w-full max-w-md p-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Truck className="w-5 h-5" style={{ color: '#00ff88' }} />
              <h3 className="text-lg font-bold flex-1">발송 처리</h3>
              <button onClick={() => setDispatchModalOrder(null)}><X className="w-4 h-4 opacity-60" /></button>
            </div>
            <div className="text-xs opacity-70 mb-3">
              주문 #{dispatchModalOrder.provider_order_id} · {dispatchModalOrder.buyer_name}
            </div>
            <label className="block text-xs font-mono uppercase mb-1.5 opacity-70">택배사</label>
            <select value={dispatchCompany} onChange={(e) => setDispatchCompany(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
              style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {DELIVERY_COMPANIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <label className="block text-xs font-mono uppercase mb-1.5 opacity-70">송장번호</label>
            <input type="text" value={dispatchTracking} onChange={(e) => setDispatchTracking(e.target.value)}
              placeholder="예: 1234-5678-9012"
              className="w-full px-3 py-2 rounded-lg border text-sm mb-4 font-mono"
              style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            <div className="text-[11px] opacity-60 mb-4">
              💡 Phase 1 (Mock): DB에만 기록되고 네이버엔 전송되지 않습니다. API 키 발급 후 자동 전환.
            </div>
            <div className="flex gap-2">
              <button onClick={submitDispatch} disabled={!dispatchTracking.trim()}
                className="flex-1 py-2.5 rounded-lg font-semibold disabled:opacity-40"
                style={{ background: '#00ff88', color: '#050b18' }}>
                <Check className="w-4 h-4 inline mr-1" />발송 등록
              </button>
              <button onClick={() => setDispatchModalOrder(null)}
                className="px-4 py-2.5 rounded-lg border"
                style={{ borderColor: 'var(--border)' }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 발송처리 모달 (Task #109) */}
      {bulkDispatchOpen && (() => {
        const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !DONE_STATUSES.has(o.order_status) && !o.naver_dispatch_succeeded_at);
        const readyCount = eligible.filter((o) => (bulkTrackingMap[o.id] || '').trim().length > 0).length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setBulkDispatchOpen(false)}>
            <div className="rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <Truck className="w-5 h-5" style={{ color: '#00ff88' }} />
                <h3 className="text-lg font-bold flex-1">일괄 발송 처리 ({eligible.length}건)</h3>
                <button onClick={() => setBulkDispatchOpen(false)}><X className="w-4 h-4 opacity-60" /></button>
              </div>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs opacity-70 mb-1">택배사 (모든 주문 공통)</div>
                <select value={bulkDispatchCompany} onChange={(e) => setBulkDispatchCompany(e.target.value)}
                  className="w-full px-3 py-2 rounded border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  {DELIVERY_COMPANIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {eligible.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 p-2 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{o.buyer_name || '구매자'} · <span className="opacity-60">{fmtNum(o.total_amount)}원</span></div>
                      <div className="text-[11px] opacity-60 truncate">#{o.provider_order_id}</div>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="송장번호"
                      value={bulkTrackingMap[o.id] || ''}
                      onChange={(e) => setBulkTrackingMap((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      className="w-44 px-3 py-2 rounded border text-sm"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                    />
                  </div>
                ))}
              </div>
              <div className="p-4 border-t flex gap-2 items-center" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs opacity-70 flex-1">
                  송장번호 입력된 {readyCount}건만 등록됩니다. 발주확인 안 된 건은 자동으로 함께 등록.
                </div>
                <button onClick={submitBulkDispatch} disabled={readyCount === 0}
                  className="px-4 py-2 rounded-lg font-bold disabled:opacity-40"
                  style={{ background: '#00ff88', color: '#001a1a' }}>
                  {readyCount}건 등록
                </button>
                <button onClick={() => setBulkDispatchOpen(false)}
                  className="px-3 py-2 rounded-lg border"
                  style={{ borderColor: 'var(--border)' }}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function KpiCard({ label, value, accent, small, onClick, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      title={hint || label}
      className={`p-3 sm:p-3.5 rounded-xl border w-full text-left transition-all ${onClick ? 'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer' : ''}`}
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="text-[11px] sm:text-xs opacity-70 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`font-extrabold ${small ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'} mt-1 leading-tight`} style={{ color: accent || 'var(--foreground)' }}>{value}</div>
    </Tag>
  );
}

function NaverStatBox({ icon, label, value, accent, alert, onClick, hint, active }) {
  const isActive = value > 0;
  const Tag = onClick ? 'button' : 'div';
  const accentRing = accent || (alert ? '#ff4d6d' : 'var(--primary)');
  return (
    <Tag
      onClick={onClick}
      title={hint || label}
      className={`p-2.5 sm:p-3 rounded-xl flex flex-col items-center text-center w-full transition-all ${onClick ? 'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer' : ''}`}
      style={{
        background: active
          ? `color-mix(in srgb, ${accentRing} 12%, var(--background))`
          : (alert && isActive ? 'rgba(255,77,109,0.08)' : 'var(--background)'),
        border: active
          ? `2px solid ${accentRing}`
          : (alert && isActive ? '1px solid rgba(255,77,109,0.35)' : '1px solid var(--border)'),
        boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${accentRing} 18%, transparent)` : undefined,
        minHeight: 92,
      }}
    >
      <div className="text-xl sm:text-2xl leading-none mb-1">{icon}</div>
      <div className="text-[11px] sm:text-xs opacity-80 leading-tight font-medium">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1 leading-none"
        style={{ color: isActive ? (accent || (alert ? '#ff4d6d' : 'var(--foreground)')) : 'var(--foreground)', opacity: isActive ? 1 : 0.4 }}>
        {value}
      </div>
    </Tag>
  );
}
