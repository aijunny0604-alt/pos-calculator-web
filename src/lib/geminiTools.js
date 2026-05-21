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

// 공통 enum
const PERIOD_ENUM = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

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
        customerId: { type: 'integer', description: '거래처 ID (이름 모를 때)' },
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
        customerId: { type: 'integer', description: '거래처 ID (거래처 모드)' },
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
        customerId: { type: 'integer', description: '거래처 ID' },
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
  // ===== 재고 분석 도구 =====
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
    description: '대기 중인 주문 (저장된 장바구니). 출고예정일 임박/지연 표시. "대기 주문", "출고 예정", "저장 카트" 같은 질문에 사용.',
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
  // ===== 쓰기 도구 (사용자 confirm 필수) =====
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
    name: 'updateProductPrice',
    description: '특정 제품의 도매가/소비자가 변경. "다운파이프 도매가 5만원으로", "머플러 가격 수정" 같은 의도일 때 호출. 사용자 confirm 후 DB 적용.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: '제품 이름' },
        productId: { type: 'integer', description: '제품 ID' },
        wholesale: { type: 'number', description: '새 도매가 (선택)' },
        retail: { type: 'number', description: '새 소비자가 (선택)' },
      },
    },
  },
];

// 쓰기 도구 이름 목록 (executeTool에서 dry-run 처리용)
export const WRITE_TOOLS = new Set(['addProduct', 'addCustomer', 'updateProductStock', 'updateProductPrice']);

// 도구 이름 → 실제 실행 함수 매핑
// 인자: (args, context) — context = { orders, customers, products }
// 반환: { ok: true, data } 또는 { ok: false, error }
//
// 쓰기 도구는 즉시 실행하지 않고 pending 객체 반환 → UI에서 confirm 후 실행
export function executeTool(name, args = {}, context = {}) {
  const { orders = [], customers = [], products = [] } = context;

  // ===== 쓰기 도구: dry-run (사용자 confirm 대기) =====
  if (WRITE_TOOLS.has(name)) {
    return buildPendingAction(name, args, { customers, products });
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
      case 'getLowStockProducts':
        return { ok: true, data: getLowStockProducts(products, orders, args) };
      case 'getStockSummary':
        return { ok: true, data: getStockSummary(products, args) };
      case 'getProductsByStockStatus':
        return { ok: true, data: getProductsByStockStatus(products, args) };
      case 'getRestockRecommendations':
        return { ok: true, data: getRestockRecommendations(products, orders, args) };
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
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 쓰기 도구 dry-run — 검증 + preview만 만들고 실제 DB 변경 X
// AI는 이 결과를 보고 "확인 후 실행하시겠어요?" 식으로 답변하도록 시스템 프롬프트가 유도
function buildPendingAction(name, args, { customers, products }) {
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
  if (name === 'updateProductStock') {
    const { productName, productId, newStock } = args;
    if (newStock == null || newStock < 0 || !Number.isFinite(Number(newStock))) {
      return { ok: false, error: '재고 수량은 0 이상이어야 합니다.' };
    }
    // 제품 찾기
    let target = null;
    if (productId != null) target = products.find((p) => p.id === productId);
    if (!target && productName) {
      const lower = productName.trim().toLowerCase();
      // 정확 일치 우선
      target = products.find((p) => (p?.name || '').toLowerCase() === lower);
      // 부분 매칭
      if (!target) target = products.find((p) => (p?.name || '').toLowerCase().includes(lower));
    }
    if (!target) {
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다. 정확한 제품명을 확인해주세요.` };
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
  if (name === 'updateProductPrice') {
    const { productName, productId, wholesale, retail } = args;
    if (wholesale == null && retail == null) {
      return { ok: false, error: '도매가 또는 소비자가 중 하나는 지정해야 합니다.' };
    }
    let target = null;
    if (productId != null) target = products.find((p) => p.id === productId);
    if (!target && productName) {
      const lower = productName.trim().toLowerCase();
      target = products.find((p) => (p?.name || '').toLowerCase() === lower)
            || products.find((p) => (p?.name || '').toLowerCase().includes(lower));
    }
    if (!target) {
      return { ok: false, error: `제품 "${productName || productId}"을(를) 찾을 수 없습니다.` };
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
  return { ok: false, error: `Unknown write tool: ${name}` };
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

## 도구 호출 전략
- 단순 질문 → 도구 1회 호출로 충분
- 복합 질문 ("VIP + 추천 액션") → 여러 도구 병렬 호출 (예: getCustomerSegments + getCustomerProductAffinity)
- 모호한 질문은 가장 합리적 해석으로 도구 호출. 진짜 모르면 사용자에게 되묻기
- 같은 도구 같은 인자 중복 호출 금지

## ✏️ 쓰기 도구 (addProduct, addCustomer)
- 사용자가 "제품 추가/거래처 등록" 의도일 때만 호출
- 호출 결과는 **즉시 DB 반영되지 않음** — 사용자에게 confirm 모달이 표시되어 [✅ 실행] 클릭해야 적용
- 답변 시: "이렇게 등록해드릴까요?" 식으로 미리 보여주고 사용자 결정 유도
- 필수 정보(가격/이름)가 빠지면 호출하지 말고 먼저 사용자에게 되묻기
- 중복 경고(warnings)가 있으면 답변에 명시

## 답변 포맷 (마크다운 사용 가능)
- 짧은 답: 2~3문장 + 핵심 수치
- 긴 답: 헤더(##) + 표/리스트 + 마지막에 "💡 추천 액션" 섹션

도구는 한 번에 여러 개 병렬 호출할 수 있습니다. 시작하세요.`;
