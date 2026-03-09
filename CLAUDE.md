# POS Calculator Web - 프로젝트 가이드

## 프로젝트 개요
자동차 튜닝 부품 판매용 POS 시스템의 웹 버전.
기존 모바일 앱(auto-shop-manager)을 웹 기반으로 재설계한 프로젝트.

## 기술 스택
- **프론트엔드**: React 18 + Vite + Tailwind CSS v3
- **백엔드/DB**: Supabase (REST API + WebSocket 실시간)
- **UI 아이콘**: lucide-react
- **기타**: exceljs (엑셀 내보내기), file-saver

## 실행 방법
```bash
npm install
npm run dev    # 개발 서버 (기본 포트: 5173 또는 5174)
npm run build  # 프로덕션 빌드
```

## Supabase 연결 정보
- URL: `https://icqxomltplewrhopafpq.supabase.co`
- 키: `supabase.js`에 하드코딩됨 (publishable key)
- 테이블: orders, products, customers, saved_carts

## 파일 구조

### 핵심 파일
- `src/App.jsx` - **메인 통합 파일**. 모든 상태관리, 라우팅, Supabase 실시간 구독, saveOrder 로직 포함
- `src/lib/supabase.js` - Supabase REST API 래퍼 (CRUD 전체)
- `src/lib/priceData.js` - 478개 하드코딩 상품 데이터 (Supabase 오프라인 시 폴백)
- `src/lib/utils.js` - formatPrice, formatDateTime 등 유틸리티

### 페이지 (src/pages/)
| 파일 | 라우팅 ID | 설명 | 상태 |
|------|-----------|------|------|
| Dashboard.jsx | `dashboard` | 메인 대시보드 (통계, 최근주문, 바로가기) | 기본 동작 |
| MainPOS.jsx | `pos` | POS 계산기 (상품그리드 + 장바구니 + 주문확인) | **핵심 기능** |
| OrderHistory.jsx | `orders` | 주문 내역 조회/필터/삭제 | 버그 있음 |
| SavedCarts.jsx | `saved-carts` | 저장된 장바구니 관리 | 미검증 |
| CustomerList.jsx | `customers` | 거래처 목록/검색/상세 | 기본 동작 |
| StockOverview.jsx | `stock` | 재고 현황 | 미검증 |
| ShippingLabel.jsx | `shipping` | 택배 송장 출력 | 미검증 |
| TextAnalyze.jsx | `ai-order` | AI 텍스트 주문 인식 | 미검증 |
| AdminPage.jsx | `admin` | 관리자 패널 (비번: dpfldl1!) | 기본 동작 |

### 모달/팝업 (App.jsx에서 렌더링)
| 파일 | 설명 |
|------|------|
| OrderDetail.jsx | 주문 상세 보기/수정/인쇄 |
| SaveCartModal.jsx | 장바구니 저장 모달 |
| QuickCalculator.jsx | 빠른 계산기 |
| NotificationSettings.jsx | 알림 설정 |

### 레이아웃 (src/components/layout/)
| 파일 | 설명 |
|------|------|
| AppLayout.jsx | 사이드바 + 헤더 + 메인 영역 래퍼 |
| Sidebar.jsx | 데스크톱 좌측 사이드바 (9개 메뉴) |
| MobileNav.jsx | 모바일 하단 네비게이션 (6개 메뉴) |
| Header.jsx | 상단 헤더 (페이지 타이틀, 모바일 햄버거) |

### UI 컴포넌트 (src/components/ui/)
- ConfirmDialog.jsx, EmptyState.jsx, StatusBadge.jsx, Toast.jsx

## 알려진 버그 (수정 필요)

### 1. 주문 금액 0원 표시 (높은 우선순위)
- **증상**: 대시보드 최근 주문에서 모든 주문이 "0원"으로 표시
- **위치**: Dashboard.jsx의 recentOrders, OrderHistory.jsx의 매출 통계
- **원인 추정**: `order.total_amount` 필드가 0이거나, saveOrder 시 금액 계산이 안 되거나, Supabase 데이터 자체 문제
- **확인 방법**: Supabase에서 orders 테이블의 total_amount 컬럼 데이터 확인 → MainPOS.jsx의 handleOrderSubmit 함수에서 total 계산 로직 확인

### 2. 주문내역 "전체 매출: NaN원" (높은 우선순위)
- **증상**: OrderHistory.jsx 상단 통계에 "전체 NaN원" 표시
- **위치**: OrderHistory.jsx 매출 합계 계산 부분
- **원인 추정**: total_amount가 null/undefined인 주문이 있어서 합산 시 NaN 발생

### 3. 주문내역 기본 필터 문제
- **증상**: "오늘" 필터 선택 시 "검색 결과 0건"인데 전체 131건 존재
- **확인**: 날짜 필터링 로직과 timezone 처리 확인 필요

### 4. 미검증 페이지들
아래 페이지들은 UI만 옮겨왔고 실제 데이터 연동이 정상인지 확인 안 됨:
- **SavedCarts.jsx**: 장바구니 저장/불러오기/주문전환
- **StockOverview.jsx**: 재고 표시/수정
- **ShippingLabel.jsx**: 송장 출력 기능
- **TextAnalyze.jsx**: AI 텍스트 분석 → 주문 변환

## Props 연결 구조 (App.jsx 기준)

```
App.jsx (상태 관리)
├── orders, products, customers, savedCarts (Supabase에서 로드)
├── saveOrder(orderData) - 주문 저장 (같은 고객 당일 병합 로직 포함)
├── setCurrentPage(pageId) - 페이지 네비게이션
└── 각 페이지에 필요한 props 전달

MainPOS 핵심 props:
  products, cart/setCart, saveOrder, customers, onSaveCartModal, supabaseConnected

Dashboard props:
  orders, products, savedCarts, customers, supabaseConnected, setCurrentPage

OrderHistory props:
  orders, setOrders, supabaseConnected, supabase, onViewOrder, setCurrentPage
```

## 주문 저장 플로우 (saveOrder in App.jsx)
1. 장바구니 아이템 + 고객정보 → saveOrder 호출
2. 같은 고객의 당일 주문이 있으면 **병합** (items 합치기)
3. 없으면 새 주문 생성
4. 고객이 DB에 없으면 자동 등록
5. Supabase orders 테이블에 저장
6. 실시간 구독으로 자동 반영

## 디자인 시스템
- CSS 변수 기반 테마: `--background`, `--foreground`, `--primary`, `--card`, `--border` 등
- `index.css`에 :root로 정의됨
- 라이트 테마 (파란색 primary: #2563eb)
- 반응형: `md:` 브레이크포인트 기준 (768px)
  - 모바일: 하단 네비 + 1열 레이아웃
  - 데스크톱: 사이드바(256px) + 유동 콘텐츠 영역

## 검증 체크리스트

### 반드시 확인
- [ ] POS에서 상품 추가 → 장바구니 → 주문확인 → 저장까지 전체 플로우
- [ ] 주문 저장 후 금액이 정상적으로 계산/저장되는지
- [ ] 주문내역 페이지에서 날짜 필터별 조회가 되는지
- [ ] 대시보드 매출 통계가 실제 금액을 반영하는지

### 기능별 확인
- [ ] 저장된 장바구니: 저장/불러오기/삭제/주문전환
- [ ] 재고현황: 상품별 재고 표시, 부족 알림
- [ ] 택배송장: 주소 입력 → 송장 출력
- [ ] AI 주문인식: 텍스트 입력 → 상품 매칭 → 주문 생성
- [ ] 관리자: 상품 추가/수정/삭제, 거래처 관리, 카테고리 관리
- [ ] 거래처: 상세보기, 블랙리스트 토글, 메모 기능

### 모바일
- [ ] 375px 뷰포트에서 하단 네비 동작
- [ ] POS 스티키 장바구니 바 동작
- [ ] 주문확인 모달이 모바일에서 정상 표시

## 원본 프로젝트 참조
- 기존 앱: `auto-shop-manager` (같은 Supabase DB 사용)
- 기존 앱의 로직을 참조하여 누락된 기능 보완 가능
