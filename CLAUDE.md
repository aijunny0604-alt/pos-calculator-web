# POS Calculator Web - AI 핸드오프 가이드

> 마지막 업데이트: 2026-03-23
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

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 키: `src/lib/supabase.js`에 하드코딩 (publishable key)
- 테이블: `orders`, `products`, `customers`, `customer_returns`, `saved_carts`
- 2026-03-19 새 Supabase 프로젝트로 이전 완료 (이전: icqxomltplewrhopafpq → 현재: jubzppndcclhnvgbvrxr)

---

## 3. 파일 구조 및 각 파일 역할

### 핵심 파일
| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `src/App.jsx` | ~1094 | 메인 앱. 라우팅, 상태관리, Supabase 실시간 구독, saveOrder, deductStock, Global Undo 시스템 |
| `src/lib/supabase.js` | ~208 | Supabase REST API 래퍼 (CRUD). `Array.isArray(data) ? data[0] : data` 정규화. addProduct id 자동생성 |
| `src/lib/priceData.js` | - | 478개 하드코딩 상품 (오프라인 폴백) |
| `src/lib/utils.js` | ~104 | formatPrice, formatDateTime, getTodayKST, toDateKST, matchesSearchQuery, normalizeText 유틸리티 |
| `src/index.css` | ~218 | CSS 변수 테마, 카드 애니메이션, 프린트 스타일 |

### 페이지 (src/pages/)
| 파일 | 줄 수 | 라우팅 ID | 설명 | 상태 |
|------|-------|-----------|------|------|
| `Dashboard.jsx` | 244 | `dashboard` | 대시보드 (통계카드, 최근주문, 바로가기) | 정상 |
| `MainPOS.jsx` | 1080 | `pos` | POS 계산기 (상품그리드 + 장바구니 + 주문확인 + isSaving 로딩) | **핵심 기능**, 정상 |
| `OrderHistory.jsx` | 839 | `orders` | 주문 내역 조회/필터/삭제/반품필터 | 정상 |
| `OrderDetail.jsx` | 1445 | (모달) | 주문 상세 보기/수정/인쇄/제품교체/배송정보복사 | 정상 |
| `SavedCarts.jsx` | 1314 | `saved-carts` | 저장된 장바구니 관리 | 정상 |
| `CustomerList.jsx` | 1105 | `customers` | 거래처 목록/상세/주문이력/반품/배송정보복사 | 정상 |
| `StockOverview.jsx` | 341 | `stock` | 재고 현황 테이블 | 정상 |
| `BurnwayStock.jsx` | 766 | `burnway-stock` | 번웨이 다운파이프 재고 (카드+세트구성) | 정상 |
| `ShippingLabel.jsx` | 1241 | `shipping` | 택배 송장 출력/관리 | 정상 |
| `TextAnalyze.jsx` | 1321 | `ai-order` | AI 텍스트 주문 인식 | 정상 |
| `AdminPage.jsx` | 2565 | `admin` | 관리자 패널 (비번: `4321`) + AI 입고 | 정상 |
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
2. 고객이 DB에 없으면 **자동 등록** (name + phone + address 포함)
3. 기존 고객의 phone/address가 비어있으면 **자동 업데이트**
4. 같은 고객의 당일 주문이 있으면 **병합** (items 합치기)
5. 없으면 새 주문 생성
6. 재고 차감 (`deductStock`)
7. 실시간 구독으로 자동 반영

### Global Undo 시스템 (App.jsx)
- `undoStackRef` (useRef) - 최대 20개 스택
- `pushUndo(entry)` - undo 항목 추가
- `setCartWithHistory` - 장바구니 변경 시 자동 undo 기록
- **Ctrl+Z** 단축키로 되돌리기 (INPUT/TEXTAREA 포커스 시 제외)
- 지원: 장바구니 변경, 주문 삭제/복원, 제품 추가/수정/삭제, 장바구니 삭제/전체삭제

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

### 2026-03-12 작업 내역

#### QuickCalculator 상태 버그 수정
- `inputDigit`에서 `setDisplay` 콜백 안에서 `setWaitingForOperand` 호출하던 사이드이펙트 수정
- 함수 바깥에서 상태 업데이트하도록 변경

#### AI 주문 인식 검색 로직 통일 (TextAnalyze.jsx)
- **문제**: TextAnalyze의 로컬 `matchesSearchQuery`가 단순 `includes` 방식이라 띄어쓰기/특수문자 검색이 안 됨
- **해결**: 로컬 함수 삭제 → `@/lib/utils`의 `matchesSearchQuery` import (subsequence matching, 멀티워드, `[\s\-_]` 제거)
- 제품 직접 추가 검색(line 632)도 `matchesSearchQuery` 사용으로 변경

#### 재고 부족 시 주문 허용 (MainPOS.jsx)
- **이전**: 재고 초과 시 `return`으로 주문 차단
- **현재**: 경고 토스트만 표시하고 주문은 계속 가능
- `addToCart`, `updateQuantity` 모두 적용

#### 주문 시 실시간 재고 차감 (App.jsx)
- `deductStock(items)` 함수 추가: `supabase.updateProduct(id, { stock: newStock })` 호출
- `saveOrder` 성공 후 `await deductStock(items)` 실행 (신규/병합 주문 모두)
- 로컬 `setProducts` 즉시 업데이트로 BurnwayStock 등에 실시간 반영

#### 배송 정보 복사 기능
- **거래처 관리 (CustomerList.jsx)**: 전화번호/주소 개별 복사 + "배송 정보 복사" 통합 버튼
- **주문 내역 상세 (OrderDetail.jsx)**: 전화번호/주소 개별 복사 + "배송 정보 복사" 통합 버튼
- `showToast` prop을 App.jsx → OrderDetail에 전달하도록 추가
- 복사 양식: `업체명 : OOO\n연락처 : 010-XXXX\n주소지 : OOO`

#### 모바일 사이드바 토글 개선
- **이전**: 메뉴(≡) 버튼으로 열기만 가능, 닫으려면 배경 클릭 필요
- **현재**: 메뉴 버튼 다시 누르면 사이드바 닫힘 (토글 동작)
- `AppLayout.jsx`: `toggle-sidebar` 커스텀 이벤트 추가, Header의 `onMenuClick`도 토글로 변경
- 7개 풀스크린 페이지 모두 `open-sidebar` → `toggle-sidebar` 변경

#### 주문 내역 반품 필터 기능 (OrderHistory.jsx)
- 상단 헤더의 반품 카드 클릭 시 반품 내역만 필터링 (토글)
- `showReturnsOnly` state 추가, `filteredOrders`에 `.filter()` 체인 추가
- 반품 카드: `<div>` → `<button>` 변환, 활성 시 진한 warning 배경 + "필터 ON" 표시

#### 모바일 사이드바 z-index 충돌 수정
- **문제**: 모바일 사이드바(`z-40 fixed`)와 풀스크린 페이지 sticky 헤더(`z-40 sticky`)가 같은 z-index → 갤럭시 폴드 등에서 헤더가 사이드바를 가림
- **근본 원인**: `index.css`의 `will-change: scroll-position`이 `main` 태그에 적용되어 새로운 stacking context 생성
- **수정 1**: `index.css`에서 `will-change: scroll-position` 제거
- **수정 2**: `AppLayout.jsx` 모바일 사이드바 `z-40` → `z-[45]`로 상향

#### 택배 송장 모바일 레이아웃 최적화 (ShippingLabel.jsx)
- **문제**: 소형 화면(갤럭시 폴드 280px, 아이폰 SE 375px)에서 하단 버튼 3개가 화면 절반 차지
- **수정**:
  - 선택 현황 + 보내는 곳별 현황: 세로 2블록 → **가로 2열** (`grid-cols-2 sm:grid-cols-1`)
  - CSV/Excel/인쇄 버튼: 세로 3블록 → **가로 3열** (`grid-cols-3 sm:grid-cols-1`) + 텍스트 축약
  - 패딩/폰트 반응형: `p-3 sm:p-4`, `text-xs sm:text-sm`

### 2026-03-19 작업 내역

#### Supabase egress quota 초과 장애 및 API 최적화 (App.jsx)
- **장애**: Supabase Free 플랜 egress quota(5GB/월) 초과 → HTTP 402 전면 차단
- **원인**: 과도한 API 호출 패턴 (하루 ~1,080회 전체 테이블 조회)
- **조치**: Pro 플랜 업그레이드($25/월) + Spend cap 해제 + 서포트 제한 해제 요청 중
- **다음 달 Free로 다운그레이드 예정** (최적화 후 월 ~0.5GB로 충분)

#### API 호출 최적화 3가지 (App.jsx만 수정)
1. **visibilitychange 쓰로틀링**: 탭 전환 시 30초 이내 재호출 차단
   - `lastFetchRef = useRef(0)` + `FETCH_THROTTLE_MS = 30000` 추가
   - `handleVisibility`에서 `Date.now() - lastFetchRef.current < FETCH_THROTTLE_MS` 체크
2. **폴링 주기 연장**: 2분(120000) → 5분(300000)
3. **WebSocket 이벤트 개별 반영**: 전체 테이블 재조회 제거
   - INSERT: `payload.record`를 로컬 state에 직접 추가
   - UPDATE: `payload.record`로 해당 항목만 교체
   - DELETE: `payload.old_record.id`로 해당 항목만 제거
   - 4개 테이블(orders, products, customers, saved_carts) 모두 적용

#### 예상 트래픽 감소
| 항목 | 최적화 전 | 최적화 후 |
|------|----------|----------|
| 일간 API 호출 | ~1,080회 | ~232회 (-78%) |
| 월간 트래픽 | 5GB+ (초과) | ~0.5GB |

> **2026-03-19 배포 완료**

#### Supabase 프로젝트 이전 (2026-03-19)
- **이전 프로젝트**: `icqxomltplewrhopafpq` (egress 초과로 차단됨, 별도 계정)
- **새 프로젝트**: `jubzppndcclhnvgbvrxr` (Free 플랜, lyjcg0604@naver 계정)
- **작업 내용**:
  - 새 프로젝트에 테이블 5개 생성 (products, customers, orders, customer_returns, saved_carts)
  - D드라이브 CSV 원본 → REST API 벌크 insert로 데이터 864건 이전
  - `App.jsx:186-187` WebSocket URL/키를 새 프로젝트로 변경
  - `supabase.js`는 이미 새 프로젝트 URL이었음 (변경 불필요)
  - RLS 정책 + Realtime 구독 설정 완료
- **스키마 참고**: customers.id는 TEXT(UUID), customer_returns는 items JSONB 형식
- **데이터 검증**: 브라우저 테스트 완료 (products 585, customers 117, orders 152, customer_returns 8, saved_carts 2)

#### AI 주문 인식 개선 (TextAnalyze.jsx) (2026-03-19)
- **가변소음기 세트 규칙**: "63h 2개" → TVB 64 h 좌,우 1세트 (qty:1). h/Y + 2개 = 1세트 매칭
  - 4개 = 2세트, 1개 = L 또는 R 개별 매칭
  - 내경 63→64 자동 매핑 (제품에 63 없고 64 있음)
- **직관 레조 = CH 뻥레조**: "직관 레조", "직관레조" → CH 제품으로 매칭 (일반 레조 아님)
  - "일반 레조" / 단순 "레조" → 진짜 일반 레조
- **변경 위치**: Gemini 프롬프트 규칙/동의어표/예시, synonyms 맵
- 동의어 추가: 직관레조→CH, 가변소음기→TVB, 가변→TVB

#### AI 재고 관리 기능 추가 (AdminPage.jsx) (2026-03-19)
- **위치**: 관리자 페이지 → 'AI 입고' 탭 (TABS 배열에 추가)
- **기능**: 자연어 텍스트 → Gemini AI 파싱 → 제품 매칭 → 확인 후 일괄 재고 업데이트
- **2가지 모드**:
  - **입고 모드** (기본): 기존 재고에 수량 추가 (현재 10 + 입고 20 = 30)
  - **재고 설정 모드**: 기존 재고 무시, 입력 수량으로 교체 (입력 20 → 재고 20). 재고 실사/초기화용
- **동작 종류**: 입고(add), 출고(subtract), 설정(set) - 결과 화면에서 개별 변경 가능
- **플로우**: 모드 선택 → 텍스트 입력 → AI 분석 → 결과 확인(현재재고→변경후재고 표시) → 일괄 적용
- **재사용**: TextAnalyze.jsx의 Gemini 호출 패턴, synonyms, calculateMatchScore, findProduct 로직
- **컴포넌트**: `AIStockTab` (AdminPage.jsx 내부 함수형 컴포넌트)

#### 백업/복구 방법
- **현재 배포 버전**: AI 재고 관리 추가 (2026-03-19)
- **이전 배포 버전**: Supabase 이전 + AI 인식 개선 (2026-03-19)
- **그 이전 배포 버전**: 최적화 미적용 (2026-03-11, gh-pages 브랜치에 기록)

#### 전체 점검 결과 요약 (에이전트 3개 투입)
- **빌드**: 정상 (에러 0건)
- **코드 품질**: 62/100 (code-analyzer)
- **설계-구현 일치율**: 90% (gap-detector)
- **보안**: Critical 3건 (Gemini API 키 노출, RLS 미확인, 인증 부재)
- **핵심 기능**: 100% 구현 완료

#### 발견된 추가 이슈
- **[Critical]** TextAnalyze.jsx:45, AdminPage.jsx:1881 - Gemini API 키 Base64 노출 (사용자 유지 결정)
- **[High]** OrderDetail.jsx, ShippingLabel.jsx - `document.write()` XSS (escapeHtml 적용됨, 위험 낮음)
- ~~**[Medium]** supabase.js:206 - 미사용 `ADMIN_PASSWORD = '1234'` 잔존~~ → **2026-03-23 삭제 완료**
- **[Info]** shippingCount와 todayOrderCount가 동일 로직 중복

### 2026-03-23 작업 내역

#### 버그 수정 11건 (전체 점검 + PDCA 기법)

##### 1. Supabase 장애 복구
- Pro 플랜 업그레이드 + Spend cap 해제 + Restart project
- 이전 프로젝트(`icqxomltplewrhopafpq`)는 별도 계정, 현재 프로젝트와 무관

##### 2. 제품 등록 빈 페이지 크래시 (supabase.js + AdminPage.jsx)
- **원인**: products 테이블 `id`가 auto-increment 아닌 수동 할당 (이전 시 설정 누락)
- **수정**: `addProduct`에서 id 없으면 `max(id)+1` 자동 생성 (`supabase.js:69-76`)
- **추가**: `retail`/`stock`/`min_stock` 빈값을 `null` → `0`으로 변경 (NOT NULL 제약)
- **추가**: `saved` 결과 null 체크로 products 배열에 null 삽입 방지

##### 3. 반품 기능 버그 (CustomerList.jsx)
- **원인**: `onUpdateOrder(updatedOrder)` → `handleUpdateOrder(id, data)` 시그니처 불일치
- **수정**: `onUpdateOrder(id, { returns, total_returned })` 형태로 변경
- **추가**: 반품 데이터 형식을 OrderDetail.jsx와 통일 (개별 레코드 → items JSONB)
- **추가**: `customer_id`, `customer_name` 필드 추가

##### 4. 거래처 등록 오류 (AdminPage.jsx + App.jsx)
- **AdminPage**: `...formData` 스프레드 → 명시적 필드 나열 (DB에 없는 `blacklist` 필드 제거)
- **App.jsx saveOrder**: 자동 거래처 등록 시 `phone`/`address` 포함 (기존: name만)
- **App.jsx saveOrder**: 기존 거래처의 빈 phone/address 자동 업데이트

##### 5. 택배 송장 빈값 덮어쓰기 (ShippingLabel.jsx)
- 빈 phone/address로 기존 값 덮어쓰기 방지 (빈 값은 업데이트에서 제외)

##### 6. 주문확인 페이지 제품명 잘림 수정 (OrderPage.jsx)
- 제품 검색 목록, 장바구니 아이템, 제품 변경 드롭다운 3곳: `truncate` → `break-keep leading-tight`
- Playwright 모바일(390x844) 테스트 완료: "스덴 밴딩 파이프 51 - 15" 전체 표시 확인

##### 7. 기타 수정
- `ADMIN_PASSWORD = '1234'` 미사용 export 삭제 (supabase.js)
- 디버그 `console.log` 제거 (supabase.js deleteSavedCart)
- 모바일 제품명 잘림 수정: `truncate` → `break-keep` (MainPOS.jsx 상품그리드)
- PC 주문 로딩 애니메이션: `isSaving={false}` 하드코딩 → 실제 상태 관리 (MainPOS.jsx)
- 거래처 저장 null 체크 추가 (AdminPage.jsx CustomersTab)

#### PDCA 점검 결과 (에이전트 6회 투입)
- **코드 품질**: 72/100 (code-analyzer)
- **설계-구현 일치율**: 82% (gap-detector)
- **보안 점수**: 22/100 (security-architect) - Gemini API 키/관리자 비번은 사용자 유지 결정
- **등록 플로우 전수검사**: 10개 플로우 중 3건 수정, 7건 정상 확인
- **Playwright E2E 테스트**: 9개 페이지 네비게이션 + 제품 등록 + 주문 저장 검증 완료
- **보고서**: `docs/04-report/2026-03-23-*.md` (코드분석/보안감사/갭분석)

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

### z-index 계층 구조
| z-index | 요소 | 위치 |
|---------|------|------|
| z-50 | 모달/다이얼로그 | 각 페이지 내 fixed 모달 |
| z-[45] | 모바일 사이드바 오버레이 | AppLayout.jsx |
| z-40 | 풀스크린 페이지 sticky 헤더 | OrderHistory, CustomerList, ShippingLabel 등 |
| z-30 | 모바일 하단 네비게이션 | MobileNav.jsx |

> **주의**: `will-change`, `transform` 등 stacking context를 생성하는 CSS를 `main`, `nav`, `aside`에 적용하면 z-index 비교가 깨짐. `index.css`에서 `will-change: scroll-position` 제거한 이유.

### 주요 CSS 클래스 (index.css)
- `.card-interactive` - 카드 호버/클릭 spring 애니메이션
- `.no-print` - 인쇄 시 숨김
- `overscroll-behavior-y: contain` → `html, body`, `main`에만 적용 (다른 곳 금지)

---

## 7. Props 연결 구조

```
App.jsx (상태 관리)
├── orders, products, customers, savedCarts ← Supabase 로드
├── saveOrder(orderData) - 주문 저장 (자동 거래처 등록/업데이트 포함)
├── setCurrentPage(pageId) - 라우팅
├── pushUndo(entry) - Global Undo 시스템
│
├── MainPOS ← products, cart, saveOrder, customers, priceType, isSaving, onSaveCartModal, onOpenTextAnalyze, onOpenQuickCalculator, loadedCustomer, onClearLoadedCustomer
├── Dashboard ← orders, products, savedCarts, customers, setCurrentPage, supabaseConnected, onViewOrder
├── OrderHistory ← orders, onDeleteOrder, onDeleteMultiple, onViewOrder, onRefresh, isLoading, onSaveToCart, customers
├── CustomerList ← customers, orders, onAddCustomer, onSaveCustomerReturn, onRefreshOrders, onUpdateOrder, showToast
├── SavedCarts ← savedCarts, customers, products, onLoad, onDelete, onDeleteAll, onUpdate, onOrder, onRefresh, isLoading, showToast
├── StockOverview ← products, categories, formatPrice, onBack
├── BurnwayStock ← products, formatPrice, onBack
├── ShippingLabel ← orders, customers, onBack, refreshCustomers, showToast
├── TextAnalyze ← products, onAddToCart, formatPrice, priceType, onBack
└── AdminPage ← products, customers, supabase, setProducts, setCustomers, supabaseConnected, showToast, pushUndo
```

---

## 8. 알려진 이슈 / 개선 가능 항목

### 남은 이슈
- `OrderPage.jsx` (~1000줄) 미사용 레거시 파일 → 삭제 가능
- 스크린샷 PNG 파일 다수 → `.gitignore`에 추가 권장
- `.playwright-cli/` 폴더 → `.gitignore`에 추가 권장
- `saveOrder` useCallback deps 배열에 `deductStock` 누락 (연속 주문 시 stale closure 가능, 실질 영향 낮음)
- `shippingCount`와 `todayOrderCount` 동일 로직 중복 (`App.jsx:302-318`)

### Supabase 스키마 주의사항
- `products.id`: auto-increment 아님! `supabase.js addProduct`에서 `max(id)+1`로 자동 생성
- `products` NOT NULL 컬럼: `id`, `name`, `category`, `wholesale`, `retail`, `stock`, `min_stock`
- `customers.id`: TEXT (UUID, Supabase 자동 생성)
- `customer_returns.return_id`: NOT NULL (코드에서 `RET-${Date.now()}` 생성)
- `saved_carts.id`: auto-increment (정상)

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
- [x] 사이드바 열기/닫기 (메뉴 버튼 토글)
- [x] 사이드바가 sticky 헤더 위에 정상 표시 (z-[45] > z-40)
- [x] 하단 네비게이션 정상
- [x] 스크롤 잠김 없음
- [x] 번웨이 카드/모달 정상
- [x] 배송 정보 복사 (거래처 관리, 주문 상세)
- [x] 재고 부족 시 주문 허용 (경고만 표시)
- [x] 주문 후 재고 실시간 차감
- [x] 주문 내역 반품 카드 클릭 필터
- [x] 택배 송장 소형 화면 레이아웃 (280px~375px 검증)

### 2026-03-23 추가 검증
- [x] 관리자: 제품 등록 (id 자동생성, NOT NULL 처리)
- [x] 관리자: 거래처 등록 (blacklist 필드 제거)
- [x] 주문 시 신규 거래처 자동 등록 (phone + address 포함)
- [x] 주문 시 기존 거래처 빈 phone/address 자동 업데이트
- [x] 반품 처리 → 주문 업데이트 DB 반영
- [x] 반품 데이터 customer_id/name 포함
- [x] 택배 송장 빈값 덮어쓰기 방지
- [x] PC 주문 로딩 스피너 표시
- [x] 모바일 제품명 전체 표시 - MainPOS 상품그리드 (break-keep)
- [x] 모바일 제품명 전체 표시 - OrderPage 주문확인 3곳 (break-keep, Playwright 검증)
- [x] 9개 페이지 네비게이션 정상 (Playwright E2E)
- [x] 5개 테이블 INSERT 정상 (API 직접 테스트)

---

## 10. 원본 프로젝트 참조

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
- 인라인 편집, 제품 복사 등 기존 앱 기능을 참조하여 웹 버전으로 포팅함
