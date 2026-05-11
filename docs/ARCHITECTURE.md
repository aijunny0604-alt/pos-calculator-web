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
| `src/lib/vatHelper.js` | VAT 계산 (`calcVat`), 카테고리 (`DEFAULT_CATEGORIES`, `getCategoryInfo`) |
| `src/lib/exportExcel.js` | Excel export (주문/페이먼트/고객 리포트) |
| `src/lib/imageUpload.js` / `storageAdmin.js` | Supabase Storage 이미지 업로드/관리 |
| `src/index.css` | CSS 변수 테마, 카드 애니메이션, 프린트 스타일 |
| `src/main.jsx` | 앱 진입점. Sentry 초기화 (프로덕션만, 에러 50% 샘플링) |

### 페이지 (src/pages/)
| 파일 | 라우팅 ID | 설명 |
|------|-----------|------|
| `Dashboard.jsx` | `dashboard` | 대시보드 (통계카드, 최근주문, 바로가기) |
| `MainPOS.jsx` | `pos` | POS 계산기 — 상품그리드 + 장바구니 + 주문확인. **addToCart 0원 가드** |
| `OrderHistory.jsx` | `orders` | 주문 내역 — 필터/삭제/반품필터, 통계 카드 카운트업, 할인 인디케이터 |
| `OrderDetail.jsx` | (모달) | 주문 상세 보기/수정/인쇄/제품교체/할인/QuickItemBar |
| `SavedCarts.jsx` | `saved-carts` | 저장된 장바구니 관리 (드래그·리사이즈 모달, 할인, QuickItemBar) |
| `CustomerList.jsx` | `customers` | 거래처 목록 + 상단 탭 (목록/💰페이먼트). PaymentsContainer 임베드, `onGoToInvoices` 점프 |
| `StockOverview.jsx` | `stock` | 재고 현황 테이블 |
| `BurnwayStock.jsx` | `burnway-stock` | 번웨이 다운파이프 재고 |
| `ShippingLabel.jsx` | `shipping` | 택배 송장 출력/관리 (저장 카트 합치기 지원) |
| `TextAnalyze.jsx` | `ai-order` | AI 텍스트 주문 인식 → OrderPage 자동 오픈 |
| `AdminPage.jsx` | `admin` | 관리자 패널 (비번: `4321`) |
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
| `Sidebar.jsx` | 데스크톱 좌측 사이드바 (텍스트 로고 + 10개 메뉴 + 빠른 계산기) |
| `MobileNav.jsx` | 모바일 하단 네비게이션 (6개 메뉴, POS에서 숨김) |
| `Header.jsx` | 상단 헤더 (페이지 타이틀, 모바일 햄버거 메뉴) |

### UI 컴포넌트 (src/components/ui/)
- `ConfirmDialog.jsx` — 확인/취소 다이얼로그
- `EmptyState.jsx` — 빈 상태 표시
- `StatusBadge.jsx` — 상태 뱃지 (완료/대기/반품 등)
- `Toast.jsx` — 토스트 알림
- **`SubPrice.jsx`** — 부가세 표시 헬퍼 (`total`/`layout`/`size`/`showWon` props, NaN-safe)
- **`QuickItemBar.jsx`** — 부가 항목(택배비/퀵비/수수료) 즉석 추가, 사용자 프리셋 (localStorage `pos_quick_items_v1`)

### 결제 모달 (src/components/)
- **`PaymentRegisterModal.jsx`** — 입금 등록 (1/2/3 스텝, 과세/비과세 + 부가 항목, memo 태그 prepend)
- **`PaymentEditModal.jsx`** — 입금 이력 수정
- **`BulkPaymentModal.jsx`** — 일괄 입금 자동 배분 (오래된 주문부터)
- **`CustomerDetailModal.jsx`** — 업체 상세 (받을돈/주문/받은횟수 StatBox, OrderDetailPopup 재설계, 명세서 발행 CTA)

### 커스텀 훅 (src/hooks/)
- `useModalFullscreen.js` — 모달 풀스크린 토글
- `useKeyboardNav.js` — 키보드 네비게이션
- **`useDraggableResizable.jsx`** — 드래그 이동 + 8방향 리사이즈 + 더블클릭 전체화면 (데스크탑 전용, `transitioning` state로 토글 시점 spring 애니메이션)
- **`useManualPaid.js`** — 수동 완불 체크. localStorage 캐시 + `supabase.syncOrderPaidRecord` Promise 호출로 DB 자동 동기화 (customersHint로 N+1 회피)
- **`useCountUp.js`** — 숫자 카운트업 애니메이션 (cubic ease-out 700ms, 직전값 → 새 값 보간)
- **`useQuickItems.js`** — QuickItemBar 프리셋 관리 (built-in + 사용자 추가, localStorage `pos_quick_items_v1`)

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
