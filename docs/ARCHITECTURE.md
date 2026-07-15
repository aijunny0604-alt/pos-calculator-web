# 프로젝트 구조 (Architecture)
> POS Calculator Web의 파일 구조, 아키텍처 패턴, Props 연결 구조
> 관련: [DB 스키마](DATABASE.md) | [디자인 시스템](STYLE-GUIDE.md)

---

## 3. 파일 구조 및 각 파일 역할

### 핵심 파일
| 파일 | 역할 |
|------|------|
| `src/App.jsx` | 메인 앱. 라우팅, 상태관리, Supabase 실시간 구독, saveOrder, deductStock, `goToInvoices(customerId)` cross-navigation |
| `src/lib/supabase.js` | Supabase REST API 래퍼. **payment 동기화** (`syncOrderPaidRecord`, `revokeAutoPaidHistory`) — payment_records `balance/payment_status`는 generated columns, payload 제외 필수 |
| `src/lib/priceData.js` | 하드코딩 상품 (오프라인 폴백) |
| `src/lib/utils.js` | `formatPrice` (NaN-safe), `formatDateTime`, `getTodayKST`, `toDateKST`, `matchesSearchQuery`, `normalizeText` |
| `src/lib/discount.js` | **할인 유틸** — `calcFinalPrice(base, type, value)`, `convertDiscountValue`, `discountLabel`, 3-mode (`percent`/`amount`/`fixed`) |
| `src/lib/purchaseExport.js` | **매입 발주 단일소스** — 상태/금액 계산(`itemStatus`/`itemSupply`/`poTotal`/`poOpenItems`), 묵은기간(`daysSince`/`ageLevel`), CSV/카톡/프린트/엑셀(exceljs 동적 import). 화면·출력물이 어긋나지 않게 계산을 여기 한 곳에 둠 |
| `src/lib/quoteVision.js` | **발주서 사진 판독** — `extractPurchaseQuote`(무료 gemini flash vision, 키/모델 로테이션, temp 0), `normalizeQuote`(더미행 제외 + **산술 자기검산**), `findFillTargets`(무상보전 채울 발주 후보). 🚨 임베드 키 referrer 제한 → localhost 403, 배포본에서만 동작 |
| `src/lib/geminiTools.js` | **AI 분석 도구 스키마** — 9개 Function Declaration + `executeTool` 라우터 + `ANALYST_SYSTEM_PROMPT` |
| `src/lib/geminiAnalyst.js` | **AI 분석 Function Calling 루프** — `askAnalyst(question, context, options)` (최대 5회 반복, 4키 폴백, 503 재시도, 5분 TTL 캐시, FIFO 100건, 중복 차단, Promise.all 병렬, AbortController) |
| `src/lib/analytics/aggregations.js` | KST 기간 필터/합산/그룹핑/월별·일별 추이/변화율/Recency 계산 |
| `src/lib/analytics/rfm.js` | RFM 점수 + 5세그먼트 분류 (Champion/Loyal/At-Risk/New/Lost/Regular). 임계값 localStorage `pos_ai_rfm_thresholds_v1` |
| `src/lib/analytics/customers.js` | `getTopCustomers`/`getCustomerTrend`/`getCustomerSegments`/`getDormantCustomers` (이전 기간 변화율 비교 포함) |
| `src/lib/analytics/products.js` | `getTopProducts`(제품/카테고리)/`getProductTrend`/`getRepeatPurchaseGap` |
| `src/lib/analytics/affinity.js` | `getCustomerProductAffinity` — 거래처가 자주 사는 제품/카테고리 |
| `src/lib/analytics/summary.js` | `getCompositeSummary` — 매출/AOV/활성/신규/반품률/부가항목률 KPI 묶음 |
| `src/lib/vatHelper.js` | VAT 계산 (`calcVat`), 카테고리 (`DEFAULT_CATEGORIES`, `getCategoryInfo`) |
| `src/lib/exportExcel.js` | Excel export (주문/페이먼트/고객 리포트) |
| `src/lib/imageUpload.js` / `storageAdmin.js` | Supabase Storage 이미지 업로드/관리 |
| `src/index.css` | CSS 변수 테마, 카드 애니메이션, 프린트 스타일 |
| `src/main.jsx` | 앱 진입점. Sentry 초기화 (프로덕션만, 에러 50% 샘플링) |

### 페이지 (src/pages/)
| 파일 | 라우팅 ID | 설명 |
|------|-----------|------|
| `Dashboard.jsx` | `dashboard` | 대시보드 (통계카드, 최근주문, 바로가기) |
| `MainPOS.jsx` | `pos` | POS 계산기 — 상품그리드 + 장바구니 + 주문확인. **addToCart 0원 경고**(차단 아님, 자바라 무료 라인 등 의도된 0원 허용) |
| `OrderHistory.jsx` | `orders` | 주문 내역 — 필터/삭제/반품필터, 통계 카드 카운트업, 할인 인디케이터 |
| `OrderDetail.jsx` | (모달) | 주문 상세 보기/수정/인쇄/제품교체/할인/QuickItemBar |
| `SavedCarts.jsx` | `saved-carts` | 저장된 장바구니 관리 (드래그·리사이즈 모달, 할인, QuickItemBar). 크기 저장 키 `pos-web.savedCartDetailModal.v2` |
| `MemosPage.jsx` | `memos` | 메모 모아보기 — 주문메모/제품주의사항 탭, 미확인 필터 |
| `CustomerList.jsx` | `customers` | 거래처 목록 + 상단 탭 (목록/💰페이먼트/📄사업자등록증). PaymentsContainer 임베드, `onGoToInvoices` 점프. 목록 카드에 등록증 썸네일 |
| `CertLibrary.jsx` | (CustomerList 탭) | 사업자등록증 보관함 — 상호명 검색, 거래처 연결/해제, 업로드 |
| `StockOverview.jsx` | `stock` | 재고 현황 테이블 |
| `BurnwayStock.jsx` | `burnway-stock` | 번웨이 다운파이프 재고 |
| `ShippingLabel.jsx` | `shipping` | 택배 송장 출력/관리 (저장 카트 합치기 지원) |
| `TextAnalyze.jsx` | `ai-order` | AI 텍스트 주문 인식 → OrderPage 자동 오픈 |
| **`PurchaseOrders.jsx`** | `purchase-orders` | **매입 발주** (🚨 네이버 "발주확인"=판매 주문상태와 정반대 개념) — 발주목록/미입고 탭, 묵은기간 추적, 빠른입고, 📷발주서 사진 판독, 증빙 열람, CSV/엑셀/프린트/카톡. lazy |
| **`SupplierPrices.jsx`** | `supplier-prices` | **매입 단가표** — 규격별 JSR 매입가 이력 + 변동률. 발주 등록 시 단가 자동채움 소스. lazy |
| **`SupplierLedger.jsx`** | `supplier-ledger` | **JSR 수불 장부** — 빌려줌/미입고/완료/불량품. `purchase_orders` 미입고와 별개. lazy |
| `AdminPage.jsx` | `admin` | 관리자 패널 (비번: `4321`) |
| **`AIAnalytics.jsx`** | `ai-analytics` | **AI 분석 어시스턴트** — 자연어 질문 → Gemini Function Calling → 자연어 답변. 분석 도구 9개 + 5분 TTL 캐시. lazy import (`AIAnalytics-*.js` chunk 41.50KB / gzip 14.62KB) |
| **`InvoicesPage.jsx`** | `invoices` | 거래명세서 — 미수업체 리스트 + 이월 인라인 + 행 수동 수정 (localStorage) + sticky 헤더 |
| **`InvoicesContainer.jsx`** | `invoices` 컨테이너 | InvoicesPage + 결제 모달 3종(PaymentRegister/BulkPayment/CustomerDetail) cross-navigation 묶음 |
| **`PaymentsPage.jsx`** | (CustomerList 탭) | 결제 레코드 목록/필터(미수/부분/완납)/Excel/동기화 |
| **`PaymentsContainer.jsx`** | (CustomerList 탭) | PaymentsPage + 모달 4종 묶음, `onGoToInvoices` 전달 |
| `OrderPage.jsx` | - | AI 주문 자동 오픈 시 사용 |
| `SaveCartModal.jsx` | (모달) | 장바구니 저장 모달 |
| `QuickCalculator.jsx` | (모달) | 빠른 계산기 |
| `NotificationSettings.jsx` | (모달) | 알림 설정 |

### 레이아웃 (src/components/layout/)
| 파일 | 역할 |
|------|------|
| `AppLayout.jsx` | 사이드바 + 헤더 + 메인 래퍼. 풀스크린 페이지 자동 감지. toggle-sidebar 이벤트 |
| `Sidebar.jsx` | 데스크톱 좌측 사이드바 (로고 이미지 + 17개 메뉴 + 빠른 계산기). MOVIS는 premium 스타일로 **항상 맨 아래** |
| `MobileNav.jsx` | 모바일 하단 네비게이션 (6개 메뉴, POS에서 숨김) |
| `Header.jsx` | 상단 헤더 (페이지 타이틀, 모바일 햄버거 메뉴) |

### UI 컴포넌트 (src/components/ui/)
- `ConfirmDialog.jsx` — 확인/취소 다이얼로그
- `EmptyState.jsx` — 빈 상태 표시
- `StatusBadge.jsx` — 상태 뱃지 (완료/대기/반품 등)
- `Toast.jsx` — 토스트 알림
- **`SubPrice.jsx`** — 부가세 표시 헬퍼 (`total`/`layout`/`size`/`showWon` props, NaN-safe)
- **`QuickItemBar.jsx`** — 부가 항목(택배비/퀵비/수수료) 즉석 추가, 사용자 프리셋 (localStorage `pos_quick_items_v1`)

### AI 분석 컴포넌트 (src/components/analytics/)
- **`ChatPanel.jsx`** — 채팅 메인 (sticky bottom 입력, 자동 스크롤, 로딩 버블, 취소 버튼, 1000자 카운터)
- **`MessageBubble.jsx`** — 4종 버블 (user/assistant/error/system) + 마크다운 lite 파서 (`**bold**`/`## h`/`- list`) + 도구 호출 이력 접기 + 캐시 배지
- **`SuggestedQuestions.jsx`** — 추천 질문 칩 그리드 (1/2/3열 반응형) + 사용 빈도 표시

### 결제 모달 (src/components/)
- **`PaymentRegisterModal.jsx`** — 입금 등록 (1/2/3 스텝, 과세/비과세 + 부가 항목, memo 태그 prepend)
- **`PaymentEditModal.jsx`** — 입금 이력 수정
- **`BulkPaymentModal.jsx`** — 일괄 입금 자동 배분 (오래된 주문부터)
- **`CustomerDetailModal.jsx`** — 업체 상세 (받을돈/주문/받은횟수 StatBox, OrderDetailPopup 재설계, 명세서 발행 CTA). 아바타 자리에 **사업자등록증 썸네일**(연동 시) → 클릭 원본 열람

### 매입 (src/components/purchase/)
- **`QuoteScanModal.jsx`** — 발주서 사진 판독 결과 확인 모달. **자동 저장 안 함**(매입 증빙이라 사람이 보고 [등록]). 모든 칸 수정 가능 + 원본 사진 나란히 대조, 관리번호 중복/검산 불일치/흐린 행 경고, 무상보전 행은 채울 발주 select 연결

### 커스텀 훅 (src/hooks/)
- `useModalFullscreen.js` — 모달 풀스크린 토글
- `useKeyboardNav.js` — 키보드 네비게이션
- **`useDraggableResizable.jsx`** — 드래그 이동 + 8방향 리사이즈 + 더블클릭 전체화면 (데스크탑 전용, `transitioning` state로 토글 시점 spring 애니메이션)
- **`useManualPaid.js`** — 수동 완불 체크. localStorage 캐시 + `supabase.syncOrderPaidRecord` Promise 호출로 DB 자동 동기화 (customersHint로 N+1 회피)
- **`useCountUp.js`** — 숫자 카운트업 애니메이션 (cubic ease-out 700ms, 직전값 → 새 값 보간)
- **`useQuickItems.js`** — QuickItemBar 프리셋 관리 (built-in + 사용자 추가, localStorage `pos_quick_items_v1`)
- **`useAIAnalystChat.js`** — AI 분석 채팅 상태 + 히스토리 50건 FIFO 영속화 (`pos_ai_analytics_history_v1`) + 사용 빈도 기록 (`pos_ai_quick_prompts_usage_v1`) + AbortController + 도구명 한국어 매핑

---

## 4. 아키텍처 패턴

### 라우팅
- SPA 클라이언트 라우팅 (`currentPage` state 기반)
- `App.jsx`에서 switch문으로 페이지 렌더링
- 풀스크린 페이지: `pos`, `orders`, `customers`, `saved-carts`, `stock`, `shipping`, `burnway-stock`, `ai-order`, `invoices` (자체 sticky header/패딩 관리)
- **Cross-navigation**: `App.invoicesInitialCustomerId` state + `goToInvoices(customerId)` 콜백 — `CustomerDetailModal.onViewInvoice` → `currentPage='invoices'` 전환 시 해당 업체 자동 선택

### 모바일 사이드바 통신
- 풀스크린 페이지는 AppLayout의 state에 직접 접근 불가
- **Custom DOM Event 패턴** 사용:
```javascript
// 페이지에서 사이드바 토글 (열기/닫기)
window.dispatchEvent(new CustomEvent('toggle-sidebar'));

// AppLayout에서 수신
useEffect(() => {
  const toggleHandler = () => setSidebarOpen(prev => !prev);
  window.addEventListener('toggle-sidebar', toggleHandler);
  return () => window.removeEventListener('toggle-sidebar', toggleHandler);
}, []);
```

### 모바일 헤더 패턴
- 풀스크린 페이지에서 공통 사용:
  - **모바일**: 메뉴(≡) 버튼 → 사이드바 열기
  - **데스크톱**: 뒤로가기(←) 버튼 → 대시보드로 이동
```jsx
<button className="md:hidden" onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}>
  <Menu />
</button>
<button className="hidden md:flex" onClick={() => setCurrentPage('dashboard')}>
  <ArrowLeft />
</button>
```

### 주문 저장 플로우 (saveOrder in App.jsx)
1. 장바구니 아이템 + 고객정보 → saveOrder 호출
2. 같은 고객의 당일 주문이 있으면 **병합** (items 합치기)
3. 없으면 새 주문 생성
4. 고객이 DB에 없으면 자동 등록
5. Supabase orders 테이블에 저장
6. 실시간 구독으로 자동 반영

> 테이블 스키마 및 Supabase 연결 정보는 [DATABASE.md](DATABASE.md) 참조.

---

## 7. Props 연결 구조

```
App.jsx (상태 관리)
├── orders, products, customers, savedCarts ← Supabase 로드
├── saveOrder(orderData) - 주문 저장
├── setCurrentPage(pageId) - 라우팅
│
├── MainPOS ← products, cart, saveOrder, customers, onSaveCartModal
├── Dashboard ← orders, products, savedCarts, customers, setCurrentPage
├── OrderHistory ← orders, setOrders, supabase, onViewOrder
├── CustomerList ← customers, setCustomers, orders, products, supabase
├── SavedCarts ← savedCarts, customers, products, loadCartToPos
├── StockOverview ← products
├── BurnwayStock ← products
├── ShippingLabel ← orders, customers
├── TextAnalyze ← products, customers, saveOrder
└── AdminPage ← products, customers, supabase, setProducts, setCustomers
```

> Props 트리는 2026-03-31 전수 검사 기준 매칭률 72%. 갱신 필요.
> 상세 데이터 흐름은 [DATABASE.md](DATABASE.md)의 테이블 구조 참조.
