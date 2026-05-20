# TODO: AI 분석 어시스턴트 (ai-analytics)

> Plan: [ai-analytics.plan.md](./ai-analytics.plan.md)
> Created: 2026-05-20
> Status: 🟡 대기 중 (내일 시작 예정)
> Strategy: Gemini Function Calling

---

## 🚀 시작 전 체크리스트

- [ ] Plan 문서 최종 검토 ([ai-analytics.plan.md](./ai-analytics.plan.md))
- [ ] RFM 5세그먼트 임계값 사용자 확정 (Champion/Loyal/At-Risk/New/Lost)
- [ ] MVP 추천 질문 5개 외 추가 필요 시 결정
- [ ] 데이터 규모 확인 (`orders` / `customers` / `products` 건수)
- [ ] Gemini 키 4프로젝트 공유 사용 OK인지 재확인

---

## 📅 Phase 1: 도구 함수 (lib/analytics) 구축 — 2일 목표

### 폴더 생성
- [ ] `src/lib/analytics/` 디렉토리 생성

### 공통 유틸 — `aggregations.js`
- [ ] KST 기간 필터 헬퍼 (`filterByPeriod(orders, '1W'|'1M'|'3M'|'6M'|'1Y'|'ALL')`)
- [ ] 매출 합산 (`sumRevenue(orders, options)`) — VAT 포함/공급가/부가세 분리 옵션
- [ ] 거래처별 그룹핑 (`groupByCustomer(orders)`)
- [ ] 제품별 그룹핑 (`groupByProduct(orders)`)
- [ ] 월별 시계열 생성 (`monthlyTrend(orders, months)`)
- [ ] 단위 테스트 5건 (빈 배열 / 단일 주문 / 다수 / 경계일 / NaN 가드)

### 거래처 분석 — `customers.js`
- [ ] `getTopCustomers(orders, customers, { period, sortBy, limit })` 구현
- [ ] `getCustomerTrend(orders, customerId, months)` 구현
- [ ] `getCustomerSegments(orders, customers, { period })` 구현 (rfm.js 호출)

### RFM 점수 계산 — `rfm.js`
- [ ] `calcRFMScore(customer, orders, period)` — R/F/M 각 1~5점
- [ ] `classifySegment({r, f, m})` — Champion/Loyal/At-Risk/New/Lost 분류
- [ ] 임계값 기본값 정의 (`DEFAULT_RFM_THRESHOLDS` const)
- [ ] localStorage 임계값 로드 (`pos_ai_rfm_thresholds_v1`)
- [ ] 데이터 0건/최소 5건 미만 가드

### 제품 분석 — `products.js`
- [ ] `getTopProducts(orders, products, { period, limit, byCategory })`
- [ ] `getProductTrend(orders, productId, months)`
- [ ] `getRepeatPurchaseGap(orders, { productId? customerId? })` — 평균 재주문 주기 일수

### 어피니티 — `affinity.js`
- [ ] `getCustomerProductAffinity(orders, customerId, limit)` — 업체별 자주 사는 제품/카테고리

### 요약 — `summary.js`
- [ ] `getCompositeSummary(orders, customers, products, { period })` — 매출/주문수/AOV/신규거래처/반품률 묶음

### Phase 1 완료 기준
- [ ] 8개 함수 모두 정상 결과 반환
- [ ] 엣지케이스 (0건, NaN, 누락 필드) 처리
- [ ] Vitest 단위 테스트 통과

---

## 📅 Phase 2: Gemini Function Calling 루프 — 1~2일 목표

- [ ] `src/lib/geminiTools.js` 신규 — 8개 도구 JSON 스키마 정의
- [ ] `src/lib/geminiAnalyst.js` 신규
  - [ ] 시스템 프롬프트 작성 (한국어, "도구 결과만 인용, 추측 금지")
  - [ ] Gemini 호출 함수 (gemini-2.5-flash 우선)
  - [ ] Function Calling 루프 (최대 5회 제한)
  - [ ] 동일 도구 동일 인자 중복 호출 차단
  - [ ] 4프로젝트 키 폴백 로직 (TextAnalyze 패턴 참고)
  - [ ] 캐시 검사 (`pos_ai_cache_v1`, 5분 TTL)
- [ ] 콘솔 디버깅으로 "이번 달 TOP 5" 정상 답변 확인

### Phase 2 완료 기준
- [ ] 자연어 질문 → 도구 호출 → 자연어 답변 흐름 동작
- [ ] 5회 호출 제한 정상 작동
- [ ] 캐시 hit/miss 로그 확인

---

## 📅 Phase 3: 채팅 UI 구축 — 2~3일 목표

### 페이지 + 라우팅
- [ ] `src/pages/AIAnalytics.jsx` 신규
- [ ] `src/App.jsx` — `case 'ai-analytics'` 라우팅 추가, props 전달 (orders/products/customers)
- [ ] `src/components/layout/Sidebar.jsx` — `📊 AI 분석` 메뉴 추가
- [ ] `src/components/layout/MobileNav.jsx` — 모바일 메뉴 검토 (6 → 7개 또는 더보기)

### 채팅 컴포넌트
- [ ] `src/components/analytics/ChatPanel.jsx` 신규
- [ ] `src/components/analytics/MessageBubble.jsx` 신규 (사용자/AI 구분)
- [ ] `src/components/analytics/SuggestedQuestions.jsx` 신규 (5개 칩)
- [ ] 로딩 스피너 + 도구 호출 진행 상황 표시 (`🔍 거래처 데이터 조회 중...`)

### 훅
- [ ] `src/hooks/useAIAnalystChat.js` 신규
  - [ ] 메시지 히스토리 state
  - [ ] localStorage 동기화 (`pos_ai_analytics_history_v1`, FIFO 50건)
  - [ ] geminiAnalyst 호출

### Phase 3 완료 기준
- [ ] 데스크탑/모바일에서 채팅 UI 정상 동작
- [ ] 히스토리 새로고침 후 복원
- [ ] 추천 질문 클릭 → 자동 전송

---

## 📅 Phase 4: 결과 자동 렌더링 — 2일 목표

### 라우터
- [ ] `src/components/analytics/ResultRenderer.jsx` 신규
  - [ ] 데이터 타입 감지 (테이블 / 시계열 / TOP N / KPI / 단순 텍스트)
  - [ ] 적절한 차트로 자동 라우팅

### 차트 (recharts)
- [ ] `package.json` recharts 의존성 확인/추가
- [ ] lazy import 설정 (분석 페이지 진입 시에만 로드)
- [ ] `charts/TrendLineChart.jsx` — 월별 추이
- [ ] `charts/TopNBarChart.jsx` — TOP N 막대
- [ ] `charts/SegmentPieChart.jsx` — RFM 4분면
- [ ] `charts/KpiCards.jsx` — KPI 그리드 4분할

### 모바일 최적화
- [ ] ResponsiveContainer 적용
- [ ] 모바일 360px에서 차트 정상 렌더 확인
- [ ] 작은 화면은 단순 표 폴백 옵션

### Phase 4 완료 기준
- [ ] 8개 도구 응답 모두 적절한 시각화로 렌더
- [ ] 빌드 후 분석 페이지 chunk 분리 확인

---

## 📅 Phase 5: 인사이트 저장 + 추천 정렬 — 1일 목표

### 인사이트
- [ ] `src/components/analytics/InsightsCarousel.jsx` 신규
- [ ] `src/hooks/useInsightsStore.js` 신규 (CRUD)
- [ ] MessageBubble에 `📌 메모로 저장` 버튼
- [ ] localStorage `pos_ai_insights_v1` 영구 저장
- [ ] 페이지 상단 "최근 인사이트" 캐러셀 표시

### 추천 질문 정렬
- [ ] 사용 빈도 카운팅 (`pos_ai_quick_prompts_usage_v1`)
- [ ] 빈도 기반 정렬 + 기본 5개 항상 포함

### Phase 5 완료 기준
- [ ] 메모 저장/조회/삭제 정상
- [ ] 추천 질문이 사용 패턴 반영해서 재정렬

---

## 📅 Phase 6: 검증 + 문서 + 배포 — 1~2일 목표

### 검증
- [ ] 실제 데이터로 10개 시나리오 테스트
  - [ ] "이번 달 매출 TOP 5"
  - [ ] "VIP 세그먼트 분석"
  - [ ] "인기 제품 TOP 10"
  - [ ] "WP튠 김해 트렌드"
  - [ ] "재주문 유도 추천"
  - [ ] "강남오토가 자주 사는 제품"
  - [ ] "최근 3개월 신규 거래처"
  - [ ] "다운파이프 판매 추이"
  - [ ] "이번 분기 전체 KPI"
  - [ ] "모르는 질문" → 환각 없이 솔직 응답 확인
- [ ] `/change-verify auto` 자동 회귀 테스트
- [ ] 콘솔 에러 0건 확인
- [ ] 모바일 360px 정상 동작 확인

### 문서 동기화
- [ ] `CLAUDE.md` — AI 분석 어시스턴트 섹션 추가
- [ ] `docs/ARCHITECTURE.md` — pages/AIAnalytics.jsx + analytics 컴포넌트 등록
- [ ] `docs/CHANGELOG.md` — 작업 내역 기록
- [ ] localStorage 키 일람 업데이트 (5개 추가)

### 배포
- [ ] `npx vite build` 통과 확인 (`--base` 플래그 절대 금지)
- [ ] `npx gh-pages -d dist` 배포
- [ ] 프로덕션 URL에서 동작 확인 (https://aijunny0604-alt.github.io/pos-calculator-web/)
- [ ] Sentry 에러 모니터링 1시간 관찰

### Phase 6 완료 기준
- [ ] 빌드 통과, 콘솔 에러 0건
- [ ] 프로덕션 정상 동작
- [ ] 모든 문서 동기화 완료

---

## 🚨 주의사항 (구현 중 자주 까먹는 것)

- [ ] **빌드 시 `--base` 플래그 절대 금지** (vite.config.js에 이미 설정됨)
- [ ] **한국어 텍스트**: `break-keep leading-snug`, 영문 메모는 `break-words`
- [ ] **flex 자식**: `min-w-0` 필수, 아이콘은 `flex-shrink-0`
- [ ] **날짜 계산**: `+09:00 + toISOString()` 금지, `offsetDateKST()` 사용
- [ ] **타임존 버그**: `new Date("YYYY-MM-DD")`는 UTC 자정 → KST 9시간 시프트
- [ ] **NaN 가드**: `formatPrice` NaN-safe 이미 적용됨, 새 집계 함수도 동일하게
- [ ] **DB 무영향**: Supabase 스키마/RLS 절대 수정하지 말 것
- [ ] **Gemini 키 패턴**: 키 3개 × 모델 2개 + 503 재시도 (`feedback_gemini_api`에 보호 메모 있음)

---

## 📊 진행 상황 요약

- Phase 1: ⬜ 0/24
- Phase 2: ⬜ 0/9
- Phase 3: ⬜ 0/12
- Phase 4: ⬜ 0/10
- Phase 5: ⬜ 0/8
- Phase 6: ⬜ 0/19

**총 진행률**: 0 / 82 (0%)

---

## 🔗 참고 파일

- Plan 문서: [ai-analytics.plan.md](./ai-analytics.plan.md)
- 기존 Gemini 호출 패턴: [src/pages/TextAnalyze.jsx](../../../src/pages/TextAnalyze.jsx)
- 기존 모달/차트 패턴: [src/components/dashboard/](../../../src/components/dashboard/)
- 디자인 시스템: [docs/STYLE-GUIDE.md](../../STYLE-GUIDE.md)
