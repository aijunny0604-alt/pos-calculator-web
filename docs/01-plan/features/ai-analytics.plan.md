# Plan: AI 분석 어시스턴트 (자연어 → 거래/제품/전략 인사이트)

> Feature: ai-analytics
> Created: 2026-05-20
> Phase: Plan
> Strategy: **Gemini Function Calling — 클라이언트 집계 + LLM 자연어 종합**

---

## 1. 목표

POS에 쌓인 거래 데이터(orders, customers, products, payment_records)를 사용자가 **자연어로 질문**하면 AI가 즉시 **VIP 분석, 인기 제품, 전략 제안**을 도출해 답하는 어시스턴트.

운영자가 SQL/엑셀 없이 "이번 달 매출 1위 누구?", "추천할 액션 뭐 있어?" 같은 일상 한국어로 데이터에 묻을 수 있어야 함.

---

## 2. 배경

### 2-1. 현재 상태
- Supabase에 약 232건 주문 + 76개 거래처 + 다수 제품 + 결제 232건 / 입금 18건 누적
- 거래처 관리 페이지(CustomerList)에 받을돈/주문수/입금횟수 StatBox는 있으나 **개별 업체 단위**만 표시
- 매출 추이/카테고리별 인기 제품/VIP 세그먼트/위험 신호 종합 분석 UI 없음
- 운영자가 인사이트를 얻으려면 OrderHistory 필터링 + 엑셀 export 수동 작업 필요
- Gemini API 인프라(4프로젝트 × 2모델 × 20회/일 = 160회/일)는 이미 TextAnalyze AI 주문인식용으로 구축됨 — **공유 사용 가능**

### 2-2. 비즈니스 시나리오 (운영자 페인포인트)
- "이번 달 누가 가장 많이 샀어?" → 현재는 OrderHistory에서 필터 → 업체별 합산 수동
- "WP튠 김해 어떻게 되고 있어?" → CustomerDetailModal로 일일이 확인 (트렌드 없음)
- "어떤 제품 더 들여놔야 해?" → StockOverview는 현재 재고만, 매출 트렌드 없음
- "단골인데 안 산 지 오래된 거래처?" → 알 방법 없음
- "특별 프로모션 누구한테 뿌릴까?" → 직관에 의존

### 2-3. 왜 LLM Function Calling인가
- 자연어 → SQL 직접 변환은 **위험** (잘못된 쿼리, 토큰 폭증, 보안)
- 사전 정의 도구(함수)를 LLM이 골라 호출 → 안전 + 정확
- 도구 결과를 다시 LLM이 종합 → 인사이트/추천까지 자연어로 산출
- 새 분석 시나리오 추가 시 **도구 함수만 추가**하면 됨 (확장성)

---

## 3. 격리 전략

- **DB 변경 없음**: 신규 테이블/컬럼 없음. 모든 집계는 클라이언트에서 수행
- **기존 UI 무영향**: 새 페이지(`ai-analytics`)만 추가, 다른 페이지/컴포넌트 수정 최소화
- **Gemini API 키 공유**: 신규 키 미발급, 기존 4프로젝트 × 2모델 풀 사용. 사용량 모니터링 후 별도 키 분리 검토
- **분석 결과 캐싱**: localStorage 1차, 추후 Supabase 영구 저장 검토 (본 plan 범위 외)
- **금액/개인정보 보안**: Gemini 호출 시 거래처 ID는 마스킹(`C-12`), 이름은 짧은 식별자로 변환 후 응답 시 복원 (선택사항)

---

## 4. 기능 요구사항 (FR)

### FR-01: 자연어 채팅 인터페이스
- 신규 페이지 `AIAnalytics.jsx` (사이드바 메뉴 `📊 AI 분석` 추가)
- 채팅 UI: 입력창 + 메시지 히스토리 (사용자 ↔ 어시스턴트)
- 추천 질문 칩 5~8개 (`이번 달 VIP TOP 5`, `인기 제품 분석`, `재주문 유도 추천` 등)
- 입력 → Enter or [전송] → 로딩 스피너 → 결과 표시
- 히스토리는 세션 메모리 + localStorage(`pos_ai_analytics_history_v1`, 최근 50건)

### FR-02: Gemini Function Calling 루프
- Gemini 2.5-flash 모델로 자연어 + 도구 스키마 전달
- Gemini가 도구 호출 결정 → 클라이언트가 도구 실행 → 결과를 Gemini에 재전달 → 최종 자연어 답변
- 단일 질문에 도구 **최대 5회** 호출 제한 (무한루프 방지)
- 실패 시 기존 키 폴백 로직 재사용 (`TextAnalyze.jsx` 패턴)

### FR-03: 분석 도구 함수 (MVP 8개)

| # | 함수명 | 설명 | 입력 파라미터 |
|---|--------|------|----------------|
| 1 | `getTopCustomers` | 거래처 매출 TOP N | period, sortBy(revenue\|count\|qty), limit |
| 2 | `getCustomerSegments` | RFM 4분면 세그먼트 | period |
| 3 | `getCustomerTrend` | 특정 업체 월별 추이 | customerId, months |
| 4 | `getTopProducts` | 제품 TOP N | period, limit, byCategory(bool) |
| 5 | `getProductTrend` | 특정 제품 판매 추이 | productId, months |
| 6 | `getCustomerProductAffinity` | 업체가 자주 사는 제품/카테고리 | customerId, limit |
| 7 | `getRepeatPurchaseGap` | 평균 재주문 주기 | productId \| customerId |
| 8 | `getCompositeSummary` | 기간 전체 KPI 묶음 | period |

**참고**: "전략 제안"은 **별도 도구 없이** Gemini가 위 결과 + 도메인 시스템 프롬프트로 추론 (LLM 강점 영역)

### FR-04: RFM 분석 정의
- **R(Recency)**: 마지막 주문일로부터 경과일. 짧을수록 점수↑
- **F(Frequency)**: 최근 N개월간 주문 건수. 많을수록 점수↑
- **M(Monetary)**: 최근 N개월간 총 매출. 클수록 점수↑
- 각 0~5점 부여 → 세그먼트 분류:
  - **Champion** (5/5/5 ~ 4/4/4): VIP, 최우선 관리
  - **Loyal** (3+/4+/3+): 안정 단골
  - **At-Risk** (1~2/3+/3+): 과거 VIP인데 최근 뜸함 → 재유도 대상
  - **New** (5/1/1~2): 신규, 정착 유도
  - **Lost** (1/1/1): 휴면, 우선순위 낮음
- 임계값은 **기본값 제공 + localStorage 조정 가능** (`pos_ai_rfm_thresholds_v1`)

### FR-05: 결과 자동 렌더링
- Gemini 답변이 단순 텍스트면 markdown 렌더
- 도구 결과가 표 형태면 `<table>` 자동 표시
- 시계열 데이터(`*Trend`)면 recharts LineChart 자동 렌더
- TOP N 리스트면 카드 그리드 (랭킹 배지 + 매출 + 변화율)
- KPI 묶음이면 4-grid StatBox 카드

### FR-06: 추천 질문 (Quick Prompts)
- 기본 5개 항상 표시:
  1. 이번 달 매출 TOP 5
  2. VIP 세그먼트 분석
  3. 인기 제품 TOP 10
  4. 재주문 유도 추천 액션
  5. 휴면 거래처 알려줘
- 사용자 자주 묻는 질문은 사용 빈도순 정렬 (localStorage)

### FR-07: 인사이트 노트 저장
- Gemini 답변 옆 `📌 메모로 저장` 버튼 → localStorage `pos_ai_insights_v1`
- 저장된 인사이트는 페이지 상단 "최근 인사이트" 캐러셀 표시

### FR-08: 에러 처리
- API 한도 초과 → "오늘 분석 한도가 소진되었습니다. 내일 다시 시도해주세요" 안내 + 캐시된 분석 결과 표시 옵션
- 네트워크 실패 → 재시도 버튼
- Gemini가 도구 호출 실패 → 사용자에게 원인 표시 + 다른 질문 유도

---

## 5. 비기능 요구사항 (NFR)

- **DB 무영향**: 테이블/컬럼/RPC 추가 0건
- **응답 시간**: 단순 질문(도구 1회 호출) 3초 이내, 복합 질문(도구 3회+) 8초 이내
- **API 절약**: 동일 질문 5분 이내 재요청은 캐시 응답 (`pos_ai_cache_v1`, key=질문 해시)
- **모바일 지원**: 채팅 UI는 모바일 우선, 차트는 데스크탑 최적화
- **번들 크기**: recharts lazy import (분석 페이지 진입 시에만 로드)
- **다기기**: localStorage 기반이라 단일 디바이스 한정. 다기기 인사이트 공유는 후속 plan

---

## 6. 기술 설계 초안

### 6-1. 파일 구조

```
src/
├── pages/
│   └── AIAnalytics.jsx                  # 신규 메인 페이지
├── components/analytics/
│   ├── ChatPanel.jsx                    # 채팅 UI (메시지 리스트 + 입력창)
│   ├── MessageBubble.jsx                # 사용자/AI 메시지 버블
│   ├── SuggestedQuestions.jsx           # 추천 질문 칩
│   ├── ResultRenderer.jsx               # 타입 감지 후 자동 렌더 라우터
│   ├── InsightsCarousel.jsx             # 저장된 인사이트 캐러셀
│   └── charts/
│       ├── TrendLineChart.jsx           # 시계열 추이
│       ├── TopNBarChart.jsx             # TOP N 막대
│       ├── SegmentPieChart.jsx          # RFM 4분면
│       └── KpiCards.jsx                 # KPI 그리드
├── lib/
│   ├── geminiAnalyst.js                 # Function Calling 루프 (5회 제한)
│   ├── geminiTools.js                   # 도구 스키마 JSON (Gemini용)
│   └── analytics/
│       ├── customers.js                 # getTopCustomers, getCustomerSegments, getCustomerTrend
│       ├── products.js                  # getTopProducts, getProductTrend, getRepeatPurchaseGap
│       ├── affinity.js                  # getCustomerProductAffinity
│       ├── summary.js                   # getCompositeSummary
│       ├── rfm.js                       # RFM 점수 계산 + 세그먼트 분류
│       └── aggregations.js              # 공통 (KST 기간 필터, 합산, 정렬)
└── hooks/
    ├── useAIAnalystChat.js              # 채팅 상태 + Gemini 호출 + 히스토리
    └── useInsightsStore.js              # 저장된 인사이트 CRUD
```

### 6-2. 데이터 흐름

```
[사용자 입력]
   ↓
[useAIAnalystChat]
   ├─ 캐시 검사 (5분 TTL)
   ├─ Gemini 호출 (질문 + 도구 스키마)
   ├─ Gemini가 도구 호출 결정
   ├─ geminiTools.js 라우터가 lib/analytics 함수 실행
   │  └─ Supabase 데이터는 App.jsx state에서 props로 받음 (orders, products, customers)
   ├─ 결과를 Gemini에 재전달
   ├─ Gemini 최종 답변 + 도구 결과 묶음 반환
   └─ ChatPanel에 메시지 추가 + ResultRenderer 렌더
```

### 6-3. Gemini 도구 스키마 (예시)

```javascript
{
  name: "getTopCustomers",
  description: "기간 내 매출/주문수/수량 기준 TOP N 거래처 조회",
  parameters: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["1W", "1M", "3M", "6M", "1Y", "ALL"],
        description: "조회 기간"
      },
      sortBy: {
        type: "string",
        enum: ["revenue", "count", "qty"],
        description: "정렬 기준"
      },
      limit: { type: "integer", minimum: 1, maximum: 50 }
    },
    required: ["period", "sortBy"]
  }
}
```

### 6-4. 시스템 프롬프트 골자

```
당신은 자동차 튜닝 부품 POS의 분석 어시스턴트입니다.
사용자 질문을 받으면 적절한 도구를 호출해 데이터를 조회하고,
결과를 바탕으로 자연스러운 한국어로 답변하세요.

원칙:
- 단순 숫자 나열이 아닌 인사이트 포함 (비교, 추세, 변화율)
- 매출 1위 같은 답변에는 추천 액션 1~2가지 제시 (예: 신제품 우선 안내)
- 데이터 부족 시 솔직히 말하고 추가 정보 유도
- 거래처/제품 이름은 정확히 그대로 사용 (마스킹 없음)
- 부가세는 항상 명시 (공급가 / 부가세 / 총액)
- 모르는 건 추측하지 말 것

도구는 한 번에 여러 개 병렬 호출 가능. 답변 형식은 도구 결과 타입에 맞춰
표/차트/카드 등을 자동 렌더하도록 메타데이터 포함하여 반환.
```

### 6-5. 캐싱 키 설계
- `pos_ai_analytics_history_v1` — 채팅 히스토리 (최근 50건 FIFO)
- `pos_ai_cache_v1` — 도구 호출 결과 캐시 (key = hash(질문 + 날짜), TTL 5분)
- `pos_ai_insights_v1` — 사용자 저장 인사이트 (영구)
- `pos_ai_rfm_thresholds_v1` — RFM 점수 임계값 조정
- `pos_ai_quick_prompts_usage_v1` — 추천 질문 사용 빈도 (정렬용)

---

## 7. 대안 비교

| 대안 | 장점 | 단점 | 채택 |
|------|------|------|------|
| **A. Function Calling** | 정확, 토큰 절약, 확장성 | 도구 스키마 설계 필요 | ✅ |
| B. 전체 컨텍스트 주입 | 구현 단순 | 토큰 폭증, 데이터 늘면 한계 | ❌ |
| C. 자연어→SQL 변환 | 유연성 | 보안 위험, 잘못된 쿼리 | ❌ |
| D. 사전 정의 대시보드만 | 안정적 | 자연어 X, 확장 어려움 | ❌ (보완 도구는 가능) |
| E. 백그라운드 배치 + 매일 리포트 | API 절약 | 실시간성 X | △ (후속) |

---

## 8. 영향 범위

### 변경 파일 (신규)
- `src/pages/AIAnalytics.jsx`
- `src/components/analytics/` 폴더 전체 (8개 컴포넌트)
- `src/lib/geminiAnalyst.js`, `geminiTools.js`
- `src/lib/analytics/` 폴더 전체 (6개 파일)
- `src/hooks/useAIAnalystChat.js`, `useInsightsStore.js`

### 변경 파일 (수정, 최소화)
- `src/App.jsx` — `case 'ai-analytics'` 라우팅 추가, props 전달 (orders, products, customers)
- `src/components/layout/Sidebar.jsx` — 메뉴 1개 추가 (`📊 AI 분석`)
- `src/components/layout/MobileNav.jsx` — 모바일 메뉴 검토 (6개 → 7개? 또는 더보기 메뉴)
- `package.json` — `recharts` 의존성 추가 (이미 있으면 생략)

### 무영향
- Supabase 스키마, RLS, RPC
- 기존 페이지 (POS, OrderHistory, Customers, Invoices 등)
- 기존 Gemini 호출 (TextAnalyze, AdminPage AI 입고)

---

## 9. 단계별 구현 (Phase)

### Phase 1: 도구 함수 (lib/analytics) 구축 — 2일
- `aggregations.js`, `customers.js`, `products.js`, `rfm.js` 단위 작성
- 입력 → 결과 JSON 형태 확정, 단위 테스트 (Vitest, 작은 샘플 데이터)
- App.jsx state(orders/customers/products)를 받는 인터페이스 설계
- **완료 기준**: 8개 함수 모두 정상 결과 반환, 0건/엣지케이스 처리

### Phase 2: Gemini Function Calling 루프 — 1~2일
- `geminiTools.js` 도구 스키마 작성
- `geminiAnalyst.js` 호출 루프 (최대 5회, 폴백, 캐시) 구현
- 콘솔에서 자연어 입력 → 답변 확인 (UI 없이 디버깅)
- **완료 기준**: "이번 달 TOP 5" → 정상 답변 받기

### Phase 3: 채팅 UI 구축 — 2~3일
- `AIAnalytics.jsx` + `ChatPanel.jsx` + `MessageBubble.jsx`
- 추천 질문 칩 / 히스토리 / 로딩 상태
- `useAIAnalystChat` 훅
- 사이드바/라우팅 연결
- **완료 기준**: 데스크탑/모바일에서 채팅 UI 동작

### Phase 4: 결과 자동 렌더링 — 2일
- `ResultRenderer.jsx` 타입 라우터
- recharts 차트 4종 (Line/Bar/Pie/KPI)
- lazy import 설정
- **완료 기준**: 모든 도구 응답이 적절한 시각화로 렌더

### Phase 5: 인사이트 저장 + 추천 질문 정렬 — 1일
- `InsightsCarousel.jsx` + `useInsightsStore` 훅
- 추천 질문 사용 빈도 정렬 로직
- **완료 기준**: 메모 저장/조회/삭제, 추천 질문이 사용 패턴 반영

### Phase 6: 검증 + 문서 + 배포 — 1~2일
- `/change-verify` 멀티 시나리오
- 실제 데이터로 10개 질문 시나리오 검증
- ARCHITECTURE.md / CHANGELOG.md 동기화
- GitHub Pages 배포
- **완료 기준**: 콘솔 에러 0건, 빌드 통과, 모바일 360px 정상

**총 예상 기간**: 9~12일 (Phase 1~6)

---

## 10. 위험 요소

| 위험 | 영향 | 대응 |
|------|------|------|
| **Gemini API 한도(160회/일) 부족** | High | 5분 캐시 + 동일 질문 dedup. 부족 시 5번째 키 추가 |
| **데이터 0건/소량으로 분석 의미 없음** | Medium | RFM은 최소 5건 이상 데이터 필요. 부족 시 "데이터 부족" 메시지 |
| **Gemini 환각 (없는 거래처 언급)** | High | 시스템 프롬프트에 "모르는 건 추측 X" 강제 + 도구 결과만 인용하도록 |
| **도구 무한 호출 루프** | Medium | 최대 5회 제한 + 동일 도구 동일 인자 중복 호출 차단 |
| **모바일 차트 렌더링 느림** | Low | recharts lazy + ResponsiveContainer + 모바일은 단순 표로 폴백 옵션 |
| **민감 매출 정보 외부 노출** | Medium | Gemini는 Google 정책상 학습 미사용(Pay-as-you-go) 확인. 거래처/제품명은 명확히 표시 필요 → 마스킹 안 함 |
| **응답 시간 지연 (사용자 이탈)** | Medium | 로딩 시 도구 호출 진행 상황 표시 (`🔍 거래처 데이터 조회 중...`) |
| **자연어 의도 오해석** | Medium | Gemini가 모호하면 사용자에게 되묻도록 시스템 프롬프트 명시 |

---

## 11. 다음 단계 (Plan 승인 후)

1. **사용자 검토** — 본 plan 검토 후 수정 요청
2. **Design 단계 진입** — `/pdca design ai-analytics`
   - 도구 함수 8개 입출력 스키마 상세 정의
   - RFM 임계값 디폴트 값 확정 (기본 3개월, 5점 척도 컷오프)
   - 시스템 프롬프트 한국어 문구 확정
   - UI mockup (채팅 + 결과 카드 + 차트) 와이어프레임
3. **Do 단계** — Phase 1부터 순차 구현
4. **Check** — `/pdca analyze` + `/change-verify`로 검증
5. **Act** — `/pdca report`로 최종 보고서

---

## 부록 A. 향후 확장 아이디어 (본 plan 범위 외)

- **음성 입력**: Web Speech API로 핸즈프리 질문
- **정기 리포트 메일**: 매주 월요일 자동 분석 + Gmail/카톡 전송
- **이상 탐지 알람**: 평소 패턴 이탈 시 자동 푸시 (예: 단가 0원 라인 발생, 30일 미수↑)
- **다기기 동기화**: Supabase `ai_insights` 테이블로 인사이트 영구 저장
- **제품 추천 엔진**: 거래처 구매 패턴 기반 다음 추천 제품 자동 산출
- **What-if 시뮬레이션**: "5% 단가 인상 시 매출 어떻게 될까?" 시뮬레이션
- **다국어 지원**: 영어 질문도 처리 (한국어 출력 유지)
