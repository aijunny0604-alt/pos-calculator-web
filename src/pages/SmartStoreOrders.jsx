// 네이버 스마트스토어 주문 페이지 (Phase 1 MVP)
// - Realtime 구독으로 새 주문 즉시 표시
// - 자동 매칭 후보 표시 + 수동 확정
// - 내부 주문으로 전환 (saveOrder)
// - Mock 데이터 주입 (Phase 1 — API 키 받기 전 테스트용)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingBag, RefreshCw, Search, Check, X, AlertTriangle, Package, ArrowRight, Bell, BellOff, FlaskConical, ClipboardCheck, Truck, ExternalLink, Printer, Menu, Ban, Copy, Maximize2, Minimize2 } from 'lucide-react';
import { supabase, supabaseClient } from '@/lib/supabase';
import { playAlertSound, isStoreAlertSoundOn, setStoreAlertSound } from '@/components/StoreOrderAlerts';
import { matchCustomer } from '@/lib/fuzzyMatch';
import { findProductCandidates } from '@/lib/productMatch';
import { isOrderDone, isOrderTerminal, isOrderPending } from '@/lib/orderStatus';
import { NAVER_COURIERS as DELIVERY_COMPANIES } from '@/lib/naverCouriers';
import SyncMonitorWidget from '@/components/SyncMonitorWidget';

const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '-';
  try {
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return s; }
};
// 송장번호 → 택배 배송조회 (네이버 통합검색 = 택배사 무관 범용, API 키 불필요)
const trackingUrl = (company, no) =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(`${company || ''} ${no} 택배조회`)}`;

// 네이버 스토어 상품페이지 직접 링크 — 주문 항목 raw_payload.productOrder.productId 사용.
// /main/products/{productId} 는 스토어 슬러그 몰라도 자동으로 해당 스토어(엠파츠=m_parts)로 리다이렉트.
// ⚠️ originalProductId 는 원본(다른 스토어)로 가니 쓰지 말 것. productId 가 엠파츠 판매 상품번호.
const naverProductUrl = (it) => {
  const pid = it?.raw_payload?.productOrder?.productId;
  return pid ? `https://smartstore.naver.com/main/products/${pid}` : null;
};

// 주문 1건 → 카톡에 바로 붙여넣기 좋은 평문. 이모지 라벨 + 상품 목록 + 합계.
const buildOrderCopyText = (order, items = [], isCash = false) => {
  const L = [];
  L.push('🧾 주문');
  if (order.buyer_name) L.push(`💳 입금자: ${order.buyer_name}`);
  if (order.receiver_name) L.push(`🎁 받는분: ${order.receiver_name}`);
  if (order.buyer_phone) L.push(`📞 ${order.buyer_phone}`);
  if (order.buyer_address) L.push(`📍 ${order.buyer_address}`);
  L.push(`🔖 주문번호 ${order.provider_order_id || '-'}`);
  L.push('');
  L.push('🛒 주문내역');
  if (items.length === 0) {
    L.push('· (상품 정보 없음)');
  } else {
    items.forEach((it) => {
      const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
      let line = `· ${it.provider_product_name} ×${it.quantity || 1} — ${fmtNum(lineTotal)}원`;
      if (it.provider_product_option) line += `\n   (옵션: ${it.provider_product_option})`;
      L.push(line);
    });
  }
  L.push('');
  L.push(`💳 합계 ${fmtNum(orderPaymentTotal(order, items))}원 (${isCash ? '🚚 착불' : '💰 선불'})`);
  return L.join('\n');
};

// 네이버 주문 수수료 집계 — 각 상품주문(raw_payload.productOrder)의 수수료 필드 합산.
// 결제수수료(paymentCommission) + 판매수수료(saleCommission) + 채널수수료(channelCommission)
// + 네이버쇼핑 연동수수료(knowledgeShoppingSellingInterlockCommission). 정산예정금액=expectedSettlementAmount.
const computeNaverFees = (items = []) => {
  let payment = 0, sale = 0, channel = 0, knowledge = 0, settlement = 0, paymentTotal = 0;
  let hasData = false;
  for (const it of items) {
    const po = it?.raw_payload?.productOrder;
    if (!po) continue;
    hasData = true;
    payment += Number(po.paymentCommission || 0);
    sale += Number(po.saleCommission || 0);
    channel += Number(po.channelCommission || 0);
    knowledge += Number(po.knowledgeShoppingSellingInterlockCommission || 0);
    settlement += Number(po.expectedSettlementAmount || 0);
    paymentTotal += Number(po.totalPaymentAmount || 0);
  }
  const totalFee = payment + sale + channel + knowledge;
  const rate = paymentTotal > 0 ? (totalFee / paymentTotal) * 100 : 0;
  return { hasData, payment, sale, channel, knowledge, settlement, paymentTotal, totalFee, rate };
};

// 주문 실제 결제금액 — external_orders.total_amount 는 sync 가 상품주문 1건(lineTotal)만
// 저장해 다건 주문에서 과소계상됨. items 의 totalPaymentAmount(실결제액) 합이 정확.
// (없으면 unit_price*qty 합, 그것도 없으면 order.total_amount 폴백)
const orderLevelPayment = (od) => {
  if (!od) return 0;
  return Number(od.generalPaymentAmount || 0) + Number(od.naverMileagePaymentAmount || 0)
    + Number(od.payLaterPaymentAmount || 0) + Number(od.chargeAmountPaymentAmount || 0);
};
const orderPaymentTotal = (order, items = []) => {
  // 1) order 레벨 결제금액(전체 상품주문 포함, 가장 정확) — items 또는 order.raw_payload에서
  const odTotal = orderLevelPayment(order?.raw_payload?.order)
    || items.map((it) => orderLevelPayment(it?.raw_payload?.order)).find((v) => v > 0) || 0;
  if (odTotal > 0) return odTotal;
  // 2) 동기화된 items 의 실결제액 합
  let paySum = 0, lineSum = 0, hasPay = false;
  for (const it of items) {
    const p = Number(it?.raw_payload?.productOrder?.totalPaymentAmount);
    if (Number.isFinite(p) && p > 0) { paySum += p; hasPay = true; }
    lineSum += Number(it.unit_price || 0) * Number(it.quantity || 0);
  }
  if (hasPay) return paySum;
  if (lineSum > 0) return lineSum;
  return Number(order?.total_amount || 0);
};

// 고객정보만 따로 복사 (카톡/배송 라벨용)
const buildCustomerCopyText = (order) => {
  const L = [];
  if (order.buyer_name) L.push(`입금자: ${order.buyer_name}`);
  if (order.receiver_name) L.push(`받는분: ${order.receiver_name}`);
  if (order.buyer_phone) L.push(`연락처: ${order.buyer_phone}`);
  if (order.buyer_address) L.push(`주소: ${order.buyer_address}`);
  return L.join('\n');
};

// 클립보드 복사 (https 아닐 때 textarea 폴백)
const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 폴백으로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
};

// 배송수단 배지 — 방문수령 / 택배 / 직접배송 / 퀵 등 구분.
// 네이버 deliveryMethod(expectedDeliveryMethod) enum 기준.
const DELIVERY_METHOD = {
  DELIVERY: { label: '택배', icon: '📦', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  GDFW_ISSUE_SVC: { label: '택배', icon: '📦', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  VISIT_RECEIPT: { label: '방문수령', icon: '🏬', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)' },
  DIRECT_DELIVERY: { label: '직접배송', icon: '🚚', color: '#a78bfa', bg: 'rgba(167,139,250,0.16)' },
  QUICK_SVC: { label: '퀵서비스', icon: '🛵', color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  NOTHING: { label: '배송없음', icon: '🚫', color: '#7e9cb8', bg: 'rgba(126,156,184,0.14)' },
};
const getDeliveryMethod = (order, items = []) => {
  let code = order?.raw_payload?.productOrder?.expectedDeliveryMethod
    || order?.raw_payload?.delivery?.deliveryMethod || null;
  if (!code) {
    for (const it of items) {
      code = it?.raw_payload?.productOrder?.expectedDeliveryMethod
        || it?.raw_payload?.delivery?.deliveryMethod;
      if (code) break;
    }
  }
  if (!code) return null;
  return DELIVERY_METHOD[code] || { label: String(code), icon: '📦', color: '#7e9cb8', bg: 'rgba(126,156,184,0.14)' };
};

// 상태별 색상 — 수명주기 단계가 한눈에 구분되도록 단계별로 고유 색 부여.
// 결제완료=시안(지금 처리!) → 발주확인=노랑(발송준비) → 발송=파랑 → 배송중=보라 → 완료=초록.
// 취소요청=주황(응답필요), 취소=빨강, 반품=핑크, 교환=마젠타. (2026-06-01 색 분리)
const STATUS_LABEL = {
  received: { label: '수신', color: '#7e9cb8', bg: 'rgba(126,156,184,0.15)' },
  // 입금대기 — 고객 미결제, 사장님 액션 불가 → 흐린 회색
  PAYMENT_WAITING: { label: '입금대기', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  PAY_WAITING: { label: '입금대기', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  // 결제완료/매칭 — 지금 처리해야 할 시작점 → 밝은 시안
  PAYED: { label: '결제완료', color: '#22d3ee', bg: 'rgba(34,211,238,0.16)' },
  matched: { label: '매칭됨', color: '#22d3ee', bg: 'rgba(34,211,238,0.16)' },
  // 발주확인 — 발송 준비 단계 → 노랑
  confirmed: { label: '발주확인', color: '#facc15', bg: 'rgba(250,204,21,0.16)' },
  // 내부주문 전환 — 내부 처리됨 → 틸
  converted: { label: '내부주문 전환', color: '#2dd4bf', bg: 'rgba(45,212,191,0.16)' },
  // 발송 — 발송 처리함 → 파랑
  shipped: { label: '발송완료', color: '#3b82f6', bg: 'rgba(59,130,246,0.18)' },
  DISPATCHED: { label: '발송중', color: '#3b82f6', bg: 'rgba(59,130,246,0.18)' },
  // 배송중 — 배송 진행 → 보라
  DELIVERING: { label: '배송중', color: '#a78bfa', bg: 'rgba(167,139,250,0.16)' },
  // 배송완료/구매확정 — 도착·최종 완료 → 초록 (진하기로 단계 구분)
  DELIVERED: { label: '배송완료', color: '#22c55e', bg: 'rgba(34,197,94,0.16)' },
  DELIVERED_COMPLETED: { label: '배송완료', color: '#22c55e', bg: 'rgba(34,197,94,0.16)' },
  PURCHASE_DECIDED: { label: '구매확정', color: '#16a34a', bg: 'rgba(22,163,74,0.2)' },
  // 취소/반품/교환 — 이상 흐름, 각각 다른 경고색
  CANCEL_REQUEST: { label: '취소요청', color: '#fb923c', bg: 'rgba(251,146,60,0.18)' },
  cancelled: { label: '취소', color: '#ff4d6d', bg: 'rgba(255,77,109,0.16)' },
  CANCELED: { label: '취소', color: '#ff4d6d', bg: 'rgba(255,77,109,0.16)' },
  CANCELED_BY_NOPAYMENT: { label: '미입금취소', color: '#ff4d6d', bg: 'rgba(255,77,109,0.16)' },
  RETURNED: { label: '반품', color: '#ec4899', bg: 'rgba(236,72,153,0.16)' },
  EXCHANGED: { label: '교환', color: '#d946ef', bg: 'rgba(217,70,239,0.16)' },
};

// 발주확인 가능 상태 (네이버 원본 + 내부 status 모두 포함)
const PENDING_CONFIRM_STATUSES = new Set(['received', 'PAYED', 'PAYMENT_WAITING', 'matched']);

// 주문 진행 단계 — 사장님이 "지금 어디까지 됐는지" 한눈에 보도록 5단계로 정규화.
// 결제완료(0) → 발주확인(1) → 발송(2) → 배송중(3) → 배송완료(4).
// 취소/반품/교환은 별도 트랙(stage=-1, canceled=true).
const ORDER_STEPS = ['결제완료', '발주확인', '발송', '배송중', '배송완료'];
function orderStage(o) {
  if (!o) return { stage: 0, canceled: false };
  const st = o.order_status;
  // 취소/반품/교환 = 정상 흐름 이탈
  if (['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'CANCEL_REQUEST', 'RETURNED', 'EXCHANGED'].includes(st)) {
    return { stage: -1, canceled: true };
  }
  // 배송완료 / 구매확정
  if (['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED'].includes(st)) return { stage: 4, canceled: false };
  // 배송중
  if (st === 'DELIVERING') return { stage: 3, canceled: false };
  // 발송 — 네이버 발송처리 시각이 찍혔거나 내부/네이버 발송 상태
  if (o.naver_dispatch_succeeded_at || st === 'shipped' || st === 'DISPATCHED') return { stage: 2, canceled: false };
  // 발주확인 — 네이버 발주확인 완료 또는 내부 전환/확인 상태
  if (o.naver_confirm_succeeded_at || st === 'confirmed' || st === 'converted') return { stage: 1, canceled: false };
  // 그 외(결제완료/매칭/수신/입금대기) = 시작점
  return { stage: 0, canceled: false };
}

// 처리 대기 주문 = 매장이 아직 손대야 하는 주문 (발주확인 전 or 발송 전).
// 이런 주문은 날짜 필터에서 빠지면 그대로 놓치므로, 기간과 무관하게 항상 노출한다 (2026-06-03).
// ⚠️ 판정은 orderStatus.js의 단일 정책 isOrderPending을 그대로 재사용한다.
//   (자체 orderStage 재구현 시 입금대기·내부전환 건이 잘못 끌려오는 드리프트 발생 — 메뉴 배지와 불일치)
//   isOrderPending = 내부전환 X · 완료(발송 succeeded_at 포함) X · 배송중 X · 입금대기 X.
const needsAction = isOrderPending;

// 조회기간 밖이지만 미처리라 끌어올려 표시되는 주문인가 — 배너 카운트와 카드 배지가
// 동일 판정을 쓰도록 단일 헬퍼로 통일 (드리프트 방지).
function isPendingOutOfRange(o, dateRange) {
  if (!dateRange || !needsAction(o) || !o.received_at) return false;
  const rec = new Date(o.received_at);
  return rec < dateRange.from || rec >= dateRange.to;
}

// 네이버 발송 실패 사유를 사장님이 이해할 메시지로 변환 (DB naver_dispatch_error 파싱).
// 예전엔 실패해도 화면에 안 떠서 "발송 안 됨"을 네이버에서야 발견했음 (2026-06-02 보강).
function dispatchErrorHint(err) {
  if (!err) return null;
  if (err.includes('104119')) return '택배사 코드를 네이버가 거부했어요 — 택배사를 다시 선택해 재시도하세요';
  if (err.includes('9999')) return '이미 발송/배송중이거나 클레임 상태라 발송처리가 안 돼요 (네이버에서 이미 처리된 주문)';
  const m = /"message":"([^"]+)"/.exec(err);
  return m ? `네이버 발송 실패: ${m[1]}` : `네이버 발송 실패: ${String(err).slice(0, 80)}`;
}

// 진행단계 스텝퍼 — 카드 상단에 가로로 표시. 지난 단계=초록 체크, 현재=강조, 이후=흐림.
function OrderStepper({ order }) {
  const { stage, canceled } = orderStage(order);
  if (canceled) {
    const st = order.order_status;
    const label = st === 'RETURNED' ? '반품' : st === 'EXCHANGED' ? '교환'
      : st === 'CANCEL_REQUEST' ? '취소요청' : '취소';
    return (
      <div className="px-4 py-1.5 flex items-center gap-1.5 border-b text-[11px] font-bold"
        style={{ background: 'rgba(255,77,109,0.08)', borderColor: 'var(--border)', color: '#ff4d6d' }}>
        <Ban className="w-3.5 h-3.5" /> {label}된 주문 — 정상 배송 흐름에서 제외됨
      </div>
    );
  }
  return (
    <div className="px-3 sm:px-4 py-2 border-b flex items-center" style={{ borderColor: 'var(--border)' }}>
      {ORDER_STEPS.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
        const color = done ? '#22c55e' : active ? '#ff3b3b' : 'var(--muted-foreground)';
        return (
          <div key={label} className="flex items-center" style={{ flex: i < ORDER_STEPS.length - 1 ? 1 : 'none' }}>
            <div className="flex flex-col items-center gap-0.5">
              <div className={`rounded-full flex items-center justify-center font-bold${active ? ' animate-pulse' : ''}`}
                style={{
                  width: active ? 24 : 20, height: active ? 24 : 20, fontSize: active ? 11 : 10,
                  background: done ? '#22c55e' : active ? '#ff3b3b' : 'var(--muted)',
                  color: done ? '#001a1a' : active ? '#fff' : color,
                  border: active ? '2px solid #ff6b6b' : done ? 'none' : '1px solid var(--border)',
                  boxShadow: active ? '0 0 0 4px rgba(255,59,59,0.2), 0 0 14px 2px rgba(255,59,59,0.85)' : 'none',
                }}>
                {done ? '✓' : i + 1}
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold whitespace-nowrap"
                style={{ color, opacity: done || active ? 1 : 0.55, textShadow: active ? '0 0 8px rgba(255,59,59,0.6)' : 'none' }}>
                {label}
              </span>
            </div>
            {i < ORDER_STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 rounded mb-3" style={{ background: i < stage ? '#22c55e' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 처리 완료 상태 (카드 기본 숨김 대상)
// Codex C-3 fix: CANCEL_REQUEST 제거 — 구매자 취소 요청은 아직 미처리 상태 (사장님 응답 필요)
// 네이버 스토어 통합 거래처명 (실 buyer 는 memo 에 기록)
const NAVER_STORE_CUSTOMER_NAME = '엠파츠';

// 네이버 커머스 API 호환 택배사 코드는 공유 모듈(@/lib/naverCouriers)에서 import (상단)

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

    // ⚠️ 택배 송장은 '받는사람(배송지)' 기준이어야 함 — 주문자(입금자)와 다를 수 있음.
    // 배송지(shippingAddress)에서 받는사람 이름·전화·주소를 우선 사용, 없으면 컬럼 폴백.
    const meta = parseNaverMeta(order, items);
    const recvName = meta.receiverName || order.receiver_name || order.buyer_name || '구매자';
    const recvPhone = meta.receiverTel || order.buyer_phone || '';
    const recvAddr = (meta.receiverAddr ? `${meta.receiverZip ? `(${meta.receiverZip}) ` : ''}${meta.receiverAddr}` : '') || order.buyer_address || '';

    const newEntry = {
      id: `naver-${order.provider_order_id}-${Date.now()}`,
      name: recvName,
      phone: recvPhone,
      address: recvAddr,
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
  const [soundOn, setSoundOn] = useState(isStoreAlertSoundOn());
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCompleted, setShowCompleted] = useState(false); // 처리완료 카드 표시 토글
  // 위젯 클릭 → 위젯과 동일한 카운트 로직으로 필터링 (Codex Major: 카운트↔필터 일관성)
  // 'none' | 'overdue' | 'dueDday' | 'dueD1' | 'autoPending' | 'newAfterConfirm' | 'cancel'
  const [widgetFilter, setWidgetFilter] = useState('none');
  // 날짜 조회 (네이버 관리자 페이지 스타일)
  const [datePreset, setDatePreset] = useState('today'); // today | 1w | 1m | 3m | custom (기본=오늘)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // 주문 검색 (이름/전화/주문번호/상품) + 정렬
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent | amount | status
  // 네이버 연동 로그 모니터 (발주확인/발송 API 성공·실패 내역)
  const [showLogModal, setShowLogModal] = useState(false);
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
  // 상단 위젯(KPI·네이버 관리자·진행단계) 접기/펼치기 — localStorage 영구 저장
  const [widgetsCollapsed, setWidgetsCollapsed] = useState(() => {
    try { return localStorage.getItem('smartstore_widgets_collapsed') === '1'; } catch { return false; }
  });
  const toggleWidgets = () => {
    setWidgetsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('smartstore_widgets_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };
  // 네이버 상품 카탈로그 수동 동기화 — sync.js가 5분 내 감지해 전 상품·옵션 갱신 (MOVIS 검색용)
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const requestCatalogSync = async () => {
    setCatalogSyncing(true);
    try {
      const { error } = await supabaseClient.rpc('request_naver_catalog_sync_now');
      if (error) throw error;
      showToast?.('🛒 네이버 상품 동기화 요청됨 — 매장 PC가 5분 내 전 상품·옵션을 갱신합니다 (MOVIS에서 검색 가능)', 'success');
    } catch (e) {
      showToast?.(`상품 동기화 요청 실패: ${e.message || e}`, 'error');
    } finally {
      setTimeout(() => setCatalogSyncing(false), 1500);
    }
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
  const [modalFullscreen, setModalFullscreen] = useState(false); // 주문 상세 모달 전체화면 토글
  const [bulkDispatchOpen, setBulkDispatchOpen] = useState(false);
  const [bulkDispatchCompany, setBulkDispatchCompany] = useState('CJGLS'); // 기본(전체 적용용)
  const [bulkTrackingMap, setBulkTrackingMap] = useState({}); // { orderId: 'tracking' }
  const [bulkCompanyMap, setBulkCompanyMap] = useState({}); // { orderId: companyCode } 주문별 개별 택배사 (네이버처럼)
  // 주문 취소 모달 (Task #108 → C1 fix: window.prompt → 모달 UI)
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const CANCEL_PRESETS = ['상품 품절', '구매자 요청', '배송 지연', '가격 오류', '기타'];
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

  // 실시간 구독은 전역 StoreOrderAlerts가 전담 → 변경 이벤트 받으면 목록만 갱신
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener('external-orders-changed', onChange);
    return () => window.removeEventListener('external-orders-changed', onChange);
  }, [reload]);

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

    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const matched = orders.filter((o) => {
      if (providerFilter !== 'all' && o.provider !== providerFilter) return false;
      // 주문 검색: 구매자 이름·전화·주문번호·주소·상품명. 전화는 숫자만으로도 매칭.
      if (q) {
        const items = itemsByOrder[o.id] || [];
        const hay = [o.buyer_name, o.buyer_phone, o.provider_order_id, o.buyer_address,
          ...items.map((it) => it.provider_product_name)].filter(Boolean).join(' ').toLowerCase();
        const phoneDigits = String(o.buyer_phone || '').replace(/\D/g, '');
        if (!(hay.includes(q) || (qDigits.length >= 3 && phoneDigits.includes(qDigits)))) return false;
      }
      // 상태 필터 = 스텝퍼 5단계(실제 배송상태)와 1:1. 단일 order_status 정확매칭이 아니라
      // 단계(결제완료/발주확인/발송/배송중/배송완료)·취소 그룹으로 판정 (2026-06-03).
      if (statusFilter !== 'all') {
        const { stage: st, canceled: cx } = orderStage(o);
        if (statusFilter === 'cancel') { if (!cx) return false; }
        else {
          const wantStage = { s0: 0, s1: 1, s2: 2, s3: 3, s4: 4 }[statusFilter];
          if (cx || st !== wantStage) return false;
        }
      }
      // 종결(배송완료/구매확정/취소/반품/교환) 만 토글 OFF 시 숨김.
      // 내부주문 전환(converted)·발송완료(shipped)·배송중은 아직 추적할 게 있어 계속 표시 (2026-06-02).
      // 단, widgetFilter 또는 상태필터 active 시에는 그쪽 의도가 우선이므로 우회 (배송완료/취소 직접 조회 가능).
      if (!showCompleted && widgetFilter === 'none' && statusFilter === 'all' && isOrderTerminal(o)) return false;
      // 날짜 범위 (결제일 = received_at 기준, 네이버 조회기간과 동일)
      // 단, 미처리(발주확인·발송 대기) 주문은 기간 밖이라도 항상 표시 → 놓치는 주문 0 (2026-06-03).
      if (dateRange && o.received_at && !needsAction(o)) {
        const rec = new Date(o.received_at);
        if (rec < dateRange.from || rec >= dateRange.to) return false;
      }
      // 위젯 필터 (stats 카운트 로직과 1:1 동일)
      if (widgetFilter !== 'none') {
        const dispatchDue = o.dispatch_due_date || o.raw_payload?.productOrder?.dispatchDueDate || o.raw_payload?.dispatchDueDate;
        const isDone = isOrderDone(o);
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
          // M4 fix: 이미 발송완료/처리완료된 큐 잔존 row 제외 (polling latency 동안 false positive 방지)
          if (isOrderDone(o)) return false;
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
    // 정렬 — 최신순(기본) / 금액순(높은순) / 상태순(진행단계). 동순위는 최신순.
    const stageRank = (o) => { const { stage, canceled } = orderStage(o); return canceled ? 99 : stage; };
    // 손상된 received_at(Invalid Date)도 NaN 없이 0으로 안전 처리 → 정렬 안정성 보장
    const ts = (o) => { const t = new Date(o.received_at || 0).getTime(); return Number.isFinite(t) ? t : 0; };
    const recentDesc = (a, b) => ts(b) - ts(a);
    const sorted = [...matched].sort((a, b) => {
      if (sortBy === 'amount') return Number(b.total_amount || 0) - Number(a.total_amount || 0) || recentDesc(a, b);
      if (sortBy === 'status') return stageRank(a) - stageRank(b) || recentDesc(a, b);
      return recentDesc(a, b);
    });
    return sorted;
  }, [orders, itemsByOrder, providerFilter, statusFilter, showCompleted, dateRange, widgetFilter, searchQuery, sortBy]);

  // 네이버 연동 로그 — orders(전 컬럼 로드됨)에서 발주확인/발송 API 결과를 이벤트로 추출.
  // 매장 PC sync.js가 external_orders에 기록한 succeeded_at/error/needs_* 필드 기반 (추가 쿼리 없음).
  const integrationLog = useMemo(() => {
    const ev = [];
    for (const o of orders) {
      const base = { id: o.id, name: o.buyer_name || '구매자', poid: o.provider_order_id };
      // 발주확인
      if (o.naver_confirm_succeeded_at) ev.push({ ...base, t: o.naver_confirm_succeeded_at, kind: '발주확인', result: 'success' });
      else if (o.needs_naver_confirm) ev.push({ ...base, t: o.naver_confirm_next_retry_at || o.received_at, kind: '발주확인', result: 'pending' });
      // 발송
      if (o.naver_dispatch_succeeded_at) ev.push({ ...base, t: o.naver_dispatch_succeeded_at, kind: '발송', result: 'success', tracking: o.naver_dispatch_tracking, company: o.naver_dispatch_company_name });
      else if (o.naver_dispatch_error) ev.push({ ...base, t: o.naver_dispatch_attempted_at || o.received_at, kind: '발송', result: 'fail', tracking: o.naver_dispatch_tracking, error: o.naver_dispatch_error });
      else if (o.needs_naver_dispatch) ev.push({ ...base, t: o.naver_dispatch_next_retry_at || o.received_at, kind: '발송', result: 'pending', tracking: o.naver_dispatch_tracking });
    }
    ev.sort((a, b) => new Date(b.t || 0) - new Date(a.t || 0));
    return ev.slice(0, 120);
  }, [orders]);
  const logCounts = useMemo(() => ({
    success: integrationLog.filter((e) => e.result === 'success').length,
    fail: integrationLog.filter((e) => e.result === 'fail').length,
    pending: integrationLog.filter((e) => e.result === 'pending').length,
  }), [integrationLog]);

  // 조회 결과 요약 (현재 필터 적용 기준)
  const filteredSummary = useMemo(() => ({
    count: filtered.length,
    sum: filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    pending: filtered.filter((o) => needsAction(o)).length,
  }), [filtered]);

  // CSV 내보내기 — 현재 조회된(필터 적용) 주문을 정산/세무용으로 다운로드
  const exportCsv = () => {
    if (!filtered.length) { showToast?.('내보낼 주문이 없어요', 'error'); return; }
    const headers = ['주문일', '구매자', '전화', '주소', '주문번호', '상품', '금액', '상태', '배송', '송장'];
    // CSV 수식 인젝션 방지: 선두가 = + - @ TAB CR 이면 작은따옴표 prepend (Excel이 수식으로 실행하는 것 차단)
    const esc = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filtered.map((o) => {
      const its = itemsByOrder[o.id] || [];
      const prod = its.map((i) => i.provider_product_name).filter(Boolean).join(' / ');
      const track = its.map((i) => i.tracking_number).filter(Boolean).join(' / ');
      const statusLabel = STATUS_LABEL[o.order_status]?.label || o.order_status || '';
      return [fmtDate(o.received_at), o.buyer_name, o.buyer_phone, o.buyer_address, o.provider_order_id,
        prod, o.total_amount, statusLabel, o.delivery_policy_type || '', track].map(esc).join(',');
    });
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n'); // BOM = Excel 한글 깨짐 방지
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = url; a.download = `스마트스토어주문_${stamp}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast?.(`${filtered.length}건 CSV 내보내기 완료`, 'success');
  };

  // 숨겨진 종결 주문 개수 (토글 OFF 시 가려지는 것과 정확히 일치)
  const completedCount = useMemo(() => orders.filter((o) =>
    isOrderTerminal(o)
  ).length, [orders]);

  // 날짜 필터 밖이지만 미처리라 끌어올려 표시 중인 주문 수 (놓침 방지 안내용)
  const pendingOutOfRangeCount = useMemo(
    () => orders.filter((o) => isPendingOutOfRange(o, dateRange)).length,
    [orders, dateRange]
  );

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
      const isDone = isOrderDone(o);
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

  // 진행 단계 실시간 현황 — orderStage(5단계)로 집계. 상태필터 s0~s4와 1:1 (클릭=그 단계만).
  // stats/위젯과 동일하게 ordersInRange(조회기간 적용) 기준 → 날짜 바꾸면 카운트도 따라감.
  const stageCounts = useMemo(() => {
    const stages = [0, 0, 0, 0, 0]; // 결제완료 / 발주확인 / 발송 / 배송중 / 배송완료
    let canceled = 0;
    for (const o of ordersInRange) {
      const { stage, canceled: cx } = orderStage(o);
      if (cx) { canceled++; continue; }
      if (stage >= 0 && stage <= 4) stages[stage]++;
    }
    return { stages, canceled };
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
  // C1 fix: window.prompt/confirm → 모달 UI (iOS Safari 안정성, CLAUDE.md 모달 정책 일관성)
  const cancelOrder = (order) => {
    setCancelReason('상품 품절');
    setCancelModalOrder(order);
  };
  const submitCancelOrder = async () => {
    if (!cancelModalOrder) return;
    const trimmed = (cancelReason || '').trim();
    if (!trimmed) { showToast?.('취소 사유는 필수예요', 'error'); return; }
    if (trimmed.length > 200) { showToast?.('취소 사유는 200자 이하로 작성해주세요', 'error'); return; }
    setCancelSubmitting(true);
    try {
      // ⚠️ 로컬 표시 전용 — sync.js에 네이버 취소 핸들러가 없어 실제 취소는 안 됨.
      // needs_naver_cancel 플래그는 처리되지 않아(미구현) 세우지 않음(오해/오작동 방지).
      const patch = {
        order_status: 'cancelled',
        naver_cancel_reason: trimmed,
      };
      const ok = await supabase.updateExternalOrder(cancelModalOrder.id, patch);
      if (ok) {
        showToast?.(`화면에서 '취소됨'으로 표시 — 네이버 실제 취소는 판매자센터에서 하세요`, 'success');
        setCancelModalOrder(null);
        setCancelReason('');
        reload();
      } else {
        showToast?.('취소 처리 실패 — 다시 시도해주세요', 'error');
      }
    } finally {
      setCancelSubmitting(false);
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
  const clearSelection = () => { setSelectedOrderIds(new Set()); setBulkTrackingMap({}); setBulkCompanyMap({}); };
  // 선택한 주문들(고객+주문내역) 한 번에 카톡용으로 복사
  const copySelectedOrders = async () => {
    const targets = filtered.filter((o) => selectedOrderIds.has(o.id));
    if (targets.length === 0) { showToast?.('선택된 주문이 없어요', 'error'); return; }
    const blocks = targets.map((o, i) => {
      const items = itemsByOrder[o.id] || [];
      const isCash = o.delivery_policy_type === '착불' || /cash/i.test(o.delivery_policy_type || '');
      return `[${i + 1}/${targets.length}]\n${buildOrderCopyText(o, items, isCash)}`;
    });
    const text = blocks.join('\n\n━━━━━━━━━━\n\n');
    const ok = await copyToClipboard(text);
    showToast?.(ok ? `📋 ${targets.length}건 전체 복사됨 — 카톡에 붙여넣기!` : '복사 실패', ok ? 'success' : 'error');
  };
  const openBulkDispatch = () => {
    if (selectedOrderIds.size === 0) {
      showToast?.('선택된 주문이 없어요', 'error');
      return;
    }
    // 선택된 주문 중 이미 발송완료 제외
    const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !isOrderDone(o));
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
    const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !isOrderDone(o));
    const ready = eligible.filter((o) => (bulkTrackingMap[o.id] || '').trim().length > 0);
    if (ready.length === 0) {
      showToast?.('송장번호를 1건 이상 입력해주세요', 'error');
      return;
    }
    // M1 fix: 부분 실패 시 실패 주문만 selection+tracking 유지하여 재시도 쉽게
    let success = 0;
    const failedOrders = [];
    const successIds = [];
    for (const order of ready) {
      const tracking = bulkTrackingMap[order.id].trim();
      // 주문별 개별 택배사 (없으면 전체 기본)
      const code = bulkCompanyMap[order.id] || bulkDispatchCompany;
      const company = DELIVERY_COMPANIES.find((c) => c.code === code);
      const needsConfirm = !order.naver_confirm_succeeded_at;
      const patch = {
        needs_naver_dispatch: true,
        naver_dispatch_company_code: code,
        naver_dispatch_company_name: company?.name || code,
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
      if (ok) { success++; successIds.push(order.id); }
      else failedOrders.push(order);
    }
    if (failedOrders.length > 0) {
      // 실패 주문만 selection 유지 + tracking 보존, 모달은 열어둠 → 사용자가 즉시 재시도 가능
      setSelectedOrderIds(new Set(failedOrders.map((o) => o.id)));
      const failedIds = new Set(failedOrders.map((o) => o.id));
      setBulkTrackingMap((prev) => {
        const next = {};
        for (const o of failedOrders) if (prev[o.id]) next[o.id] = prev[o.id];
        return next;
      });
      // 개별 택배사도 실패분만 보존 (재시도 시 선택 유지)
      setBulkCompanyMap((prev) => {
        const next = {};
        for (const id of failedIds) if (prev[id]) next[id] = prev[id];
        return next;
      });
      const names = failedOrders.slice(0, 3).map((o) => o.buyer_name || `#${o.provider_order_id}`).join(', ');
      const suffix = failedOrders.length > 3 ? ` 외 ${failedOrders.length - 3}건` : '';
      showToast?.(
        `일괄 발송 ${success}건 성공 / ${failedOrders.length}건 실패: ${names}${suffix} — 모달 유지, 재시도 가능`,
        'error'
      );
    } else {
      showToast?.(`일괄 발송 ${success}건 대기열 등록 — 60초 내 네이버 자동 처리`, 'success');
      setBulkDispatchOpen(false);
      clearSelection();
    }
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
    // 배송 정책(착불/선불) 보존 — 내부주문엔 별도 필드가 없으므로 memo에 기록.
    // ShippingLabel이 이 마커를 읽어 발송인=엠파츠 + 착불/선불을 자동 세팅한다.
    const payLabel = normalizeDeliveryPayType(order.delivery_policy_type); // '착불' | '선불'
    const memo = isNaverOrder
      ? `[엠파츠] [네이버 스마트스토어] ${order.provider_order_id}\n구매자: ${buyerName || '-'} / ${order.buyer_phone || '-'}${order.buyer_address ? `\n주소: ${order.buyer_address}` : ''}\n배송: ${payLabel}`
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
      const baseName = it.matched_product_name || it.provider_product_name;
      // 스토어 주문 옵션(예: "사이즈: 63-90")을 내부주문에도 보존 — 상세 모달이 name을 렌더하므로
      // 옵션을 제품명에 함께 붙여 한눈에 보이게 + option 필드도 별도 보존.
      const opt = (it.provider_product_option || '').trim();
      return {
        // freeform 의 id 는 productOrderId 기반 유니크 마커 (같은 주문 합산 안 되게)
        id: isMatched ? (p?.id || it.matched_product_id) : `naver-${it.provider_product_order_id || it.id}`,
        name: opt ? `${baseName} (${opt})` : baseName,
        option: opt || undefined,
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
      // ⚠️ order_status 는 건드리지 않는다 — 'converted'로 덮으면 sync.js STATUS_RANK(99)에 막혀
      // 그 뒤 네이버 상태(발송/배송중/배송완료)가 영영 반영 안 됨. 전환 여부는 internal_order_id 로만 표시.
      // (2026-06-02: 메인 상태 칩 = 네이버 실시간 상태 유지가 핵심)
      await supabase.updateExternalOrder(order.id, {
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
      <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* 모바일 햄버거 메뉴 — 다른 페이지와 동일 패턴 (toggle-sidebar 이벤트) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="md:hidden p-2 -ml-1 rounded-lg transition-colors hover:bg-[var(--accent)]"
          title="메뉴 열기"
        >
          <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
        </button>
        <ShoppingBag className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
        <h1 className="text-base sm:text-xl font-bold flex-1 min-w-0 truncate whitespace-nowrap" style={{ color: 'var(--foreground)' }}>스마트스토어 주문</h1>
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
          onClick={requestCatalogSync}
          disabled={catalogSyncing}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
          title="네이버 스토어 전 상품·옵션을 MOVIS 검색용으로 동기화 (하루 1회 자동 + 수동)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${catalogSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">상품 동기화</span>
        </button>
        <button
          onClick={() => setSoundOn((v) => { const next = !v; setStoreAlertSound(next); if (next) playAlertSound('order'); return next; })}
          className="p-2 rounded hover:bg-[var(--muted)]"
          title={soundOn ? '알림 사운드 끄기 (신규주문·취소, 전 페이지 공통)' : '알림 사운드 켜기 (신규주문·취소, 전 페이지 공통)'}
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
          onClick={() => setShowLogModal(true)}
          className="px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
          style={{ background: 'rgba(0,212,255,0.12)', color: 'var(--primary)', border: '1px solid var(--border)' }}
          title="네이버 연동 로그 — 발주확인/발송 API 성공·실패 내역"
        >
          📋<span className="hidden sm:inline">로그</span>
          {logCounts.fail > 0 && (
            <span className="px-1 rounded-full text-[10px] font-bold" style={{ background: '#ff4d6d', color: 'white' }}>{logCounts.fail}</span>
          )}
        </button>
        <button
          onClick={injectMockOrder}
          className="px-2 sm:px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 flex-shrink-0"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
          title="테스트용 mock 주문 1건 생성"
        >
          <FlaskConical className="w-3.5 h-3.5" /><span className="hidden sm:inline">Mock 주문 테스트</span>
        </button>
      </div>

      {/* 본문 스크롤 영역 — 헤더 외 모든 컨텐츠를 포함 (모바일 스크롤 보장) */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-20 sm:pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>

      {/* Sync 모니터링 위젯 */}
      <div className="px-3 sm:px-4 pt-3">
        <SyncMonitorWidget showToast={showToast} />
      </div>

      {/* 상단 위젯 접기/펼치기 토글 */}
      <div className="px-3 sm:px-4 pt-2">
        <button
          onClick={toggleWidgets}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs sm:text-sm font-semibold transition-colors hover:opacity-90"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          title={widgetsCollapsed ? '요약 위젯 펼치기' : '요약 위젯 접기 (주문 목록 먼저 보기)'}
        >
          <span className="flex items-center gap-1.5 opacity-80">
            📊 요약 위젯
            {widgetsCollapsed && (
              <span className="text-[10px] sm:text-xs font-normal opacity-60">
                (전체 {stats.total} · 대기 {stats.pending}{stats.overdue > 0 ? ` · 초과 ${stats.overdue}` : ''})
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 opacity-70">
            {widgetsCollapsed ? '펼치기' : '접기'}
            <span className="inline-block transition-transform" style={{ transform: widgetsCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>▾</span>
          </span>
        </button>
      </div>

      {!widgetsCollapsed && (<>
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

      {/* 진행 단계 실시간 현황 — 결제완료→발주확인→발송→배송중→배송완료 (클릭=그 단계만 필터) */}
      <div className="px-3 sm:px-4 pb-3">
        <StageMonitorBar
          counts={stageCounts.stages}
          canceled={stageCounts.canceled}
          statusFilter={statusFilter}
          onSelect={(key) => { setWidgetFilter('none'); setStatusFilter(key || 'all'); }}
          onSelectCancel={() => { setWidgetFilter('none'); setStatusFilter('cancel'); }}
        />
      </div>
      </>)}

      {/* 날짜 조회 (네이버 관리자 페이지 스타일) */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 pb-2">
        <span className="text-sm opacity-70 font-mono uppercase">조회기간</span>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {[
            { v: 'today', label: '오늘' },
            { v: '1w', label: '1주일' },
            { v: '1m', label: '1개월' },
            { v: '3m', label: '3개월' },
            { v: 'all', label: '전체' },
          ].map((p) => (
            <button key={p.v} onClick={() => { setWidgetFilter('none'); setDatePreset(p.v); }}
              className="text-sm px-4 py-1.5 transition-colors"
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
          className="text-sm px-2.5 py-1.5 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        <span className="text-sm opacity-50">~</span>
        <input type="date" value={dateTo}
          onChange={(e) => { setWidgetFilter('none'); setDateTo(e.target.value); setDatePreset('custom'); }}
          className="text-sm px-2.5 py-1.5 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        {dateRange && (
          <span className="text-xs opacity-60 font-mono ml-auto">
            {fmtDate(dateRange.from)} ~ {fmtDate(new Date(dateRange.to.getTime() - 1))} · {filtered.length}건
          </span>
        )}
      </div>

      {/* 기간 밖 미처리 끌어올림 안내 — 어제·그제 주문도 발주확인/발송 전이면 항상 표시됨을 명시 */}
      {pendingOutOfRangeCount > 0 && (
        <div className="mx-3 sm:mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(255,193,7,0.12)', border: '1px solid rgba(255,193,7,0.4)', color: 'var(--foreground)' }}>
          <span>⏳</span>
          <span><b>처리 대기 {pendingOutOfRangeCount}건</b>은 조회기간 밖이지만 아직 <b>발주확인·발송 전</b>이라 함께 표시 중이에요 (놓침 방지)</span>
        </div>
      )}

      {/* 주문 검색 — 구매자·전화·주문번호·상품명 즉시 검색 */}
      <div className="px-3 sm:px-4 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="구매자 · 전화 · 주문번호 · 상품 검색"
            className="w-full text-sm pl-9 pr-9 py-2 rounded-lg border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--accent)]"
              title="검색어 지우기">
              <X className="w-4 h-4 opacity-60" />
            </button>
          )}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2">
        <select value={providerFilter} onChange={(e) => { setWidgetFilter('none'); setProviderFilter(e.target.value); }}
          className="text-sm px-2.5 py-1.5 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 마켓</option>
          <option value="naver">네이버</option>
          <option value="mock">🧪 Mock</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setWidgetFilter('none'); setStatusFilter(e.target.value); }}
          className="text-sm px-2.5 py-1.5 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          <option value="all">전체 상태</option>
          <option value="s0">① 결제완료</option>
          <option value="s1">② 발주확인</option>
          <option value="s2">③ 발송</option>
          <option value="s3">④ 배송중</option>
          <option value="s4">⑤ 배송완료</option>
          <option value="cancel">취소·반품</option>
        </select>
        {/* 정렬 */}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="text-sm px-2.5 py-1.5 rounded border" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          title="정렬 기준">
          <option value="recent">↕ 최신순</option>
          <option value="amount">💰 금액순</option>
          <option value="status">📊 상태순</option>
        </select>
        {/* 뷰 모드 토글 — 카드 / 컴팩트 */}
        <button
          onClick={toggleViewMode}
          className="text-sm px-3 py-1.5 rounded border ml-auto flex items-center gap-1 hover:bg-[var(--accent)]"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          title={viewMode === 'card' ? '컴팩트 모드로 (한 줄 표시)' : '카드 모드로 (디테일 표시)'}
        >
          {viewMode === 'card' ? '📋 컴팩트' : '🔲 카드'}
        </button>
        {/* 처리완료 카드 표시 토글 */}
        <label className="text-sm flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="accent-current w-4 h-4" />
          배송완료·취소 표시
          {completedCount > 0 && <span className="opacity-60">({completedCount})</span>}
        </label>
      </div>

      {/* 조회 결과 요약 바 — 현재 필터 기준 건수·합계·대기 한눈에 + CSV 내보내기 */}
      {!loading && filtered.length > 0 && (
        <div className="mx-3 sm:mx-4 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span>조회 <b>{filteredSummary.count}</b>건</span>
          <span>합계 <b style={{ color: 'var(--primary)' }}>{fmtNum(filteredSummary.sum)}원</b></span>
          {filteredSummary.pending > 0 && (
            <span style={{ color: '#ffb020' }}>처리대기 <b>{filteredSummary.pending}</b>건</span>
          )}
          <button onClick={exportCsv}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--accent)]"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            title="조회된 주문 CSV 내보내기">
            <span>📤</span> CSV
          </button>
        </div>
      )}

      {/* 주문 카드 목록 — 항상 풀 디스플레이, 모바일 우선 디자인 */}
      <div className="px-3 sm:px-4">
        {loading && <div className="text-center py-12 text-sm opacity-60">불러오는 중...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 opacity-60">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
            {orders.length > 0 ? (
              <>
                <div className="text-sm">조건에 맞는 주문이 없어요</div>
                <div className="text-xs mt-1">검색어·필터·조회기간을 바꿔보세요</div>
                {(searchQuery || statusFilter !== 'all' || providerFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setProviderFilter('all'); setWidgetFilter('none'); }}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--primary)', color: 'white' }}>
                    필터 초기화
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="text-sm">아직 받은 주문이 없어요</div>
                <div className="text-xs mt-1">우측 상단 [Mock 주문 테스트]로 흐름 검증 가능</div>
              </>
            )}
          </div>
        )}
        {viewMode === 'compact' && (
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            {/* 일괄 선택 액션 바 (선택된 게 있을 때만) */}
            {selectedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: 'rgba(0,212,255,0.10)', borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold" style={{ color: '#4dffff' }}>{selectedOrderIds.size}건 선택</span>
                <button onClick={copySelectedOrders}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                  title="선택한 주문 전체를 고객정보+주문내역 카톡용으로 복사">
                  <Copy className="w-3.5 h-3.5" />전체 복사
                </button>
                <button onClick={openBulkDispatch}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  style={{ background: '#00ff88', color: '#001a1a' }}>
                  <Truck className="w-3.5 h-3.5" />일괄 발송처리
                </button>
                <button onClick={clearSelection}
                  className="px-2 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>해제</button>
              </div>
            )}
            {/* 컴팩트 헤더 (데스크탑만) — 체크박스 컬럼 추가. 헤더 정렬을 각 셀과 일치시킴 */}
            <div className="hidden sm:grid grid-cols-[34px_minmax(0,2fr)_88px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.5fr)] gap-3 px-3 py-2.5 text-xs font-bold opacity-70 border-b uppercase tracking-wide items-center"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-center">
                <input type="checkbox" className="w-4 h-4"
                  checked={filtered.length > 0 && filtered.every((o) => selectedOrderIds.has(o.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedOrderIds(new Set(filtered.map((o) => o.id)));
                    else clearSelection();
                  }}
                  title="전체 선택/해제" />
              </span>
              <span>주문자 · 상품</span>
              <span className="text-center">배송</span>
              <span className="text-center">상태</span>
              <span className="text-right">금액</span>
              <span className="text-center">주문일</span>
              <span className="text-right">액션</span>
            </div>
            {filtered.map((order) => {
              const itemsForOrder = itemsByOrder[order.id] || [];
              const productSummary = itemsForOrder.length === 0 ? '-'
                : itemsForOrder.length === 1 ? itemsForOrder[0].provider_product_name
                : `${itemsForOrder[0].provider_product_name} 외 ${itemsForOrder.length - 1}건`;
              const statusMeta = STATUS_LABEL[order.order_status] || { label: order.order_status || '-', color: '#7e9cb8', bg: 'rgba(126,156,184,0.15)' };
              const isCash = order.delivery_policy_type === '착불' || /cash/i.test(order.delivery_policy_type || '');
              const dm = getDeliveryMethod(order, itemsForOrder);
              const isExpanded = expandedCompactId === order.id;
              const meta = isExpanded ? parseNaverMeta(order, itemsForOrder) : null;
              return (
                <div key={order.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <div
                  className="order-row-premium flex flex-wrap items-center gap-x-2 gap-y-2 sm:grid sm:grid-cols-[34px_minmax(0,2fr)_88px_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.5fr)] sm:gap-3 px-3 py-3 text-sm sm:items-center hover:bg-[var(--accent)]/30 cursor-pointer"
                  onClick={(e) => {
                    if (e.target.closest('button[title]')) return;
                    if (e.target.closest('input[type="checkbox"]')) return;
                    setExpandedCompactId(order.id); // 큰 상세 모달 열기
                  }}
                >
                  <span className="text-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={() => toggleOrderSelect(order.id)}
                      title="선택" />
                  </span>
                  <div className="min-w-[88px] flex-1 sm:min-w-0 sm:flex-none">
                    <div className="font-bold text-[15px] flex items-center gap-1.5">
                      {order.provider === 'naver' && <span className="text-[11px] px-1 rounded" style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }}>N</span>}
                      <span className="truncate">{order.buyer_name || '구매자'}</span>
                      <span className="text-[11px] opacity-40" title="클릭하면 상세 보기">🔍</span>
                    </div>
                    <div className="text-xs opacity-70 truncate mt-0.5">{productSummary}</div>
                  </div>
                  {/* 배송 (수단 배지 + 착불/선불) — 별도 칸, 줄바꿈 제거 */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    {dm && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap"
                        style={{ background: dm.bg, color: dm.color }} title={`배송수단: ${dm.label}`}>
                        {dm.icon} {dm.label}
                      </span>
                    )}
                    {order.delivery_policy_type ? (
                      <span className="px-2.5 py-1 rounded-md text-[13px] font-bold whitespace-nowrap"
                        style={{ background: isCash ? 'rgba(255,170,0,0.15)' : 'rgba(3,199,90,0.12)', color: isCash ? '#e69500' : '#03c75a' }}>
                        {isCash ? '🚚 착불' : '💰 선불'}
                      </span>
                    ) : (!dm && <span className="text-sm opacity-30">-</span>)}
                  </div>
                  {/* 상태 */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <span className="px-2.5 py-1 rounded-md text-[13px] font-bold whitespace-nowrap text-center sm:w-full"
                      style={{ background: statusMeta.bg, color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                    {order.naver_dispatch_succeeded_at ? (
                      <span className="text-[11px] font-bold text-center" style={{ color: '#03c75a' }} title="네이버 발송완료">✓ 발송</span>
                    ) : order.naver_confirm_succeeded_at ? (
                      <span className="text-[11px] font-bold text-center" style={{ color: '#a78bfa' }} title="네이버 발주확인">✓ 발주확인</span>
                    ) : null}
                  </div>
                  {/* 금액 + 네이버 수수료 (착불 표기는 배송 칸으로 이동) */}
                  <div className="text-right whitespace-nowrap flex-shrink-0">
                    <div className="font-bold text-base" style={{ color: 'var(--primary)' }}>{fmtNum(orderPaymentTotal(order, itemsForOrder))}원</div>
                    {(() => {
                      const fees = computeNaverFees(itemsForOrder);
                      if (!fees.hasData || fees.totalFee === 0) return null;
                      return <div className="text-[11px] font-semibold mt-0.5" style={{ color: '#e69500' }} title="네이버 수수료(결제+연동 등)">수수료 -{fmtNum(fees.totalFee)}원</div>;
                    })()}
                  </div>
                  {/* 주문일 (결제일=received_at) */}
                  <div className="text-base font-medium opacity-80 whitespace-nowrap text-center flex-shrink-0">{fmtDate(order.received_at)}</div>
                  {/* 액션 — 텍스트 배지. 모바일은 전체폭 한 줄, 데스크탑은 우측 정렬. 내부주문을 맨 앞에 배치 */}
                  <div className="flex gap-1.5 flex-wrap items-center basis-full w-full justify-start sm:basis-auto sm:w-auto sm:justify-end pt-1.5 sm:pt-0 border-t border-[var(--border)]/40 sm:border-0">
                    {!order.internal_order_id && !isOrderDone(order) && (
                      <button onClick={() => convertToInternalOrder(order)} className="px-3 py-2 sm:px-2.5 sm:py-1 rounded text-xs font-bold whitespace-nowrap inline-flex items-center justify-center min-h-[44px] sm:min-h-0"
                        style={{ background: 'var(--primary)', color: 'white' }} title="내부주문 전환">내부주문</button>
                    )}
                    {PENDING_CONFIRM_STATUSES.has(order.order_status) && !order.naver_confirm_succeeded_at && (
                      <button onClick={() => confirmOrder(order)} className="px-3 py-2 sm:px-2.5 sm:py-1 rounded text-xs font-bold whitespace-nowrap inline-flex items-center justify-center min-h-[44px] sm:min-h-0"
                        style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa' }} title="네이버 발주확인">발주확인</button>
                    )}
                    {!isOrderDone(order) && (
                      <button onClick={() => openDispatch(order)} className="px-3 py-2 sm:px-2.5 sm:py-1 rounded text-xs font-bold whitespace-nowrap inline-flex items-center justify-center min-h-[44px] sm:min-h-0"
                        style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }} title="발송처리">발송</button>
                    )}
                    <button onClick={() => handleCreateShippingLabel(order)} className="px-3 py-2 sm:px-2.5 sm:py-1 rounded text-xs font-bold whitespace-nowrap inline-flex items-center justify-center min-h-[44px] sm:min-h-0"
                      style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }} title="택배 송장">송장</button>
                    {!isOrderDone(order) && (
                      <button onClick={() => cancelOrder(order)} className="px-3 py-2 sm:px-2.5 sm:py-1 rounded text-xs font-bold whitespace-nowrap inline-flex items-center justify-center min-h-[44px] sm:min-h-0"
                        style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d' }} title="주문 취소">취소</button>
                    )}
                  </div>
                </div>
                {/* 상세 모달 — 컴팩트 행 클릭 시 크게 표시 (폰트↑, 깔끔) */}
                {isExpanded && (
                  <div className={`fixed inset-0 z-50 flex justify-center animate-modal-backdrop ${modalFullscreen ? 'items-stretch p-0' : 'items-stretch sm:items-center p-0 sm:p-4'}`}
                    style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setExpandedCompactId(null)}>
                    <div className={`w-full flex flex-col border shadow-2xl animate-modal-up text-base sm:text-[17px] overflow-hidden ${modalFullscreen
                        ? 'max-w-none h-full max-h-none rounded-none'
                        : 'max-w-3xl h-full sm:h-auto max-h-[100dvh] sm:max-h-[94vh] rounded-none sm:rounded-2xl'}`}
                      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                      onClick={(e) => e.stopPropagation()}>
                      {/* 모달 헤더 — 상태 + 전체화면 + 닫기 (이름은 아래 고객정보 카드로 통합) */}
                      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                        {order.provider === 'naver' && <span className="text-sm px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }}>N</span>}
                        <span className="font-bold text-base sm:text-lg flex-1">주문 상세</span>
                        <span className="px-2.5 sm:px-3 py-1 rounded-md text-sm sm:text-base font-bold whitespace-nowrap" style={{ background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
                        <button onClick={() => setModalFullscreen((v) => !v)} className="hidden sm:flex p-2 rounded-lg hover:bg-[var(--accent)]" title={modalFullscreen ? '창 모드' : '전체화면'}>
                          {modalFullscreen ? <Minimize2 className="w-5 h-5 opacity-60" /> : <Maximize2 className="w-5 h-5 opacity-60" />}
                        </button>
                        <button onClick={() => setExpandedCompactId(null)} className="p-2 rounded-lg hover:bg-[var(--accent)]" title="닫기"><X className="w-6 h-6 opacity-60" /></button>
                      </div>
                      {/* 본문 스크롤 */}
                      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                    {/* 👤 고객정보 카드 — 이름·전화·주소·주문번호 한 곳에 모음 + 복사 */}
                    <div className="rounded-xl border p-4 space-y-2.5" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                      <div className="flex items-start gap-2 flex-wrap">
                        <div className="text-2xl font-bold leading-tight flex-1 min-w-0">{order.buyer_name || '구매자'}</div>
                        {dm && (
                          <span className="px-2.5 py-1 rounded-lg text-sm font-bold flex-shrink-0"
                            style={{ background: dm.bg, color: dm.color }} title={`배송수단: ${dm.label}`}>
                            {dm.icon} {dm.label}
                          </span>
                        )}
                        <button
                          onClick={async (e) => { e.stopPropagation(); const ok = await copyToClipboard(buildCustomerCopyText(order)); showToast?.(ok ? '👤 고객정보 복사됨' : '복사 실패', ok ? 'success' : 'error'); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                          title="이름·전화·주소만 복사">
                          <Copy className="w-3.5 h-3.5" /> 고객
                        </button>
                      </div>
                      <div className="flex items-center gap-2.5 text-lg">
                        <span className="opacity-60 flex-shrink-0">📞</span>
                        <a href={`tel:${(order.buyer_phone || '').replace(/[^0-9+]/g, '')}`} className="font-mono font-bold tracking-wide hover:underline" onClick={(e) => e.stopPropagation()}>{order.buyer_phone || '-'}</a>
                      </div>
                      <div className="flex items-start gap-2.5 text-base leading-relaxed">
                        <span className="opacity-60 flex-shrink-0 mt-0.5">📍</span>
                        <span className="break-keep font-medium flex-1">{order.buyer_address || '주소 없음'}</span>
                      </div>
                      {/* 🎁 받는 사람 — 눈에 띄게 강조 (주문자와 다르면 경고색) */}
                      {meta?.receiverName && (
                        <div className="rounded-lg px-3 py-2.5 space-y-1"
                          style={{ background: meta.diffReceiver ? 'rgba(245,158,11,0.14)' : 'rgba(3,199,90,0.10)', border: `1px solid ${meta.diffReceiver ? 'rgba(245,158,11,0.4)' : 'rgba(3,199,90,0.3)'}` }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: meta.diffReceiver ? 'rgba(245,158,11,0.25)' : 'rgba(3,199,90,0.2)', color: meta.diffReceiver ? '#e69500' : '#03c75a' }}>🎁 받는분</span>
                            <span className="text-lg font-bold">{meta.receiverName}</span>
                            {meta.receiverTel && (
                              <a href={`tel:${meta.receiverTel.replace(/[^0-9+]/g, '')}`} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold text-base hover:underline ml-auto">{meta.receiverTel}</a>
                            )}
                          </div>
                          {meta.diffReceiver && (
                            <div className="text-[11px] font-semibold" style={{ color: '#e69500' }}>⚠️ 주문자({order.buyer_name})와 받는분이 다릅니다</div>
                          )}
                          {meta.receiverAddr && (
                            <div className="text-sm break-keep flex items-start gap-1.5"><span className="opacity-60">📍</span><span>{meta.receiverZip ? `(${meta.receiverZip}) ` : ''}{meta.receiverAddr}</span></div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                        <span className="text-xs opacity-50 font-mono">주문번호 {order.provider_order_id}</span>
                        <button
                          onClick={async (e) => { e.stopPropagation(); const ok = await copyToClipboard(buildOrderCopyText(order, itemsForOrder, isCash)); showToast?.(ok ? '📋 주문내역 전체 복사됨 — 카톡에 붙여넣기!' : '복사 실패', ok ? 'success' : 'error'); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0"
                          style={{ background: 'var(--primary)', color: 'white' }}
                          title="고객정보+주문내역 전체를 카톡용으로 복사">
                          <Copy className="w-4 h-4" /> 주문내역 복사
                        </button>
                      </div>
                    </div>
                    {/* 진행 단계 스텝퍼 (배송 현황) */}
                    <div className="-mx-1">
                      <OrderStepper order={order} />
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
                    {/* 네이버 주문 추가정보 (실수령액/주문자·받는분/유입경로 등) */}
                    <NaverOrderMeta order={order} items={itemsForOrder} />
                    {/* 상품 리스트 */}
                    <div className="space-y-1.5">
                      {itemsForOrder.map((it) => {
                        const matched = it.match_status === 'matched';
                        const candidate = it.match_status === 'manual';
                        const lineTotal = Number(it.unit_price || 0) * Number(it.quantity || 0);
                        return (
                          <div key={it.id} className="p-2.5 rounded border text-sm"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                            <div className="font-semibold text-[15px] break-keep mb-0.5">{it.provider_product_name}</div>
                            {it.provider_product_option && (
                              <div className="text-xs opacity-60">옵션: {it.provider_product_option}</div>
                            )}
                            {naverProductUrl(it) && (
                              <a href={naverProductUrl(it)} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded"
                                style={{ background: 'rgba(3,199,90,0.12)', color: '#03c75a', border: '1px solid rgba(3,199,90,0.3)' }}
                                title="네이버 스토어 상품페이지 열기">
                                <ExternalLink className="w-3 h-3" /> 상품페이지
                              </a>
                            )}
                            <div className="flex justify-between items-center mt-1.5">
                              <span className="opacity-80 text-sm">×{it.quantity} · 단가 {fmtNum(it.unit_price)}원</span>
                              <span className="font-bold text-base" style={{ color: 'var(--primary)' }}>{fmtNum(lineTotal)}원</span>
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
                    <div className="flex justify-between items-center pt-2 border-t text-base"
                      style={{ borderColor: 'var(--border)' }}>
                      <span className="opacity-70 flex items-center gap-1.5 flex-wrap">
                        합계
                        <span className="px-2 py-0.5 rounded text-xs font-bold"
                          style={{ background: isCash ? 'rgba(255,170,0,0.15)' : 'rgba(3,199,90,0.12)', color: isCash ? '#e69500' : '#03c75a' }}>
                          {isCash ? '🚚 착불' : '💰 선불'}
                        </span>
                      </span>
                      <span className="font-bold text-xl" style={{ color: 'var(--primary)' }}>{fmtNum(orderPaymentTotal(order, itemsForOrder))}원</span>
                    </div>
                    {/* 💸 네이버 수수료 / 정산예정금액 */}
                    {(() => {
                      const fees = computeNaverFees(itemsForOrder);
                      if (!fees.hasData || (fees.totalFee === 0 && fees.settlement === 0)) return null;
                      return (
                        <div className="rounded-xl border p-3 space-y-1.5 text-sm" style={{ background: 'rgba(255,170,0,0.06)', borderColor: 'rgba(255,170,0,0.25)' }}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5" style={{ color: '#e69500' }}>💸 네이버 수수료</span>
                            <span className="font-bold text-base" style={{ color: '#e69500' }}>
                              -{fmtNum(fees.totalFee)}원 {fees.rate > 0 && <span className="text-xs opacity-70">({fees.rate.toFixed(1)}%)</span>}
                            </span>
                          </div>
                          <div className="space-y-0.5 text-xs opacity-80 pl-0.5">
                            {fees.payment > 0 && <div className="flex justify-between"><span>· 결제수수료</span><span className="font-mono">-{fmtNum(fees.payment)}원</span></div>}
                            {fees.knowledge > 0 && <div className="flex justify-between"><span>· 네이버쇼핑 연동수수료</span><span className="font-mono">-{fmtNum(fees.knowledge)}원</span></div>}
                            {fees.sale > 0 && <div className="flex justify-between"><span>· 판매수수료</span><span className="font-mono">-{fmtNum(fees.sale)}원</span></div>}
                            {fees.channel > 0 && <div className="flex justify-between"><span>· 채널수수료</span><span className="font-mono">-{fmtNum(fees.channel)}원</span></div>}
                          </div>
                          {fees.settlement > 0 && (
                            <div className="flex items-center justify-between pt-1.5 border-t" style={{ borderColor: 'rgba(255,170,0,0.25)' }}>
                              <span className="font-bold" style={{ color: '#00ff88' }}>정산예정금액</span>
                              <span className="font-bold text-base" style={{ color: '#00ff88' }}>{fmtNum(fees.settlement)}원</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                      </div>{/* 본문 스크롤 끝 */}
                      {/* 액션 푸터 */}
                      <div className="flex gap-1.5 flex-wrap px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                        {!order.internal_order_id && !isOrderDone(order) && (
                          <button onClick={() => { setExpandedCompactId(null); convertToInternalOrder(order); }} className="flex-1 min-w-[88px] px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'var(--primary)', color: 'white' }}>내부주문</button>
                        )}
                        {PENDING_CONFIRM_STATUSES.has(order.order_status) && !order.naver_confirm_succeeded_at && (
                          <button onClick={() => { setExpandedCompactId(null); confirmOrder(order); }} className="flex-1 min-w-[88px] px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa' }}>발주확인</button>
                        )}
                        {!isOrderDone(order) && (
                          <button onClick={() => { setExpandedCompactId(null); openDispatch(order); }} className="flex-1 min-w-[88px] px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }}>발송</button>
                        )}
                        <button onClick={() => { setExpandedCompactId(null); handleCreateShippingLabel(order); }} className="flex-1 min-w-[88px] px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>송장</button>
                        {!isOrderDone(order) && (
                          <button onClick={() => { setExpandedCompactId(null); cancelOrder(order); }} className="flex-1 min-w-[88px] px-3 py-2.5 rounded-lg text-sm font-bold" style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d' }}>취소</button>
                        )}
                      </div>
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
          const cardDm = getDeliveryMethod(order, items);
          // 조회기간 밖이지만 미처리라 끌어올려진 주문 → 카드에도 표시 (배너 카운트와 동일 헬퍼)
          const pendingOutOfRange = isPendingOutOfRange(order, dateRange);

          return (
            <div key={order.id} className="order-hover-premium rounded-xl border overflow-hidden shadow-sm"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

              {/* ① 상단 — 상태(크게) + provider + 발주확인/발송완료 마커 + 날짜 */}
              <div className="px-4 py-3 flex items-center gap-2 flex-wrap border-b"
                style={{ background: statusMeta.bg, borderColor: 'var(--border)' }}>
                <span className="px-3 py-1 rounded-md text-sm font-bold tracking-wide flex items-center gap-1.5"
                  style={{ background: 'rgba(0,0,0,0.25)', color: statusMeta.color }}>
                  ● {statusMeta.label}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold"
                  style={{ background: `${providerMeta.color}20`, color: providerMeta.color }}>
                  {providerMeta.label}
                </span>
                {/* 내부주문 전환 마커 — 메인 상태(네이버)와 별개로 "우리 주문서에 등록됨" 표시 */}
                {order.internal_order_id && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(45,212,191,0.18)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,0.4)' }}
                    title="내부 주문서로 등록 완료 (네이버 상태와 별개)">
                    📥 내부주문 등록됨
                  </span>
                )}
                {/* 네이버 측 처리 마커 — DB의 succeeded_at 기준 */}
                {order.naver_confirm_succeeded_at && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(167,139,250,0.18)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                    title={`네이버 발주확인 완료 ${fmtDate(order.naver_confirm_succeeded_at)}`}>
                    ✓ 발주확인
                  </span>
                )}
                {order.naver_dispatch_succeeded_at && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(0,255,136,0.18)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.35)' }}
                    title={`네이버 발송처리 완료 ${fmtDate(order.naver_dispatch_succeeded_at)}`}>
                    ✓ 발송완료
                  </span>
                )}
                {pendingOutOfRange && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5"
                    style={{ background: 'rgba(255,193,7,0.18)', color: '#ffc107', border: '1px solid rgba(255,193,7,0.45)' }}
                    title="조회기간 밖이지만 아직 발주확인·발송 전이라 끌어올려 표시 중">
                    ⏳ 기간 외 미처리
                  </span>
                )}
                <span className="ml-auto text-sm opacity-80 font-mono">
                  {fmtDate(order.received_at)}
                </span>
              </div>

              {/* 진행 단계 스텝퍼 — 결제완료→발주확인→발송→배송중→배송완료 */}
              <OrderStepper order={order} />

              {/* 네이버 발송 실패 사유 — 발송 시도했으나 네이버가 거부한 경우만 (성공 시각 없을 때) */}
              {order.naver_dispatch_error && !order.naver_dispatch_succeeded_at && (
                <div className="px-4 py-2 border-b text-xs font-semibold flex items-start gap-1.5"
                  style={{ background: 'rgba(255,77,109,0.12)', borderColor: 'var(--border)', color: '#ff4d6d' }}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{dispatchErrorHint(order.naver_dispatch_error)}</span>
                </div>
              )}

              {/* ② 구매자 블록 — 큰 글씨 우선 + 복사 */}
              <div className="px-4 py-3 space-y-1">
                <div className="flex items-start gap-2">
                  <div className="text-xl font-bold leading-snug flex-1">
                    {order.buyer_name || '구매자'}
                  </div>
                  <button
                    onClick={async (e) => { e.stopPropagation(); const ok = await copyToClipboard(buildCustomerCopyText(order)); showToast?.(ok ? '👤 고객정보 복사됨' : '복사 실패', ok ? 'success' : 'error'); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold flex-shrink-0"
                    style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                    title="이름·전화·주소만 복사">
                    <Copy className="w-3 h-3" /> 고객
                  </button>
                </div>
                <div className="text-base opacity-90 font-mono font-semibold">
                  {order.buyer_phone || '전화번호 없음'}
                </div>
                <div className="text-sm sm:text-base opacity-80 leading-snug break-keep">
                  📍 {order.buyer_address || '주소 없음'}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5">
                  <span className="text-[11px] opacity-50 font-mono">주문번호 {order.provider_order_id}</span>
                  <button
                    onClick={async (e) => { e.stopPropagation(); const ok = await copyToClipboard(buildOrderCopyText(order, items, isCashOnDelivery)); showToast?.(ok ? '📋 주문내역 전체 복사됨 — 카톡에 붙여넣기!' : '복사 실패', ok ? 'success' : 'error'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--primary)', color: 'white' }}
                    title="고객정보+주문내역 전체를 카톡용으로 복사">
                    <Copy className="w-4 h-4" /> 주문내역 복사
                  </button>
                </div>
              </div>

              {/* ③ 상품/금액 블록 */}
              <div className="px-4 py-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                {/* 네이버 주문 추가정보 (실수령액/주문자·받는분/유입경로 등) */}
                <NaverOrderMeta order={order} items={items} />
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
                        <div className="flex-1 text-[15px] font-semibold leading-snug break-keep">
                          {it.provider_product_name}
                        </div>
                      </div>
                      {it.provider_product_option && (
                        <div className="text-xs opacity-60 ml-6">옵션: {it.provider_product_option}</div>
                      )}
                      {naverProductUrl(it) && (
                        <a href={naverProductUrl(it)} target="_blank" rel="noopener noreferrer"
                          className="ml-6 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: 'rgba(3,199,90,0.12)', color: '#03c75a', border: '1px solid rgba(3,199,90,0.3)' }}
                          title="네이버 스토어 상품페이지 열기">
                          <ExternalLink className="w-3 h-3" /> 상품페이지
                        </a>
                      )}
                      <div className="ml-6 flex items-center justify-between text-sm">
                        <span className="opacity-80">×{it.quantity} · 단가 {fmtNum(it.unit_price)}원</span>
                        <span className="font-bold text-[15px]" style={{ color: 'var(--primary)' }}>
                          {fmtNum(lineTotal)}원
                        </span>
                      </div>
                      <div className="ml-6 flex items-center gap-1.5 text-[11px] flex-wrap">
                        {matched && (
                          <span className="flex items-center gap-1 font-medium" style={{ color: '#00ff88' }}>
                            <Check className="w-3.5 h-3.5" />{it.matched_product_name}
                          </span>
                        )}
                        {candidate && (
                          <>
                            <span className="flex items-center gap-1 font-medium" style={{ color: '#ffaa00' }}>
                              <AlertTriangle className="w-3.5 h-3.5" />후보: {it.matched_product_name}
                            </span>
                            <button onClick={() => confirmMatch(it)} className="px-2.5 py-1 rounded text-[11px] font-semibold"
                              style={{ background: 'rgba(0,255,136,0.2)', color: '#00ff88' }}>확정</button>
                          </>
                        )}
                        {(it.match_status === 'pending' || it.match_status === 'no-candidate') && (
                          <button onClick={() => autoMatchItem(it)} className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1"
                            style={{ background: 'rgba(0,212,255,0.15)', color: '#4dffff' }}>
                            <Search className="w-3.5 h-3.5" />매칭 시도
                          </button>
                        )}
                        {it.match_status === 'no-candidate' && (
                          <span className="text-[11px]" style={{ color: '#ff4d6d' }}>매칭 후보 없음</span>
                        )}
                        {/* 매칭 직접 수정 — 모든 상태에서 [변경] 버튼 */}
                        <button
                          onClick={() => { setEditingItemId(editingItemId === it.id ? null : it.id); setMatchSearch(''); }}
                          className="px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ml-auto"
                          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }}
                        >
                          {editingItemId === it.id ? '닫기' : (matched || candidate ? '변경' : '직접 선택')}
                        </button>
                        {matched && (
                          <button onClick={() => clearMatch(it)} className="px-2.5 py-1 rounded text-[11px] font-semibold"
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

                {/* 배송 정보 (수단 배지 + 착불/선불 + 배송비) */}
                {(cardDm || order.delivery_policy_type || order.delivery_fee_amount > 0) && (
                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--border)' }}>
                    {cardDm && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold"
                        style={{ background: cardDm.bg, color: cardDm.color }} title={`배송수단: ${cardDm.label}`}>
                        {cardDm.icon} {cardDm.label}
                      </span>
                    )}
                    {order.delivery_policy_type && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: isCashOnDelivery ? 'rgba(255,170,0,0.15)' : 'rgba(0,255,136,0.15)',
                          color: isCashOnDelivery ? '#ffaa00' : '#00ff88',
                        }}>
                        {isCashOnDelivery ? '🚚 착불' : '💰 선불'}
                      </span>
                    )}
                    {order.delivery_fee_amount > 0 && (
                      <span className="text-xs opacity-75">배송비 {fmtNum(order.delivery_fee_amount)}원</span>
                    )}
                  </div>
                )}

                {/* 합계 — 크게 강조 */}
                <div className="pt-2 border-t flex items-baseline justify-between" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm opacity-70">합계</span>
                  <span className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>
                    {fmtNum(orderPaymentTotal(order, items))}원
                  </span>
                </div>

                {/* 💸 네이버 수수료 / 정산예정금액 */}
                {(() => {
                  const fees = computeNaverFees(items);
                  if (!fees.hasData || (fees.totalFee === 0 && fees.settlement === 0)) return null;
                  return (
                    <div className="rounded-lg border p-2.5 space-y-1 text-xs" style={{ background: 'rgba(255,170,0,0.06)', borderColor: 'rgba(255,170,0,0.25)' }}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold" style={{ color: '#e69500' }}>💸 네이버 수수료</span>
                        <span className="font-bold text-sm" style={{ color: '#e69500' }}>
                          -{fmtNum(fees.totalFee)}원 {fees.rate > 0 && <span className="opacity-70">({fees.rate.toFixed(1)}%)</span>}
                        </span>
                      </div>
                      <div className="space-y-0.5 opacity-80 pl-0.5">
                        {fees.payment > 0 && <div className="flex justify-between"><span>· 결제수수료</span><span className="font-mono">-{fmtNum(fees.payment)}원</span></div>}
                        {fees.knowledge > 0 && <div className="flex justify-between"><span>· 네이버쇼핑 연동수수료</span><span className="font-mono">-{fmtNum(fees.knowledge)}원</span></div>}
                        {fees.sale > 0 && <div className="flex justify-between"><span>· 판매수수료</span><span className="font-mono">-{fmtNum(fees.sale)}원</span></div>}
                        {fees.channel > 0 && <div className="flex justify-between"><span>· 채널수수료</span><span className="font-mono">-{fmtNum(fees.channel)}원</span></div>}
                      </div>
                      {fees.settlement > 0 && (
                        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'rgba(255,170,0,0.25)' }}>
                          <span className="font-bold" style={{ color: '#00ff88' }}>정산예정금액</span>
                          <span className="font-bold text-sm" style={{ color: '#00ff88' }}>{fmtNum(fees.settlement)}원</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                      <Truck className="w-3 h-3 flex-shrink-0" />
                      <span>{i.delivery_company_name} · </span>
                      {i.tracking_number ? (
                        <a
                          href={trackingUrl(i.delivery_company_name, i.tracking_number)}
                          target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="underline font-semibold inline-flex items-center gap-0.5 hover:opacity-80"
                          title="택배 배송조회 (새 탭)">
                          {i.tracking_number}<Search className="w-3 h-3" />
                        </a>
                      ) : '-'}
                      <span className="opacity-60 ml-1">({fmtDate(i.dispatched_at)})</span>
                      {!i.sent_to_naver && <span className="ml-auto opacity-70 text-[10px]">🧪 Mock</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* ⑤ 액션 버튼 — 모바일 2열, 데스크탑 4열 */}
              <div className="px-3 py-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2"
                style={{ borderColor: 'var(--border)' }}>
                {!order.internal_order_id && !isOrderDone(order) && (
                  <button
                    onClick={() => convertToInternalOrder(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'var(--primary)', color: 'white' }}
                  >
                    <ArrowRight className="w-4 h-4" />내부주문
                  </button>
                )}
                {PENDING_CONFIRM_STATUSES.has(order.order_status) && !order.naver_confirm_succeeded_at && (
                  <button
                    onClick={() => confirmOrder(order)}
                    className="py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' }}
                  >
                    <ClipboardCheck className="w-4 h-4" />발주확인
                  </button>
                )}
                {!isOrderDone(order) && (
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
                {!isOrderDone(order) && (
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

      {/* 네이버 연동 로그 모달 — 발주확인/발송 API 성공·실패·대기 내역 */}
      {showLogModal && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/60 sm:p-4 backdrop-blur-sm" onClick={() => setShowLogModal(false)}>
          <div className="rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: 'min(85vh, 720px)' }} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-lg">📋</span>
              <h3 className="text-base font-bold flex-1">네이버 연동 로그</h3>
              <button onClick={reload} className="p-1.5 rounded hover:bg-[var(--muted)]" title="새로고침">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowLogModal(false)}><X className="w-5 h-5 opacity-60" /></button>
            </div>
            {/* 요약 카운트 */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0 text-xs" style={{ borderColor: 'var(--border)' }}>
              <span className="px-2 py-1 rounded-md font-bold" style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a' }}>✓ 성공 {logCounts.success}</span>
              <span className="px-2 py-1 rounded-md font-bold" style={{ background: 'rgba(255,77,109,0.15)', color: '#ff4d6d' }}>✗ 실패 {logCounts.fail}</span>
              <span className="px-2 py-1 rounded-md font-bold" style={{ background: 'rgba(255,176,32,0.15)', color: '#e6961b' }}>⏳ 대기 {logCounts.pending}</span>
              <span className="ml-auto opacity-50">최근 {integrationLog.length}건</span>
            </div>
            {/* 로그 리스트 */}
            <div className="overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {integrationLog.length === 0 ? (
                <div className="text-center py-12 text-sm opacity-60">아직 연동 내역이 없어요</div>
              ) : integrationLog.map((e, i) => {
                const rc = e.result === 'success' ? { bg: 'rgba(3,199,90,0.12)', color: '#03c75a', icon: '✓', label: '성공' }
                  : e.result === 'fail' ? { bg: 'rgba(255,77,109,0.12)', color: '#ff4d6d', icon: '✗', label: '실패' }
                  : { bg: 'rgba(255,176,32,0.12)', color: '#e6961b', icon: '⏳', label: '대기' };
                return (
                  <div key={`${e.id}-${e.kind}-${i}`} className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--accent)]/30">
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-bold flex-shrink-0 mt-0.5" style={{ background: rc.bg, color: rc.color }}>{rc.icon} {rc.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="px-1.5 py-0.5 rounded text-[11px] font-bold flex-shrink-0" style={{ background: e.kind === '발송' ? 'rgba(3,199,90,0.12)' : 'rgba(167,139,250,0.15)', color: e.kind === '발송' ? '#03c75a' : '#a78bfa' }}>{e.kind}</span>
                        <span className="font-semibold truncate">{e.name}</span>
                        <span className="text-[11px] opacity-50 flex-shrink-0">{fmtDate(e.t)}</span>
                      </div>
                      <div className="text-[11px] opacity-60 font-mono truncate">#{e.poid}{e.tracking ? ` · 📦 ${e.company || ''} ${e.tracking}` : ''}</div>
                      {e.result === 'fail' && e.error && (
                        <div className="text-[11px] mt-0.5 font-medium" style={{ color: '#ff4d6d' }}>⚠ {dispatchErrorHint(e.error)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 푸터 안내 */}
            <div className="px-4 py-2.5 border-t flex-shrink-0 text-[11px] opacity-60 safe-bottom" style={{ borderColor: 'var(--border)' }}>
              매장 PC가 송장 입력 후 <b>최대 60초</b>(발주확인 동시 시 2~3분) 내 네이버에 자동 연동합니다. 상단 위젯에서 sync 가동 상태(LIVE/STALE)를 확인하세요.
            </div>
          </div>
        </div>
      )}

      {/* 발송처리 모달 */}
      {dispatchModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDispatchModalOrder(null)}>
          <div className="rounded-xl w-full max-w-md p-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Truck className="w-5 h-5" style={{ color: '#03c75a' }} />
              <h3 className="text-lg font-bold flex-1">발송 처리 <span className="text-xs font-bold" style={{ color: '#03c75a' }}>· 네이버 연동</span></h3>
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
            <div className="text-[11px] mb-4 p-2 rounded-lg" style={{ background: 'color-mix(in srgb, #03c75a 10%, transparent)', color: '#03c75a' }}>
              🟢 매장 PC가 <b>60초 내 네이버에 발송처리(송장 등록)를 자동 연동</b>합니다. 발주확인이 안 됐으면 발주확인까지 함께 처리돼요.
            </div>
            <div className="flex gap-2">
              <button onClick={submitDispatch} disabled={!dispatchTracking.trim()}
                className="flex-1 py-2.5 rounded-lg font-semibold disabled:opacity-40"
                style={{ background: '#03c75a', color: 'white' }}>
                <Check className="w-4 h-4 inline mr-1" />네이버 발송 등록
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
        const eligible = filtered.filter((o) => selectedOrderIds.has(o.id) && !isOrderDone(o));
        const readyCount = eligible.filter((o) => (bulkTrackingMap[o.id] || '').trim().length > 0).length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setBulkDispatchOpen(false)}>
            <div className="rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <Truck className="w-5 h-5" style={{ color: '#03c75a' }} />
                <h3 className="text-lg font-bold flex-1">일괄 발송 처리 ({eligible.length}건) <span className="text-xs font-bold" style={{ color: '#03c75a' }}>· 네이버 연동</span></h3>
                <button onClick={() => setBulkDispatchOpen(false)}><X className="w-4 h-4 opacity-60" /></button>
              </div>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs opacity-70 mb-1">기본 택배사 — [전체 적용]으로 아래 모든 주문에 일괄 지정 (각 주문 개별 변경도 가능)</div>
                <div className="flex gap-2">
                  <select value={bulkDispatchCompany} onChange={(e) => setBulkDispatchCompany(e.target.value)}
                    className="flex-1 px-3 py-2 rounded border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    {DELIVERY_COMPANIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <button
                    onClick={() => setBulkCompanyMap(() => {
                      const next = {};
                      eligible.forEach((o) => { next[o.id] = bulkDispatchCompany; });
                      return next;
                    })}
                    className="px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap flex-shrink-0"
                    style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a', border: '1px solid rgba(3,199,90,0.3)' }}
                    title="선택한 택배사를 아래 모든 주문에 적용">
                    전체 적용
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {eligible.map((o) => (
                  <div key={o.id} className="p-2.5 rounded border space-y-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{o.buyer_name || '구매자'} · <span className="opacity-60">{fmtNum(o.total_amount)}원</span></div>
                      <div className="text-[11px] opacity-60 truncate">#{o.provider_order_id}</div>
                    </div>
                    <div className="flex gap-2">
                      {/* 주문별 개별 택배사 (네이버처럼) */}
                      <select
                        value={bulkCompanyMap[o.id] || bulkDispatchCompany}
                        onChange={(e) => setBulkCompanyMap((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        className="w-28 flex-shrink-0 px-2 py-2 rounded border text-xs"
                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        title="이 주문의 택배사">
                        {DELIVERY_COMPANIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="송장번호"
                        value={bulkTrackingMap[o.id] || ''}
                        onChange={(e) => setBulkTrackingMap((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        className="flex-1 min-w-0 px-3 py-2 rounded border text-sm"
                        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t flex gap-2 items-center" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs opacity-70 flex-1">
                  🟢 송장번호 입력된 {readyCount}건이 <b>네이버에 자동 발송처리</b>됩니다(60초 내). 발주확인 안 된 건은 자동으로 함께 등록.
                </div>
                <button onClick={submitBulkDispatch} disabled={readyCount === 0}
                  className="px-4 py-2 rounded-lg font-bold disabled:opacity-40"
                  style={{ background: '#03c75a', color: 'white' }}>
                  네이버 {readyCount}건 발송
                </button>
                <button onClick={() => setBulkDispatchOpen(false)}
                  className="px-3 py-2 rounded-lg border"
                  style={{ borderColor: 'var(--border)' }}>취소</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 주문 취소 모달 (C1 fix: window.prompt → 모달 UI) */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => !cancelSubmitting && setCancelModalOrder(null)}>
          <div className="rounded-2xl w-full max-w-md p-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Ban className="w-5 h-5" style={{ color: '#ff4d6d' }} />
              <h3 className="text-lg font-bold flex-1">주문 취소 표시 <span className="text-xs font-normal opacity-60">(화면 전용)</span></h3>
              <button onClick={() => !cancelSubmitting && setCancelModalOrder(null)} disabled={cancelSubmitting}>
                <X className="w-4 h-4 opacity-60" />
              </button>
            </div>
            {/* ⚠️ 실제 네이버 취소가 아님을 명확히 — 판매자센터 안내 */}
            <div className="mb-3 p-2.5 rounded-lg border text-[12px] leading-relaxed" style={{ background: 'rgba(255,170,0,0.1)', borderColor: 'rgba(255,170,0,0.4)' }}>
              <div className="font-bold mb-0.5" style={{ color: '#e69500' }}>⚠️ 네이버 실제 취소가 아닙니다</div>
              이 작업은 <b>내 화면에서만 '취소됨'으로 표시</b>합니다. 네이버 스토어의 실제 주문 취소는 아래 <b>판매자센터</b>에서 직접 처리하세요.
              <a href="https://sell.smartstore.naver.com/" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[11px]"
                style={{ background: 'rgba(3,199,90,0.15)', color: '#03c75a', border: '1px solid rgba(3,199,90,0.35)' }}>
                <ExternalLink className="w-3 h-3" /> 네이버 판매자센터에서 취소하기
              </a>
            </div>
            <div className="text-xs mb-3 p-2 rounded border" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
              <div><span className="opacity-60">구매자:</span> <span className="font-semibold">{cancelModalOrder.buyer_name || '구매자'}</span></div>
              <div><span className="opacity-60">주문번호:</span> #{cancelModalOrder.provider_order_id}</div>
              <div><span className="opacity-60">금액:</span> {fmtNum(cancelModalOrder.total_amount)}원</div>
            </div>
            <div className="mb-3">
              <div className="text-xs opacity-70 mb-1.5">취소 사유 (자주 쓰는 것 선택 또는 직접 입력)</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {CANCEL_PRESETS.map((p) => (
                  <button key={p} onClick={() => setCancelReason(p)}
                    className="text-xs px-2 py-1.5 rounded border transition-colors"
                    style={{
                      background: cancelReason === p ? 'rgba(255,77,109,0.15)' : 'var(--background)',
                      borderColor: cancelReason === p ? '#ff4d6d' : 'var(--border)',
                      color: cancelReason === p ? '#ff4d6d' : 'var(--foreground)',
                      fontWeight: cancelReason === p ? 700 : 400,
                    }}>{p}</button>
                ))}
              </div>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="취소 사유 (200자 이내, 직접 수정 가능)"
                className="w-full px-3 py-2 rounded border text-sm resize-none"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
              <div className="text-[10px] opacity-50 text-right mt-0.5">{cancelReason.length} / 200</div>
            </div>
            <div className="text-[11px] opacity-60 mb-3">
              이 화면 목록에서만 [취소됨]으로 표시됩니다. (네이버 미반영)
            </div>
            <div className="flex gap-2">
              <button onClick={submitCancelOrder} disabled={!cancelReason.trim() || cancelSubmitting}
                className="flex-1 py-2.5 rounded-lg font-bold disabled:opacity-40"
                style={{ background: '#ff4d6d', color: 'white' }}>
                {cancelSubmitting ? '처리 중...' : '화면에 취소 표시'}
              </button>
              <button onClick={() => setCancelModalOrder(null)} disabled={cancelSubmitting}
                className="px-4 py-2.5 rounded-lg border disabled:opacity-40"
                style={{ borderColor: 'var(--border)' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 진행 단계 실시간 현황 바 — 5단계 건수 + 클릭 시 해당 단계만 필터 (네이버 관리자 단계별 모니터링 동등).
// 색은 STATUS_LABEL 단계색과 통일: 결제완료=시안 / 발주확인=노랑 / 발송=파랑 / 배송중=보라 / 배송완료=초록.
const STEP_COLORS = ['#22d3ee', '#facc15', '#3b82f6', '#a78bfa', '#22c55e'];
function StageMonitorBar({ counts, canceled, statusFilter, onSelect, onSelectCancel }) {
  const stageActive = /^s[0-4]$/.test(statusFilter);
  return (
    <div className="rounded-xl border p-3 sm:p-3.5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-2 sm:mb-2.5">
        <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-70">진행 단계 실시간 현황 (클릭=해당 단계만)</div>
        {(stageActive || statusFilter === 'cancel') && (
          <button onClick={() => onSelect(null)}
            className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(0,212,255,0.14)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            전체 보기 ✕
          </button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        {ORDER_STEPS.map((label, i) => {
          const key = `s${i}`;
          const active = statusFilter === key;
          const color = STEP_COLORS[i];
          const val = counts[i] || 0;
          const on = val > 0;
          return (
            <button key={label} onClick={() => onSelect(active ? null : key)}
              title={`${label} ${val}건만 보기`}
              className="rounded-lg px-1 py-2 flex flex-col items-center justify-between transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              style={{
                minHeight: 64,
                background: active ? `color-mix(in srgb, ${color} 16%, var(--background))` : 'var(--background)',
                border: active ? `2px solid ${color}` : '1px solid var(--border)',
                boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)` : undefined,
              }}>
              <span className="text-[10px] sm:text-xs font-semibold leading-tight text-center whitespace-nowrap"
                style={{ color: on ? color : 'var(--muted-foreground)' }}>{label}</span>
              <span className="text-2xl sm:text-3xl font-extrabold leading-none mt-1"
                style={{ color: on ? color : 'var(--foreground)', opacity: on ? 1 : 0.35 }}>{val}</span>
            </button>
          );
        })}
      </div>
      {canceled > 0 && (
        <button onClick={onSelectCancel}
          className="mt-2 w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: statusFilter === 'cancel' ? 'rgba(255,77,109,0.18)' : 'rgba(255,77,109,0.08)', color: '#ff4d6d', border: statusFilter === 'cancel' ? '2px solid #ff4d6d' : '1px solid rgba(255,77,109,0.3)' }}>
          <Ban className="w-3.5 h-3.5" /> 취소·반품 {canceled}건 {statusFilter === 'cancel' ? '— 보는 중' : '(클릭=따로 보기)'}
        </button>
      )}
    </div>
  );
}

// 네이버 raw_payload 추가정보 파싱 — 실수령액(수수료)/주문자·받는사람/주소/유입경로/결제/할인.
// 항목별(productOrder) 값은 합산·첫값, 주문(order) 레벨은 공통. 단건 폴백(order.raw_payload.productOrder)도 처리.
function parseNaverMeta(order, items = []) {
  const ord = order?.raw_payload?.order
    || items.find((i) => i?.raw_payload?.order)?.raw_payload?.order
    || {};
  // 수수료는 결제수수료만이 아니라 전체(결제+매출연동+판매+채널)를 합산해야 실수령액이 정확.
  // 정산예정금액(expectedSettlementAmount)이 있으면 그게 네이버 공식 실수령액 → 우선 사용.
  let commission = 0, prodDiscount = 0, settlement = 0, hasSettlement = false;
  let shipAddr = null, inflow = null, sellerCode = null;
  const feeOf = (po) => Number(po.paymentCommission || 0) + Number(po.saleCommission || 0)
    + Number(po.channelCommission || 0) + Number(po.knowledgeShoppingSellingInterlockCommission || 0);
  for (const it of items) {
    const po = it?.raw_payload?.productOrder;
    if (!po) continue;
    commission += feeOf(po);
    if (po.expectedSettlementAmount != null) { settlement += Number(po.expectedSettlementAmount || 0); hasSettlement = true; }
    prodDiscount += Number(po.productDiscountAmount || 0);
    if (!shipAddr && po.shippingAddress) shipAddr = po.shippingAddress;
    if (!inflow && po.inflowPath && po.inflowPath !== 'null') inflow = po.inflowPath;
    if (!sellerCode && po.sellerProductCode) sellerCode = po.sellerProductCode;
  }
  const po0 = order?.raw_payload?.productOrder;
  if (po0) {
    if (!commission) commission = feeOf(po0);
    if (!hasSettlement && po0.expectedSettlementAmount != null) { settlement = Number(po0.expectedSettlementAmount || 0); hasSettlement = true; }
    if (!prodDiscount) prodDiscount = Number(po0.productDiscountAmount || 0);
    if (!shipAddr) shipAddr = po0.shippingAddress;
    if (!inflow && po0.inflowPath && po0.inflowPath !== 'null') inflow = po0.inflowPath;
    if (!sellerCode) sellerCode = po0.sellerProductCode;
  }
  const total = Number(order?.total_amount || 0);
  const ordererName = ord.ordererName || null;
  const receiverName = shipAddr?.name || null;
  // 실수령액 = 네이버 정산예정금액(공식) 우선, 없으면 주문금액 − 전체수수료
  const netAmount = hasSettlement ? settlement : (commission > 0 ? total - commission : null);
  return {
    commission,
    netAmount,
    ordererName, receiverName,
    diffReceiver: !!(ordererName && receiverName && ordererName !== receiverName),
    receiverTel: shipAddr?.tel1 || null,
    receiverZip: shipAddr?.zipCode || null,
    receiverAddr: shipAddr ? [shipAddr.baseAddress, shipAddr.detailedAddress].filter(Boolean).join(' ') : null,
    inflow, sellerCode,
    paymentMeans: ord.paymentMeans || null,
    device: ord.payLocationType || null,
    discountTotal: Number(ord.orderDiscountAmount || 0) + prodDiscount + Number(ord.naverMileagePaymentAmount || 0),
  };
}

// 네이버 주문 추가정보 블록 (펼침/카드 공용) — 네이버 초록 톤, 실수령액 강조 카드 + 아이콘 행
function NaverOrderMeta({ order, items }) {
  const m = parseNaverMeta(order, items);
  if (m.netAmount == null && !m.ordererName && !m.inflow && !m.receiverName) return null;
  const Row = ({ icon, label, children }) => (
    <div className="flex items-start justify-between gap-2 py-1 border-t" style={{ borderColor: 'var(--border)' }}>
      <span className="opacity-60 flex-shrink-0 flex items-center gap-1.5"><span className="text-[13px] leading-none">{icon}</span>{label}</span>
      <span className="text-right break-keep font-medium">{children}</span>
    </div>
  );
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(3,199,90,0.3)' }}>
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
        style={{ background: 'rgba(3,199,90,0.1)', color: '#03c75a' }}>
        🛍️ 네이버 주문 상세
      </div>
      <div className="p-2.5 text-xs" style={{ background: 'var(--card)' }}>
        {/* 실수령액 강조 */}
        {m.netAmount != null && (
          <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-2"
            style={{ background: 'rgba(3,199,90,0.1)', border: '1px solid rgba(3,199,90,0.25)' }}>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-semibold opacity-80">실수령액</span>
              <span className="text-[10px] opacity-50">네이버 수수료 -{fmtNum(m.commission)}원</span>
            </div>
            <span className="text-lg font-extrabold whitespace-nowrap" style={{ color: '#03c75a' }}>{fmtNum(m.netAmount)}원</span>
          </div>
        )}
        {/* 주문자 ≠ 받는분 경고 */}
        {m.diffReceiver && (
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-2 text-[11px] leading-snug break-keep"
            style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.3)', color: 'var(--foreground)' }}>
            <span className="flex-shrink-0">👤</span>
            <span><b>{m.ordererName}</b> 주문 → <b>{m.receiverName}</b> 받음 <span className="opacity-50">(주문자≠받는분)</span></span>
          </div>
        )}
        <div>
          {m.receiverAddr && <Row icon="📍" label="받는주소">{m.receiverZip ? `(${m.receiverZip}) ` : ''}{m.receiverAddr}</Row>}
          {m.receiverTel && <Row icon="📞" label="받는분">{m.receiverTel}</Row>}
          {m.inflow && <Row icon="🔍" label="유입">{m.inflow}</Row>}
          {(m.paymentMeans || m.device) && <Row icon="💳" label="결제">{[m.paymentMeans, m.device === 'MOBILE' ? '모바일' : m.device === 'PC' ? 'PC' : null].filter(Boolean).join(' · ')}</Row>}
          {m.discountTotal > 0 && <Row icon="🏷️" label="할인">-{fmtNum(m.discountTotal)}원</Row>}
          {m.sellerCode && <Row icon="🔖" label="판매코드">{m.sellerCode}</Row>}
        </div>
      </div>
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
      {/* 아이콘+라벨은 상단 고정, 숫자는 mt-auto로 칸 하단에 정렬 → 라벨 줄수가 달라도 6칸 숫자가 한 줄로 맞음 */}
      <div className="text-xl sm:text-2xl leading-none mb-1">{icon}</div>
      <div className="text-[11px] sm:text-xs opacity-80 leading-tight font-medium min-h-[2.2em] flex items-center justify-center">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-auto pt-1 leading-none"
        style={{ color: isActive ? (accent || (alert ? '#ff4d6d' : 'var(--foreground)')) : 'var(--foreground)', opacity: isActive ? 1 : 0.4 }}>
        {value}
      </div>
    </Tag>
  );
}
