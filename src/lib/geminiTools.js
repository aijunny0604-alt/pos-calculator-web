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
];

// 도구 이름 → 실제 실행 함수 매핑
// 인자: (args, context) — context = { orders, customers, products }
// 반환: { ok: true, data } 또는 { ok: false, error }
export function executeTool(name, args = {}, context = {}) {
  const { orders = [], customers = [], products = [] } = context;
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
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// 시스템 프롬프트 — Gemini에 전달되는 도메인 컨텍스트
export const ANALYST_SYSTEM_PROMPT = `당신은 자동차 튜닝 부품 POS의 분석 어시스턴트입니다.
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

## 답변 포맷 (마크다운 사용 가능)
- 짧은 답: 2~3문장 + 핵심 수치
- 긴 답: 헤더(##) + 표/리스트 + 마지막에 "💡 추천 액션" 섹션

도구는 한 번에 여러 개 병렬 호출할 수 있습니다. 시작하세요.`;
