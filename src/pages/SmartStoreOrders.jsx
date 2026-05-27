// 네이버 스마트스토어 주문 페이지 (Phase 1 MVP)
// - Realtime 구독으로 새 주문 즉시 표시
// - 자동 매칭 후보 표시 + 수동 확정
// - 내부 주문으로 전환 (saveOrder)
// - Mock 데이터 주입 (Phase 1 — API 키 받기 전 테스트용)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingBag, RefreshCw, Search, Check, X, AlertTriangle, Package, ArrowRight, Bell, BellOff, FlaskConical, ClipboardCheck, Truck, ExternalLink, Printer } from 'lucide-react';
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
  matched: { label: '매칭됨', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  confirmed: { label: '발주확인', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  converted: { label: '내부주문 전환', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  shipped: { label: '발송완료', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
  cancelled: { label: '취소', color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)' },
};

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
      sender: '무브모터스',
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
  const [expandedId, setExpandedId] = useState(null);

  // 발송처리 모달
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null);
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

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (providerFilter !== 'all' && o.provider !== providerFilter) return false;
      if (statusFilter !== 'all' && o.order_status !== statusFilter) return false;
      return true;
    });
  }, [orders, providerFilter, statusFilter]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayOrders = orders.filter((o) => o.received_at && new Date(o.received_at).toDateString() === today);
    return {
      total: orders.length,
      todayCount: todayOrders.length,
      pending: orders.filter((o) => o.order_status === 'received').length,
      todayRevenue: todayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    };
  }, [orders]);

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
    const items = itemsByOrder[order.id] || [];
    const ids = items.map((it) => it.id);
    if (ids.length === 0) return;
    const result = await callOrderAction('confirm', ids);
    if (result?.ok) {
      const modeLabel = result.sentToNaver ? '✓ 네이버에 전송됨' : '🧪 Mock (네이버 미전송)';
      showToast?.(`발주확인 완료 — ${modeLabel}`, 'success');
      await supabase.updateExternalOrder(order.id, { order_status: 'confirmed' });
      reload();
    }
  };

  const openDispatch = (order) => {
    setDispatchModalOrder(order);
    setDispatchCompany('CJGLS');
    setDispatchTracking('');
  };

  const submitDispatch = async () => {
    if (!dispatchModalOrder || !dispatchTracking.trim()) return;
    const items = itemsByOrder[dispatchModalOrder.id] || [];
    const ids = items.map((it) => it.id);
    if (ids.length === 0) return;
    const company = DELIVERY_COMPANIES.find((c) => c.code === dispatchCompany);
    const result = await callOrderAction('dispatch', ids, {
      deliveryCompanyCode: dispatchCompany,
      deliveryCompanyName: company?.name || dispatchCompany,
      trackingNumber: dispatchTracking.trim(),
    });
    if (result?.ok) {
      const modeLabel = result.sentToNaver ? '✓ 네이버 전송됨' : '🧪 Mock 모드';
      showToast?.(`발송처리 완료 (${company?.name}) — ${modeLabel}`, 'success');
      await supabase.updateExternalOrder(dispatchModalOrder.id, { order_status: 'shipped' });
      setDispatchModalOrder(null);
      reload();
    }
  };

  // 내부 주문으로 전환
  const convertToInternalOrder = async (order) => {
    const items = itemsByOrder[order.id] || [];
    const matched = items.filter((it) => it.matched_product_id && (it.match_status === 'matched' || it.match_status === 'manual'));
    if (matched.length === 0) {
      showToast?.('매칭된 항목이 없어요. 먼저 제품 매칭부터 해주세요', 'error');
      return;
    }
    if (!saveOrderProp) return;

    // 거래처 매칭
    const cm = matchCustomer(order.buyer_name || '', customers, { maxCandidates: 1, threshold: 0.7 });
    const customerName = cm.status === 'exact' ? cm.exact.name : (order.buyer_name || '온라인 구매자');

    const itemsForOrder = matched.map((it) => {
      const p = products.find((x) => x.id === it.matched_product_id);
      return {
        id: p?.id || it.matched_product_id,
        name: it.matched_product_name || it.provider_product_name,
        price: it.unit_price,
        wholesale: Number(p?.wholesale) || it.unit_price,
        retail: Number(p?.retail) || it.unit_price,
        quantity: it.quantity,
      };
    });
    const total = itemsForOrder.reduce((s, it) => s + (it.price * it.quantity), 0);

    const result = await saveOrderProp({
      customer_name: customerName,
      customer_phone: order.buyer_phone || '',
      customer_address: order.buyer_address || '',
      price_type: 'retail', // 온라인 주문은 보통 소비자가
      items: itemsForOrder,
      total_amount: total,
      memo: `[${PROVIDER_LABEL[order.provider]?.label || order.provider}] 주문번호: ${order.provider_order_id}`,
    });
    if (result) {
      await supabase.updateExternalOrder(order.id, {
        order_status: 'converted',
        internal_order_id: result.id,
      });
      showToast?.('내부 주문으로 전환 완료', 'success');
      reload();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
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

      {/* Sync 모니터링 위젯 */}
      <div className="px-3 sm:px-4 pt-3">
        <SyncMonitorWidget showToast={showToast} />
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-2 px-3 sm:px-4 pb-3">
        <KpiCard label="전체" value={stats.total} />
        <KpiCard label="오늘" value={stats.todayCount} accent="#4dffff" />
        <KpiCard label="대기" value={stats.pending} accent="#ffaa00" />
        <KpiCard label="오늘 매출" value={`${fmtNum(stats.todayRevenue)}원`} small />
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2">
        <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 마켓</option>
          <option value="naver">네이버</option>
          <option value="mock">🧪 Mock</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 상태</option>
          <option value="received">수신</option>
          <option value="matched">매칭됨</option>
          <option value="converted">전환됨</option>
          <option value="cancelled">취소</option>
        </select>
      </div>

      {/* 주문 목록 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pb-20 sm:pb-6 space-y-2">
        {loading && <div className="text-center py-12 text-sm opacity-60">불러오는 중...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 opacity-60">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <div className="text-sm">아직 받은 주문이 없어요</div>
            <div className="text-xs mt-1">우측 상단 [Mock 주문 테스트]로 흐름 검증 가능</div>
          </div>
        )}
        {filtered.map((order) => {
          const items = itemsByOrder[order.id] || [];
          const isExpanded = expandedId === order.id;
          const statusMeta = STATUS_LABEL[order.order_status] || STATUS_LABEL.received;
          const providerMeta = PROVIDER_LABEL[order.provider] || { label: order.provider, color: '#7e9cb8' };
          const matchedCount = items.filter((i) => i.match_status === 'matched').length;
          const totalCount = items.length;

          return (
            <div key={order.id} className="rounded-lg border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
                className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--muted)]/30 text-left"
              >
                <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: `${providerMeta.color}20`, color: providerMeta.color }}>
                  {providerMeta.label}
                </span>
                <span className="text-xs font-mono opacity-70">{order.provider_order_id}</span>
                <span className="text-sm font-semibold flex-1 truncate">{order.buyer_name || '구매자'}</span>
                <span className="text-xs opacity-70">{fmtDate(order.received_at)}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{fmtNum(order.total_amount)}원</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: statusMeta.bg, color: statusMeta.color }}>
                  {statusMeta.label}
                </span>
                {totalCount > 0 && (
                  <span className="text-[10px] opacity-70">{matchedCount}/{totalCount}</span>
                )}
              </button>

              {isExpanded && (
                <div className="border-t px-3 py-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs opacity-70 grid grid-cols-2 sm:grid-cols-3 gap-1">
                    <div>📞 {order.buyer_phone || '-'}</div>
                    <div>📍 {order.buyer_address || '-'}</div>
                    <div>📅 {fmtDate(order.order_date)}</div>
                  </div>
                  {/* 착불/선불 + 배송비 표시 */}
                  {(order.delivery_policy_type || order.delivery_fee_amount > 0) && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded font-semibold"
                        style={{
                          background: order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '')
                            ? 'rgba(255,170,0,0.15)'
                            : 'rgba(0,255,136,0.15)',
                          color: order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '')
                            ? '#ffaa00'
                            : '#00ff88',
                        }}>
                        {order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '') ? '🚚 착불' : '💰 선불'}
                      </span>
                      {order.delivery_fee_amount > 0 && (
                        <span className="opacity-70">배송비 {fmtNum(order.delivery_fee_amount)}원</span>
                      )}
                    </div>
                  )}
                  {items.map((it) => {
                    const matched = it.match_status === 'matched';
                    const candidate = it.match_status === 'manual';
                    return (
                      <div key={it.id} className="p-2 rounded border text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-3.5 h-3.5 opacity-60" />
                          <span className="flex-1 truncate font-medium">{it.provider_product_name}</span>
                          <span className="text-xs opacity-70">×{it.quantity} · {fmtNum(it.unit_price)}원</span>
                        </div>
                        {it.provider_product_option && (
                          <div className="text-xs opacity-60 ml-5">옵션: {it.provider_product_option}</div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          {matched && (
                            <span className="flex items-center gap-1" style={{ color: '#00ff88' }}>
                              <Check className="w-3 h-3" />매칭: {it.matched_product_name}
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
                            <span className="text-[10px]" style={{ color: '#ff4d6d' }}>후보 없음</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* 발송처리 정보 표시 */}
                  {items.some((i) => i.dispatched_at) && (
                    <div className="mt-1.5 p-2 rounded text-xs" style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                      {items.filter((i) => i.dispatched_at).map((i) => (
                        <div key={i.id} className="flex items-center gap-1.5" style={{ color: '#00ff88' }}>
                          <Truck className="w-3 h-3" />
                          {i.delivery_company_name} · {i.tracking_number}
                          <span className="opacity-60 ml-1">({fmtDate(i.dispatched_at)})</span>
                          {!i.sent_to_naver && <span className="ml-auto opacity-70 text-[10px]">🧪 Mock</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* 발주확인 */}
                    {order.order_status === 'received' && (
                      <button
                        onClick={() => confirmOrder(order)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                      >
                        <ClipboardCheck className="w-4 h-4" />발주 확인
                      </button>
                    )}
                    {/* 내부 주문으로 전환 */}
                    {order.order_status !== 'converted' && order.order_status !== 'shipped' && (
                      <button
                        onClick={() => convertToInternalOrder(order)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: 'var(--primary)', color: 'white' }}
                      >
                        <ArrowRight className="w-4 h-4" />내부 주문 전환
                      </button>
                    )}
                    {/* 발송 처리 */}
                    {order.order_status !== 'shipped' && order.order_status !== 'cancelled' && (
                      <button
                        onClick={() => openDispatch(order)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.4)' }}
                      >
                        <Truck className="w-4 h-4" />발송 처리
                      </button>
                    )}
                    {/* 택배 송장 만들기 — 택배 송장 페이지로 이동 + prefill */}
                    <button
                      onClick={() => handleCreateShippingLabel(order)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                      title="택배 송장 페이지로 자동 이동 + 구매자 정보 prefill"
                    >
                      <Printer className="w-4 h-4" />택배 송장
                    </button>
                    {order.order_status === 'shipped' && (
                      <div className="flex-1 py-2 text-center text-xs" style={{ color: '#00ff88' }}>
                        ✓ 발송 완료
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
    </div>
  );
}

function KpiCard({ label, value, accent, small }) {
  return (
    <div className="p-2.5 rounded-lg border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="text-[10px] opacity-60 uppercase tracking-wider">{label}</div>
      <div className={`font-bold ${small ? 'text-sm' : 'text-xl'} mt-0.5`} style={{ color: accent || 'var(--foreground)' }}>{value}</div>
    </div>
  );
}
