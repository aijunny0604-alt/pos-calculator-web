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
    description: '키워드로 여러 제품 검색 (제품명/카테고리 부분 일치). "머플러팁 제품들", "스덴 밴딩 종류 보여줘", "다파 뭐 있어", "X 카테고리 제품 목록" 같은 복수 검색에 반드시 이 도구 사용. 각 제품의 name/category/stock/wholesale/retail 반환.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '제품명 또는 카테고리 키워드 (부분 일치)' },
        limit: { type: 'integer', description: '최대 N개 (기본 30)' },
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
  {
    name: 'bulkUpdateProductPrice',
    description: '여러 제품의 도매가/소비자가를 한 번의 confirm으로 일괄 변경합니다. 사용자가 표/목록 형태로 여러 제품 가격을 입력할 때 사용. 제품명은 findProductSmart 방식으로 매칭하며 단일 제품 가격 변경은 updateProductPrice 사용.',
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
              wholesale: { type: 'number', description: '새 도매가 (선택)' },
              retail: { type: 'number', description: '새 소비자가 (선택)' },
            },
            required: ['productName'],
          },
        },
      },
      required: ['updates'],
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
    description: '기존 거래처 정보 수정 (전화번호 / 주소). "WP튠 김해 전화번호 010-1234-5678로", "강남오토 주소 변경" 같은 의도일 때 호출.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: '거래처 이름 (정확히 또는 일부)' },
        customerId: { type: 'integer', description: '거래처 ID (선택)' },
        phone: { type: 'string', description: '새 전화번호 (선택)' },
        address: { type: 'string', description: '새 주소 (선택)' },
      },
    },
  },
  {
    name: 'bulkUpdateCustomer',
    description: '여러 거래처의 전화번호/주소를 한 번의 confirm으로 일괄 변경합니다. 사용자가 표/목록 형태로 여러 거래처 정보 변경을 입력할 때 사용. 단일 거래처 정보 변경은 updateCustomer 사용.',
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
              customerId: { type: 'integer', description: '거래처 ID (선택)' },
              phone: { type: 'string', description: '새 전화번호 (선택)' },
              address: { type: 'string', description: '새 주소 (선택)' },
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
  const { orders = [], customers = [], products = [], aiLearningData = [] } = context;

  // ===== 쓰기 도구: dry-run (사용자 confirm 대기) =====
  if (WRITE_TOOLS.has(name)) {
    return buildPendingAction(name, args, { customers, products, aiLearningData });
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
        const matches = (products || []).filter((p) => {
          const name = String(p?.name || '').toLowerCase();
          const cat = String(p?.category || '').toLowerCase();
          const nameNoSpace = name.replace(/\s+/g, '');
          const catNoSpace = cat.replace(/\s+/g, '');
          return nameNoSpace.includes(kwNoSpace) || catNoSpace.includes(kwNoSpace);
        });
        return {
          ok: true,
          data: {
            keyword: kw,
            count: matches.length,
            items: matches.slice(0, limit).map((p) => ({
              name: p.name,
              category: p.category || '미분류',
              stock: Number(p.stock || 0),
              wholesale: Number(p.wholesale || 0),
              retail: Number(p.retail || 0),
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
function buildPendingAction(name, args, { customers, products, aiLearningData = [] }) {
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
    // 거래처 찾기 (정확 → 부분 → 토큰 단위)
    const customerLower = customerName.trim().toLowerCase();
    let customer = (customers || []).find((c) => (c?.name || '').toLowerCase() === customerLower);
    if (!customer) customer = (customers || []).find((c) => (c?.name || '').toLowerCase().includes(customerLower));
    if (!customer) {
      const tokens = customerLower.split(/\s+/).filter(Boolean);
      customer = (customers || []).find((c) => {
        const cn = (c?.name || '').toLowerCase();
        return tokens.length > 0 && tokens.every((t) => cn.includes(t));
      });
    }
    const customerLabel = customer ? customer.name : customerName.trim();

    // 각 라인 제품 매칭 (AI 학습 사례 우선 + tolerance + fuzzy)
    const resolved = [];
    const missingDetails = [];
    for (const it of items) {
      const pname = (it.productName || '').trim();
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      if (!pname) continue;
      const product = findProductSmart(pname, products, aiLearningData);
      if (!product) {
        missingDetails.push({ name: pname, candidates: findProductCandidates(pname, products) });
        continue;
      }
      const unitPrice = Number(product[priceType] || product.wholesale || product.retail) || 0;
      resolved.push({
        id: product.id,
        name: product.name,
        price: unitPrice,
        wholesale: Number(product.wholesale) || 0,
        retail: Number(product.retail) || 0,
        quantity: qty,
      });
    }
    if (missingDetails.length > 0) {
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
    if (!customer) warnings.push(`⚠️ "${customerName}" 거래처가 DB에 없습니다. 주문 저장 시 자동 신규 등록됩니다.`);
    if (resolved.some((r) => r.price <= 0)) warnings.push('⚠️ 일부 라인의 단가가 0원입니다.');
    const lines = resolved.map((r) => `  • ${r.name} × ${r.quantity} = ${(r.price * r.quantity).toLocaleString('ko-KR')}원 (단가 ${r.price.toLocaleString('ko-KR')})`).join('\n');
    return {
      ok: true,
      data: {
        __pending: true,
        action: 'saveOrder',
        params: {
          customerName: customerLabel,
          customerExists: Boolean(customer),
          customerPhone: customer?.phone || '',
          customerAddress: customer?.address || '',
          priceType,
          items: resolved,
          total,
          memo: memo || null,
        },
        warnings,
        preview: `🛒 주문 등록\n• 거래처: ${customerLabel}${customer ? '' : ' (신규 자동 등록)'}\n• 가격: ${priceType === 'retail' ? '소비자가' : '도매가'} 기준\n• 항목 ${resolved.length}건:\n${lines}\n\n💰 합계: ${total.toLocaleString('ko-KR')}원 (VAT 포함)`,
      },
    };
  }
  if (name === 'updateCustomer') {
    const { customerName, customerId, phone, address } = args;
    if (phone == null && address == null) {
      return { ok: false, error: '전화번호 또는 주소 중 하나는 지정해야 합니다.' };
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
      if (u?.phone == null && u?.address == null) {
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
      resolved.push({
        customerId: target.id,
        customerName: target.name,
        inputName: customerName,
        oldPhone: target.phone || '',
        oldAddress: target.address || '',
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
    if (invalid.length > 0) warnings.push(`⚠️ ${invalid.length}개 라인은 전화번호/주소 변경값이 없어 제외됩니다.`);
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
      return { ok: false, error: '도매가 또는 소비자가 중 하나는 지정해야 합니다.' };
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
- 같은 도구 같은 인자 중복 호출 금지
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

## 🔍 조회 vs 변경 의도 구별 (중요!)
"있어?", "얼마?", "알려줘", "보여줘", "확인", "조회", "현황", "어때", "몇 개?" → **조회 의도**, 절대 쓰기 도구 호출하지 말 것
"변경", "바꿔", "수정", "입고", "출고", "N개로 해줘", "추가 등록", "주문 넣어" → **쓰기 의도**

### 재고/제품 조회 - 반드시 read 도구 사용
- **단일 제품 1개 정보**: "스덴 밴딩 54-30 재고", "X 얼마야?" → **getProductInfo** (fuzzy 매칭)
- **여러 제품 검색 (복수형!)**: "머플러팁 제품들", "스덴밴딩 종류 보여줘", "다파 뭐있어", "X 카테고리 제품들" → **searchProducts** (키워드 부분 일치)
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
- 필수 정보(가격/이름/수량)가 빠지면 호출하지 말고 먼저 사용자에게 되묻기
- 중복/위험 경고(warnings)가 있으면 답변에 명시
- 사용자가 표/목록/여러 줄로 2개 이상을 추가 또는 변경하면 단일 도구 반복 호출보다 bulk 도구를 우선 사용
- 제품 일괄 등록은 bulkAddProduct, 거래처 일괄 등록은 bulkAddCustomer, 제품 가격 일괄 변경은 bulkUpdateProductPrice, 거래처 전화/주소 일괄 변경은 bulkUpdateCustomer 사용
- 여러 제품 재고 일괄 변경은 기존 bulkUpdateProductStock 사용

## 🛒 자연어 주문 인식 (saveOrder)
- 사용자가 "거래처에 제품N개 제품M개 주문" 같은 자연어 입력 시 saveOrder 호출
- 정확하지 않은 줄임말이나 통칭도 적극 해석:
  - "다파" → "다운파이프"
  - "BMW다파" → "BMW 다운파이프"
  - "머플러2개" → quantity 2
  - "강남" → "강남오토" (거래처)
- 가격 모드 (priceType): 명시 안 되면 'wholesale' 기본
- 같은 거래처 당일 주문은 자동 병합 (saveOrder 내부 로직)
- 거래처가 DB에 없어도 OK — 자동 신규 등록

## 답변 포맷 (마크다운 사용 가능)
- 짧은 답: 2~3문장 + 핵심 수치
- 긴 답: 헤더(##) + 표/리스트 + 마지막에 "💡 추천 액션" 섹션

도구는 한 번에 여러 개 병렬 호출할 수 있습니다. 시작하세요.`;
