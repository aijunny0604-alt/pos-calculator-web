// Gemini Function Calling 도구 정의
// 9개 분석 도구의 JSON 스키마 (Gemini용) + 실행 라우터
//
// Gemini API의 Function Declaration 형식:
//   { name, description, parameters: { type, properties, required } }
//
// 실행 라우터(executeTool)는 도구 이름 + 인자를 받아 lib/analytics 함수 호출 후 결과 반환

import { getTopCustomers, getCustomerTrend, getCustomerSegments, getDormantCustomers } from './analytics/customers';
import { getTopProducts, getProductTrend, getRepeatPurchaseGap } from './analytics/products';
import { getCustomerProductAffinity } from './analytics/affinity';
import { getCompositeSummary } from './analytics/summary';
import { getLowStockProducts, getStockSummary, getProductsByStockStatus, getRestockRecommendations } from './analytics/inventory';
import { getPaymentSummary, getOverdueCustomers, getPaymentInflow } from './analytics/payments';
import { getReturnAnalysis } from './analytics/returns';
import { getPendingCarts } from './analytics/carts';
import { getLearningStats } from './analytics/learning';
import { findProductSmart, findProductCandidates } from './productMatch';
import { matchCustomer } from './fuzzyMatch';
import {
  getCollectionPlan,
  getStockCoverageForecast,
  getNextBestOffers,
  getProductBundleSuggestions,
  getMarginLeakage,
} from './analytics/advanced';
import {
  simulatePriceChange,
  simulateRestock,
  getRevenueVolatility,
  getCustomerLifetimeValue,
} from './analytics/simulation';
import { detectAnomalies } from './analytics/anomalyDetector';
import { isOrderTerminal } from './orderStatus';

// 공통 enum
const PERIOD_ENUM = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

// ===== 스마트스토어(네이버) 주문 분석 — SmartStoreOrders 페이지의 stage 로직과 동일 =====
const SS_STAGE_LABELS = ['결제완료', '발주확인', '발송', '배송중', '배송완료'];
function ssStage(o) {
  const st = o?.order_status;
  if (['cancelled', 'CANCELED', 'CANCELED_BY_NOPAYMENT', 'CANCEL_REQUEST', 'RETURNED', 'EXCHANGED'].includes(st)) {
    return { stage: -1, canceled: true };
  }
  if (['DELIVERED', 'DELIVERED_COMPLETED', 'PURCHASE_DECIDED'].includes(st)) return { stage: 4, canceled: false };
  if (st === 'DELIVERING') return { stage: 3, canceled: false };
  if (o?.naver_dispatch_succeeded_at || st === 'shipped' || st === 'DISPATCHED') return { stage: 2, canceled: false };
  if (o?.naver_confirm_succeeded_at || st === 'confirmed' || st === 'converted') return { stage: 1, canceled: false };
  return { stage: 0, canceled: false };
}
// 처리 대기 = 발주확인·발송 전 + 내부전환/입금대기 제외 (메뉴 배지·페이지와 동일 정책)
function ssIsPending(o) {
  const { stage, canceled } = ssStage(o);
  if (canceled || o?.internal_order_id) return false;
  if (['PAYMENT_WAITING', 'PAY_WAITING'].includes(o?.order_status)) return false;
  return stage < 2;
}
const ssDueDate = (o) => o?.dispatch_due_date || o?.raw_payload?.productOrder?.dispatchDueDate || o?.raw_payload?.dispatchDueDate || null;

function getSmartstoreOrders(externalOrders, args = {}) {
  const list = Array.isArray(externalOrders) ? externalOrders : [];
  const filter = args?.filter || 'pending';
  const limit = Math.max(1, Number(args?.limit || 20));
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);

  // 상태별 카운트 (스텝퍼 5단계 + 취소)
  const counts = { 결제완료: 0, 발주확인: 0, 발송: 0, 배송중: 0, 배송완료: 0, 취소: 0 };
  list.forEach((o) => {
    const { stage, canceled } = ssStage(o);
    if (canceled) counts['취소']++;
    else counts[SS_STAGE_LABELS[stage]]++;
  });

  const pendingOrders = list.filter(ssIsPending);
  const active = list.filter((o) => { const { canceled } = ssStage(o); return !canceled && !isOrderTerminal(o); });

  // 발송기한 (발송 전 주문만 대상)
  let dispatchOverdue = 0, dispatchDueToday = 0;
  active.forEach((o) => {
    const d = ssDueDate(o); if (!d || ssStage(o).stage >= 2) return;
    const t = new Date(d).getTime();
    if (t < now) dispatchOverdue++;
    else if (t >= todayStart.getTime() && t < tomorrowStart.getTime()) dispatchDueToday++;
  });

  const summarize = (o) => {
    const { stage, canceled } = ssStage(o);
    return {
      buyer: o?.buyer_name || '구매자',
      amount: Number(o?.total_amount || 0),
      status: canceled ? '취소/반품' : SS_STAGE_LABELS[stage],
      orderedAt: o?.received_at ? String(o.received_at).slice(0, 10) : null,
      dispatchDue: ssDueDate(o) ? String(ssDueDate(o)).slice(0, 10) : null,
      naverConfirmed: !!o?.naver_confirm_succeeded_at,
      naverDispatched: !!o?.naver_dispatch_succeeded_at,
      internalRegistered: !!o?.internal_order_id,
      dispatchError: !!o?.naver_dispatch_error && !o?.naver_dispatch_succeeded_at,
      cashOnDelivery: o?.delivery_policy_type === '착불',
      orderNo: o?.provider_order_id || null,
    };
  };

  let items;
  if (filter === 'dispatch_due') {
    items = active.filter((o) => ssDueDate(o) && ssStage(o).stage < 2)
      .sort((a, b) => new Date(ssDueDate(a)) - new Date(ssDueDate(b)));
  } else if (filter === 'today') {
    items = list.filter((o) => o?.received_at && new Date(o.received_at) >= todayStart && new Date(o.received_at) < tomorrowStart);
  } else if (filter === 'all') {
    items = active;
  } else {
    items = pendingOrders; // 기본 pending
  }

  return {
    total: list.length,
    counts,
    pendingCount: pendingOrders.length,
    dispatchOverdue,
    dispatchDueToday,
    filter,
    listed: items.length,
    items: items.slice(0, limit).map(summarize),
    message: list.length === 0
      ? '스마트스토어 주문 데이터가 없습니다 (매장 PC 동기화 확인 필요).'
      : `스토어 전체 ${list.length}건 · 처리대기(발주확인·발송 전) ${pendingOrders.length}건 · 발송기한 초과 ${dispatchOverdue}건 · 오늘 발송마감 ${dispatchDueToday}건.`,
  };
}

// Gemini Function Declaration 배열
export const GEMINI_TOOLS = [
  {
    name: 'getTopCustomers',
    description: '기간 내 매출/주문수/수량 기준 TOP N 거래처 조회. 이전 동일 기간 대비 변화율 포함. "이번 달 매출 1위", "VIP 누구야" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: '조회 기간. 기본 1M(최근 1개월)' },
        sortBy: { type: 'string', enum: ['revenue', 'count', 'qty'], description: '정렬 기준. revenue=매출, count=주문수, qty=수량' },
        limit: { type: 'integer', description: 'TOP N. 기본 10. 최대 50' },
      },
      required: ['period'],
    },
  },
  {
    name: 'getCustomerTrend',
    description: '특정 거래처의 월별 매출/주문 추이. 거래처 이름 또는 ID 지정. "WP튠 김해 어떻게 되고 있어", "강남오토 트렌드" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처 이름 (정확히 일치)' },
        customerId: { type: 'string', description: '거래처 ID (이름 모를 때)' },
        months: { type: 'integer', description: '과거 몇 개월. 기본 6' },
      },
    },
  },
  {
    name: 'getCustomerSegments',
    description: '전체 거래처를 RFM 분석으로 5세그먼트 분류 (Champion/Loyal/At-Risk/New/Lost/Regular). "VIP 세그먼트", "단골 분석", "고객 분류" 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: 'F/M 점수 산출 기준 기간. 기본 3M' },
        minOrders: { type: 'integer', description: '포함할 최소 주문 건수. 기본 1' },
        limit: { type: 'integer', description: '각 세그먼트당 표시 인원. 기본 20' },
      },
    },
  },
  {
    name: 'getDormantCustomers',
    description: '평소 자주 사던 거래처가 N일 이상 안 산 경우 추출. "휴면 거래처", "안 산 지 오래된 곳", "이탈 위험" 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        daysThreshold: { type: 'integer', description: '최소 미주문 일수. 기본 60' },
        minPastOrders: { type: 'integer', description: '과거 최소 주문 건수 (단골 기준). 기본 3' },
        limit: { type: 'integer', description: '최대 표시 개수. 기본 20' },
      },
    },
  },
  {
    name: 'getTopProducts',
    description: '기간 내 제품 또는 카테고리 TOP N. "인기 제품", "잘 팔리는 부품", "카테고리별 매출" 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: '조회 기간. 기본 1M' },
        sortBy: { type: 'string', enum: ['revenue', 'qty'], description: 'revenue=매출 / qty=수량' },
        limit: { type: 'integer', description: 'TOP N. 기본 10' },
        byCategory: { type: 'boolean', description: 'true=카테고리 단위 묶음, false=개별 제품. 기본 false' },
      },
      required: ['period'],
    },
  },
  {
    name: 'getProductTrend',
    description: '특정 제품의 월별 판매 추이. "다운파이프 추이", "이 제품 잘 팔려?" 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름 (정확히)' },
        productId: { type: 'integer', description: '제품 ID' },
        months: { type: 'integer', description: '과거 몇 개월. 기본 6' },
      },
    },
  },
  {
    name: 'getRepeatPurchaseGap',
    description: '제품 또는 거래처의 재주문 평균 주기(일). "이 제품 얼마나 자주 사", "재주문 주기" 질문에 사용. productId 또는 customerName 중 하나 필수.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'integer', description: '제품 ID (제품 모드)' },
        customerName: { type: 'string', description: '거래처 이름 (거래처 모드)' },
        customerId: { type: 'string', description: '거래처 ID (거래처 모드)' },
      },
    },
  },
  {
    name: 'getCustomerProductAffinity',
    description: '특정 거래처가 자주 사는 제품 + 카테고리. "강남오토는 뭐 자주 사", "이 업체에 뭐 추천하지" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처 이름' },
        customerId: { type: 'string', description: '거래처 ID' },
        limit: { type: 'integer', description: 'TOP N. 기본 10' },
      },
    },
  },
  {
    name: 'getCompositeSummary',
    description: '기간 전체 KPI 묶음 (매출/공급가/부가세/주문수/AOV/활성 거래처/신규 거래처/반품률/부가항목 사용률) + 이전 기간 대비 변화율. "이번 달 요약", "전체 KPI", "한눈에 보여줘" 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: '조회 기간. 기본 1M' },
      },
      required: ['period'],
    },
  },
  // ===== 단일 거래처 조회 =====
  {
    name: 'getCustomerInfo',
    description: '단일 거래처의 상세 정보 조회 (총 거래액, 주문 횟수, 최근 주문일, 미수금, 평균 주문가, 자주 사는 제품 TOP3). customerName 부분 매칭. "강남오토 정보", "X 매출 얼마?", "Y 최근 언제 왔어?" 같은 특정 거래처 1곳 조회에 사용.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '조회할 거래처명 (부분 매칭 OK)' },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'searchProducts',
    description: '키워드로 여러 제품 검색 (제품명/카테고리 토큰 단위 부분 일치 + 관련도 순 정렬). "머플러팁 제품들", "스덴 밴딩 종류", "HKS 흡기필터 관련/연관 상품", "X 옵션이든 제품이든 다 찾아줘" 같은 복수·연관 검색에 반드시 이 도구 사용. "HKS 흡기필터"처럼 여러 단어로 물어도 각 키워드가 들어간 관련 상품을 모두 찾아 관련도 높은 순으로 반환(allTokenMatchCount=모든 키워드 다 포함된 정확 매칭 수). 옵션은 제품명에 포함돼 함께 검색됨. 각 제품 name/category/stock/wholesale/retail 반환.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '제품명/카테고리 키워드. 브랜드+품목을 공백으로 묶어 넓게 검색 가능 (예: "HKS 흡기", "흡기필터", "BMW 머플러")' },
        limit: { type: 'integer', description: '최대 N개 (기본 30). 관련 상품 전체를 보려면 50~100 권장' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'searchNaverCatalog',
    description: '네이버 스토어(엠파츠)에 실제 등록된 상품·옵션 전체에서 검색. ⚠️ 우리 POS DB(searchProducts)와 다른 별도 소스 — "네이버/스토어/엠파츠에 올라간/등록된 상품", "스토어에 HKS 흡기필터 있어?", "엠파츠 옵션 뭐 있어" 같이 네이버 카탈로그를 물으면 이 도구 사용. 토큰 단위 검색 + 옵션명까지 검색 대상 포함 + 관련도 순 반환. 각 상품 name/status(판매중·품절)/salePrice/options(옵션조합)/optionCount/url 반환. inStockOnly=true면 판매중만.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '상품/옵션 키워드. 브랜드+품목 공백 묶음 가능 (예: "HKS 흡기", "오픈흡기 필터")' },
        limit: { type: 'integer', description: '최대 N개 (기본 40). 관련 상품 전체는 80~100 권장' },
        inStockOnly: { type: 'boolean', description: 'true면 판매중 상품만' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'searchCustomers',
    description: '키워드로 여러 거래처 검색 (거래처명/전화번호/주소 부분 일치). "강남 쪽 거래처들", "오토 들어가는 곳", "X 시 거래처" 같은 복수 검색에 사용. 각 거래처의 name/phone/address/totalRevenue 반환.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '거래처명/전화/주소 키워드 (부분 일치)' },
        limit: { type: 'integer', description: '최대 N개 (기본 30)' },
      },
      required: ['keyword'],
    },
  },
  // ===== 재고 분석 도구 =====
  {
    name: 'getProductInfo',
    description: '단일 제품의 상세 정보(재고, 가격, 카테고리, 최근 판매량) 조회. productName 5단계 fuzzy 매칭 (정확/부분/토큰). "스덴 밴딩 54-30 재고 알려줘", "X 얼마", "Y 정보", "Z 재고 있어?" 등 특정 제품 1개 조회에 반드시 이 도구 사용. 매칭 실패 시 후보 제품 목록 반환.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '조회할 제품명 (정확하지 않아도 OK, fuzzy 매칭)' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'getLowStockProducts',
    description: '재고 부족 제품 조회 (threshold 이하 또는 품절). 최근 판매량 함께 표시. "재고 부족", "재고 적은 것", "곧 떨어질 거", "재고 부족한 애들" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', description: '재고 임계값 (기본 5). 이 값 이하만 반환' },
        limit: { type: 'integer', description: 'TOP N (기본 30)' },
        includeOutOfStock: { type: 'boolean', description: '품절 포함 여부 (기본 true)' },
      },
    },
  },
  {
    name: 'getStockSummary',
    description: '전체 재고 현황 요약 (총 제품수, 정상/부족/품절/입고대기 카운트, 카테고리별, 총 재고 가치). "재고 현황", "전체 재고 어때", "재고 요약" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        lowThreshold: { type: 'integer', description: '부족 기준 (기본 5)' },
      },
    },
  },
  {
    name: 'getProductsByStockStatus',
    description: '재고 상태별 제품 조회. status=incoming(입고대기), out(품절), normal(정상). "입고대기 제품", "품절 목록" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['incoming', 'out', 'normal'], description: '재고 상태' },
        limit: { type: 'integer', description: 'TOP N (기본 50)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'getRestockRecommendations',
    description: '재주문 추천 — 재고 부족 + 최근 판매 활발한 제품의 시급도 분석. 우선순위 점수 + 추천 수량 포함. "재주문 해야할 제품", "뭐 들여놔야 해", "발주 추천", "재주문 리스트" 같은 질문에 가장 적합.',
    parameters: {
      type: 'object',
      properties: {
        stockThreshold: { type: 'integer', description: '재고 임계 (기본 5)' },
        salesPeriod: { type: 'string', enum: PERIOD_ENUM, description: '판매량 기준 기간 (기본 1M)' },
        limit: { type: 'integer', description: 'TOP N (기본 20)' },
      },
    },
  },
  // ===== 🎯 고급 분석 도구 (Codex 제안 5종) =====
  {
    name: 'getCollectionPlan',
    description: '미수 회수 액션 플래너. 거래처별 미수금+경과일+최근 거래 기반 회수 우선순위 + 톤별 연락 문구 자동 생성. "미수 누구부터 회수해야 해?", "회수 계획 짜줘", "연락할 거래처 우선순위" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'TOP N (기본 15)' } },
    },
  },
  {
    name: 'getStockCoverageForecast',
    description: '품절 예상일 + 재고 커버리지 예측. 최근 N일 평균 일일 판매량 기반으로 며칠 뒤 품절될지 예측. "곧 떨어질 제품", "품절 임박", "발주 타이밍", "X일 이내 품절 예상" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        periodDays: { type: 'integer', description: '판매량 기준 기간 (기본 30일)' },
        maxDaysLeft: { type: 'integer', description: '며칠 이내 품절 예상까지 보여줄지 (기본 14일)' },
      },
    },
  },
  {
    name: 'getNextBestOffers',
    description: '특정 거래처에게 권할 만한 다음 제품 추천. 과거 구매 패턴 + 재주문 주기 + 현재 재고 기반. "강남오토에 뭐 권할까?", "X 거래처 다음 주문 추천", "이 거래처 자주 사는 거 권유 리스트" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: { customerName: { type: 'string', description: '거래처명' } },
      required: ['customerName'],
    },
  },
  {
    name: 'getProductBundleSuggestions',
    description: '특정 제품과 함께 자주 팔린 부품 추천 (묶음 판매). 동시 구매 패턴 분석. "다운파이프 사면 같이 뭐 팔리지?", "X 제품 묶음 추천", "이 제품 같이 권할 거" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: { productName: { type: 'string', description: '기준 제품명' } },
      required: ['productName'],
    },
  },
  {
    name: 'getMarginLeakage',
    description: '마진 누수 점검. 도매가 이하 판매 또는 마진율 낮은 제품 자동 탐지. "마진 적은 제품", "손해 본 제품", "수익성 안 좋은 거", "가격 수정 필요한 제품" 같은 질문에 사용. 가격 인상 후보 식별에 핵심.',
    parameters: {
      type: 'object',
      properties: {
        periodDays: { type: 'integer', description: '분석 기간 (기본 30일)' },
        minMarginRate: { type: 'number', description: '최소 마진율 (기본 0.10 = 10%, 이 미만이 누수)' },
      },
    },
  },
  // ===== 🔮 시뮬레이션 + 변수 분석 (4종) =====
  {
    name: 'simulatePriceChange',
    description: '특정 제품 가격 변동 시 매출/마진/판매량 시뮬레이션. "X 가격 10% 올리면?", "Y 가격 인상 시뮬", "가격 시나리오" 같은 질문에 사용. 가격 탄력성 기반 예측 + 비추천/추천 판정.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품명 (정확)' },
        changePct: { type: 'number', description: '가격 변동율 % (예: 10 = 10% 인상, -5 = 5% 인하)' },
        elasticity: { type: 'number', description: '가격 탄력성 (기본 -1.0, 1% 가격↑ → 1% 판매↓)' },
        periodDays: { type: 'integer', description: '기준 판매 기간 (기본 30일)' },
      },
      required: ['productName', 'changePct'],
    },
  },
  {
    name: 'simulateRestock',
    description: '특정 제품 발주 시뮬레이션. "X 50개 발주하면?", "Y 100개 들여놓으면 며칠 가?", "발주 시나리오" 같은 질문에 사용. 며칠치 재고 + 비용 + 예상 매출/마진/ROI + 적정성 판정.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품명' },
        restockQty: { type: 'integer', description: '발주 수량' },
        periodDays: { type: 'integer', description: '판매량 기준 기간 (기본 30일)' },
      },
      required: ['productName', 'restockQty'],
    },
  },
  {
    name: 'getRevenueVolatility',
    description: '매출 변동성 + 트렌드 + 이상치 분석. "매출 변동성", "매출 안정성", "매출 이상치", "튀는 날 알려줘" 같은 질문에 사용. 표준편차 + 변동계수 + 선형 회귀 트렌드 + ±2σ 이상치.',
    parameters: {
      type: 'object',
      properties: { periodDays: { type: 'integer', description: '분석 기간 (기본 30일)' } },
    },
  },
  {
    name: 'getCustomerLifetimeValue',
    description: '거래처 LTV (Lifetime Value) 추정. "거래처 가치 분석", "LTV", "VIP 가치 순위" 같은 질문에 사용. 누적 매출 + 평균 주문가 + 거래 기간 + 미래 12개월 예상 가치.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'TOP N (기본 20)' } },
    },
  },
  // ===== 결제/미수 분석 =====
  {
    name: 'getPaymentSummary',
    description: '전체 결제 현황 요약 (완납/부분/미수 카운트 + 총 미수금 + 입금률). "결제 현황", "미수 얼마", "전체 결제 어때" 같은 질문에 사용.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getOverdueCustomers',
    description: '미수 거래처 (미수금 큰 순). "미수 누구", "받을 돈 많은 곳", "외상 거래처", "N일 이상 미수" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        minDays: { type: 'integer', description: '최소 경과 일수 (기본 0)' },
        minBalance: { type: 'integer', description: '최소 미수금 (기본 0원)' },
        limit: { type: 'integer', description: 'TOP N (기본 30)' },
      },
    },
  },
  {
    name: 'getPaymentInflow',
    description: '입금 이력 분석 (기간 내 총 입금액 + 방법별 + 최근 N건). "이번 달 입금", "현금 입금 얼마", "입금 이력" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: '기간 (기본 1M)' },
        limit: { type: 'integer', description: '최근 입금 N건 (기본 50)' },
      },
    },
  },
  // ===== 반품 분석 =====
  {
    name: 'getReturnAnalysis',
    description: '반품 통계 (기간 내 반품률, 자주 반품되는 제품/거래처). "반품 얼마", "반품률", "반품 자주 나는 제품" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: '기간 (기본 3M)' },
      },
    },
  },
  // ===== 저장된 장바구니 =====
  {
    name: 'getPendingCarts',
    description: '매장 내부에서 임시 저장한 "저장된 장바구니"만 조회 (네이버 스마트스토어와 무관!). 출고예정일 임박/지연 표시. "저장 장바구니", "저장한 카트", "출고 예정 카트" 같은 내부 임시저장 질문에만 사용. ⚠️ "스토어/스마트스토어/네이버" 주문은 getSmartstoreOrders 사용.',
    parameters: {
      type: 'object',
      properties: {
        onlyUpcoming: { type: 'boolean', description: '오늘 이후 출고예정만 (기본 false)' },
        limit: { type: 'integer', description: 'TOP N (기본 50)' },
      },
    },
  },
  // ===== AI 학습 데이터 =====
  {
    name: 'getLearningStats',
    description: 'AI 주문 인식 학습 데이터 통계. 자주 교정되는 제품/사유. "AI 학습", "교정 사례", "AI 잘 인식하나" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'TOP N (기본 20)' } },
    },
  },
  // ===== 🤖 자율 이상 탐지 =====
  {
    name: 'detectAnomalies',
    description: '매장 전체 이상 징후 자동 탐지. 매출 급감/급증, 미수금 임계 초과, 품절 인기 제품, 휴면 위험 거래처, 반품률 급증, 대량 출고 등 6가지 신호 자동 감지. "매장 상태 어때?", "이상 없어?", "주목할 거 알려줘", "경고 알려줘", "문제 있어?" 같은 질문에 사용.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  // ===== 🛒 스마트스토어(네이버) 주문 =====
  {
    name: 'getSmartstoreOrders',
    description: '⭐ 네이버 스마트스토어/스토어 주문 전용 도구. 질문에 "스토어/스마트스토어/네이버/발주확인/발송/송장/배송" 중 하나라도 있으면 무조건 이 도구를 사용(저장 장바구니 getPendingCarts와 혼동 금지 — 그건 내부 임시저장 주문임). 처리 대기(발주확인·발송 전), 발송기한 초과/오늘마감, 상태별(결제완료/발주확인/발송/배송중/배송완료/취소) 카운트 + 주문 목록 반환. 예: "스토어 주문 몇 건 대기", "발주확인 안 한 거", "오늘 발송할 스토어 주문", "스마트스토어 현황", "네이버 주문 어때", "발송기한 임박".',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'pending', 'dispatch_due', 'today'], description: 'all=처리 진행중 전체, pending=처리대기(발주확인·발송 전, 기본), dispatch_due=발송기한 임박/초과순, today=오늘 들어온 주문' },
        limit: { type: 'integer', description: '목록 최대 N (기본 20)' },
      },
    },
  },
  // ===== 📋 내부 주문 내역 조회 =====
  {
    name: 'searchOrders',
    description: '내부 주문 내역 조회/검색 (스토어 주문 아님 — 스토어는 getSmartstoreOrders). "오늘 주문 뭐 들어왔어", "WP튠 최근 주문 내역", "어제 주문 몇 건", "이번주 강남오토 주문", "머플러 나간 주문" 같은 질문에 사용. 거래처명·제품명 키워드·기간(일수)으로 필터. 각 주문의 거래처/일시/품목/금액 반환.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처 이름 (일부 가능, 선택)' },
        keyword: { type: 'string', description: '제품명/메모 키워드 (선택)' },
        days: { type: 'integer', description: '최근 N일 (1=오늘, 2=어제부터, 7=일주일. 기본 7)' },
        limit: { type: 'integer', description: '최대 N건 (기본 15)' },
      },
    },
  },
  // ===== 쓰기 도구 (사용자 confirm 필수) =====
  {
    name: 'updateOrderMemo',
    description: '내부 주문에 메모를 추가하거나 교체합니다. "김철수 주문에 메모 남겨줘", "어제 강남오토 주문 메모에 착불로 변경이라고 적어줘" 같은 의도일 때 호출. orderNumber를 알면 직접, 모르면 customerName의 가장 최근 주문에 적용. mode=append(기존 메모 뒤에 추가, 기본)/replace(교체). 사용자 confirm 후 적용.',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: '주문번호 (예: ORD-20260703-1234, 선택)' },
        customerName: { type: 'string', description: '거래처 이름 — 이 거래처의 가장 최근 주문에 적용 (orderNumber 없을 때)' },
        memo: { type: 'string', description: '남길 메모 내용' },
        mode: { type: 'string', enum: ['append', 'replace'], description: 'append=기존 메모 뒤에 줄바꿈 추가(기본), replace=통째 교체' },
      },
      required: ['memo'],
    },
  },
  {
    name: 'addProduct',
    description: '신규 제품을 등록합니다. 사용자가 "제품 추가해줘", "신상품 등록", "OO 제품 추가" 같은 의도일 때 호출. 실제 DB 변경은 사용자 확인 후 적용됨. 카테고리 모를 때는 "미분류"로 두지 말고 사용자에게 되묻기.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '제품명 (필수, 정확히)' },
        category: { type: 'string', description: '카테고리 (예: 머플러, 다운파이프, 휠 등)' },
        wholesale: { type: 'number', description: '도매가 (원, VAT 포함)' },
        retail: { type: 'number', description: '소비자가 (원, VAT 포함)' },
        stock: { type: 'integer', description: '초기 재고 수량 (선택, 기본 0)' },
      },
      required: ['name', 'wholesale', 'retail'],
    },
  },
  {
    name: 'addCustomer',
    description: '신규 거래처를 등록합니다. "거래처 추가해줘", "신규 업체 등록" 같은 의도일 때 호출. 실제 DB 변경은 사용자 확인 후 적용됨.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '거래처 이름 (필수)' },
        phone: { type: 'string', description: '전화번호 (선택, 010-xxxx-xxxx 형식 권장)' },
        address: { type: 'string', description: '주소 (선택)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'bulkAddProduct',
    description: '여러 제품을 한 번의 confirm으로 일괄 등록합니다. 사용자가 표/목록 형태로 여러 신규 제품명, 카테고리, 도매가, 소비자가, 초기 재고를 입력할 때 사용. 단일 제품 등록은 addProduct 사용.',
    parameters: {
      type: 'object',
      properties: {
        products: {
          type: 'array',
          description: '등록할 제품 배열',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '제품명 (필수)' },
              category: { type: 'string', description: '카테고리 (선택, 기본 미분류)' },
              wholesale: { type: 'number', description: '도매가 (원, VAT 포함)' },
              retail: { type: 'number', description: '소비자가 (원, VAT 포함)' },
              stock: { type: 'integer', description: '초기 재고 수량 (선택, 기본 0)' },
            },
            required: ['name', 'wholesale', 'retail'],
          },
        },
      },
      required: ['products'],
    },
  },
  {
    name: 'bulkAddCustomer',
    description: '여러 거래처를 한 번의 confirm으로 일괄 등록합니다. 사용자가 표/목록 형태로 여러 신규 거래처명, 전화번호, 주소를 입력할 때 사용. 단일 거래처 등록은 addCustomer 사용.',
    parameters: {
      type: 'object',
      properties: {
        customers: {
          type: 'array',
          description: '등록할 거래처 배열',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '거래처 이름 (필수)' },
              phone: { type: 'string', description: '전화번호 (선택)' },
              address: { type: 'string', description: '주소 (선택)' },
            },
            required: ['name'],
          },
        },
      },
      required: ['customers'],
    },
  },
  {
    name: 'updateProductStock',
    description: '특정 제품의 재고 수량을 변경합니다. productName으로 검색 (정확히 일치 우선, 부분 매칭 fallback). "스덴 밴딩 재고 30개로 변경", "다운파이프 재고 50개 입고" 같은 의도일 때 호출. 사용자 confirm 후 DB 적용.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름 (정확히 또는 일부)' },
        productId: { type: 'integer', description: '제품 ID (이름 모를 때)' },
        newStock: { type: 'integer', description: '변경할 재고 수량 (0 이상)' },
      },
      required: ['newStock'],
    },
  },
  {
    name: 'bulkUpdateProductStock',
    description: '여러 제품의 재고를 한 번의 confirm으로 일괄 변경. 사용자가 여러 라인(여러 제품)의 재고 정보를 한 번에 입력할 때 사용. 예: "스덴밴딩 38-45 56개, 38-90 40개, 43-45 24개..." 또는 표/목록 형태 입력. 단일 제품 변경은 updateProductStock 사용. "재고없음" → 0으로 인식.',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: '재고 변경 라인 배열 (각 라인 = 제품명 + 새 재고)',
          items: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: '제품 이름 (정확히 또는 일부)' },
              newStock: { type: 'integer', description: '변경할 재고 (0 이상, 재고없음=0)' },
            },
            required: ['productName', 'newStock'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'updateProductPrice',
    description: '특정 제품의 도매가/소비자가 변경. "다운파이프 도매가 5만원으로" 같은 의도일 때 호출. 사용자 confirm 후 DB 적용. ⚠️매핑 필수: 도매가=wholesale, 소비자가(=소매가/판매가/정가)=retail. **사용자가 명시한 쪽만 채우고 나머지 필드는 비운다(절대 같은 값을 양쪽에 넣지 말 것).** "가격/단가"만 말하고 도매/소비자 구분이 없으면 추측하지 말고 "도매가인가요 소비자가인가요?"라고 되물어라.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름' },
        productId: { type: 'integer', description: '제품 ID' },
        wholesale: { type: 'number', description: "새 도매가(원, VAT포함). 사용자가 '도매가/도매/매입가/사입가'라고 명시한 경우에만 채움. 그 외(소비자가만 언급 등)엔 null로 비움." },
        retail: { type: 'number', description: "새 소비자가(원, VAT포함). 사용자가 '소비자가/소매가/판매가/정가'라고 명시한 경우에만 채움. 그 외(도매가만 언급 등)엔 null로 비움." },
      },
    },
  },
  {
    name: 'bulkUpdateProductPrice',
    description: '여러 제품의 도매가/소비자가를 한 번의 confirm으로 일괄 변경합니다. 사용자가 표/목록 형태로 여러 제품 가격을 입력할 때 사용. 제품명은 findProductSmart 방식으로 매칭하며 단일 제품 가격 변경은 updateProductPrice 사용. ⚠️매핑: 도매가=wholesale, 소비자가(=소매가/판매가)=retail. **각 라인마다 사용자가 명시한 가격 종류의 필드만 채우고 나머지는 비운다(같은 값을 양쪽에 넣지 말 것).**',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: '가격 변경 라인 배열',
          items: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: '제품 이름 (정확히 또는 일부)' },
              productId: { type: 'integer', description: '제품 ID (선택)' },
              wholesale: { type: 'number', description: "새 도매가(원). '도매가/도매/매입가'라고 한 라인만 채움. 그 외 null." },
              retail: { type: 'number', description: "새 소비자가(원). '소비자가/소매가/판매가'라고 한 라인만 채움. 그 외 null." },
            },
            required: ['productName'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'updateProductName',
    description: '등록된 제품의 이름을 수정하거나 이름 뒤에 텍스트를 이어붙입니다. "X 제품명을 Y로 바꿔/변경", "이름 뒤에 (무정전 타입) 붙여줘/추가" 같은 의도일 때 호출. newName(전체 교체) 또는 appendText(기존 이름 뒤에 덧붙임) 중 하나만 사용. scope="all"이면 productName(키워드)이 이름에 포함된 모든 제품에 일괄 적용(주로 appendText). 사용자 confirm 후 DB 적용.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '수정 대상 제품 이름(단일) 또는 키워드(scope=all 일괄)' },
        productId: { type: 'integer', description: '제품 ID (단일, 선택)' },
        newName: { type: 'string', description: '새 제품명 전체(교체). appendText와 동시 사용 금지' },
        appendText: { type: 'string', description: '기존 이름 뒤에 덧붙일 텍스트. 예: " (무정전 타입)" — 사용자가 말한 그대로(앞 공백/괄호 포함)' },
        scope: { type: 'string', enum: ['one', 'all'], description: '"all"이면 키워드가 이름에 포함된 모든 제품 일괄 (기본 one)' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'getPriceHistory',
    description: '제품의 단가(도매가/소비자가) 변경 이력과 초기 원본 금액을 조회합니다. "인테이크 단가 이력", "X 원래 얼마였어?", "가격 변경 내역" 같은 의도일 때 호출. 읽기 전용. scope="all"이면 이름에 키워드가 포함된 모든 제품을 함께 조회.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름 또는 키워드(예: 인테이크)' },
        scope: { type: 'string', enum: ['one', 'all'], description: '"all"이면 키워드가 이름에 포함된 모든 제품 (기본 one)' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'revertProductPrice',
    description: '제품 가격을 초기 원본 금액(initial_wholesale/initial_retail)으로 되돌립니다. "인테이크 원본가로 되돌려", "가격 원래대로 복원" 같은 의도일 때 호출. scope="all"이면 이름에 키워드가 포함된, 현재가≠원본가인 모든 제품을 일괄 복원. 사용자 confirm 후 적용되며 복원도 이력에 기록됩니다.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름 또는 키워드(예: 인테이크)' },
        productId: { type: 'integer', description: '제품 ID (단일, 선택)' },
        scope: { type: 'string', enum: ['one', 'all'], description: '"all"이면 키워드 포함 모든 제품 일괄 복원 (기본 one)' },
      },
      required: ['productName'],
    },
  },
  {
    name: 'saveOrder',
    description: '주문 등록 — 거래처 + 여러 제품 라인. "강남오토에 다운파이프 2개 머플러 1개 주문" 같은 자연어를 분석하여 호출. 거래처가 DB에 없으면 자동 신규 등록, 같은 거래처 당일 주문은 자동 병합 (App.jsx saveOrder 로직 활용).',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처 이름 (정확히 또는 일부)' },
        priceType: { type: 'string', enum: ['wholesale', 'retail'], description: '가격 모드 (기본 wholesale)' },
        items: {
          type: 'array',
          description: '주문 라인 배열',
          items: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: '제품 이름' },
              quantity: { type: 'integer', description: '수량 (1 이상)' },
              unitPrice: { type: 'integer', description: '단가 힌트 (사용자가 가격을 명시한 경우, 동명 제품 구분에 사용)' },
              categoryHint: { type: 'string', description: '카테고리 힌트 (사용자가 카테고리를 언급한 경우, 후보 좁히기 용)' },
            },
            required: ['productName', 'quantity'],
          },
        },
        memo: { type: 'string', description: '메모 (선택)' },
      },
      required: ['customerName', 'items'],
    },
  },
  {
    name: 'updateCustomer',
    description: '기존 거래처(업체/고객)의 전화번호·주소·상호(이름)·블랙리스트 수정. ⚠️동의어: "배송지/배송주소/납품처/보내는곳/위치"=주소(address), "연락처/번호/핸드폰/폰"=전화(phone), "상호/업체명/이름 변경"=newName, "블랙/블랙리스트 지정·등록·해제"=isBlacklist. 예: "WP튠 김해 전화 010-1234로", "동래YB 상호 YB모터스로 변경"(newName), "세븐카 블랙리스트 지정해줘"(isBlacklist=true), "블랙 해제"(false). **상호 변경 시 과거 주문/저장카트/반품 이력도 새 상호로 자동 이전됨.**',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처(업체/고객) 이름 (정확히 또는 일부). 예: "스페셜라인"' },
        customerId: { type: 'string', description: '거래처 ID (선택)' },
        phone: { type: 'string', description: "새 전화번호. 사용자가 연락처/번호/핸드폰/폰 변경을 말한 경우만." },
        address: { type: 'string', description: "새 주소(=배송지/배송주소/납품처/보내는곳/위치). 문장 속 주소 문자열을 그대로. 예: '부산 강서구 대저2동 울만로 430-18'" },
        newName: { type: 'string', description: '새 상호(거래처명). 사용자가 상호/업체명/이름 변경을 말한 경우만. 과거 이력 자동 이전.' },
        isBlacklist: { type: 'boolean', description: '블랙리스트 지정(true)/해제(false). 사용자가 블랙/블랙리스트를 말한 경우만.' },
      },
    },
  },
  {
    name: 'bulkUpdateCustomer',
    description: '여러 거래처의 전화번호/주소/상호명/블랙리스트 지정을 한 번의 confirm으로 일괄 변경합니다. "A랑 B 둘 다 블랙 지정", "여러 업체 상호/연락처 한꺼번에 변경" 같은 다건 요청에 사용. 단일 거래처 변경은 updateCustomer 사용.',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: '거래처 정보 변경 라인 배열',
          items: {
            type: 'object',
            properties: {
              customerName: { type: 'string', description: '거래처 이름 (정확히 또는 일부)' },
              customerId: { type: 'string', description: '거래처 ID (선택)' },
              phone: { type: 'string', description: '새 전화번호 (선택)' },
              address: { type: 'string', description: '새 주소 (선택)' },
              newName: { type: 'string', description: '새 상호명(이름 변경 시). 과거 주문/장바구니/반품 이력도 함께 이전됨 (선택)' },
              isBlacklist: { type: 'boolean', description: '블랙리스트 지정(true)/해제(false) (선택)' },
            },
            required: ['customerName'],
          },
        },
      },
      required: ['updates'],
    },
  },
];

// 쓰기 도구 이름 목록 (executeTool에서 dry-run 처리용)
export const WRITE_TOOLS = new Set([
  'addProduct',
  'addCustomer',
  'bulkAddProduct',
  'bulkAddCustomer',
  'updateProductStock',
  'updateProductPrice',
  'bulkUpdateProductPrice',
  'revertProductPrice',
  'updateProductName',
  'updateOrderMemo',
  'saveOrder',
  'updateCustomer',
  'bulkUpdateCustomer',
  'bulkUpdateProductStock',
]);

// 도구 이름 → 실제 실행 함수 매핑
// 인자: (args, context) — context = { orders, customers, products }
// 반환: { ok: true, data } 또는 { ok: false, error }
//
// 쓰기 도구는 즉시 실행하지 않고 pending 객체 반환 → UI에서 confirm 후 실행
export function executeTool(name, args = {}, context = {}) {
  const { orders = [], customers = [], products = [], aiLearningData = [], externalOrders = [], externalProducts = [] } = context;

  // ===== 쓰기 도구: dry-run (사용자 confirm 대기) =====
  if (WRITE_TOOLS.has(name)) {
    return buildPendingAction(name, args, { customers, products, aiLearningData, orders });
  }

  // ===== 읽기 도구 =====
  try {
    switch (name) {
      case 'getTopCustomers':
        return { ok: true, data: getTopCustomers(orders, customers, args) };
      case 'getCustomerTrend':
        return { ok: true, data: getCustomerTrend(orders, customers, args) };
      case 'getCustomerSegments':
        return { ok: true, data: getCustomerSegments(orders, customers, args) };
      case 'getDormantCustomers':
        return { ok: true, data: getDormantCustomers(orders, customers, args) };
      case 'getTopProducts':
        return { ok: true, data: getTopProducts(orders, products, args) };
      case 'getProductTrend':
        return { ok: true, data: getProductTrend(orders, products, args) };
      case 'getRepeatPurchaseGap':
        return { ok: true, data: getRepeatPurchaseGap(orders, args) };
      case 'getCustomerProductAffinity':
        return { ok: true, data: getCustomerProductAffinity(orders, products, customers, args) };
      case 'getCompositeSummary':
        return { ok: true, data: getCompositeSummary(orders, customers, products, args) };
      case 'getCustomerInfo': {
        const q = String(args?.customerName || '').trim();
        if (!q) return { ok: false, error: 'customerName이 필요합니다.' };
        const ql = q.toLowerCase().replace(/\s+/g, '');
        // 부분 매칭
        const target = (customers || []).find((c) => {
          const cn = String(c.name || '').toLowerCase().replace(/\s+/g, '');
          return cn === ql || cn.includes(ql) || ql.includes(cn);
        });
        if (!target) {
          const candidates = (customers || [])
            .filter((c) => {
              const cn = String(c.name || '').toLowerCase().replace(/\s+/g, '');
              return cn.includes(ql.slice(0, Math.min(3, ql.length)));
            })
            .slice(0, 5);
          return {
            ok: true,
            data: {
              found: false,
              query: q,
              message: `"${q}" 거래처를 찾지 못했습니다.`,
              candidates: candidates.map((c) => ({ name: c.name, phone: c.phone })),
            },
          };
        }
        // 거래 집계
        const myOrders = (orders || []).filter((o) => o.customerId === target.id || o.customerName === target.name);
        const totalRevenue = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const orderCount = myOrders.length;
        const avgOrder = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;
        const lastOrder = myOrders.length > 0
          ? myOrders.slice().sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))[0]
          : null;
        // 자주 사는 제품 TOP3
        const productCount = {};
        myOrders.forEach((o) => {
          (o.items || []).forEach((it) => {
            const k = it.name || it.productName || '?';
            productCount[k] = (productCount[k] || 0) + Number(it.quantity || 0);
          });
        });
        const topProducts = Object.entries(productCount)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, qty]) => ({ name, totalQty: qty }));
        // 미수금 (paymentRecords에서)
        const payment = (context.paymentRecords || []).find(
          (p) => p.customerId === target.id || p.customerName === target.name
        );
        const overdue = payment ? Number(payment.balance || 0) : 0;
        return {
          ok: true,
          data: {
            found: true,
            name: target.name,
            phone: target.phone || '',
            address: target.address || '',
            totalRevenue,
            orderCount,
            avgOrder,
            lastOrderDate: lastOrder?.orderDate || null,
            topProducts,
            overdueBalance: overdue,
          },
        };
      }
      case 'searchProducts': {
        const kw = String(args?.keyword || '').trim().toLowerCase().replace(/ㅡ/g, '-');
        if (!kw || kw.length < 2) return { ok: false, error: 'keyword 2자 이상 필요' };
        const limit = Number(args?.limit || 30);
        const kwNoSpace = kw.replace(/\s+/g, '');
        // 토큰 단위 매칭 — "HKS 흡기필터"처럼 여러 단어로 물어도 각 토큰이 들어간 관련 상품을 폭넓게 찾는다.
        // 1자 토큰은 노이즈라 제외, 토큰 없으면 전체 키워드로 폴백.
        const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
        const searchTokens = tokens.length ? tokens : [kwNoSpace];
        // 각 제품을 (매칭 토큰 수, 전체 부분일치 보너스)로 점수화 → 관련도 순 정렬
        const scored = [];
        for (const p of (products || [])) {
          const hay = (String(p?.name || '') + ' ' + String(p?.category || '')).toLowerCase();
          const hayNoSpace = hay.replace(/\s+/g, '');
          let hitCount = 0;
          for (const t of searchTokens) {
            if (hayNoSpace.includes(t.replace(/\s+/g, ''))) hitCount++;
          }
          if (hitCount === 0) continue;
          // 전체 키워드(공백제거)까지 통째로 들어가면 가장 정확 → 큰 가산점
          const exactBonus = hayNoSpace.includes(kwNoSpace) ? 100 : 0;
          scored.push({ p, score: exactBonus + hitCount });
        }
        // 점수 desc, 동점이면 모든 토큰 매칭(AND) 우선
        scored.sort((a, b) => b.score - a.score);
        const allTokenCount = scored.filter((s) => s.score % 100 >= searchTokens.length).length;
        return {
          ok: true,
          data: {
            keyword: kw,
            count: scored.length,
            allTokenMatchCount: allTokenCount, // 모든 키워드가 다 들어간 정확 매칭 수
            tokens: searchTokens,
            items: scored.slice(0, limit).map(({ p }) => ({
              name: p.name,
              category: p.category || '미분류',
              stock: Number(p.stock || 0),
              wholesale: Number(p.wholesale || 0),
              retail: Number(p.retail || 0),
            })),
          },
        };
      }
      case 'searchNaverCatalog': {
        const kw = String(args?.keyword || '').trim().toLowerCase().replace(/ㅡ/g, '-');
        if (!kw || kw.length < 2) return { ok: false, error: 'keyword 2자 이상 필요' };
        if (!externalProducts || externalProducts.length === 0) {
          return { ok: true, data: { keyword: kw, count: 0, items: [], note: '네이버 상품 카탈로그가 아직 동기화되지 않았습니다. 스토어 주문 페이지의 [네이버 상품 동기화] 버튼을 누르거나 잠시 후 다시 시도하세요. (매장 PC sync가 하루 1회 자동 동기화)' } };
        }
        const limit = Number(args?.limit || 40);
        const inStockOnly = !!args?.inStockOnly;
        const kwNoSpace = kw.replace(/\s+/g, '');
        const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
        const searchTokens = tokens.length ? tokens : [kwNoSpace];
        const scored = [];
        for (const p of externalProducts) {
          if (inStockOnly && p.status_type && p.status_type !== 'SALE') continue;
          // 옵션명까지 검색 대상에 포함
          const optText = Array.isArray(p.options) ? p.options.map((o) => o?.name || '').join(' ') : '';
          const hay = (String(p?.name || '') + ' ' + String(p?.category_name || '') + ' ' + optText).toLowerCase();
          const hayNoSpace = hay.replace(/\s+/g, '');
          let hitCount = 0;
          for (const t of searchTokens) { if (hayNoSpace.includes(t.replace(/\s+/g, ''))) hitCount++; }
          if (hitCount === 0) continue;
          const exactBonus = hayNoSpace.includes(kwNoSpace) ? 100 : 0;
          scored.push({ p, score: exactBonus + hitCount });
        }
        scored.sort((a, b) => b.score - a.score);
        const allTokenCount = scored.filter((s) => s.score % 100 >= searchTokens.length).length;
        return {
          ok: true,
          data: {
            keyword: kw,
            source: '네이버 스토어(엠파츠) 카탈로그',
            count: scored.length,
            allTokenMatchCount: allTokenCount,
            tokens: searchTokens,
            items: scored.slice(0, limit).map(({ p }) => ({
              name: p.name,
              status: p.status_type === 'SALE' ? '판매중' : (p.status_type === 'OUTOFSTOCK' ? '품절' : (p.status_type === 'SUSPENSION' ? '판매중지' : (p.status_type || '-'))),
              salePrice: Number(p.sale_price || 0),
              optionCount: Number(p.option_count || 0),
              options: Array.isArray(p.options) ? p.options.slice(0, 30).map((o) => ({ name: o.name, price: Number(o.price || 0), stock: Number(o.stock || 0) })) : [],
              managementCode: p.seller_management_code || '',
              category: p.category_name || '',
              url: p.product_url || '',
            })),
          },
        };
      }
      case 'searchCustomers': {
        const kw = String(args?.keyword || '').trim().toLowerCase();
        if (!kw || kw.length < 2) return { ok: false, error: 'keyword 2자 이상 필요' };
        const limit = Number(args?.limit || 30);
        const kwNoSpace = kw.replace(/\s+/g, '');
        const matches = (customers || []).filter((c) => {
          const name = String(c?.name || '').toLowerCase().replace(/\s+/g, '');
          const phone = String(c?.phone || '').toLowerCase();
          const address = String(c?.address || '').toLowerCase().replace(/\s+/g, '');
          return name.includes(kwNoSpace) || phone.includes(kw) || address.includes(kwNoSpace);
        });
        // 총 거래액 계산
        const enriched = matches.slice(0, limit).map((c) => {
          const myOrders = (orders || []).filter((o) => o.customerId === c.id || o.customerName === c.name);
          const totalRevenue = myOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
          return {
            name: c.name,
            phone: c.phone || '',
            address: c.address || '',
            totalRevenue,
            orderCount: myOrders.length,
          };
        });
        return {
          ok: true,
          data: { keyword: kw, count: matches.length, items: enriched },
        };
      }
      case 'getProductInfo': {
        const q = String(args?.productName || '').trim();
        if (!q) return { ok: false, error: 'productName이 필요합니다.' };
        const target = findProductSmart(q, products, context.aiLearningData);
        if (!target) {
          // findProductCandidates는 문자열 배열 반환 → products에서 원본 객체 매핑
          const candidateNames = findProductCandidates(q, products).slice(0, 5);
          const candidates = candidateNames.map((name) => {
            const p = (products || []).find((x) => x?.name === name);
            return {
              name,
              category: p?.category || '미분류',
              stock: Number(p?.stock || 0),
            };
          });
          return {
            ok: true,
            data: {
              found: false,
              query: q,
              message: `"${q}" 제품을 찾지 못했습니다.`,
              candidates,
            },
          };
        }
        // 최근 30일 판매량 집계
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const recentSales = (orders || []).reduce((sum, o) => {
          if (!o?.orderDate) return sum;
          const d = new Date(o.orderDate);
          if (d < cutoff) return sum;
          const item = (o.items || []).find((it) => it.productId === target.id || it.name === target.name);
          return sum + (item ? Number(item.quantity || 0) : 0);
        }, 0);
        const stockNum = Number(target.stock || 0);
        return {
          ok: true,
          data: {
            found: true,
            name: target.name,
            category: target.category || '미분류',
            stock: stockNum,
            wholesale: Number(target.wholesale || 0),
            retail: Number(target.retail || 0),
            recentSales30d: recentSales,
            // 음수 = 입고대기를 먼저 판정 (이전엔 <=5 매칭에 음수가 잘못 잡힘)
            status: stockNum < 0
              ? '입고대기'
              : stockNum === 0
                ? '품절'
                : stockNum <= 5
                  ? '부족'
                  : '정상',
          },
        };
      }
      case 'getPriceHistory': {
        const q = String(args?.productName || '').trim();
        if (!q) return { ok: false, error: 'productName이 필요합니다.' };
        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
        const ql = norm(q);
        let targets = [];
        if (args?.scope === 'all') {
          targets = (products || []).filter((p) => norm(p.name).includes(ql));
        } else {
          const t = findProductSmart(q, products, context.aiLearningData);
          if (t) targets = [t];
        }
        if (targets.length === 0) {
          return { ok: true, data: { found: false, query: q, message: `"${q}" 제품을 찾지 못했습니다.`, candidates: findProductCandidates(q, products).slice(0, 5) } };
        }
        const items = targets.map((p) => {
          const hist = Array.isArray(p.price_history) ? p.price_history : [];
          return {
            id: p.id,
            name: p.name,
            wholesale: Number(p.wholesale || 0),
            retail: Number(p.retail || 0),
            initialWholesale: p.initial_wholesale != null ? Number(p.initial_wholesale) : null,
            initialRetail: p.initial_retail != null ? Number(p.initial_retail) : null,
            changedFromInitial: (p.initial_wholesale != null && Number(p.initial_wholesale) !== Number(p.wholesale))
              || (p.initial_retail != null && Number(p.initial_retail) !== Number(p.retail)),
            // 최근 10건 (오래된→최신), 큰 변경 이력은 잘라서 토큰 절약
            history: hist.slice(-10).map((h) => ({ field: h.field, old: Number(h.old), new: Number(h.new), at: h.at })),
            historyCount: hist.length,
          };
        });
        return { ok: true, data: { found: true, query: q, scope: args?.scope || 'one', count: items.length, changedCount: items.filter((i) => i.changedFromInitial).length, items } };
      }
      case 'getLowStockProducts':
        return { ok: true, data: getLowStockProducts(products, orders, args) };
      case 'getStockSummary':
        return { ok: true, data: getStockSummary(products, args) };
      case 'getProductsByStockStatus':
        return { ok: true, data: getProductsByStockStatus(products, args) };
      case 'getRestockRecommendations':
        return { ok: true, data: getRestockRecommendations(products, orders, args) };
      // 고급 분석 5종
      case 'getCollectionPlan':
        return { ok: true, data: getCollectionPlan(context.paymentRecords || [], customers, orders, args) };
      case 'getStockCoverageForecast':
        return { ok: true, data: getStockCoverageForecast(products, orders, args) };
      case 'getNextBestOffers':
        return { ok: true, data: getNextBestOffers(args?.customerName, orders, products, args) };
      case 'getProductBundleSuggestions':
        return { ok: true, data: getProductBundleSuggestions(args?.productName, orders, args) };
      case 'getMarginLeakage':
        return { ok: true, data: getMarginLeakage(orders, products, args) };
      // 시뮬레이션 4종
      case 'simulatePriceChange':
        return { ok: true, data: simulatePriceChange(args?.productName, orders, products, args) };
      case 'simulateRestock':
        return { ok: true, data: simulateRestock(args?.productName, args?.restockQty, orders, products, args) };
      case 'getRevenueVolatility':
        return { ok: true, data: getRevenueVolatility(orders, args) };
      case 'getCustomerLifetimeValue':
        return { ok: true, data: getCustomerLifetimeValue(orders, args) };
      case 'getPaymentSummary':
        return { ok: true, data: getPaymentSummary(context.paymentRecords, context.paymentHistory) };
      case 'getOverdueCustomers':
        return { ok: true, data: getOverdueCustomers(context.paymentRecords, customers, args) };
      case 'getPaymentInflow':
        return { ok: true, data: getPaymentInflow(context.paymentHistory, args) };
      case 'getReturnAnalysis':
        return { ok: true, data: getReturnAnalysis(orders, context.customerReturns, args) };
      case 'getPendingCarts':
        return { ok: true, data: getPendingCarts(context.savedCarts, args) };
      case 'getLearningStats':
        return { ok: true, data: getLearningStats(context.aiLearningData, args) };
      case 'getSmartstoreOrders':
        return { ok: true, data: getSmartstoreOrders(externalOrders, args) };
      case 'searchOrders': {
        const days = Math.max(1, Number(args?.days) || 7);
        const limit = Math.max(1, Math.min(Number(args?.limit) || 15, 40));
        const nameQ = String(args?.customerName || '').trim().toLowerCase();
        const kwQ = String(args?.keyword || '').trim().toLowerCase();
        const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
        const list = (orders || [])
          .filter((o) => {
            const dt = new Date(o.createdAt || o.created_at || 0);
            if (!(dt >= since)) return false;
            if (nameQ && !String(o.customerName || o.customer_name || '').toLowerCase().includes(nameQ)) return false;
            if (kwQ) {
              const hay = [(o.memo || ''), ...((o.items || []).map((it) => it?.name || ''))].join(' ').toLowerCase();
              if (!hay.includes(kwQ)) return false;
            }
            return true;
          })
          .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
        const totalAmt = list.reduce((s, o) => s + (Number(o.totalAmount ?? o.total ?? o.total_amount) || 0), 0);
        return {
          ok: true,
          data: {
            period: `최근 ${days}일`, count: list.length, totalAmount: totalAmt,
            orders: list.slice(0, limit).map((o) => ({
              orderNumber: o.orderNumber || o.id,
              customer: o.customerName || o.customer_name || '',
              date: o.createdAt || o.created_at || '',
              amount: Number(o.totalAmount ?? o.total ?? o.total_amount) || 0,
              items: (o.items || []).map((it) => `${it?.name || ''}${(it?.quantity || 1) > 1 ? `×${it.quantity}` : ''}`).slice(0, 6),
              memo: o.memo || '',
            })),
            note: list.length > limit ? `상위 ${limit}건만 표시 (총 ${list.length}건)` : '',
          },
        };
      }
      case 'detectAnomalies': {
        const anomalies = detectAnomalies({
          products, customers, orders,
          paymentRecords: context.paymentRecords || [],
          customerReturns: context.customerReturns || [],
        });
        return {
          ok: true,
          data: {
            count: anomalies.length,
            criticalCount: anomalies.filter(a => a.level === 'critical').length,
            warningCount: anomalies.filter(a => a.level === 'warning').length,
            infoCount: anomalies.filter(a => a.level === 'info').length,
            anomalies: anomalies.map(a => ({
              level: a.level,
              icon: a.icon,
              title: a.title,
              detail: a.detail,
              suggestion: a.suggestion,
            })),
            message: anomalies.length === 0
              ? '현재 이상 징후 없음 — 매장 상태 정상입니다.'
              : `${anomalies.length}건 이상 신호 감지됨.`,
          },
        };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 쓰기 도구 dry-run — 검증 + preview만 만들고 실제 DB 변경 X
// AI는 이 결과를 보고 "확인 후 실행하시겠어요?" 식으로 답변하도록 시스템 프롬프트가 유도
function buildPendingAction(name, args, { customers, products, aiLearningData = [], orders = [] }) {
  if (name === 'addProduct') {
    const { name: productName, category, wholesale, retail, stock } = args;
    if (!productName) return { ok: false, error: '제품명이 필요합니다.' };
    if (!(Number(wholesale) > 0)) return { ok: false, error: '도매가는 0보다 커야 합니다.' };
    if (!(Number(retail) > 0)) return { ok: false, error: '소비자가는 0보다 커야 합니다.' };
    // 중복 검사
    const existing = (products || []).find((p) => (p?.name || '').toLowerCase() === productName.toLowerCase());
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'addProduct',
        params: {
          name: productName.trim(),
          category: (category || '미분류').trim(),
          wholesale: Number(wholesale),
          retail: Number(retail),
          stock: Number(stock) || 0,
        },
        warnings: existing ? [`⚠️ 동일 이름 "${productName}" 제품이 이미 있습니다 (id: ${existing.id})`] : [],
        preview: `📦 신규 제품 등록\n• 이름: ${productName}\n• 카테고리: ${category || '미분류'}\n• 도매가: ${Number(wholesale).toLocaleString('ko-KR')}원\n• 소비자가: ${Number(retail).toLocaleString('ko-KR')}원${stock ? `\n• 초기 재고: ${stock}개` : ''}`,
      },
    };
  }
  if (name === 'addCustomer') {
    const { name: customerName, phone, address } = args;
    if (!customerName) return { ok: false, error: '거래처 이름이 필요합니다.' };
    const existing = (customers || []).find((c) => (c?.name || '').toLowerCase() === customerName.toLowerCase());
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'addCustomer',
        params: {
          name: customerName.trim(),
          phone: (phone || '').trim(),
          address: (address || '').trim(),
        },
        warnings: existing ? [`⚠️ 동일 이름 "${customerName}" 거래처가 이미 있습니다`] : [],
        preview: `🏢 신규 거래처 등록\n• 이름: ${customerName}${phone ? `\n• 전화: ${phone}` : ''}${address ? `\n• 주소: ${address}` : ''}`,
      },
    };
  }
  if (name === 'bulkAddProduct') {
    const { products: productRows } = args;
    if (!Array.isArray(productRows) || productRows.length === 0) {
      return { ok: false, error: '등록할 제품이 없습니다.' };
    }
    const valid = [];
    const invalid = [];
    const warnings = [];
    for (const row of productRows) {
      const productName = (row?.name || '').trim();
      const wholesale = Number(row?.wholesale);
      const retail = Number(row?.retail);
      if (!productName || !(wholesale > 0) || !(retail > 0)) {
        invalid.push(productName || '(제품명 없음)');
        continue;
      }
      const existing = (products || []).find((p) => (p?.name || '').toLowerCase() === productName.toLowerCase());
      if (existing) warnings.push(`⚠️ 동일 이름 "${productName}" 제품이 이미 있습니다 (id: ${existing.id})`);
      valid.push({
        name: productName,
        category: (row?.category || '미분류').trim(),
        wholesale,
        retail,
        stock: Math.max(0, Math.floor(Number(row?.stock) || 0)),
      });
    }
    if (valid.length === 0) {
      return { ok: false, error: `등록 가능한 제품이 없습니다.${invalid.length > 0 ? `\n확인 필요: ${invalid.join(', ')}` : ''}` };
    }
    if (invalid.length > 0) warnings.push(`⚠️ ${invalid.length}개 라인은 제품명/도매가/소비자가가 부족해 제외됩니다.`);
    const previewLines = valid.map((p) =>
      `• ${p.name} / ${p.category} / 도매 ${p.wholesale.toLocaleString('ko-KR')}원 / 소비자 ${p.retail.toLocaleString('ko-KR')}원 / 재고 ${p.stock}개`
    ).join('\n');
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkAddProduct',
        params: { products: valid, invalid },
        warnings,
        preview: `📦 제품 일괄 등록 (${valid.length}건)\n\n${previewLines}`,
      },
    };
  }
  if (name === 'bulkAddCustomer') {
    const { customers: customerRows } = args;
    if (!Array.isArray(customerRows) || customerRows.length === 0) {
      return { ok: false, error: '등록할 거래처가 없습니다.' };
    }
    const valid = [];
    const invalid = [];
    const warnings = [];
    for (const row of customerRows) {
      const customerName = (row?.name || '').trim();
      if (!customerName) {
        invalid.push('(거래처명 없음)');
        continue;
      }
      const existing = (customers || []).find((c) => (c?.name || '').toLowerCase() === customerName.toLowerCase());
      if (existing) warnings.push(`⚠️ 동일 이름 "${customerName}" 거래처가 이미 있습니다`);
      valid.push({
        name: customerName,
        phone: (row?.phone || '').trim(),
        address: (row?.address || '').trim(),
      });
    }
    if (valid.length === 0) {
      return { ok: false, error: '등록 가능한 거래처가 없습니다.' };
    }
    if (invalid.length > 0) warnings.push(`⚠️ ${invalid.length}개 라인은 거래처명이 없어 제외됩니다.`);
    const previewLines = valid.map((c) =>
      `• ${c.name}${c.phone ? ` / ${c.phone}` : ''}${c.address ? ` / ${c.address}` : ''}`
    ).join('\n');
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkAddCustomer',
        params: { customers: valid, invalid },
        warnings,
        preview: `🏢 거래처 일괄 등록 (${valid.length}건)\n\n${previewLines}`,
      },
    };
  }
  if (name === 'updateProductStock') {
    const { productName, productId, newStock } = args;
    if (newStock == null || newStock < 0 || !Number.isFinite(Number(newStock))) {
      return { ok: false, error: '재고 수량은 0 이상이어야 합니다.' };
    }
    // 제품 찾기 (AI 학습 사례 우선 + tolerance + 부분 + 토큰)
    let target = null;
    if (productId != null) target = products.find((p) => p.id === productId);
    if (!target && productName) {
      target = findProductSmart(productName, products, aiLearningData);
    }
    if (!target) {
      const candidates = productName ? findProductCandidates(productName, products) : [];
      const hint = candidates.length > 0 ? `\n\n비슷한 후보: ${candidates.join(' / ')}` : '';
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다.${hint}` };
    }
    const currentStock = Number(target.stock) || 0;
    const diff = Number(newStock) - currentStock;
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'updateProductStock',
        params: {
          productId: target.id,
          productName: target.name,
          newStock: Number(newStock),
          oldStock: currentStock,
        },
        warnings: diff < -10 ? [`⚠️ 재고가 ${Math.abs(diff)}개 감소합니다 (큰 변동)`] : [],
        preview: `📦 재고 변경\n• 제품: ${target.name}\n• 현재 재고: ${currentStock}개\n• 변경 후: ${newStock}개\n• 변동: ${diff > 0 ? '+' : ''}${diff}개`,
      },
    };
  }
  if (name === 'saveOrder') {
    const { customerName, items, priceType = 'wholesale', memo } = args;
    if (!customerName) return { ok: false, error: '거래처 이름이 필요합니다.' };
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: '주문 항목이 1개 이상 필요합니다.' };
    }
    // 거래처 매칭 — Codex 위험 분석 반영: 정확 매칭만 통과, 유사 후보는 사용자 확인 필수
    const customerMatch = matchCustomer(customerName, customers, { maxCandidates: 3, threshold: 0.6 });
    const customer = customerMatch.status === 'exact' ? customerMatch.exact : null;
    const customerCandidates = customerMatch.candidates.map((c) => ({
      id: c.item.id,
      name: c.item.name,
      phone: c.item.phone || '',
      address: c.item.address || '',
      score: Number(c.score.toFixed(2)),
      reason: c.reason,
    }));
    const customerLabel = customer ? customer.name : customerName.trim();

    // 각 라인 제품 매칭 (AI 학습 사례 우선 + tolerance + fuzzy + candidates top1 자동 매칭)
    const resolved = [];
    const missingDetails = [];
    const autoMatchedDetails = []; // candidates top1으로 자동 매칭된 항목
    for (const it of items) {
      const pname = (it.productName || '').trim();
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const unitPriceHint = Number(it.unitPrice || 0);
      const categoryHint = (it.categoryHint || '').trim().toLowerCase();
      if (!pname) continue;

      // 🎯 카테고리 힌트 — 해당 카테고리 제품으로 우선 검색
      let searchPool = products;
      if (categoryHint) {
        const filtered = products.filter((p) => (p?.category || '').toLowerCase().includes(categoryHint));
        if (filtered.length > 0) searchPool = filtered;
      }

      let product = findProductSmart(pname, searchPool, aiLearningData);
      let autoMatched = false;
      let originalInput = null;
      let alternatives = []; // 자동 매칭됐을 때 다른 후보 (모달 dropdown용)
      if (!product) {
        // 🎯 candidates top1 자동 매칭 (정확도 boost)
        const candidates = findProductCandidates(pname, searchPool);
        // 🎯 가격 역조회 — 후보 중 unitPriceHint 일치 제품 우선
        let pickName = candidates[0];
        if (unitPriceHint > 0 && candidates.length > 1) {
          const priceMatch = candidates.find((cn) => {
            const cp = searchPool.find((p) => p.name === cn);
            if (!cp) return false;
            const w = Number(cp.wholesale || 0);
            const r = Number(cp.retail || 0);
            return Math.abs(w - unitPriceHint) <= unitPriceHint * 0.1 || Math.abs(r - unitPriceHint) <= unitPriceHint * 0.1;
          });
          if (priceMatch) pickName = priceMatch;
        }
        if (pickName) {
          product = searchPool.find((p) => p.name === pickName);
          if (product) {
            autoMatched = true;
            originalInput = pname;
            alternatives = candidates.filter((c) => c !== pickName).slice(0, 3);
            autoMatchedDetails.push({ input: pname, matched: product.name, alternatives });
          }
        }
        if (!product) {
          missingDetails.push({ name: pname, candidates });
          continue;
        }
      }
      const unitPrice = Number(product[priceType] || product.wholesale || product.retail) || 0;
      resolved.push({
        id: product.id,
        name: product.name,
        price: unitPrice,
        wholesale: Number(product.wholesale) || 0,
        retail: Number(product.retail) || 0,
        quantity: qty,
        autoMatched,
        originalInput,
        alternatives, // 모달에서 dropdown으로 변경 가능
        zeroPrice: unitPrice <= 0, // 단가 0원 플래그 (모달에서 강조)
      });
    }
    if (missingDetails.length > 0 && resolved.length === 0) {
      // 모든 항목이 후보도 못 찾은 경우만 에러
      const lines = missingDetails.map((m) => {
        const hint = m.candidates.length > 0 ? ` (혹시 이거? ${m.candidates.join(' / ')})` : '';
        return `- "${m.name}"${hint}`;
      }).join('\n');
      return { ok: false, error: `다음 제품을 찾지 못했습니다:\n${lines}\n\n정확한 제품명으로 다시 시도해주세요.` };
    }
    if (resolved.length === 0) {
      return { ok: false, error: '유효한 주문 항목이 없습니다.' };
    }
    const total = resolved.reduce((acc, r) => acc + r.price * r.quantity, 0);
    const warnings = [];
    const issues = []; // 모달에서 확인 필요한 항목 구조화 (UI에서 활용)

    // 거래처 미확정 — 자동 신규 등록 금지, 사용자 명시 클릭 필요
    if (!customer) {
      if (customerCandidates.length > 0) {
        const names = customerCandidates.map((c) => `"${c.name}"`).join(' / ');
        warnings.push(`❓ "${customerName}" 거래처가 DB에 정확히 없어요. 혹시 ${names}?`);
        issues.push({ field: 'customer', kind: 'candidate', input: customerName, candidates: customerCandidates });
      } else {
        warnings.push(`❌ "${customerName}" 거래처가 DB에 없습니다. 신규 등록하시려면 [수정] 버튼에서 명시적으로 등록해주세요.`);
        issues.push({ field: 'customer', kind: 'missing', input: customerName });
      }
    }

    // 단가 0원 — 강한 경고
    const zeroPriceItems = resolved.filter((r) => r.zeroPrice);
    if (zeroPriceItems.length > 0) {
      const names = zeroPriceItems.map((r) => `"${r.name}"`).join(', ');
      warnings.push(`⚠️ 단가 0원 항목: ${names} — 수정 모달에서 단가를 입력해주세요.`);
      zeroPriceItems.forEach((r) => {
        issues.push({ field: 'item-price', kind: 'zero-price', productId: r.id, productName: r.name });
      });
    }

    // 자동 매칭된 항목 — 확인 필요
    autoMatchedDetails.forEach((d, idx) => {
      const alt = d.alternatives.length > 0 ? ` · 다른 후보: ${d.alternatives.join(' / ')}` : '';
      warnings.push(`🔄 "${d.input}" → "${d.matched}"로 자동 매칭됨${alt}`);
      issues.push({ field: 'item-product', kind: 'auto-matched', input: d.input, matchedName: d.matched, alternatives: d.alternatives });
    });

    // 매칭 실패 라인 (제외됨)
    if (missingDetails.length > 0) {
      const lines = missingDetails.map((m) => `"${m.name}"${m.candidates.length > 0 ? ` (후보: ${m.candidates.slice(0, 2).join(', ')})` : ''}`).join(', ');
      warnings.push(`❌ 매칭 실패 ${missingDetails.length}건: ${lines} — 자동 제외됨.`);
      missingDetails.forEach((m) => {
        issues.push({ field: 'item-missing', kind: 'missing', input: m.name, candidates: m.candidates });
      });
    }

    const lines = resolved.map((r) => {
      const mark = r.autoMatched ? ' 🔄' : '';
      const priceMark = r.zeroPrice ? ' ⚠️0원' : '';
      return `  • ${r.name}${mark}${priceMark} × ${r.quantity} = ${(r.price * r.quantity).toLocaleString('ko-KR')}원 (단가 ${r.price.toLocaleString('ko-KR')})${r.originalInput ? ` [입력: "${r.originalInput}"]` : ''}`;
    }).join('\n');

    return {
      ok: true,
      data: {
        __pending: true,
        action: 'saveOrder',
        params: {
          customerName: customerLabel,
          customerId: customer?.id || null,
          customerExists: Boolean(customer),
          customerPhone: customer?.phone || '',
          customerAddress: customer?.address || '',
          customerCandidates, // 모달 dropdown 후보 (id, name, phone, address, score)
          priceType,
          items: resolved,
          total,
          memo: memo || null,
          needsConfirmation: !customer || zeroPriceItems.length > 0 || autoMatchedDetails.length > 0 || missingDetails.length > 0,
        },
        warnings,
        // issues: 향후 확장용 — UI에서 issue별 inline indicator/액션 버튼 매핑 가능 (현재는 warnings 텍스트만 표시)
        issues,
        preview: `🛒 주문 등록\n• 거래처: ${customerLabel}${customer ? '' : ' ❓미확정'}\n• 가격: ${priceType === 'retail' ? '소비자가' : '도매가'} 기준\n• 항목 ${resolved.length}건:\n${lines}\n\n💰 합계: ${total.toLocaleString('ko-KR')}원 (VAT 포함)`,
      },
    };
  }
  if (name === 'updateCustomer') {
    const { customerName, customerId, phone, address, newName, isBlacklist } = args;
    if (phone == null && address == null && newName == null && isBlacklist == null) {
      return { ok: false, error: '전화번호·주소·새 상호·블랙리스트 중 하나는 지정해야 합니다.' };
    }
    let target = null;
    if (customerId != null) target = customers.find((c) => c.id === customerId);
    if (!target && customerName) {
      const lower = customerName.trim().toLowerCase();
      target = customers.find((c) => (c?.name || '').toLowerCase() === lower)
            || customers.find((c) => (c?.name || '').toLowerCase().includes(lower));
    }
    if (!target) {
      return { ok: false, error: `거래처 "${customerName || customerId}"을(를) 찾을 수 없습니다.` };
    }
    const patch = {};
    const lines = [`🏢 거래처 정보 변경`, `• 이름: ${target.name}`];
    if (phone != null) {
      patch.phone = phone.trim();
      lines.push(`• 전화: ${target.phone || '(없음)'} → ${patch.phone || '(삭제)'}`);
    }
    if (address != null) {
      patch.address = address.trim();
      lines.push(`• 주소: ${target.address || '(없음)'} → ${patch.address || '(삭제)'}`);
    }
    if (newName != null && String(newName).trim() && String(newName).trim() !== target.name) {
      patch.name = String(newName).trim();
      lines.push(`• 상호: ${target.name} → ${patch.name} (과거 주문·이력 자동 이전)`);
    }
    if (isBlacklist != null) {
      patch.is_blacklist = Boolean(isBlacklist);
      lines.push(`• 블랙리스트: ${target.is_blacklist ? '지정됨' : '아님'} → ${patch.is_blacklist ? '🚫 지정' : '✅ 해제'}`);
    }
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'updateCustomer',
        params: { customerId: target.id, customerName: target.name, ...patch },
        warnings: [],
        preview: lines.join('\n'),
      },
    };
  }
  if (name === 'bulkUpdateCustomer') {
    const { updates } = args;
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: false, error: '변경할 거래처 항목이 없습니다.' };
    }
    const resolved = [];
    const missing = [];
    const invalid = [];
    for (const u of updates) {
      const customerName = (u?.customerName || '').trim();
      if (u?.phone == null && u?.address == null && u?.newName == null && u?.isBlacklist == null) {
        invalid.push(customerName || String(u?.customerId || '(거래처명 없음)'));
        continue;
      }
      let target = null;
      if (u?.customerId != null) target = customers.find((c) => c.id === u.customerId);
      if (!target && customerName) {
        const lower = customerName.toLowerCase();
        target = customers.find((c) => (c?.name || '').toLowerCase() === lower)
              || customers.find((c) => (c?.name || '').toLowerCase().includes(lower));
      }
      if (!target) {
        missing.push(customerName || String(u?.customerId || '(거래처명 없음)'));
        continue;
      }
      const patch = {};
      if (u.phone != null) patch.phone = String(u.phone).trim();
      if (u.address != null) patch.address = String(u.address).trim();
      if (u.newName != null && String(u.newName).trim() && String(u.newName).trim() !== target.name) patch.newName = String(u.newName).trim();
      if (u.isBlacklist != null) patch.isBlacklist = !!u.isBlacklist;
      resolved.push({
        customerId: target.id,
        customerName: target.name,
        inputName: customerName,
        oldPhone: target.phone || '',
        oldAddress: target.address || '',
        oldBlacklist: !!target.is_blacklist,
        ...patch,
      });
    }
    if (resolved.length === 0) {
      const missingPart = missing.length > 0 ? `\n찾을 수 없음: ${missing.join(', ')}` : '';
      const invalidPart = invalid.length > 0 ? `\n변경값 없음: ${invalid.join(', ')}` : '';
      return { ok: false, error: `변경 가능한 거래처 항목이 없습니다.${missingPart}${invalidPart}` };
    }
    const previewLines = resolved.map((r) => {
      const changes = [
        r.newName !== undefined ? `상호 ${r.customerName} → ${r.newName}` : null,
        r.isBlacklist !== undefined ? (r.isBlacklist ? '🚫 블랙리스트 지정' : '✅ 블랙리스트 해제') : null,
        r.phone !== undefined ? `전화 ${r.oldPhone || '(없음)'} → ${r.phone || '(삭제)'}` : null,
        r.address !== undefined ? `주소 ${r.oldAddress || '(없음)'} → ${r.address || '(삭제)'}` : null,
      ].filter(Boolean).join(' / ');
      const nameMatch = r.inputName && r.inputName !== r.customerName ? ` (입력: "${r.inputName}")` : '';
      return `• ${r.customerName}: ${changes}${nameMatch}`;
    }).join('\n');
    const missingPart = missing.length > 0
      ? `\n\n⚠️ 찾을 수 없는 ${missing.length}개:\n` + missing.map((m) => `- ${m}`).join('\n')
      : '';
    const warnings = [];
    if (missing.length > 0) warnings.push(`⚠️ ${missing.length}개 거래처를 찾지 못했습니다.`);
    if (invalid.length > 0) warnings.push(`⚠️ ${invalid.length}개 라인은 변경값(전화/주소/상호/블랙)이 없어 제외됩니다.`);
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkUpdateCustomer',
        params: { updates: resolved, missing, invalid },
        warnings,
        preview: `🏢 거래처 정보 일괄 변경 (${resolved.length}건)\n\n${previewLines}${missingPart}`,
      },
    };
  }
  if (name === 'bulkUpdateProductStock') {
    const { updates } = args;
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: false, error: '변경할 항목이 없습니다.' };
    }
    const resolved = [];
    const missing = [];
    for (const u of updates) {
      const pname = (u?.productName || '').trim();
      const newStock = Math.max(0, Math.floor(Number(u?.newStock) || 0));
      if (!pname) continue;
      const product = findProductSmart(pname, products, aiLearningData);
      if (!product) {
        missing.push({ name: pname, candidates: findProductCandidates(pname, products) });
        continue;
      }
      const oldStock = Number(product.stock) || 0;
      resolved.push({
        productId: product.id,
        productName: product.name,
        inputName: pname,
        oldStock,
        newStock,
        diff: newStock - oldStock,
      });
    }
    if (resolved.length === 0) {
      const lines = missing.map((m) => {
        const hint = m.candidates.length > 0 ? ` (혹시? ${m.candidates.slice(0, 3).join(' / ')})` : '';
        return `- "${m.name}"${hint}`;
      }).join('\n');
      return { ok: false, error: `매칭된 제품이 없습니다:\n${lines}` };
    }
    // 총 변동량
    const totalIn = resolved.filter((r) => r.diff > 0).reduce((acc, r) => acc + r.diff, 0);
    const totalOut = resolved.filter((r) => r.diff < 0).reduce((acc, r) => acc + Math.abs(r.diff), 0);
    // preview 라인 (입력 → 실제 매칭된 이름, 변동 표시)
    const previewLines = resolved.map((r) => {
      const sign = r.diff > 0 ? `+${r.diff}` : `${r.diff}`;
      const arrow = r.diff > 0 ? '↑' : r.diff < 0 ? '↓' : '→';
      const nameMatch = r.inputName !== r.productName ? ` (입력: "${r.inputName}")` : '';
      return `${arrow} ${r.productName}: ${r.oldStock} → ${r.newStock} (${sign})${nameMatch}`;
    }).join('\n');
    const missingPart = missing.length > 0
      ? `\n\n⚠️ 매칭 못한 ${missing.length}개:\n` + missing.map((m) => `- ${m.name}`).join('\n')
      : '';
    const warnings = [];
    if (totalOut > 50) warnings.push(`⚠️ 재고 ${totalOut}개 감소 (큰 변동)`);
    if (missing.length > 0) warnings.push(`⚠️ ${missing.length}개 라인이 매칭 실패 — 정확한 이름으로 다시 시도 필요`);
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkUpdateProductStock',
        params: {
          updates: resolved,
          missing,
          totalIn,
          totalOut,
        },
        warnings,
        preview: `📦 재고 일괄 변경 (${resolved.length}건)\n\n${previewLines}\n\n📊 합계: 입고 +${totalIn} / 출고 -${totalOut}${missingPart}`,
      },
    };
  }
  if (name === 'updateProductPrice') {
    const { productName, productId, wholesale, retail } = args;
    if (wholesale == null && retail == null) {
      // 🤔 가격 종류 불명확 → 추측 실행 대신 되묻기 (Clarification)
      const who = productName || productId || '해당 제품';
      return { ok: true, data: { __clarification: true, question: `💬 "${who}" 가격을 **도매가**로 바꿀까요, **소비자가(판매가)**로 바꿀까요?\n어느 쪽을 얼마로 변경할지 알려주시면 처리할게요.` } };
    }
    let target = null;
    if (productId != null) target = products.find((p) => p.id === productId);
    if (!target && productName) {
      target = findProductSmart(productName, products, aiLearningData);
    }
    if (!target) {
      const candidates = productName ? findProductCandidates(productName, products) : [];
      const hint = candidates.length > 0 ? `\n\n비슷한 후보: ${candidates.join(' / ')}` : '';
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다.${hint}` };
    }
    const params = { productId: target.id, productName: target.name };
    const lines = [`💰 가격 변경`, `• 제품: ${target.name}`];
    if (wholesale != null && Number.isFinite(Number(wholesale)) && Number(wholesale) > 0) {
      params.wholesale = Number(wholesale);
      lines.push(`• 도매가: ${(Number(target.wholesale) || 0).toLocaleString('ko-KR')}원 → ${params.wholesale.toLocaleString('ko-KR')}원`);
    }
    if (retail != null && Number.isFinite(Number(retail)) && Number(retail) > 0) {
      params.retail = Number(retail);
      lines.push(`• 소비자가: ${(Number(target.retail) || 0).toLocaleString('ko-KR')}원 → ${params.retail.toLocaleString('ko-KR')}원`);
    }
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'updateProductPrice',
        params,
        warnings: [],
        preview: lines.join('\n'),
      },
    };
  }
  if (name === 'updateOrderMemo') {
    const { orderNumber, customerName, memo, mode } = args;
    if (!memo || !String(memo).trim()) return { ok: false, error: '메모 내용이 필요합니다.' };
    let target = null;
    if (orderNumber) {
      const on = String(orderNumber).trim();
      target = orders.find((o) => String(o.orderNumber || o.id) === on);
    }
    if (!target && customerName) {
      const nq = String(customerName).trim().toLowerCase();
      target = [...orders]
        .filter((o) => String(o.customerName || o.customer_name || '').toLowerCase().includes(nq))
        .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))[0] || null;
    }
    if (!target) return { ok: false, error: `주문을 찾을 수 없습니다 (${orderNumber || customerName || '조건 없음'}). 주문번호나 거래처명을 알려주세요.` };
    const oldMemo = String(target.memo || '').trim();
    const newMemoText = String(memo).trim();
    const finalMemo = (mode === 'replace' || !oldMemo) ? newMemoText : `${oldMemo}\n${newMemoText}`;
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'updateOrderMemo',
        params: { orderId: target.orderNumber || target.id, customerName: target.customerName || target.customer_name || '', memo: finalMemo },
        warnings: [],
        preview: `📝 주문 메모 ${mode === 'replace' ? '교체' : '추가'}\n• 주문: ${target.orderNumber || target.id} (${target.customerName || ''})\n• 내용: ${newMemoText}${oldMemo && mode !== 'replace' ? `\n(기존 메모 뒤에 추가됨)` : ''}`,
      },
    };
  }
  if (name === 'updateProductName') {
    const { productName, productId, newName, appendText, scope } = args;
    if ((!newName || !String(newName).trim()) && (!appendText || !String(appendText).trim())) {
      return { ok: false, error: 'newName(전체 교체) 또는 appendText(뒤에 덧붙임) 중 하나가 필요합니다.' };
    }
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
    let targets = [];
    if (productId != null) { const t = products.find((p) => p.id === productId); if (t) targets = [t]; }
    else if (scope === 'all' && productName) { const ql = norm(productName); targets = products.filter((p) => norm(p.name).includes(ql)); }
    else if (productName) { const t = findProductSmart(productName, products, aiLearningData); if (t) targets = [t]; }
    if (targets.length === 0) {
      const candidates = productName ? findProductCandidates(productName, products) : [];
      const hint = candidates.length > 0 ? `\n\n비슷한 후보: ${candidates.join(' / ')}` : '';
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다.${hint}` };
    }
    // 새 이름 계산 — newName(교체) 우선, 아니면 기존 이름 + appendText. 이미 붙어있으면 중복 방지
    const buildName = (p) => {
      if (newName && String(newName).trim()) return String(newName).trim();
      const app = String(appendText);
      return String(p.name).includes(app.trim()) ? p.name : `${p.name}${app}`;
    };
    const changed = targets.map((p) => ({ p, nn: buildName(p) })).filter((x) => x.nn !== x.p.name);
    if (changed.length === 0) {
      return { ok: false, error: `변경할 이름이 없습니다 — 대상 ${targets.length}개 모두 이미 적용된 상태입니다.` };
    }
    if (changed.length === 1) {
      const { p, nn } = changed[0];
      return { ok: true, data: { __pending: true, action: 'updateProductName', params: { productId: p.id, oldName: p.name, name: nn }, warnings: [], preview: `✏️ 제품명 변경\n• ${p.name}\n→ ${nn}` } };
    }
    const updates = changed.map(({ p, nn }) => ({ productId: p.id, oldName: p.name, name: nn }));
    const previewLines = updates.slice(0, 8).map((u) => `• ${u.oldName}\n   → ${u.name}`);
    const preview = `✏️ 제품명 일괄 변경 (${updates.length}건)\n${previewLines.join('\n')}${updates.length > 8 ? `\n…외 ${updates.length - 8}건` : ''}`;
    return { ok: true, data: { __pending: true, action: 'bulkUpdateProductName', params: { updates }, warnings: [], preview } };
  }
  if (name === 'revertProductPrice') {
    const { productName, productId, scope } = args;
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
    // 대상 제품 수집
    let targets = [];
    if (productId != null) {
      const t = products.find((p) => p.id === productId);
      if (t) targets = [t];
    } else if (scope === 'all' && productName) {
      const ql = norm(productName);
      targets = products.filter((p) => norm(p.name).includes(ql));
    } else if (productName) {
      const t = findProductSmart(productName, products, aiLearningData);
      if (t) targets = [t];
    }
    if (targets.length === 0) {
      const candidates = productName ? findProductCandidates(productName, products) : [];
      const hint = candidates.length > 0 ? `\n\n비슷한 후보: ${candidates.join(' / ')}` : '';
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다.${hint}` };
    }
    // 초기값 존재 + 현재가≠원본가 인 것만 복원 대상
    const revertable = [];
    for (const p of targets) {
      const iw = p.initial_wholesale != null ? Number(p.initial_wholesale) : null;
      const ir = p.initial_retail != null ? Number(p.initial_retail) : null;
      const wDiff = iw != null && iw !== Number(p.wholesale || 0);
      const rDiff = ir != null && ir !== Number(p.retail || 0);
      if (wDiff || rDiff) {
        revertable.push({ p, iw, ir, wDiff, rDiff });
      }
    }
    if (revertable.length === 0) {
      return { ok: false, error: `복원할 변경 내역이 없습니다 — 대상 ${targets.length}개 모두 이미 원본 금액입니다.` };
    }
    // 단일 → updateProductPrice 액션 재사용 / 복수 → bulkUpdateProductPrice 액션 재사용
    if (revertable.length === 1) {
      const { p, iw, ir, wDiff, rDiff } = revertable[0];
      const params = { productId: p.id, productName: p.name };
      const lines = [`↩️ 원본가 복원`, `• 제품: ${p.name}`];
      if (wDiff) { params.wholesale = iw; lines.push(`• 도매가: ${Number(p.wholesale || 0).toLocaleString('ko-KR')}원 → ${iw.toLocaleString('ko-KR')}원 (원본)`); }
      if (rDiff) { params.retail = ir; lines.push(`• 소비자가: ${Number(p.retail || 0).toLocaleString('ko-KR')}원 → ${ir.toLocaleString('ko-KR')}원 (원본)`); }
      return { ok: true, data: { __pending: true, action: 'updateProductPrice', params, warnings: [], preview: lines.join('\n') } };
    }
    const updates = revertable.map(({ p, iw, ir, wDiff, rDiff }) => {
      const u = { productId: p.id, productName: p.name };
      if (wDiff) u.wholesale = iw;
      if (rDiff) u.retail = ir;
      return u;
    });
    const previewLines = revertable.slice(0, 15).map(({ p, iw, ir, wDiff, rDiff }) => {
      const parts = [];
      if (wDiff) parts.push(`도매 ${Number(p.wholesale || 0).toLocaleString('ko-KR')}→${iw.toLocaleString('ko-KR')}`);
      if (rDiff) parts.push(`소비자 ${Number(p.retail || 0).toLocaleString('ko-KR')}→${ir.toLocaleString('ko-KR')}`);
      return `• ${p.name}: ${parts.join(' / ')}`;
    }).join('\n');
    const more = revertable.length > 15 ? `\n…외 ${revertable.length - 15}건` : '';
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkUpdateProductPrice',
        params: { updates },
        warnings: [],
        preview: `↩️ 원본가 일괄 복원 (${revertable.length}건)\n\n${previewLines}${more}`,
      },
    };
  }
  if (name === 'bulkUpdateProductPrice') {
    const { updates } = args;
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: false, error: '변경할 가격 항목이 없습니다.' };
    }
    const resolved = [];
    const missing = [];
    const invalid = [];
    for (const u of updates) {
      const pname = (u?.productName || '').trim();
      const wholesale = u?.wholesale != null ? Number(u.wholesale) : null;
      const retail = u?.retail != null ? Number(u.retail) : null;
      if ((wholesale == null || !(wholesale > 0)) && (retail == null || !(retail > 0))) {
        invalid.push(pname || String(u?.productId || '(제품명 없음)'));
        continue;
      }
      let product = null;
      if (u?.productId != null) product = products.find((p) => p.id === u.productId);
      if (!product && pname) product = findProductSmart(pname, products, aiLearningData);
      if (!product) {
        missing.push({ name: pname || String(u?.productId || '(제품명 없음)'), candidates: pname ? findProductCandidates(pname, products) : [] });
        continue;
      }
      const patch = {};
      if (wholesale != null && wholesale > 0) patch.wholesale = wholesale;
      if (retail != null && retail > 0) patch.retail = retail;
      resolved.push({
        productId: product.id,
        productName: product.name,
        inputName: pname,
        oldWholesale: Number(product.wholesale) || 0,
        oldRetail: Number(product.retail) || 0,
        ...patch,
      });
    }
    if (resolved.length === 0) {
      const missingLines = missing.map((m) => {
        const hint = m.candidates.length > 0 ? ` (혹시? ${m.candidates.slice(0, 3).join(' / ')})` : '';
        return `- "${m.name}"${hint}`;
      }).join('\n');
      const invalidPart = invalid.length > 0 ? `\n가격 확인 필요: ${invalid.join(', ')}` : '';
      return { ok: false, error: `변경 가능한 제품 가격 항목이 없습니다.${missingLines ? `\n${missingLines}` : ''}${invalidPart}` };
    }
    const previewLines = resolved.map((r) => {
      const changes = [
        r.wholesale != null ? `도매 ${r.oldWholesale.toLocaleString('ko-KR')}원 → ${r.wholesale.toLocaleString('ko-KR')}원` : null,
        r.retail != null ? `소비자 ${r.oldRetail.toLocaleString('ko-KR')}원 → ${r.retail.toLocaleString('ko-KR')}원` : null,
      ].filter(Boolean).join(' / ');
      const nameMatch = r.inputName && r.inputName !== r.productName ? ` (입력: "${r.inputName}")` : '';
      return `• ${r.productName}: ${changes}${nameMatch}`;
    }).join('\n');
    const missingPart = missing.length > 0
      ? `\n\n⚠️ 매칭 못한 ${missing.length}개:\n` + missing.map((m) => `- ${m.name}`).join('\n')
      : '';
    const warnings = [];
    if (missing.length > 0) warnings.push(`⚠️ ${missing.length}개 라인이 매칭 실패 — 정확한 제품명으로 다시 시도 필요`);
    if (invalid.length > 0) warnings.push(`⚠️ ${invalid.length}개 라인은 유효한 가격이 없어 제외됩니다.`);
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'bulkUpdateProductPrice',
        params: { updates: resolved, missing, invalid },
        warnings,
        preview: `💰 가격 일괄 변경 (${resolved.length}건)\n\n${previewLines}${missingPart}`,
      },
    };
  }
  return { ok: false, error: `Unknown write tool: ${name}` };
}

// === DB 메타 컨텍스트 생성 (AI 정확도 ↑) ===
// 시스템 프롬프트에 동적 주입되어 AI가 큰 그림을 파악한 상태에서 도구 호출
export function buildContextMeta(context = {}) {
  const {
    products = [], customers = [], orders = [],
    paymentRecords = [], paymentHistory = [],
    customerReturns = [], savedCarts = [], aiLearningData = [],
    externalOrders = [],
  } = context;

  // 스마트스토어(네이버) 요약 — getSmartstoreOrders와 동일 기준
  const ssSummary = getSmartstoreOrders(externalOrders, { filter: 'pending', limit: 0 });

  // 카테고리별 제품 수 (전체)
  const catCount = {};
  products.forEach((p) => {
    const c = p?.category || '미분류';
    catCount[c] = (catCount[c] || 0) + 1;
  });
  const categories = Object.entries(catCount)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, n]) => `${cat}(${n})`)
    .join(', ');

  // 카테고리별 대표 제품 (각 카테고리 첫 3개)
  const catSamples = {};
  Object.keys(catCount).forEach((cat) => {
    catSamples[cat] = products
      .filter((p) => (p?.category || '미분류') === cat)
      .slice(0, 3)
      .map((p) => p.name)
      .join(' / ');
  });
  const catSampleLines = Object.entries(catSamples)
    .slice(0, 10)
    .map(([cat, sample]) => `  • ${cat}: ${sample}`)
    .join('\n');

  // 거래처 매출 집계
  const customerRevenue = {};
  const customerOrderCount = {};
  orders.forEach((o) => {
    const k = o?.customerName || (customers.find((c) => c.id === o?.customerId)?.name);
    if (k) {
      customerRevenue[k] = (customerRevenue[k] || 0) + Number(o.total || 0);
      customerOrderCount[k] = (customerOrderCount[k] || 0) + 1;
    }
  });
  // 매출 TOP 100 거래처
  const topCustomers = Object.entries(customerRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 100)
    .map(([n]) => n)
    .join(', ');

  // 최근 7일/30일 활동
  const now = new Date();
  const cutoff7 = new Date(now); cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);
  const recent7 = orders.filter((o) => o?.orderDate && new Date(o.orderDate) >= cutoff7);
  const recent30 = orders.filter((o) => o?.orderDate && new Date(o.orderDate) >= cutoff30);
  const recent7Revenue = recent7.reduce((s, o) => s + Number(o.total || 0), 0);
  const recent30Revenue = recent30.reduce((s, o) => s + Number(o.total || 0), 0);
  const recent7Customers = new Set(recent7.map((o) => o?.customerName || o?.customerId).filter(Boolean)).size;

  // 재고 상태
  const outOfStock = products.filter((p) => Number(p?.stock || 0) === 0).length;
  const lowStock = products.filter((p) => {
    const s = Number(p?.stock || 0);
    return s > 0 && s <= 5;
  }).length;
  const incomingStock = products.filter((p) => Number(p?.stock || 0) < 0).length;
  const totalStockValue = products.reduce((s, p) => s + Number(p?.wholesale || 0) * Math.max(0, Number(p?.stock || 0)), 0);

  // 미수금 합계
  const overdueTotal = paymentRecords.reduce((s, r) => s + Math.max(0, Number(r?.balance || 0)), 0);
  const overdueCount = paymentRecords.filter((r) => Number(r?.balance || 0) > 0).length;

  // 반품 최근 30일
  const recentReturns = customerReturns.filter((r) => {
    const d = r?.returnDate || r?.created_at;
    return d && new Date(d) >= cutoff30;
  }).length;

  // TOP 5 매출 거래처 (간단 요약용)
  const top5 = Object.entries(customerRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([n, r]) => `${n}(${Math.round(r / 10000)}만)`)
    .join(', ');

  // TOP 5 인기 제품 (수량 기준)
  const productQty = {};
  orders.forEach((o) => {
    (o?.items || []).forEach((it) => {
      const k = it?.name || it?.productName;
      if (k) productQty[k] = (productQty[k] || 0) + Number(it.quantity || 0);
    });
  });
  const top5Products = Object.entries(productQty)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([n, q]) => `${n}(${q}개)`)
    .join(', ');

  return `\n\n## 📊 현재 DB 메타 (질문 답변 시 반드시 참고)

### 규모 요약
- 제품 ${products.length}개 · 거래처 ${customers.length}곳 · 주문 ${orders.length}건
- 저장 장바구니 ${savedCarts.length}건 · 반품(전체) ${customerReturns.length}건 · AI 학습 ${aiLearningData.length}건
- 결제 기록 ${paymentRecords.length}건 · 입금 이력 ${paymentHistory.length}건

### 제품 카테고리 (전체 ${Object.keys(catCount).length}종)
${categories || '(없음)'}

### 카테고리별 대표 제품 (각 3건)
${catSampleLines || '(없음)'}

### 거래처 (매출 TOP 100)
${topCustomers || '(데이터 없음)'}

### TOP 5 매출 거래처
${top5 || '(데이터 없음)'}

### TOP 5 인기 제품 (수량)
${top5Products || '(데이터 없음)'}

### 재고 상태
- 정상 ${products.length - outOfStock - lowStock - incomingStock}건 · 부족(≤5) ${lowStock}건 · 품절 ${outOfStock}건 · 입고대기 ${incomingStock}건
- 총 재고 가치 (도매가 기준): ${Math.round(totalStockValue / 10000).toLocaleString('ko-KR')}만원

### 최근 활동
- 최근 7일: 주문 ${recent7.length}건, 매출 ${Math.round(recent7Revenue / 10000).toLocaleString('ko-KR')}만원, 활동 거래처 ${recent7Customers}곳
- 최근 30일: 주문 ${recent30.length}건, 매출 ${Math.round(recent30Revenue / 10000).toLocaleString('ko-KR')}만원
- 최근 30일 반품 ${recentReturns}건

### 미수금
- 미수 거래처 ${overdueCount}곳, 미수금 합계 ${Math.round(overdueTotal / 10000).toLocaleString('ko-KR')}만원

### 🛒 스마트스토어(네이버) 주문
- 전체 ${ssSummary.total}건 · 처리대기(발주확인·발송 전) ${ssSummary.pendingCount}건 · 발송기한 초과 ${ssSummary.dispatchOverdue}건 · 오늘 발송마감 ${ssSummary.dispatchDueToday}건
- 상태별: 결제완료 ${ssSummary.counts['결제완료']} / 발주확인 ${ssSummary.counts['발주확인']} / 발송 ${ssSummary.counts['발송']} / 배송중 ${ssSummary.counts['배송중']} / 배송완료 ${ssSummary.counts['배송완료']} / 취소 ${ssSummary.counts['취소']}
- 스토어 주문 상세는 getSmartstoreOrders 도구로 조회 (목록·발송기한 등)

### 🧠 AI 학습 매칭 사례 (최우선 적용 — 동일/유사 입력 시 이 매핑 따를 것)
${aiLearningData.length > 0
  ? aiLearningData
      .slice(0, 15)
      .map((l) => `- "${(l?.original_text || '').slice(0, 40)}" → "${(l?.product_name || '').slice(0, 40)}"`)
      .join('\n')
  : '(학습 사례 없음)'}

## 🛠️ 사용 가능 도구 카탈로그 (36개)

### 🎯 고급 분석 (Codex 제안 5종 — 사장님께 실제 가치)
- getCollectionPlan({limit?}) — 미수 회수 액션 플래너 (우선순위 + 톤별 연락 문구)
- getStockCoverageForecast({periodDays?, maxDaysLeft?}) — 품절 예상일 (며칠 뒤 떨어질지)
- getNextBestOffers({customerName}) — 거래처별 권할 만한 다음 제품
- getProductBundleSuggestions({productName}) — 같이 팔린 부품 (묶음 업셀)
- getMarginLeakage({periodDays?, minMarginRate?}) — 마진 누수 (가격 인상 후보)

### 🔮 시뮬레이션 + 변수 분석 (4종 — What-If 의사 결정)
- simulatePriceChange({productName, changePct, elasticity?}) — 가격 변동 시 매출/마진 시뮬레이션
- simulateRestock({productName, restockQty}) — 발주 시 며칠치 재고/비용/예상 매출/ROI
- getRevenueVolatility({periodDays?}) — 매출 변동성 + 트렌드 + 이상치 자동 탐지
- getCustomerLifetimeValue({limit?}) — 거래처 LTV 추정 (미래 12개월 예상)

### 단일 조회
- getProductInfo({productName}) — 제품 1개 상세 (fuzzy 매칭)
- getPriceHistory({productName, scope}) — 단가 변경 이력 + 초기 원본가 ("원래 얼마였어", "인테이크 단가 이력", scope="all"=키워드 포함 전체)
- getCustomerInfo({customerName}) — 거래처 1곳 상세 (매출/미수/TOP 제품)

### 키워드 검색 (복수)
- searchProducts({keyword, limit?}) — **우리 POS DB** 제품 검색 ("X들/X 종류")
- searchNaverCatalog({keyword, limit?, inStockOnly?}) — **네이버 스토어(엠파츠) 등록 상품·옵션** 검색. "네이버/스토어/엠파츠에 올라간·등록된 상품", "스토어에 X 있어?", "엠파츠 옵션" → 이 도구
- searchCustomers({keyword, limit?}) — 거래처 부분 검색

### 거래처 분석
- getTopCustomers({period, limit?}) — 매출 TOP N
- getCustomerTrend({customerName, period}) — 시간 추이
- getCustomerSegments({period}) — VIP/일반/신규 RFM
- getDormantCustomers({days}) — 휴면 거래처
- getCustomerProductAffinity({customerName?}) — 구매 패턴

### 제품 분석
- getTopProducts({period, limit?}) — 인기 제품
- getProductTrend({productName, period}) — 시간 추이
- getRepeatPurchaseGap({productName?}) — 재주문 주기

### 재고 분석
- getLowStockProducts({threshold?}) — 부족 제품
- getStockSummary({lowThreshold?}) — 전체 요약
- getProductsByStockStatus({status}) — incoming/out/normal
- getRestockRecommendations({stockThreshold?, salesPeriod?}) — 재주문 추천

### 결제/미수
- getPaymentSummary() — 완납/부분/미수 카운트
- getOverdueCustomers({minDays?, minBalance?}) — 미수 거래처 TOP
- getPaymentInflow({period}) — 입금 이력

### 반품/장바구니/학습
- getReturnAnalysis({period}) — 반품 통계
- getPendingCarts({}) — 저장 장바구니
- getLearningStats({}) — AI 학습 통계

### 🛒 스마트스토어(네이버) 주문
- getSmartstoreOrders({filter?, limit?}) — 스토어 주문 현황 (처리대기/발송기한/상태별 카운트 + 목록). filter: pending(기본)/dispatch_due/today/all

### 종합
- getCompositeSummary({period}) — 종합 KPI

### 쓰기 (Confirm 모달 표시)
- addProduct / addCustomer / updateProductStock / updateProductPrice / revertProductPrice / updateCustomer / saveOrder
- revertProductPrice({productName, scope}) — 가격을 초기 원본가로 복원 ("원본가로 되돌려", "원래대로", scope="all"=키워드 포함 전체 일괄)
- bulkAddProduct / bulkAddCustomer / bulkUpdateProductStock / bulkUpdateProductPrice / bulkUpdateCustomer

## ⚠️ 활용 규칙 (필독)
1. **메타에 있는 카테고리/거래처/제품은 확실히 존재** → 정확한 도구로 호출
2. **메타에 없는 이름이면** → "DB에 [이름]은 없는 것 같아요. 혹시 [유사 카테고리/거래처]?" 식으로 되묻기
3. **추측 금지** — 메타에 없는 데이터를 만들어내지 말 것
4. **단수 vs 복수**: "X" → getProductInfo / "X들·X 종류·X 뭐있어" → searchProducts
5. **숫자 규격 보존**: "54-30", "38-45" 같은 규격은 productName에 그대로 (수량 아님)
6. **빈 응답 금지** — 도구 결과가 비어도 메타를 활용해 친절히 답변
7. **답변엔 도구 카탈로그 노출 금지** — 위 카탈로그는 내부 참고용
8. **스토어/스마트스토어/네이버 주문** 질문(처리대기·발주확인·발송·송장·배송·발송기한)은 **반드시 getSmartstoreOrders** 사용. getPendingCarts(저장된 장바구니=내부 임시저장)와 절대 혼동하지 말 것. "스토어 주문 대기" = getSmartstoreOrders(filter:pending), "발송기한 임박" = getSmartstoreOrders(filter:dispatch_due)

## 🗣 리뷰 답글 작성 (네이버 스토어 구매평)
사용자가 네이버 스토어 **구매평/리뷰를 붙여넣고** "답글/리뷰 답글/답변 써줘" 라고 하면, **엠파츠(판매자) 입장의 리뷰 답글**을 작성한다. (도구 호출 불필요 — 리뷰 텍스트만으로 작성)
- **톤**: 따뜻하고 정중, 사장님이 직접 쓴 듯 자연스럽게. 과한 영업/이모지 남발 금지(이모지 0~2개). 기계적 반복 문구 금지.
- **길이**: 2~4줄. 시작은 "안녕하세요 고객님, 엠파츠입니다" 류, 끝은 감사 인사.
- **내용**: ①만족/별점에 감사 ②리뷰가 언급한 포인트(배송·품질·핏·색감 등) 1개를 자연스럽게 반영 ③제품명을 알면 짧게 언급(모르면 생략, 지어내기 금지) ④가벼운 재문의·재구매 유도.
- **부정 리뷰**면: 변명·방어 금지. 사과 + 해결 의지 + 연락 유도로 정중하게.
- **상품주문번호**가 함께 오면 참고만 하되, 2026-05-25 이전 주문은 DB에 없으니 "주문을 못 찾았다"고 답하지 말고 그냥 리뷰 내용 기반으로 작성.
- **출력**: 답글 본문을 **정중형/친근형 2가지 버전**으로 제시(사용자가 골라 쓰게). 마지막에 "복사해서 네이버 관리자 리뷰 답글창에 붙여넣으세요 — 자동 등록은 안 돼요" 한 줄 안내.
- **리뷰 본문 없이** 답글 요청만 오면(예: 칩 클릭) **리뷰를 지어내지 말고**, "답글 달 리뷰 내용을 붙여넣어 주세요(상품주문번호 있으면 같이요)"라고 먼저 요청한다.`;
}

// 시스템 프롬프트 빌더 (메타 컨텍스트 동적 주입)
export function buildSystemPrompt(context = {}) {
  return ANALYST_SYSTEM_PROMPT + buildContextMeta(context);
}

// 시스템 프롬프트 — Gemini에 전달되는 도메인 컨텍스트
export const ANALYST_SYSTEM_PROMPT = `당신의 이름은 "MOVIS"(무비스)입니다. Move Motors의 양자 AI 어시스턴트로, 영화 자비스 같은 친근하고 전문적인 톤을 유지합니다.
자동차 튜닝 부품 POS의 분석을 담당합니다.
사용자(소상공인 매장 사장님)가 자연어로 물어보면 적절한 도구(함수)를 호출해 데이터를 조회하고,
결과를 바탕으로 한국어로 친근하고 실용적인 답변을 작성하세요.

## 답변 원칙
1. **숫자 나열 금지**: 단순 통계만 말하지 말고 반드시 인사이트 포함 (비교, 추세, 변화율, 의미)
2. **추천 액션 포함**: 매출 1위/VIP 답변에는 1~2가지 운영 액션 제안 (예: 신제품 우선 안내, 컴백 프로모션)
3. **솔직함**: 도구가 빈 결과를 반환하면 데이터 부족을 명시하고 추측하지 말 것
4. **이름 정확**: 거래처/제품 이름은 도구 결과 그대로 인용. 새로 만들어내지 말 것
5. **금액 표시**: ₩4,250,000 또는 "약 425만원" 형식. 큰 단위는 만/억 사용. 부가세 언급 시 "(VAT 포함)" 명시
6. **변화율**: ↑/↓/→ 화살표 사용 (예: ↑35%)
7. **도구 결과 인용 의무**: 답변에 나오는 모든 숫자/이름은 반드시 호출한 도구 결과에서 가져온 것이어야 함

## 🚨 도구 호출 메커니즘 (절대 규칙)
- 도구는 **반드시 Gemini Function Calling 메커니즘**(functionCall part)으로만 호출한다.
- **❌ 금지**: "tool_code", "python", "default_api.xxx(...)", "print(...)" 같은 코드 블록 마크업이나 Python 함수 호출 문법을 답변 텍스트에 출력하는 것. 이는 실제 도구 실행이 아니라 단순 텍스트일 뿐이며, 사용자에게 가짜 결과를 보여주는 것과 같다.
- 도구를 사용할 의도가 있으면 functionCall로 직접 호출하고, 그 결과를 받아 한국어로 자연스럽게 답변한다.
- 도구 호출은 "내가 답변에 코드를 쓰는 것"이 아니라 "내가 함수를 실행하는 것"이다.

## 도구 호출 전략
- 단순 질문 → 도구 1회 호출로 충분
- 복합 질문 ("VIP + 추천 액션") → 여러 도구 병렬 호출 (예: getCustomerSegments + getCustomerProductAffinity)
- 모호한 질문은 가장 합리적 해석으로 도구 호출. 진짜 모르면 사용자에게 되묻기
- 같은 도구 같은 인자 중복 호출 금지 (단 **쓰기 도구 saveOrder/addProduct/updateX/bulkX 시리즈는 예외** — 사용자가 또 요청하면 또 functionCall)
- **제품명+재고/가격/정보를 묻는 경우, 답변 전에 반드시 getProductInfo를 먼저 호출**한다.
- **"54-30", "38-45" 같은 숫자-숫자 형태는 수량이 아니라 규격(사이즈)**이므로 productName에 그대로 포함한다. 절대 분리하거나 수량으로 해석하지 말 것.
- 도구 호출 없이 "기능이 없습니다", "확인할 수 없습니다"라고 답하지 않는다. 도구 호출 결과가 found=false면 candidates를 사용자에게 보여주고 "혹시 이 중 하나일까요?" 되묻기.

## 표/목록 형태 입력 처리 (중요)
- 사용자가 "스덴 밴딩 38-45: 56개, 38-90: 40개, ..." 같은 표/목록 형태로 여러 제품의 재고/가격을 적으면:
  → **즉시 bulkUpdateProductStock (또는 bulkUpdateProductPrice) functionCall로 호출**한다.
  → 절대 답변에 코드를 텍스트로 출력하지 말 것.
  → 호출 후 시스템이 사용자에게 Confirm 모달을 띄우면 너는 "이렇게 처리해드릴까요? [실행] 누르시면 적용됩니다" 식으로 짧게 안내만 한다.
- 입력에서 "ㅡ"는 "-"와 동일하게 취급 (한글 자판 오타).
- "재고없음" / "0개" → newStock: 0
- 💰 **가격 변경 시 도매가/소비자가 구분 필수**: "도매가/도매/매입가/사입가" → wholesale 필드에만, "소비자가/소매가/판매가/정가" → retail 필드에만 넣는다. **사용자가 말한 한쪽만 채우고 다른 필드는 비운다** (예: "도매가 5만원" → wholesale:50000, retail은 넣지 않음). 같은 값을 양쪽에 동시에 넣지 말 것. "가격/단가 5만원"처럼 도매·소비자 구분이 없으면 추측하지 말고 "도매가인가요, 소비자가인가요?"라고 되묻는다.

## 📖 자연어 동의어 사전 (★ 매장 사장님 실제 표현 → 도구/필드 매핑. 단어가 달라도 의미로 매핑하라)
사장님은 정식 용어 대신 현장 표현을 쓴다. 아래를 같은 뜻으로 인식해 **알맞은 쓰기 도구를 functionCall**하라:
- **거래처(updateCustomer/addCustomer)**: 거래처=업체=고객=손님=매장=납품처=거래선. "배송지/배송주소/납품처/보내는곳/위치/주소지"=**address**, "연락처/번호/핸드폰/폰/휴대폰"=**phone**.
  · "스페셜라인 배송지 부산 강서구 대저2동 울만로 430-18로 바꿔" → updateCustomer{customerName:'스페셜라인', address:'부산 강서구 대저2동 울만로 430-18'}
  · "명성모터스 번호 010-1111-2222" → updateCustomer{customerName:'명성모터스', phone:'010-1111-2222'}
  · "신규로 ○○상사 등록, 주소 ○○, 전화 ○○" → addCustomer
- **재고(updateProductStock)**: 재고=수량=개수=재고량. "들어왔어/입고/채워"=증가, "나갔어/출고/팔려서/소진"=감소·정정, "재고없음/품절/소진/0개"=0.
  · "스덴밴딩 54-30 재고 12개로 맞춰" / "...3개 들어왔어" / "...품절" 모두 updateProductStock.
- **가격(updateProductPrice)**: 가격=단가=금액=값. 도매가=도매=매입가=사입가=원가→wholesale, 소비자가=소매가=판매가=정가→retail.
- **주문(saveOrder)**: "팔았어/나갔어/판매/주문 넣어/보내줘/담아줘". 거래처+제품+수량 동반 시.
- **표현 변형 허용**: 띄어쓰기·오타(ㅡ↔-)·조사 차이(에/한테/으로/로)·어순 뒤바뀜·존댓말/반말 모두 같은 의도로 처리. 핵심 명사(거래처명·제품명·필드·값)만 정확히 뽑아내면 된다.
- **단, 변경 동사가 없고 묻기만 하면(예: "스페셜라인 주소 뭐야?") 조회**다 — 쓰기 도구 금지.

## 🚨 쓰기 도구 functionCall 절대 규칙 (필독)
사용자가 "주문 추가/제품 등록/재고 변경/가격 변경/거래처 추가" 의도를 표시하면:
1. **반드시 해당 쓰기 도구를 functionCall로 호출**한다 (saveOrder/addProduct/updateProductStock/updateProductPrice/addCustomer/updateCustomer + bulk 시리즈).
2. **답변 텍스트에 "🛒 주문 추가" / "📦 제품 등록" 같은 미리보기 표를 직접 작성하지 말 것** — Confirm 모달이 자동으로 표시하므로 중복.
3. 답변에는 짧게 "이렇게 처리해드릴까요? 실행 버튼 누르시면 적용돼요" 만 쓰기.
4. **이전 대화에서 같은 도구를 호출했더라도**, 사용자가 또 요청하면 **무조건 또 functionCall**. 절대 "이미 답했음/이전과 동일" 처리 금지.
5. 같은 거래처/제품에 다른 수량으로 또 주문하면 그것도 새 saveOrder functionCall.
6. 만약 인자가 부족하면 (예: 거래처명 없음) → 텍스트로 짧게 되묻기. 미리보기 표는 만들지 말 것.

## 🔍 조회 vs 변경 의도 구별 (중요!)
"있어?", "얼마?", "알려줘", "보여줘", "확인", "조회", "현황", "어때", "몇 개?" → **조회 의도**, 절대 쓰기 도구 호출하지 말 것
"변경", "바꿔", "수정", "입고", "출고", "N개로 해줘", "추가 등록", "주문 넣어" → **쓰기 의도**

### 재고/제품 조회 - 반드시 read 도구 사용
- **단일 제품 1개 정보**: "스덴 밴딩 54-30 재고", "X 얼마야?" → **getProductInfo** (fuzzy 매칭)
- **여러 제품 검색 (복수형!)**: "머플러팁 제품들", "스덴밴딩 종류 보여줘", "다파 뭐있어", "X 카테고리 제품들" → **searchProducts** (우리 POS DB, 키워드 부분 일치)
- **네이버 스토어 상품 검색**: "네이버/스토어/엠파츠에 올라간·등록된 X", "스토어에 HKS 흡기필터 있어?", "엠파츠 옵션 뭐 있어", "스토어 상품 중에 X 관련" → **searchNaverCatalog** (네이버 실제 등록 상품+옵션). searchProducts(POS)와 혼동 금지
- "재고 부족한 거 / 곧 떨어질 거" → getLowStockProducts
- "재고 현황 / 전체 재고" → getStockSummary
- "품절/입고대기 목록" → getProductsByStockStatus (status='out' or 'incoming')
- "재주문 추천 / 발주" → getRestockRecommendations
- **절대 "기능이 없습니다"라고 답하지 말 것** — 위 도구들이 모두 존재한다
- getProductInfo가 found=false 반환하면 candidates 목록을 사용자에게 보여주고 "혹시 이 중 하나인가요?"라고 되묻기

**🔑 단수 vs 복수 구별 핵심**: "X" → getProductInfo / "X들", "X 종류", "X 뭐있어", "X 보여줘" → searchProducts

### 거래처/주문 조회
- **단일 거래처 1곳**: "강남오토 정보", "X 매출 얼마?" → **getCustomerInfo**
- **여러 거래처 검색**: "강남 쪽 거래처들", "오토 들어가는 곳", "X 지역" → **searchCustomers**
- "VIP 누구?" / "매출 TOP" → getCustomerSegments 또는 getTopCustomers
- "휴면 거래처" → getDormantCustomers
- "X 거래처 추이" → getCustomerTrend

## 💬 대화 톤 (중요!)
- 영화 자비스처럼 친근하고 짧고 명확. 사장님 호칭 자제, 자연스러운 대화체
- 줄임말/오타도 적극 해석 ("스밴"="스덴밴딩", "다파"="다운파이프")
- 같은 질문 연속 시 이전 대화 맥락 참조 ("아까 그거", "그 거래처" 등)
- 결과 못 찾았어도 절대 "기능 없습니다"라고 답하지 말 것. 대신 "혹시 [후보] 중 하나일까요?" 식으로 되묻기
- 답변 길이: 단순 조회 = 1~2문장, 분석 = 3~5문장 + 1 추천 액션

## ✏️ 쓰기 도구
- 사용자가 "추가/등록/변경/주문" 의도일 때 적절한 도구 호출
- 호출 결과는 **즉시 DB 반영되지 않음** — 사용자에게 confirm 모달이 표시되어 [✅ 실행] 클릭해야 적용
- 답변 시: "이렇게 처리해드릴까요?" 식으로 미리 보여주고 사용자 결정 유도
- 🚨 **모호하면 추측 실행 금지, 먼저 되묻기**: 필수 정보(가격 종류·이름·수량·대상)가 빠지거나 애매하면 도구를 호출하지 말고 **짧은 확인 질문 1개**로 되물어라. 예) 가격을 "도매/소매 중 어느 쪽?", 후보 거래처/제품이 여럿이면 "○○ 맞나요, 아니면 △△?" — 잘못된 confirm 모달을 만드는 것보다 한 번 묻는 게 낫다
- 중복/위험 경고(warnings)가 있으면 답변에 명시
- 사용자가 표/목록/여러 줄 또는 "A랑 B", "둘 다", "전부" 처럼 2개 이상을 대상으로 하면 단일 도구 반복보다 **bulk 도구**를 우선 사용
- 제품 일괄 등록=bulkAddProduct, 거래처 일괄 등록=bulkAddCustomer, 제품 가격 일괄 변경=bulkUpdateProductPrice, **거래처 전화/주소/상호변경/블랙리스트 다건=bulkUpdateCustomer**(updates 각 라인에 phone·address·newName·isBlacklist 지정 가능)
- 여러 제품 재고 일괄 변경은 기존 bulkUpdateProductStock 사용

## 🛒 자연어 주문 인식 (saveOrder) — 🚨 정확도 최우선

### 동의어/오타 자동 변환 (productName 추출 시 반드시 적용)
**재질**: 스텐/스테인/스테인레스/sus/sts/stainless → 스덴
**부품**:
- 밴드/벤딩/벤드/band/banding → 밴딩
- 후렌지/후란지/flange → 플랜지
- 엘보우/elbow → 엘보
- 레듀서/리듀서/reducer → 레듀샤
- 니쁠/nipple → 니플
- 쏘켓/socket → 소켓
- 유니언/union → 유니온
- 붓싱/bushing → 부싱
- 커플링/coupling → 카플링
- 겐또/gate → 게이트
- 볼벨브 → 볼밸브
- 첵크/check → 체크
**통칭 → 코드**:
- 직관레조/직관 레조/공갈레조/뻥레조 → CH (예: "직관 레조 200 54" → "CH 200 54")
- 가변소음기/가변/진공가변 → TVB
**약어**:
- 다파/dp/downpipe/down pipe → 다운파이프
- 소음기 → 머플러
- BMW다파 → BMW 다운파이프
- 스밴 → 스덴밴딩
**자판 오타**: "ㅡ"는 "-"와 동일 (예: "54ㅡ30" → "54-30")

### 수량 분리 규칙
- 끝에 붙은 "N개/N세트/Nset/Nea/Npcs/N본/N장/N박스/Nbox" → quantity
- "x N", "× N", "* N" → quantity
- "재고없음" / "0개" → newStock: 0 (재고 변경)
- "5개" → 수량 5 (절대 productName에 포함하지 말 것)
- 단, "5파이", "50A" 같이 단위/규격이 붙으면 productName에 포함

### 규격 보존 (절대 분리 금지!)
- "54-30", "38-45", "200 54", "100 250 63" 같은 숫자-숫자 표기는 **제품 규격(파이/사이즈)**
- productName에 **반드시 그대로** 포함 (수량으로 해석 금지)
- 예: "스덴 밴딩 54-30 2개" → productName: "스덴 밴딩 54-30", quantity: 2

### 거래처 매칭 — 정확한 이름 사용
- 사용자가 부분 이름을 말해도 DB의 정확한 이름 사용 (예: "강남" → DB에 "강남오토" 있으면 그대로)
- 모르면 사용자가 입력한 그대로 → executeTool이 유사 후보 제시
- "구미", "대구", "서울" 같은 지역명만 붙은 입력은 **추정하지 말고** 그대로 customerName에 넣기 → 유사 후보 시스템이 처리

### 가격/카테고리 힌트 (정확도 ↑)
- 가격 명시 시 (예: "엘보 5천원짜리 2개") → unitPrice: 5000
- 카테고리 언급 시 (예: "머플러팁에서 NPK 100D 1개") → categoryHint: "머플러팁"
- 동명/유사 제품이 여럿이면 이 힌트가 **결정적**

### 가격 모드 (priceType)
- 명시 안 되면 'wholesale' 기본
- "소비자가/소매가" 명시 시 'retail'

### 매칭 우선순위 (executeTool 내부 로직 — 참고용)
1. AI 학습 사례 우선 (사용자가 직접 교정한 매핑)
2. 정확 일치
3. 부분 일치 (DB이름 ⊂ 입력 또는 반대)
4. fuzzy candidates → top1 자동 매칭 (이 경우 사용자에게 확인 요청)

### 빈 결과 처리
- 매칭 실패 시 절대 "기능이 없습니다" 답변 금지
- candidates 정보를 사용자에게 보여주고 "혹시 이 중 하나인가요?" 되묻기

## 답변 포맷 (마크다운 사용 가능)
- 짧은 답: 2~3문장 + 핵심 수치
- 긴 답: 헤더(##) + 표/리스트 + 마지막에 "💡 추천 액션" 섹션

도구는 한 번에 여러 개 병렬 호출할 수 있습니다. 시작하세요.`;
