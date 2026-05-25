# POS Calculator Web

> 마지막 업데이트: 2026-05-25 (MOVIS UI 핫픽스 + 자율 분석)
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry + Gemini AI.

## 🆕 v2026-05-25 (2차) — Containing-block 함정 4건 핫픽스

CSS `transform`/`perspective`가 자식 `position: fixed`의 containing block을 viewport에서 부모로 바꾸는 spec 함정에 4가지 증상이 동시에 걸려있었음.

### 🐛 증상 → 원인 → 픽스
1. **모바일+PC MOVIS 빅뱅 인트로가 화면 아래로 밀림** — `AIAnalytics.jsx`의 `perspective: 1200px` 부모 div가 자식 BigBangIntro의 `fixed inset-0`을 가둠 → return문을 Fragment 구조로 바꿔 BigBangIntro를 perspective 부모 **밖**으로 hoist ([src/pages/AIAnalytics.jsx](src/pages/AIAnalytics.jsx))
2. **MOVIS 페이지 재진입 시 검은 화면에서 안 끝남** — `BigBangIntro`의 모듈 레벨 `lastBigBangStartTime` 1000ms 가드가 페이지 재진입에 걸려서 `onComplete` 안 호출 → 부모 `introDone=false` 영원히 → 가드 100ms로 축소(StrictMode 더블 마운트는 <16ms이므로 충분) + 가드 트립 시 `completedRef=true` + `Promise.resolve().then(() => onComplete?.())` 마이크로태스크 보장 ([src/components/analytics/BigBangIntro.jsx](src/components/analytics/BigBangIntro.jsx))
3. **미확인 메모 토스트가 사이드바 빼고 main 중앙으로 밀림** — AppLayout의 `.animate-page-in` wrapper가 `transform: translateY(6px → 0)` + `fill-mode: both`로 transform이 영구 적용된 상태 → 자식 fixed 토스트가 main 영역 기준 → 키프레임을 opacity-only로 변경 ([src/index.css](src/index.css) `@keyframes page-fade-in`)
4. **MOVIS 메인화면 양자 sphere 회전이 너무 빠름** — `JarvisDotSphere` 4개 상태의 `spinSpeed`를 원본 대비 1/4로 추가 감속 (standby 0.0025 / listening 0.005 / analyzing 0.009 / responding 0.003) ([src/components/analytics/JarvisDotSphere.jsx](src/components/analytics/JarvisDotSphere.jsx))

### 🎓 규칙 추가 (containing-block 함정)
**자식 `position: fixed`가 viewport 기준이 되어야 하는 곳에는 부모 체인에 `transform` / `translate` / `perspective` / `filter` / `will-change: transform` 금지**. 페이지 전환/모달 진입 애니메이션은 opacity-only로 작성 (또는 fixed 자식을 portal로 body에 렌더). 새로운 transform-bearing wrapper 추가 시 fixed 자식이 안에 있는지 반드시 확인.

---

## 🆕 v2026-05-25 — MOVIS 자율 분석 (대시보드 스마트 알림)

대시보드 진입 시 AI가 자동으로 매장 상태를 분석하여 이상 징후를 알림 카드로 표시. 기존에 구현된 고급 분석 함수를 실제 화면에 연결한 첫 번째 스마트 업그레이드.

### 🤖 자율 이상 징후 탐지 (Dashboard)
- **useSmartAlerts 훅** ([src/hooks/useSmartAlerts.js](src/hooks/useSmartAlerts.js)): 대시보드 데이터 로드 후 자동 실행
  - `detectAnomalies` — 매출 급감/급증, 미수 임계 초과, 품절 인기 제품, 휴면 위험 거래처, 반품률 급증, 대량 출고
  - `getStockCoverageForecast` — 14일 이내 품절 예상 제품 자동 표시
  - `getMarginLeakage` — 도매가 이하 판매/마진율 10% 미만 자동 탐지
  - **30분 TTL localStorage 캐시** (`pos_smart_alerts_v1`), dynamic import로 메인 번들 +0KB
  - paymentRecords + customerReturns는 hook 내부에서 비동기 fetch (Dashboard prop 불필요)
- **SmartAlertFeed 컴포넌트** ([src/components/dashboard/SmartAlertFeed.jsx](src/components/dashboard/SmartAlertFeed.jsx)):
  - 심각도별 배지 (긴급=빨강 glow / 주의=노랑 / 정보=파랑)
  - 접기/펼치기 + 더보기 + 새로고침 + "AI에게 자세히 물어보기" → AI Analytics 딥링크
  - 0건이면 "이상 징후 없음 — 매장 상태 정상" 초록 카드
- **detectAnomalies Gemini 도구 추가** — AI 채팅에서 "매장 상태 어때?", "이상 없어?", "경고 알려줘" 질문 가능

### 📦 localStorage 키 추가
- `pos_smart_alerts_v1` — 대시보드 스마트 알림 캐시 (30분 TTL)

---

## 🆕 v2026-05-21 — AI 분석 어시스턴트 (Phase 1+2+3)

자연어로 거래처/제품/VIP/매출 분석 + 전략 도출. Gemini Function Calling 기반 (DB 무영향).

### 💬 자연어 분석 채팅
- 사이드바 **`✨ AI 분석`** 메뉴 (관리자 위)
- "이번 달 매출 1위 누구야?" / "VIP 세그먼트 분석" / "WP튠 김해 트렌드" 자연어 질문
- Gemini 2.5-flash가 9개 분석 도구 중 적절한 것 선택 → 클라이언트 집계 → 자연어 답변 + 추천 액션
- 추천 질문 6개 + 사용 빈도 기반 자동 재정렬

### 🛠 분석 도구 9종 (`src/lib/analytics/`)
- 거래처: `getTopCustomers` / `getCustomerTrend` / `getCustomerSegments` (RFM 5세그먼트) / `getDormantCustomers`
- 제품: `getTopProducts`(제품/카테고리) / `getProductTrend` / `getRepeatPurchaseGap`
- 어피니티: `getCustomerProductAffinity` (자주 사는 제품/카테고리)
- 종합: `getCompositeSummary` (매출/AOV/활성/신규/반품률 KPI + 이전 기간 변화율)

### 🎯 RFM 5세그먼트
- **Champion** (VIP): R≥4 && F≥4 && M≥4
- **Loyal**: R≥3 && F≥3 (안정 단골)
- **At-Risk**: R≤2 && (F≥3 || M≥3) (재유도 대상)
- **New**: R≥4 && F≤2 (신규 정착 유도)
- **Lost**: R≤1 && F≤2 (휴면)
- **Regular**: 폴백
- 임계값 기본: R 14/30/60/90일, F 1/2/4/7건, M 10만/50만/150만/400만원 (자동차 튜닝 재구매 주기 보수 세팅)

### 🚦 격리 전략 (사이드 이펙트 0)
- DB 변경 없음 — 신규 테이블/컬럼 0건
- 기존 페이지 무영향 — 신규 페이지/컴포넌트만 추가, App.jsx 라우팅 1줄 + Sidebar 1줄만 수정
- Gemini API 키 공유 — 신규 키 미발급, 기존 4프로젝트 풀 사용
- AIAnalytics는 lazy import — `AIAnalytics-*.js` 41.50KB chunk 분리, 기존 index.js +0.62KB만 증가

### 🚨 환각 방지
- 시스템 프롬프트에 "도구 결과만 인용, 거래처/제품명 새로 만들지 말 것" 강제
- 도구 결과 빈 결과 → "데이터 부족" 솔직히 답변
- 단순 통계 나열 금지 → 인사이트 + 추천 액션 1~2개 의무

---

## 🆕 v2026-05-11 — code-review Critical 핫픽스 3건 (이전 변경 이력)

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry.

## 🆕 v2026-05-11 — code-review Critical 핫픽스 3건

### 🚨 supabase.getOrderById 신규 추가 (Critical #1)
- 이전엔 `CustomerDetailModal.jsx:161`에서 호출만 있고 정의 없는 미정의 함수 — 거래처 모달 → 미수 카드 클릭 시 캐시 미스(orders 배열에 order_id 없음) → "is not a function" 런타임 크래시 위험
- 신규: [src/lib/supabase.js](src/lib/supabase.js) `getOrderById(orderId)` — `?id=eq.${encodeURIComponent(id)}&limit=1` REST 패턴, `!orderId` 가드 + 결과 단건 반환, catch 시 null

### 🚨 OrderDetail handleReplaceProduct 할인 메타 보존 (Critical #2)
- 이전: 할인 적용된 라인을 다른 제품으로 통째 교체할 때 `{id, name, price, quantity}`만 들고 새 라인 생성 → `originalPrice/discountType/discountValue` 조용히 destruction
- 신규: 기존 라인에 할인 있으면 `confirm` 다이얼로그로 사용자 알림 + 새 라인에 메타 3필드 `null` 명시 clear ([src/pages/OrderDetail.jsx:218~261](src/pages/OrderDetail.jsx#L218))
- 호출 패턴: `handleAddProduct`는 기존 라인 quantity만 +1이라 메타 보존 (안전)

### 💵 CustomerDetailModal setPaid 4-arg 보강 (WARN)
- 이전: `setPaid(orderDetail.id, k)` 2-arg → CLAUDE.md 규칙 위반, no_customer fail-safe 미동작 가능
- 현재: `setPaid(orderDetail.id, k, orderDetail, customer ? [customer] : [])` ([CustomerDetailModal.jsx:667](src/components/CustomerDetailModal.jsx#L667))
- 효과: N+1 회피 + customers hint 명시 → syncOrderPaidRecord 거래처 매핑 정확

---

## 🆕 v2026-05-10 — 모바일 모달 안정화 + 번들 최적화 (origin 머지)

### 🪟 SavedCarts 편집 모드 하단 잘림 fix (시작점 버그)
- Status 편집 섹션을 `flex-shrink-0` 형제 → 스크롤 본문 안으로 편입 (`-mx-3 sm:-mx-6` 풀너비 breakout). 모바일 maxHeight 85vh 초과 시 저장/취소 버튼 잘림 해결

### 💬 window.confirm → ConfirmDialog 교체 (모바일 UX)
- iOS Safari native confirm 스레드 차단 + 깨짐 해결
- 적용: `PaymentEditModal.jsx` 입금 기록 삭제, `OrderDetail.jsx` 반품 취소
- stacking 안전 패턴: Fragment + `z-[110]` wrapper (PaymentEditModal), `z-[65]` wrapper (OrderDetail), SavedCarts는 detail 모달 먼저 닫고 ConfirmDialog 오픈 (clean stack)

### 📦 exceljs 940KB 프리로드 제거 (성능)
- 이전: `CustomerDetailModal.jsx` top-level `import exportExcel` → entry chain에 묶여 940KB 모바일 부팅 시 modulepreload
- 현재: `handleExport` 안에서 `await import('@/lib/exportExcel')` dynamic 호출 → 별도 13.50KB chunk 분리, exceljs는 Excel 버튼 클릭 시점까지 미로드
- `index.js` 729.68KB → 717.53KB (-12KB), TTI 추정 6-8s → 4-5s on slow 4G

### 📐 modal-scroll-area 패턴 추가 (iOS 러버밴드)
- `PaymentRegisterModal.jsx`, `PaymentEditModal.jsx`, `CustomerDetailModal.jsx` (OrderDetailPopup)
- `overscroll-contain` + `modal-scroll-area` 마커 + `touchAction: 'pan-y'` + `onTouchMove stopPropagation`

---

## 🆕 v2026-04-30 — 할인 시스템 + 완불체크 DB 동기화 + QuickItemBar + 모바일 정리

### 🏷 라인별 할인 시스템 (3가지 모드)
- **신규 유틸** ([src/lib/discount.js](src/lib/discount.js)): `calcFinalPrice(base, type, value)`, `convertDiscountValue`, `discountLabel`, `discountPlaceholder`
- **3 모드**: `percent` (할인율) / `amount` (차감 금액) / `fixed` (지정 단가)
- **데이터 모델 (items JSON 신규 필드, DB 스키마 무변경)**:
  - `originalPrice` — 정가 (할인 적용 전)
  - `discountType` — `'percent' | 'amount' | 'fixed'`
  - `discountValue` — 사용자 입력값 (그대로 보존)
  - `price/wholesale/retail` — 할인 후 최종가로 동기화 (명세서/주문 변환 흐름과 호환)
- **토글 동작**: 모드 전환 시 같은 결과 유지하며 value 자동 변환 (예: 1% = 2,191원)
- **단가 input 안전장치**: 할인 적용 중에는 `readOnly` (실수로 메타 날아가는 것 방지). 변경하려면 [해제] 후 가능
- **적용 화면**: SavedCarts 카트 상세 모달, OrderDetail 모바일/데스크탑, OrderHistory 카드 (`🏷 할인 N건 (-X원)` 인디케이터), CustomerList 주문 카드 라인, CustomerDetailModal OrderDetailPopup, InvoicesPage 명세서 (정가 strikethrough + 할인 배지)

### 💵 완불체크 → DB 자동 동기화 (Critical fix)
- **이전 문제**: `[완불 체크]` 버튼이 `localStorage`(useManualPaid)에만 저장 → 거래처 관리/명세서/미수 통계 미반영 ("결제 레코드 미생성")
- **신규 함수** ([src/lib/supabase.js](src/lib/supabase.js)):
  - `syncOrderPaidRecord(orderId, methodKey, orderHint, customersHint)` — payment_records 자동 생성 + payment_history 전액 입금 row 추가 (memo: `[자동] 완불체크 (수단)`)
  - `revokeAutoPaidHistory(orderId)` — 자동 history만 회수 + 빈 record 자동 삭제 ("결제 레코드 미생성"으로 정확히 복원)
- **호출 체인**: `OrderHistory → setPaid(id, method, order, customers) → useManualPaid → supabase.syncOrderPaidRecord` (Promise 반환, customersHint로 N+1 회피)
- **C1 fail-safe**: 거래처 매핑 실패 시 `{success:false, reason:'no_customer'}` 반환 → 호출부에서 alert로 사용자에게 명시적 알림

### 🚨 payment_records DB 제약 (필독)
- `balance` = **generated column** (`total_amount - paid_amount`). INSERT/UPDATE 페이로드에서 **반드시 제외**. 포함하면 `400 code:428C9 "balance can only be updated to DEFAULT"` 발생
- `payment_status` = **generated column** (paid_amount/total_amount 비교). 동일하게 페이로드 제외 필수
- 갱신 가능 컬럼: `paid_amount`만 변경. 두 generated columns는 DB가 자동 계산

### 📦 QuickItemBar — 부가 항목(택배비/퀵비/수수료) 즉석 추가
- **신규 컴포넌트** ([src/components/ui/QuickItemBar.jsx](src/components/ui/QuickItemBar.jsx)) + 훅 ([src/hooks/useQuickItems.js](src/hooks/useQuickItems.js))
- **기본 프리셋**: 택배비 5,000 / 퀵비 30,000 / 수수료 0 (`builtin: true`로 보호)
- **사용자 프리셋**: 추가/삭제/이름·금액 인라인 편집 가능
- **localStorage 키**: `pos_quick_items_v1`
- **라인 추가 시 마커**: `isCustom: true`, `presetId: 'shipping' | 'quick' | ...`
- **ID 충돌 방지**: `${preset.id}_${Date.now()}_${random5}` (빠른 클릭 race 방지)
- **UX**: 커스텀 펼침 ↔ 프리셋 관리 펼침 mutex (한쪽 열면 반대쪽 자동 닫힘), 커스텀 닫을 때 input 자동 reset
- **적용 위치**: SavedCarts 카트 상세 편집 모드, OrderDetail 편집 모드 (모바일/데스크탑)

### 🪟 CustomerDetailModal OrderDetailPopup 재설계
- **이전**: max-w-lg 작은 모달, 품목 10개 잘림, 할인 표시 없음
- **현재**: max-w-3xl + max-h-[90vh] flex column, 합계 배너 (총금액/공급가액/부가세 3개 박스), 품목 전체 노출 + 정가 strikethrough + `🏷 할인` 배지
- 헤더는 success 그린, 푸터에 [닫기] 버튼

### 🎬 OrderHistory 통계 카드 폰트↑ + 카운트업
- **신규 훅** ([src/hooks/useCountUp.js](src/hooks/useCountUp.js)): cubic ease-out 700ms, 직전값 → 새 값 보간
- 통계 카드 6개 (조회 주문 / 매출 / 공급가액 / 부가세 / 반품 / 메모) 폰트 `text-base/lg` → `text-2xl sm:text-3xl font-black` (16 → 30px)
- gradient bg + 색상별 glow `textShadow` + `tabular-nums` + `hover:-translate-y-0.5`

### 🪟 SavedCarts 카트 상세 — 모바일 정리 + 인라인 편집
- 편집 모드 카드 세로 적층: 1행 제품명 input → 2행 단가 input + 합계 → 2.5행 할인 토글/펼침 → 3행 수량 컨트롤 + 삭제
- 헤더 `px-4 py-4` → `px-3 sm:px-6 py-3 sm:py-4` 모바일 패딩 축소
- 주문 상태 5개 → `grid-cols-5` 균등, 우선순위 4개 → `grid-cols-4`, 배송예정일 ↔ 우선순위 모바일 1열/sm 2열

### 🔧 코드 정리
- **공용 추출**: `src/lib/discount.js`, `src/hooks/useCountUp.js`, `src/hooks/useQuickItems.js`, `src/components/ui/QuickItemBar.jsx`
- **잔여 후순위 (P3)**: DiscountControlRow 컴포넌트 추출 (모바일/데스크탑 ~120줄 중복), CustomerDetailModal `fmt` 함수 중복 제거, useQuickItems 멀티디바이스 동기화

## 🆕 v2026-04-28 — 명세서 0원 버그 fix + 부가세 표시 통일 + UI 일관성 강화

### 🚨 명세서 0원 버그 (Critical fix)
- **원인**: `App.jsx onOrder` 핸들러(저장 카트 → "주문확인" 흐름)가 `cartData.items`를 그대로 saveOrder에 전달 → DB에 `price` 필드 누락 저장 → 명세서가 `item.price` 직접 읽으니 0원 표시
- **fix** (`App.jsx:1023-1046`): `items.map`으로 폴백 체인(`price → wholesale → retail → 0`) + `Number()` 강제 + `> 0` 가드. saveOrder에서 한 번 더 검증으로 이중 안전망
- **DB 일괄 보정**: 동일 패턴으로 손상된 기존 10건(진주 소울 스포츠 외 9건)을 Supabase MCP로 `price` 필드 보강 완료. 잔여 3건(자바라 무료 라인 등)은 products 마스터 가격 0이라 의도된 0원으로 판단, 미보정

### 📊 부가세 표시 통일 (`<SubPrice />` 헬퍼 컴포넌트)
- **신규 컴포넌트** (`src/components/ui/SubPrice.jsx`): `total`, `layout='inline|stacked|supply-only'`, `size='sm|xs'`, `showWon` props
- 4개 화면에 일괄 적용: OrderHistory, CustomerList, SavedCarts, SaveCartModal — 18줄 반복 JSX → 1줄 컴포넌트
- `calcExVat()` 1회 계산 후 ex/vat 재사용 (성능 ↑), 라벨 "공급가/부가세" 통일, 폰트 토큰 sm=11px/xs=10px 표준화
- NaN-safe: `Number.isFinite() && t > 0` 가드

### 🤖 AI 주문 인식 → OrderPage 자동 오픈
- **이전**: AI 인식 → 담기 → SaveCartModal(장바구니 저장) 자동 오픈
- **현재**: AI 인식 → 담기 → **OrderPage(주문서)** 자동 오픈 (App.jsx `autoOpenOrderConfirm` state + MainPOS useEffect 신호)
- TextAnalyze 버튼 라벨: "장바구니 담기" → **"주문하기"**

### 🔍 OrderPage 거래처 검색 안전화 + SaveCartModal 검색 추가
- OrderPage 부모 onClick 외부 클릭 닫기 로직에 `data-customer-search-area` 마커 + closest 매칭 시 skip
- input/dropdown 컨테이너에 `onClick` + `onMouseDown` stopPropagation 이중 안전망
- **SaveCartModal에 거래처 검색 드롭다운 신규 추가** (이전엔 완전일치 시에만 자동 채움) — OrderPage 패턴 일관

### 📄 명세서 안내 문구 인라인 편집
- `TraditionalInvoice` 푸터에 ✏️ 수정 버튼 → 인라인 textarea + 라디오 (이 업체만 / 전체 기본)
- localStorage 키:
  - `pos_invoice_footer_default_v1` — 사용자 기본값 (모든 업체 자동 적용)
  - `pos_invoice_footer_overrides_v1` — `{ [customerId]: customNotice }` 개별
- 표시 우선순위: 개별 오버라이드 > 사용자 기본 > `settings.invoice_footer` > 없음
- 명세서 업체명 "🏢 N 귀하" 빨간색 → **검정/다크그레이**(`#1f2937`)로 톤다운. 잔액 빨간색은 강조 유지

### 🚚 택배 송장 페이지 — 저장 카트 합치기
- ShippingLabel에 `savedCarts` prop 추가, `delivery_date === todayKST`인 카트만 필터해 주문 형식으로 변환(`CART-XXXXXX` 주문번호, `__fromSavedCart: true`)
- 시각 구분: amber 배경 + 좌측 3px 액센트 바 + `📦 출고예약` 알약 배지

### 🪟 SavedCarts 상세 모달 OrderDetail과 통일
- `useModalFullscreen` → **`useDraggableResizable('pos-web.savedCartDetailModal', { w: 1200, h: 820 })`** 교체 (드래그/리사이즈/더블클릭 전체화면)
- 사이즈 통일: `min(72rem, ...)`, `calc(100vh - 2rem)`
- 합계 영역 접기/펼치기 (`isBottomExpanded` + ChevronDown/Up)
- 하단 버튼 반응형 (`flex-wrap`, `min-w-[7rem]`, 작은 화면 padding/font 축소)

### 🎬 모달 fullscreen 애니메이션 복구 (`useDraggableResizable.jsx`)
- 원인: 데스크탑 모드에서 inline `width/height/left/top`으로 사이즈 제어하는데 CSS `.modal-fs-transition`은 `max-width/max-height`에만 transition → 토글 즉시 점프
- fix: `transitioning` state + setTimeout 480ms — 토글 시점에만 inline transition spring 적용. 드래그/리사이즈 중엔 OFF로 잔상 방지
- 영향 범위: OrderDetail, AdminPage, BurnwayStock, CustomerList, MainPOS, NotificationSettings, SaveCartModal, ShippingLabel, **SavedCarts 등** 전 모달 일괄 복구

### 📐 OrderDetail 그리드 정렬 재조정
- 컬럼 비율: `1+3+3+2+3` (제품명/단가/수량/금액)
- **모든 숫자 셀 `text-center`** — 각 칸 정 가운데 정렬 + `tabular-nums` 자릿수 통일
- 데스크탑 단가/금액 폰트: `text-base/lg` → `text-lg/xl` (보조 라인 13px)
- 모바일 카드: 단가/금액 셀에 `공급 N원` 인라인 추가

### 🛒 MainPOS 카트 정리
- 제품 카드 우측 ⊕ 아이콘 모두 제거 (사용자 요청 — 시각 군더더기 제거)
- 카트 품목 라인 우측에 `공급 N` 작은 회색 추가

### 📦 재고현황 통계 카드 폰트 ↑ (`StockOverview.jsx:181-201`)
- 숫자: `text-base font-bold` → **`text-2xl sm:text-3xl font-black`** (16px → 30px)
- 라벨: `text-[10px]` → `text-xs sm:text-sm font-medium`
- 카드 padding `p-2` → `p-3 sm:p-4`, gap `1.5` → `2 sm:3`, border-radius `lg` → `xl`

### 📋 plan 문서 신규
- `docs/01-plan/features/invoice-amount-override.plan.md` — 명세서 금액 임의 수정 발행 시스템 (% / 원 단위 할인·할증, 적용 범위 3단계, localStorage 우선) — 미래 구현 대기

## 🆕 v2026-04-27 — 주문 카드 가독성 개선 + 배포 누락 복구

- **🚨 배포 누락 복구**: 4/21 이후 6일치 변경(스피너 강제, AI 주문 자동 모달, 명세서/결제 UX 대개편 등)이 `pos-calculator-web` 라이브에 누락된 상태였음. 재배포로 복구. **다음부터 두 사이트(pos-calculator/web) 동시 배포 시 반드시 둘 다 `gh-pages` 실행 확인**
- **공급가 인라인 표시** (`OrderHistory.jsx:798-805`): 주문 카드 합계 옆에 `(공급가 N원)` 작은 회색 괄호 인라인. `whitespace-nowrap`로 줄바꿈 방지. 부가세 포함/미포함 혼동 방지
- **확대/닫기 버튼 그룹화** (`CustomerList.jsx:904-919`): `justify-between` + 자식 3개 → 확대 버튼 가운데 밀림. `flex gap-1` 컨테이너로 묶어 우상단 정렬. OrderDetail 모달과 일관
- **반품 카드 amber 톤 강조** (`OrderHistory.jsx:664-708`): 카드 전체 주황 배경 + 2px 테두리 + 그림자 + 상단 그라데이션 액센트 바 + 우상단 흰 "반품" 알약 배지. 우선순위: 선택됨 > **반품** > 완불 > 블랙리스트
- **반품 "기간 내 처리" 배지 문구 동적화** (`OrderHistory.jsx:884-893`): `⚡ 기간 내 처리` → 필터에 따라 `오늘 반품 처리` / `어제 반품 처리` / `M/D 반품 처리` (커스텀 날짜). 옛날 주문이 반품일 매칭으로 단일 일자 필터에 끼어들 때 "왜 보이는지" 설명 시그널

## 🆕 v2026-04-23 (2차) — Phase 9 Cross-navigation + 입금 모달 리디자인 + 데이터 품질 가드

- **명세서 Phase 9 Cross-navigation** (`InvoicesContainer.jsx` 신규): 명세서 페이지의 각 업체 섹션에 `💵 입금 받기` / `💰 일괄 입금` / `👁 업체 상세` 액션 바. 거래처 관리의 `CustomerDetailModal`에는 `📄 명세서 발행하기` 버튼 → 해당 업체 자동 선택된 명세서로 점프. 페이지 이동 없이 양방향 통합
- **명세서 UX**: 업체 선택 시 그 업체 이월 날짜가 **체크박스 옆에 인라인 펼침**, Sticky 헤더 + ▲/▼ 접기 토글, 레이아웃 `max-w-[1600px]` + 폰트/패딩 확대, 테이블 행 **✏️ 수정 / ✕ 제외** 버튼 (localStorage 오버라이드, 원본 DB 무영향), 단가 0원 행 자동 빨간 하이라이트
- **입금 모달 리디자인** (`PaymentRegisterModal.jsx`): `max-w-md` → `max-w-2xl`, **1/2/3 단계 숫자 뱃지**, 전액/절반/+10만/+50만/+100만 빠른 금액 버튼, 대형 결제 방법 버튼, **과세/비과세 토글 + 택배비/퀵비/수수료 동적 부가 항목 + 💹 실시간 합계 모니터링 카드**. 저장 시 memo에 `[비과세][택배비 5,000원]...` 태그 prepend (DB 스키마 무변경)
- **CustomerDetailModal**: StatBox 라벨 `받을 돈(미수)/전체 주문/받은 횟수` + 힌트 1줄, 숫자+단위 인라인 한 줄, 일괄 입금은 `▶ 고급: 월말 정산용` details 접힘으로 강등
- **데이터 품질 가드 (1단계)**: `MainPOS.addToCart`에서 wholesale·retail 둘 다 0원이면 카트 담기 거부. `App.saveOrder`에서 price 누락/0원 item 발견 시 confirm 경고. `formatPrice` NaN-safe. `CustomerList` 주문 상세 모달에 `item.price ?? wholesale ?? retail ?? 0` 폴백 + "⚠️ 단가 누락" 배지
- **기타 UI**: `OrderDetail` 확대/X 버튼 그룹화(딱 붙음), `SavedCarts` 도매/소비자 배지 타이틀 옆 정렬

## 🆕 v2026-04-23 (1차) — 명세서·결제 UX 대개편

- **거래명세서 모던 양식**: 전통 격자 → 공급자/공급받는자 2단 + 대형 합계 배너 + 줄무늬 품목 테이블. `규격` 컬럼 제거
- **미수 업체 원클릭 리스트**: 좌측 사이드바에 76개 미수 업체 내림차순 표시, 클릭 한 번으로 해당 업체 명세서 즉시 전환
- **이월 날짜 드로어**: 기본 접힘, 체크된 날짜만 본문/PNG/인쇄에 포함 (69일 중 선택)
- **페이먼트 → 거래처 관리 통합**: 사이드바 `페이먼트` 메뉴 제거, 거래처 관리 페이지 상단 탭으로 흡수
- **주문 카드에 결제 임베드**: 업체 상세의 각 주문 카드에 [미수/부분/완납] 배지 + 잔금 + 입금 이력 + [💵 입금 등록] 버튼

## 🗂️ v2026-04-20 이전 변경

- **OrderDetail 모달**: 드래그 이동 + 8방향 리사이즈 + 더블클릭 전체화면 (데스크톱 전용, 모바일은 기존 중앙 유지)
- **OrderHistory/OrderDetail**: 수동 완불 체크 기능 (카드/현금/계좌이체/기타) — **pos-payments와 localStorage 공유**
- **4개 모달 드래그/리사이즈 적용**: SaveCartModal, QuickCalculator, NotificationSettings, ShippingLabel 부속 모달
- **접근성**: `prefers-reduced-motion` 대응 + `focus-visible` 포커스 링 통일
- 신규 훅: `src/hooks/useDraggableResizable.jsx`, `src/hooks/useManualPaid.js`

## 빌드/배포

```bash
npm run dev              # 개발 서버
npx vite build           # 빌드 (--base 플래그 절대 금지!)
npx gh-pages -d dist     # GitHub Pages 배포
```

> `vite.config.js`에 `base: '/pos-calculator-web/'` 설정됨. `--base` 사용 시 빈 페이지 발생.

## 핵심 규칙

- **텍스트 표시**: `truncate` 금지. 제품명/메모는 `break-words leading-snug`, 한국어 주소/이름은 `break-keep leading-snug` 사용. flex 자식에는 `min-w-0`, 아이콘/버튼은 `flex-shrink-0` 필수
- **날짜 계산**: `+09:00` + `toISOString()` 조합 금지, `offsetDateKST()` 사용
- **새 제품 추가**: `supabase.addProduct(POST)` 사용. `saveProduct`은 id 있으면 PATCH
- **주문 저장**: 같은 고객 당일 주문 자동 병합. WebSocket 실시간 반영
- **가격 0원 방어**: 카트 담기는 **경고만**(자바라 무료 라인 등 의도된 0원 허용). 주문 저장은 confirm 게이트로 사용자 확인 후 진행. `formatPrice`는 NaN-safe (모든 비유한수 → '0'). 명세서 등 소비자 표시에서는 `price ?? wholesale ?? retail ?? 0` 폴백 체인 사용. **카트 차단 금지** — 2026-04-23 (1단계) 도입 후 운영에서 정상 0원 라인까지 막혀 차단 정책은 철회 (2026-05-15)
- **명세서 수동 수정**: 원본 `orders.items`는 절대 건드리지 않음. 명세서 한정 조정은 localStorage 키 `pos_invoice_line_overrides_v1`에 `{ [recordId:itemIndex]: {name, qty, unitWithVat, deleted} }` 형태로 저장
- **명세서 안내 문구**: localStorage 키 — 사용자 기본 `pos_invoice_footer_default_v1` (string), 업체별 개별 `pos_invoice_footer_overrides_v1` (`{ [customerId]: text }`). 표시 우선순위: 개별 > 기본 > `settings.invoice_footer`
- **공급가/부가세 표시**: 모든 화면은 `<SubPrice total={X} layout="stacked|inline|supply-only" size="sm|xs" />` 헬퍼 사용 ([src/components/ui/SubPrice.jsx](src/components/ui/SubPrice.jsx)). 라벨/폰트 일관성 + calcExVat 1회 계산. NaN-safe 내장
- **입금 확장 필드**: `payment_history`에 컬럼 추가 대신 `memo` 앞에 `[과세/비과세][택배비 N원][퀵비 N원]` 태그 prepend. 집계 필요 시 DB 컬럼(`is_vat_exempt`, `extra_fees JSONB`)으로 승격 예정
- **저장 카트 → 주문 변환**: `App.jsx onOrder` 핸들러에서 `items.map`으로 `price` 폴백 체인(`price → wholesale → retail → 0`) + `Number()` 강제 필수. 누락 시 명세서 0원 버그 재발
- **AI 학습**: 주문인식 수동 교정 시 자동 학습 → 다음 인식에 반영 (3중: DB → Gemini 프롬프트 → 패턴 매칭)
- **할인 메타 보존**: 라인에 `originalPrice/discountType/discountValue` 필드 있으면 절대 삭제하지 말 것. 단가 직접 수정은 할인 메타를 명시적 해제 후만 허용 (현재 단가 input은 할인 적용 중 readOnly). 명세서/주문 변환은 `price` 필드만 사용하므로 메타가 있어도 무영향. 자세한 계산은 [src/lib/discount.js](src/lib/discount.js) `calcFinalPrice` 사용. **제품 교체(handleReplaceProduct) 시**: 기존 라인에 할인 있으면 confirm 다이얼로그 필수 + 새 라인에 3필드 `null` 명시 clear (2026-05-11 Critical #2 fix). 새 라인 추가/quantity 증가 패턴은 자동 보존됨
- **payment_records 갱신**: `balance`, `payment_status`는 **generated columns**. INSERT/UPDATE 페이로드에 절대 포함 금지 (400 code:428C9). `paid_amount`만 갱신하면 DB가 자동 계산
- **완불체크 동기화**: `useManualPaid.setPaid(orderId, method, order, customers)` — 4번째 인자 customers 필수 (N+1 회피). **모든 호출부 4-arg 강제** (2026-05-11 WARN fix). `CustomerDetailModal`은 단일 거래처 컨텍스트라 `[customer]` 배열로 전달. 동기화 실패 시 호출부에서 `res.syncResult.reason === 'no_customer'` 검사하여 alert. 자동 history 식별자: `memo` prefix `[자동] 완불체크`
- **단건 주문 조회**: `supabase.getOrderById(id)` — payment_record.order_id가 orders 캐시에 없을 때 안전한 단건 조회. 신규 함수 (2026-05-11 Critical #1 fix). encodeURIComponent + null 가드 내장
- **부가 항목 (QuickItemBar)**: 택배비/퀵비/수수료 등은 `items` 배열에 `{ name, price, quantity:1, isCustom:true, presetId? }`로 저장. 프리셋은 localStorage `pos_quick_items_v1`에 보관. 빌트인 3개는 `builtin:true`로 보호되어 삭제 불가

## Supabase

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 테이블: orders, products, customers, customer_returns, saved_carts, ai_learning, **payment_records**, **payment_history**, **manual_paid_orders**
- 관리자 비밀번호: `4321`
- **orders 주의**: `updated_at`, `status` 컬럼 없음. PATCH 시 미존재 컬럼 포함하면 PGRST204로 전체 실패
- **customer_returns 주의**: PK는 `id`(bigint auto), 삭제 시 `return_id`(text) 사용
- **payment_records 주의** (v2026-04-30): `balance`, `payment_status`는 **generated columns** (DB 자동 계산). UPDATE 페이로드에 포함하면 `400 code:428C9 "can only be updated to DEFAULT"`. `paid_amount`만 갱신
- **payment_history**: `payment_record_id`(FK), `amount`, `method`, `paid_at`, `memo`. 자동 생성된 row는 `memo` prefix `[자동] 완불체크 (수단)`로 식별
- **manual_paid_orders**: 수동 완불 체크의 시각 마커 (UPSERT key: `order_id`). useManualPaid 훅이 멀티 디바이스 Realtime 동기화

### localStorage 키 일람
- `pos_invoice_line_overrides_v1` — 명세서 라인 수동 수정 (원본 무영향)
- `pos_invoice_footer_default_v1` — 명세서 안내 문구 사용자 기본
- `pos_invoice_footer_overrides_v1` — 명세서 안내 문구 업체별
- `pos-payments.manual-paid-orders.v1` — 완불체크 캐시 (Supabase ground truth와 동기화)
- `pos-payments.audit-log.v1` — 완불체크 감사 로그 (FIFO 500건)
- `pos_quick_items_v1` — QuickItemBar 부가 항목 프리셋 (택배비/퀵비/수수료 + 사용자 추가)
- `pos_ai_analytics_history_v1` — AI 분석 채팅 히스토리 (FIFO 50건)
- `pos_ai_cache_v1` — AI 분석 도구 결과 캐시 (5분 TTL, FIFO 100건)
- `pos_ai_quick_prompts_usage_v1` — AI 추천 질문 사용 빈도 (정렬용)
- `pos_ai_rfm_thresholds_v1` — RFM 점수 임계값 (사용자 조정 가능)
- `pos_ai_insights_v1` — AI 분석 인사이트 저장 (Phase 5 예정, 키만 예약)

## 상세 문서

| 문서 | 내용 |
|------|------|
| [프로젝트 구조](docs/ARCHITECTURE.md) | 파일 구조, 아키텍처 패턴, Props 연결 |
| [데이터베이스](docs/DATABASE.md) | Supabase 연결, 테이블 스키마, API 래퍼 |
| [변경 이력](docs/CHANGELOG.md) | 날짜별 구현/수정 사항 |
| [스타일 가이드](docs/STYLE-GUIDE.md) | CSS 변수, 반응형, z-index 계층 |
| [테스트/이슈](docs/TESTING.md) | 검증 체크리스트, 알려진 이슈 |
| [보안 설정](docs/SECURITY-SETUP.md) | API 키 referrer 제한, Vite 포트 가이드 |

## 원본 프로젝트

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
