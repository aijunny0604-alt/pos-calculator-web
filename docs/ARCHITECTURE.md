# 프로젝트 구조 (Architecture)
> POS Calculator Web의 파일 구조, 아키텍처 패턴, Props 연결 구조
> 관련: [DB 스키마](DATABASE.md) | [디자인 시스템](STYLE-GUIDE.md)

---

## 3. 파일 구조 및 각 파일 역할

### 핵심 파일
| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `src/App.jsx` | ~1045 | 메인 앱. 라우팅, 상태관리, Supabase 실시간 구독, saveOrder, deductStock 로직 |
| `src/lib/supabase.js` | ~206 | Supabase REST API 래퍼 (CRUD). `Array.isArray(data) ? data[0] : data` 정규화 적용 |
| `src/lib/priceData.js` | - | 478개 하드코딩 상품 (오프라인 폴백) |
| `src/lib/utils.js` | ~104 | formatPrice, formatDateTime, getTodayKST, toDateKST, matchesSearchQuery, normalizeText 유틸리티 |
| `src/index.css` | ~218 | CSS 변수 테마, 카드 애니메이션, 프린트 스타일 |
| `src/main.jsx` | ~21 | 앱 진입점. Sentry 초기화 (프로덕션만, 에러 50% 샘플링, 세션 리플레이) |

### 페이지 (src/pages/)
| 파일 | 줄 수 | 라우팅 ID | 설명 | 상태 |
|------|-------|-----------|------|------|
| `Dashboard.jsx` | 244 | `dashboard` | 대시보드 (통계카드, 최근주문, 바로가기) | 정상 |
| `MainPOS.jsx` | 1074 | `pos` | POS 계산기 (상품그리드 + 장바구니 + 주문확인) | **핵심 기능**, 정상 |
| `OrderHistory.jsx` | 839 | `orders` | 주문 내역 조회/필터/삭제/반품필터 | 정상 |
| `OrderDetail.jsx` | 1420 | (모달) | 주문 상세 보기/수정/인쇄/제품교체/배송정보복사 | 정상 |
| `SavedCarts.jsx` | 1314 | `saved-carts` | 저장된 장바구니 관리 | 정상 |
| `CustomerList.jsx` | 1100 | `customers` | 거래처 목록/상세/주문이력/반품/배송정보복사 | 정상 |
| `StockOverview.jsx` | 341 | `stock` | 재고 현황 테이블 | 정상 |
| `BurnwayStock.jsx` | 562 | `burnway-stock` | 번웨이 다운파이프 재고 (대시보드 카드 스타일) | 정상 |
| `ShippingLabel.jsx` | 1238 | `shipping` | 택배 송장 출력/관리 | 정상 |
| `TextAnalyze.jsx` | 1216 | `ai-order` | AI 텍스트 주문 인식 | 정상 |
| `AdminPage.jsx` | 2203 | `admin` | 관리자 패널 (비번: `4321`) | 정상 |
| `OrderPage.jsx` | 1000 | - | (미사용 레거시) | 미사용 |
| `SaveCartModal.jsx` | 289 | (모달) | 장바구니 저장 모달 | 정상 |
| `QuickCalculator.jsx` | 298 | (모달) | 빠른 계산기 | 정상 |
| `NotificationSettings.jsx` | 287 | (모달) | 알림 설정 | 정상 |

### 레이아웃 (src/components/layout/)
| 파일 | 역할 |
|------|------|
| `AppLayout.jsx` | 사이드바 + 헤더 + 메인 래퍼. 풀스크린 페이지 자동 감지. toggle-sidebar 이벤트 |
| `Sidebar.jsx` | 데스크톱 좌측 사이드바 (텍스트 로고 + 10개 메뉴 + 빠른 계산기) |
| `MobileNav.jsx` | 모바일 하단 네비게이션 (6개 메뉴, POS에서 숨김) |
| `Header.jsx` | 상단 헤더 (페이지 타이틀, 모바일 햄버거 메뉴) |

### UI 컴포넌트 (src/components/ui/)
- `ConfirmDialog.jsx` - 확인/취소 다이얼로그
- `EmptyState.jsx` - 빈 상태 표시
- `StatusBadge.jsx` - 상태 뱃지 (완료/대기/반품 등)
- `Toast.jsx` - 토스트 알림

### 커스텀 훅 (src/hooks/)
- `useModalFullscreen.js` - 모달 풀스크린 토글
- `useKeyboardNav.js` - 키보드 네비게이션

---

## 4. 아키텍처 패턴

### 라우팅
- SPA 클라이언트 라우팅 (`currentPage` state 기반)
- `App.jsx`에서 switch문으로 페이지 렌더링
- 풀스크린 페이지: `pos`, `orders`, `customers`, `saved-carts`, `stock`, `shipping`, `burnway-stock`, `ai-order` (자체 sticky header/패딩 관리)

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
