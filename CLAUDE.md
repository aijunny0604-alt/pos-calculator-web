# POS Calculator Web - AI 핸드오프 가이드

> 마지막 업데이트: 2026-03-11
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

---

## 1. 프로젝트 개요

자동차 튜닝 부품(다운파이프, 머플러팁 등) 판매용 **POS 웹 시스템**.
기존 모바일 앱(`pos-calculator`)을 웹 기반으로 완전 재설계한 프로젝트.

### 기술 스택
| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + Tailwind CSS v3 |
| 백엔드/DB | Supabase (REST API + WebSocket 실시간) |
| UI 아이콘 | lucide-react |
| 엑셀 | exceljs + file-saver |
| 배포 | GitHub Pages (gh-pages) |

### 실행/빌드/배포
```bash
npm install
npm run dev          # 개발 서버 (포트 5173/5174)
npx vite build       # 프로덕션 빌드 (--base 플래그 절대 사용 금지!)
npx gh-pages -d dist # GitHub Pages 배포
```

> **주의**: `--base` 플래그 사용 시 Git Bash 경로 변환 문제로 빈 페이지 발생.
> `vite.config.js`에 `base: '/pos-calculator-web/'` 이미 설정되어 있음.
> 배포 후 CDN 캐시 반영에 1~2분 소요.

---

## 2. Supabase 연결 정보

- URL: `https://icqxomltplewrhopafpq.supabase.co`
- 키: `src/lib/supabase.js`에 하드코딩 (publishable key)
- 테이블: `orders`, `products`, `customers`, `saved_carts`
- 기존 앱 `pos-calculator`와 동일 DB 공유

---

## 3. 파일 구조 및 각 파일 역할

### 핵심 파일
| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `src/App.jsx` | ~800 | 메인 앱. 라우팅, 상태관리, Supabase 실시간 구독, saveOrder 로직 |
| `src/lib/supabase.js` | ~206 | Supabase REST API 래퍼 (CRUD). `Array.isArray(data) ? data[0] : data` 정규화 적용 |
| `src/lib/priceData.js` | - | 478개 하드코딩 상품 (오프라인 폴백) |
| `src/lib/utils.js` | ~102 | formatPrice, formatDateTime, getTodayKST, toDateKST 유틸리티 |
| `src/index.css` | ~234 | CSS 변수 테마, 카드 애니메이션, 프린트 스타일 |

### 페이지 (src/pages/)
| 파일 | 줄 수 | 라우팅 ID | 설명 | 상태 |
|------|-------|-----------|------|------|
| `Dashboard.jsx` | 244 | `dashboard` | 대시보드 (통계카드, 최근주문, 바로가기) | 정상 |
| `MainPOS.jsx` | 1028 | `pos` | POS 계산기 (상품그리드 + 장바구니 + 주문확인) | **핵심 기능**, 정상 |
| `OrderHistory.jsx` | 809 | `orders` | 주문 내역 조회/필터/삭제 | 정상 |
| `OrderDetail.jsx` | 1385 | (모달) | 주문 상세 보기/수정/인쇄/제품교체 | 정상 |
| `SavedCarts.jsx` | 1215 | `saved-carts` | 저장된 장바구니 관리 | 정상 |
| `CustomerList.jsx` | 1073 | `customers` | 거래처 목록/상세/주문이력/반품 | 정상 |
| `StockOverview.jsx` | 338 | `stock` | 재고 현황 테이블 | 정상 |
| `BurnwayStock.jsx` | ~523 | `burnway-stock` | 번웨이 다운파이프 재고 (대시보드 카드 스타일) | 정상 |
| `ShippingLabel.jsx` | 1217 | `shipping` | 택배 송장 출력/관리 | 정상 |
| `TextAnalyze.jsx` | 851 | `ai-order` | AI 텍스트 주문 인식 | 정상 |
| `AdminPage.jsx` | 1575 | `admin` | 관리자 패널 (비번: `dpfldl1!`) | 정상 |
| `OrderPage.jsx` | 1000 | - | (미사용 레거시) | 미사용 |
| `SaveCartModal.jsx` | 289 | (모달) | 장바구니 저장 모달 | 정상 |
| `QuickCalculator.jsx` | 298 | (모달) | 빠른 계산기 | 정상 |
| `NotificationSettings.jsx` | 287 | (모달) | 알림 설정 | 정상 |

### 레이아웃 (src/components/layout/)
| 파일 | 역할 |
|------|------|
| `AppLayout.jsx` | 사이드바 + 헤더 + 메인 래퍼. 풀스크린 페이지 자동 감지 |
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
// 페이지에서 사이드바 열기
window.dispatchEvent(new CustomEvent('open-sidebar'));

// AppLayout에서 수신
useEffect(() => {
  const handler = () => setSidebarOpen(true);
  window.addEventListener('open-sidebar', handler);
  return () => window.removeEventListener('open-sidebar', handler);
}, []);
```

### 모바일 헤더 패턴
- 풀스크린 페이지에서 공통 사용:
  - **모바일**: 메뉴(≡) 버튼 → 사이드바 열기
  - **데스크톱**: 뒤로가기(←) 버튼 → 대시보드로 이동
```jsx
<button className="md:hidden" onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}>
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

---

## 5. 최근 구현/수정 사항 (2026-03 세션)

### 관리자 페이지 (AdminPage.jsx)
- 모달 크기 확대: `max-w-5xl`, `max-h-[90vh]`
- 입력필드/버튼 크기 확대: `px-4 py-3 text-base`
- **인라인 편집**: 제품 리스트에서 더블클릭으로 이름/도매가/소매가/재고/최소재고 즉시 편집
- **인라인 편집**: 거래처 리스트에서 더블클릭으로 이름/전화/주소/메모 즉시 편집
- **제품 복사**: Copy 아이콘 버튼 → 제품 복제 기능

### 스크롤 버그 수정
- `index.css`에서 `overscroll-behavior: contain` 광범위 적용 제거 (scroll trapping 해결)
- `StockOverview.jsx` 테이블 래퍼: `overflow-hidden` → `overflow: clip` (스크롤 전파 허용)
- `AdminPage.jsx` SectionCard 3곳에서 `overflow-hidden` 제거

### 번웨이 다운파이프 (BurnwayStock.jsx) - 완전 리디자인
- **이전**: 아코디언 펼침/접힘 방식 (복잡, 긴 스크롤)
- **현재**: 대시보드 카드 그리드 + 클릭 시 상세 모달
  - `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` 반응형
  - `ModelCard`: 차종명, 총재고, 품절뱃지, 타입별 재고 요약
  - `DetailModal`: 전체 제품 리스트 (타입별 그룹핑)
  - `card-interactive` CSS 클래스로 호버/클릭 애니메이션

### 모바일 헤더 통합
- 6개 풀스크린 페이지(StockOverview, CustomerList, OrderHistory, BurnwayStock, ShippingLabel, SavedCarts)에 메뉴 버튼 + 사이드바 연동 적용

### 2026-03-11 작업 내역

#### 모달 풀스크린 토글 추가
- `useModalFullscreen` 훅 + `modal-fs-transition` CSS 활용
- 적용된 모달: BurnwayStock DetailModal, AdminPage Modal, SaveCartModal, NotificationSettings, QuickCalculator
- 이미 적용됨: OrderDetail, SavedCarts, CustomerList
- Maximize2/Minimize2 아이콘으로 토글 버튼

#### KST 타임존 버그 수정
- **문제**: `toISOString()`이 UTC 기준이라 자정~오전9시 사이에 "오늘" 날짜가 어제로 계산됨
- **해결**: `src/lib/utils.js`에 `getTodayKST()`, `toDateKST()` 함수 추가
- **적용 파일**: `App.jsx` (todayOrderCount, shippingCount, saveOrder 병합), `Dashboard.jsx` (오늘 주문 필터)

#### 로고 수정
- `move-logo.png` 파일 없어서 404 에러 발생
- `Sidebar.jsx`에서 `<img>` → 텍스트 로고 `MOVE MOTORS` (MOVE는 primary 컬러)로 교체
- 로고 이미지 파일이 생기면 `public/move-logo.png`에 넣고 img 태그로 복원 가능

#### 자바라 단위 변경 (세트 → 개)
- `BurnwayStock.jsx`의 `StockBadge`에 `unit` prop 추가 (기본값: "세트")
- 자바라 관련 StockBadge에 `unit="개"` 전달
- 상세 모달의 타입별 재고, 개별 제품 리스트에서도 자바라는 "개" 단위 표시
- 다운파이프(촉매/직관)는 기존대로 "세트" 유지

---

## 6. 디자인 시스템

### CSS 변수 (index.css :root)
```css
--background, --foreground, --primary, --card, --border
--success (#16a34a), --destructive (#dc2626), --warning (#f59e0b)
```

### 반응형 기준
- 모바일: < 768px (하단 네비, 1열 레이아웃)
- 데스크톱: >= 768px (좌측 사이드바 256px + 유동 콘텐츠)

### 주요 CSS 클래스 (index.css)
- `.card-interactive` - 카드 호버/클릭 spring 애니메이션
- `.no-print` - 인쇄 시 숨김
- `overscroll-behavior-y: contain` → `html, body`, `main`에만 적용 (다른 곳 금지)

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

---

## 8. 알려진 이슈 / 개선 가능 항목

### 남은 이슈
- `OrderPage.jsx` (~1000줄) 미사용 레거시 파일 → 삭제 가능
- 스크린샷 PNG 파일 다수 → `.gitignore`에 추가 권장
- `.playwright-cli/` 폴더 → `.gitignore`에 추가 권장

### 향후 개선 아이디어
- 다크 모드 지원
- PWA (오프라인 지원)
- 재고 자동 알림 (Supabase Edge Functions)
- 주문 통계 차트 (일/주/월별)

---

## 9. 검증 체크리스트

### 핵심 플로우
- [x] POS 상품 추가 → 장바구니 → 주문확인 → 저장
- [x] 주문 금액 정상 계산/저장
- [x] 주문내역 날짜 필터 조회
- [x] 대시보드 매출 통계 정상 반영

### 기능별
- [x] 관리자: 상품 추가/수정/삭제/복사, 거래처 관리, 인라인 편집
- [x] 거래처: 상세보기, 블랙리스트, 주문이력, 반품
- [x] 저장 장바구니: 저장/불러오기/삭제/주문전환
- [x] 재고현황: 상품별 재고, 스크롤 정상
- [x] 번웨이 다운파이프: 카드 대시보드, 상세 모달
- [x] 택배 송장: 주소 입력/출력
- [x] AI 주문인식: 텍스트 → 상품 매칭 → 주문

### 모바일 (390x844 기준)
- [x] 모든 풀스크린 페이지 메뉴 버튼 동작
- [x] 사이드바 열기/닫기
- [x] 하단 네비게이션 정상
- [x] 스크롤 잠김 없음
- [x] 번웨이 카드/모달 정상

---

## 10. 원본 프로젝트 참조

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
- 인라인 편집, 제품 복사 등 기존 앱 기능을 참조하여 웹 버전으로 포팅함
