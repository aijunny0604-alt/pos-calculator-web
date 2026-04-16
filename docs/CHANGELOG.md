# 변경 이력 (Changelog)
> 날짜별 구현/수정 사항 기록
> 관련: [프로젝트 구조](ARCHITECTURE.md) | [DB 스키마](DATABASE.md) | [보안 설정](SECURITY-SETUP.md)

---

### 2026-04-16 작업 내역

#### 반품 처리 전면 수정 (7건 버그 수정)
- **문제**: 반품 처리 시 DB에 저장되지 않음 (PATCH 전체 실패)
- **원인 1**: `updated_at` 컬럼이 orders 테이블에 미존재 → Supabase PGRST204 에러로 PATCH 전체 거부
- **원인 2**: `totalReturned` camelCase 키 → Supabase가 알 수 없는 컬럼으로 거부
- **원인 3**: `deleteCustomerReturn`이 `id=eq.RET-xxx` 조회 → `id`는 bigint 자동증가, `return_id`로 조회해야 함

| 위치 | 변경 |
|------|------|
| `OrderDetail.jsx:279-283` | `updated_at` 제거, `totalReturned`→`total_returned` snake_case, `await` 추가 |
| `OrderDetail.jsx:323-327` | 반품 삭제도 동일 수정 |
| `App.jsx:632-635` | `handleUpdateOrder`에서 `total_returned→totalReturned`, `returns` 매핑 추가 |
| `App.jsx:1144-1145` | `setSelectedOrder`에서 반품 데이터 매핑 추가 |
| `supabase.js:138` | `deleteCustomerReturn` 쿼리 `id=eq.`→`return_id=eq.` |
| `CustomerList.jsx:144` | 중복 camelCase `totalReturned` 키 제거 |

- **검증**: Playwright + Supabase API curl로 The V8 주문 전량 반품 테스트 → DB 저장 확인 + 목록 즉시 반영 확인
- **배포**: GitHub Pages 배포 완료, 프로덕션 Playwright 검증 통과 (콘솔 에러 0건)
- DATABASE.md orders/customer_returns 스키마를 실제 DB와 동기화

---

### 2026-04-14 작업 내역

#### 모바일 한국어 텍스트 줄바꿈 깨짐 전수 수정 (7곳)
- **문제**: 모바일(360px)에서 한국어 주소/고객명이 글자 단위로 깨지거나 `truncate`로 잘리는 현상
- **원인**: `flex` 컨테이너에 `min-w-0` 누락, 한국어에 영문용 `break-words` 적용
- **수정**: 한국어는 어절 단위 줄바꿈(`break-keep`), 영문 포함 메모는 `break-words` 구분 적용

| 위치 | 변경 |
|------|------|
| `CustomerList.jsx:347-385` | 상세 상단 카드 전화/주소 — `flex-col sm:flex-row` + `break-keep` + `min-w-0` + `flex-shrink-0` |
| `CustomerList.jsx:567` | 주문 이력 메모 — `break-words` |
| `CustomerList.jsx:663` | 블랙리스트 사유 — `break-words leading-snug` |
| `CustomerList.jsx:675` | 리스트 카드 주소 — `break-keep flex-1 min-w-0` |
| `SavedCarts.jsx:423` | 상세 모달 헤더 — `break-words leading-snug min-w-0 flex-1` |
| `SavedCarts.jsx:1176` | 카드 이름 — `break-words leading-snug min-w-0` |
| `SavedCarts.jsx:1224` | 카드 메모 — `break-words leading-snug` |
| `OrderHistory.jsx:624` | 고객명 — `items-start` + `flex-wrap` + `break-words` |

- **검증**: Playwright 360×640 모바일 뷰포트 전수 검증. 가로 스크롤 0건, 콘솔 에러 0건, 단어 단위 자연 줄바꿈 확인.
- STYLE-GUIDE.md에 "텍스트 표시 규칙 (제품명/고객정보/메모)" 섹션 확장 — 한국어 `break-keep` vs 영문 `break-words` 구분 명문화.

---

### 2026-04-13 작업 내역 (4차)

#### AppLayout root 스크롤 + TextAnalyze 수량 버튼 터치 영역
- `AppLayout.jsx:54` — main wrapper에 `min-h-0` 추가 (모든 페이지의 root 스크롤 보장)
- `TextAnalyze.jsx:1066,1070` — AI 인식 결과 수량 +/- 버튼 `p-1.5` → `p-2.5` (터치 영역 24→40px)

전수조사 2회차 결과 잔여 Critical 0건. STYLE-GUIDE.md에 모달 표준 패턴 명문화.

---

### 2026-04-13 작업 내역 (3차)

#### 모달 h-full 제거 — 콘텐츠에 맞춰 자동 높이 조정
4개 모달이 `w-full h-full`로 콘텐츠 짧아도 항상 풀스크린 → 빈 공간 많이 보이는 문제:
- `SavedCarts.jsx` 상세 모달
- `OrderDetail.jsx:439` 주문 상세
- `MainPOS.jsx:825` 모바일 장바구니
- `OrderPage.jsx:326` 주문서

수정: `h-full` 제거 → `height: auto` + `maxHeight` 캡 유지. 콘텐츠 짧으면 모달도 작아지고 길면 maxHeight까지 늘어나며 스크롤.

---

### 2026-04-13 작업 내역 (2차)

#### 모달 스크롤 일괄 수정 — 5개 모달 (전수조사)
모달 스크롤 패턴(`min-h-0` + `overscroll-contain` + `touchAction: pan-y` + `modal-scroll-area`)을 누락한 모달 5개 일괄 수정:
- `OrderDetail.jsx:494` — 주문 상세 모달 (partial fix → full fix)
- `NotificationSettings.jsx:93` — 알림 설정 모달
- `TextAnalyze.jsx:1430` — 백업 목록 모달
- `OrderPage.jsx:372` — 주문서 모달 (modal-scroll-area만 있어 min-h-0 추가)
- `MainPOS.jsx:859` — 모바일 장바구니 모달

전체 모달에 동일 표준 패턴 적용 완료. 향후 새 모달 추가 시 SECURITY-SETUP.md/STYLE-GUIDE 참조.

---

### 2026-04-13 작업 내역

#### SavedCarts 상세 모달 모바일 스크롤 수정 (SavedCarts.jsx)
- **원인**: `flex-1 overflow-y-auto`만 있고 `min-h-0` 누락 → flex 높이 계산 실패로 모바일에서 본문 스크롤 불가
- **수정**: SaveCartModal과 동일 패턴 적용
  - `min-h-0`, `overscroll-contain`, `modal-scroll-area` 클래스 추가
  - `WebkitOverflowScrolling: touch`, `touchAction: pan-y` 인라인 스타일
  - `onTouchMove={e.stopPropagation()}` (이중 모달 방어)
- 위치: `SavedCarts.jsx:474` (renderDetailModal 본문)

#### Gemini API 키 HTTP referrer 제한 적용
- **목적**: GitHub 공개 레포에 노출된 Gemini API 키가 다른 도메인에서 사용되지 못하도록 차단
- 4개 프로젝트(A/B/C/D) 각각의 Cloud Console에서 "웹사이트 제한사항" 등록
- 허용 URL: `aijunny0604-alt.github.io/*`, `localhost:5173/*`, `localhost:4173/*`
- 신규 문서: `docs/SECURITY-SETUP.md` (referrer 제한 + Vite 포트 가이드)

---

### 2026-04-09 작업 내역 (6차)

#### AI 입고 제품 변경 + 학습 기능 (AdminPage.jsx)
- 각 결과 항목에 [제품 변경] 버튼 + 검색 드롭다운
- 매칭 실패 항목에도 [제품 검색] 버튼
- 수동 교정 시 ai_learning에 자동 학습 저장 (사유: "재고 관리에서 교정")
- [전체 선택] / [전체 해제] 토글 버튼

#### Gemini API 키D(프로젝트D) 추가 — 총 4프로젝트 160회/일

#### AI 입고 탭 — 입고대기/품절 상태 변경 (AdminPage.jsx)
- 각 결과 항목에 [입고대기] [품절] 토글 버튼 추가
- 품절 클릭 시 자동으로 수량 0 + action=set
- 상단에 [선택 입고대기] [선택 품절] 일괄 버튼
- 일괄 적용 시 stock + stock_status 동시 DB 업데이트
- 현재 상태 + 변경될 상태 뱃지 표시

### 2026-04-09 작업 내역 (5차)

#### 관리자 제품관리 — 입고대기 설정 추가 (AdminPage.jsx)
- 제품 추가/수정 폼에 "입고대기" 체크박스 추가
- `stock_status = 'incoming'` 토글로 입고예정 상품 관리
- 재고 현황에 입고대기 뱃지 표시, POS에서 예약주문 경고

#### Gemini API 키 3개 + 모델 2개 + 503 재시도 (TextAnalyze.jsx, AdminPage.jsx)
- 키 3개(프로젝트C→B→A) × 모델 2개(2.5-flash→2.0-flash) 자동 폴백
- 503(서버 과부하): 같은 키/모델로 2초 대기 후 최대 3회 재시도
- 429/403: 다음 키/모델로 즉시 폴백
- 에러 메시지 자연어 변환 (429→"일일 사용량 초과", 503→"서버 일시 장애")
- 일일 한도: 3프로젝트 × 2모델 × 20회 = 120회/일

### 2026-04-09 작업 내역 (3차)

#### 이중 모달 터치 스크롤 근본 수정 (OrderPage.jsx)
- **원인**: OrderPage의 `document.addEventListener('touchmove', preventDefault)` + 백드롭 `onTouchMove` + `touchAction: none` 3중 차단이 상위 모달(SaveCartModal 등) 스크롤을 막음
- **수정**: touchmove 차단에서 `overflow-y-auto`, `overflow-auto` 클래스가 있는 모든 요소 자동 허용
- 모든 모달에 `modal-scroll-area` 클래스를 수동 추가할 필요 없어짐
- SaveCartModal에 `onTouchMove={e.stopPropagation()}` 추가 (이중 모달 방어)

### 2026-04-09 작업 내역 (2차)

#### 구형 갤럭시(360px) 모바일 최적화 일괄 수정
- 모달 maxWidth: `min(Xrem, calc(100vw - 2rem))` 적용 (OrderDetail, MainPOS, AdminPage)
- 모달 maxHeight: `calc(100vh - 2rem)` 통일 (SaveCartModal, OrderDetail, MainPOS, AdminPage)
- TextAnalyze AI 설정 모달 max-height + flex-col 추가
- ShippingLabel 주소 truncate → break-words (전체 주소 표시)
- SaveCartModal touch-action: pan-y 추가 (구형 갤럭시 터치 스크롤)

#### 신규 고객 등록 시 전화번호/주소 누락 수정 (App.jsx)
- saveOrder에서 신규 고객 auto-register 시 name만 저장 → phone/address 포함

### 2026-04-07 작업 내역

#### AI 주문인식 학습 기능 (TextAnalyze, AdminPage, App, supabase)
- Supabase `ai_learning` 테이블 생성 (교정 데이터 저장)
- 3중 학습: DB 직접 매칭 → Gemini 프롬프트 주입(few-shot) → 패턴 매칭 폴백
- 수동 교정 시 자동 학습 + 수정 사유 기록
- 관리자 AI학습 탭: 목록/검색/삭제/수정/내보내기/가져오기/초기화
- DB백업에 ai_learning 포함 (6개 테이블)
- WebSocket 실시간 구독 추가
- change-verify 4팀 검증: Critical 5건 발견 → 수정 완료

#### CLAUDE.md 전문분야별 분할 (626줄 → 45줄)
- ARCHITECTURE.md: 파일 구조, 아키텍처, Props
- DATABASE.md: Supabase 연결, 6개 테이블 스키마
- CHANGELOG.md: 날짜별 변경 이력
- STYLE-GUIDE.md: CSS 변수, 반응형, z-index
- TESTING.md: 검증 체크리스트, 알려진 이슈

---

### 2026-04-09 작업 내역

#### 관리자 카테고리 탭 전면 개선 (AdminPage.jsx)
- **추가**: 새 카테고리 추가 기능 (인라인 입력 + 기본제품 생성)
- **삭제**: 카테고리 삭제 시 "미분류로 이동" 또는 "다른 카테고리로 병합" 선택
- **검색**: 카테고리명 검색 기능
- 편집/삭제 버튼 모바일에서도 항상 표시 (기존: hover에서만)

#### 관리자 제품 복사 id 생성 수정 (AdminPage.jsx)
- **문제**: handleDuplicate에 id 미생성 → Supabase 400 에러
- **수정**: products 전체에서 maxId+1 생성 후 addProduct에 전달

#### 주문 상세 수량 직접 입력 (OrderDetail.jsx)
- 수정 모드에서 수량 +/- 버튼 사이 숫자 직접 입력 가능 (모바일/PC 모두)
- `parseInt(val) || 1` + `val > 0` 이중 방어

#### 주문 상세 메모 편집 기능 (OrderDetail.jsx)
- 수정 모드에서 메모 textarea 표시 (기존: 읽기 전용)
- 메모가 없어도 새로 추가 가능

#### number input 스피너 전역 숨김 (index.css)
- 브라우저 기본 위/아래 화살표 전역 제거 (커스텀 +/- 버튼 중복 방지)
- Chrome/Firefox 모두 대응

### 2026-04-07 작업 내역

#### AI 주문인식 학습 기능 (TextAnalyze.jsx, AdminPage.jsx, App.jsx, supabase.js)
- Supabase ai_learning 테이블 생성 (교정 데이터 저장)
- 3중 학습 시스템: DB 직접 매칭 → Gemini 프롬프트 주입 → 패턴 매칭 폴백
- 사용자 수동 교정 시 자동 학습 + 수정 사유 기록
- Gemini 프롬프트에 교정 사례 주입 (few-shot learning, 상위 50건)
- 관리자 AI학습 탭: 목록/검색/삭제/수정/내보내기/가져오기/초기화
- DB백업에 ai_learning 포함 (6개 테이블)
- WebSocket 실시간 구독 추가 (ai_learning)
- change-verify 4팀 검증: Critical 5건 발견 → 수정 완료

### 2026-04-01 작업 내역

#### 대시보드 PC 반응형 개선 (Dashboard.jsx)
- 최근 주문 리스트: 8개 → 20개 표시 + `max-h-[480px]` 고정 높이 + 커스텀 스크롤
- 재고 부족 알림: 5개 제한 해제 → 전체 표시 + `max-h-48` 스크롤
- 커스텀 스크롤바 CSS 추가 (`index.css` `.custom-scroll` 클래스): 4px 얇은 디자인
- PC에서 하단 빈 공간 제거

#### AI 주문인식 결과 카드 모바일 제품명 전체 표시 (TextAnalyze.jsx)
- 1줄 레이아웃(제품명+수량+버튼 경쟁) → 2줄 레이아웃으로 변경
- 1줄: 체크박스 + 제품명 (전체 너비, break-words 줄바꿈)
- 2줄: 가격 + 수량조절 + 편집/삭제 버튼

#### 관리자 단가 일괄 조정 기능 추가 (AdminPage.jsx)
- **위치**: 관리자 페이지 → '단가조정' 탭 (TABS 배열에 `price-adjust` 추가)
- **기능**: 카테고리/제품 선택 → 인상/인하 설정 → 미리보기 → 일괄 적용
- **카테고리 선택**: 체크박스 + 펼쳐서 하위 제품 개별 제외 가능
- **제품 개별 추가**: 카테고리 외 제품 검색으로 추가
- **조정 방식**: % 또는 원 단위, 인상/인하 선택, 도매가/소매가/둘 다
- **미리보기**: 수치 입력 시 실시간 자동 표시 (변경 전/후 가격 비교 테이블)
- **반올림 없음**: 계산값 그대로 표기 (예: 38,500 × 1.2 = 46,200)
- **되돌리기(undo)** 지원
- **컴포넌트**: `PriceAdjustTab` (AdminPage.jsx 내부 함수형 컴포넌트)

#### 주문 삭제 시 재고 자동 복원 (App.jsx)
- **문제**: 주문 삭제/취소 시 재고가 차감된 상태로 유지 (복원 안 됨)
- **수정**: `restoreStock()` 함수 추가 (deductStock의 역함수)
  - `handleDeleteOrder`: 삭제 시 `restoreStock(deletedOrder.items)` 호출
  - `handleDeleteMultipleOrders`: 다건 삭제 시 전체 재고 일괄 복원
  - 토스트 메시지: "(재고 복원됨)" 표시
- **검증**: Playwright 테스트 - 벨로스터N 직관 다운파이프 2개→1개(주문)→2개(삭제) 확인

#### 관리자 거래처 등록 흰 화면 크래시 수정 (AdminPage.jsx)
- **원인**: `blacklist` 필드를 Supabase에 보내면 400 에러 → `saveCustomer` null 반환 → `setCustomers`에 null 추가 → useMemo `.name` 접근 시 크래시
- **수정**: DB 전송 전 `blacklist` 제거, null 체크 추가, useMemo 필터에 null 방어

#### 관리자 제품 등록 서버 응답 오류 수정 (AdminPage.jsx, supabase.js)
- **원인 1**: `products` 테이블 `id`가 auto-increment 아님 → id 없이 POST하면 NOT NULL 위반
- **원인 2**: `saveProduct()`이 `id`가 있으면 `updateProduct(PATCH)` 호출 → 새 제품은 DB에 해당 id 없어서 빈 결과
- **원인 3**: undo 등록 시 `getProducts()` 전체 조회 호출 → 느려서 모달 안 닫힘
- **수정**:
  - 새 제품 시 `maxId + 1`로 id 생성 + `addProduct(POST)` 직접 호출
  - 기존 제품 수정 시 `updateProduct(PATCH)` 직접 호출
  - null 필드(retail, stock, min_stock) 값 없으면 payload에서 제거
  - undo 시 `getProducts()` 호출 제거 → 즉시 모달 닫힘
  - `fetchJSON` 에러 메시지에 응답 body 포함 (디버깅용)
- **방어 코드**: 모든 `useMemo` 필터에 null 체크, `saveProduct/addProduct` 실패 시 throw

> **주의**: 새 제품 추가 시 반드시 `supabase.addProduct(POST)`를 사용할 것.
> `saveProduct`은 id가 있으면 `updateProduct(PATCH)`를 호출하므로 새 제품에 사용 금지.

#### DB 백업/복원 시스템 (AdminPage.jsx)
- **위치**: 관리자 페이지 → 'DB백업' 탭
- **백업**: 5개 테이블(제품/거래처/주문/장바구니/반품) → `pos-backup-YYYYMMDD.json` 다운로드
- **복원**: JSON 파일 업로드 → 미리보기(테이블별 건수) → 2단계 확인 후 **5개 테이블 전체** 복원
- **메타데이터**: `_meta.version`, `_meta.createdAt`, `_meta.app` 포함
- **마지막 백업 날짜**: localStorage에 저장, UI 표시

#### 제품 일괄 카테고리 변경 - 정리 모드 (AdminPage.jsx)
- **위치**: 관리자 페이지 → 제품관리 → '정리' 버튼
- **동작**: 정리 모드 진입 → 제품 행 클릭으로 체크박스 선택 → 카테고리 드롭다운에서 일괄 변경
- **기능**: 전체선택/전체해제/선택취소, 검색+카테고리 필터 유지
- **정리 모드 UI**: 백업/CSV/추가 버튼 숨김, 검색+필터+완료만 표시
- **DB 반영**: Supabase `updateProduct` 순차 호출 + 로컬 state 즉시 반영
- **검증**: Playwright로 CH 150 54 카테고리 변경/복원 → DB 직접 확인 완료

#### 주문 상세 업체 정보 수정 → 거래처 자동 동기화 (App.jsx)
- **문제**: 주문 완료 후 OrderDetail에서 전화번호/주소 수정 시 `orders` 테이블만 업데이트, `customers` 테이블 미반영
- **원인**: `handleUpdateOrder`가 `supabase.updateOrder()`만 호출, `updateCustomer()` 미호출
- **수정**: `handleUpdateOrder`에서 `customer_phone`/`customer_address` 변경 감지 시:
  - `customerName`으로 거래처 매칭 → `supabase.updateCustomer()` 자동 호출
  - 로컬 `customers` state도 동시 업데이트
- **검증**: 신규업체 주문(업체명만) → 주문상세에서 전화/주소 수정 → DB 직접 확인 완료

#### 거래처 목록 PC 검색바 기본 펼침 (CustomerList.jsx)
- 모바일(<768px): 기본 접힘 (기존 유지)
- PC(≥768px): 기본 펼침 (`isHeaderCollapsed` 초기값 `window.innerWidth < 768`)

#### 단가조정 검색 포커스 소실 수정 (AdminPage.jsx)
- **원인**: `SectionCard`를 함수 내부에서 컴포넌트로 정의 → state 변경 시 리마운트 → input 포커스 소실
- **수정**: PriceAdjustTab/BackupTab 모두 `SectionCard` 컴포넌트 → CSS 클래스 문자열(`sc`/`bsc`)로 대체

#### 장바구니/저장장바구니 견적서 복사 형식 통일
- **OrderPage.jsx** (주문확인 모달): 기존 간단 형식 → 상세 형식으로 변경
- **SavedCarts.jsx** (저장된 장바구니 상세): **견적서 복사 버튼 신규 추가**
- **통일 형식**: 주문번호, 고객명, 연락처, 상품목록(단가×수량), 결제정보(공급가/부가세), 입금 계좌
- 3곳 모두 동일: OrderDetail, OrderPage, SavedCarts

#### 정밀 검증 버그 수정 (에이전트 4팀 투입)
- **restoreStock 동일 제품 중복 합산** (App.jsx): 다건 삭제 시 같은 제품이 여러 주문에 포함되면 수량 누락 → `reduce`로 productId별 합산 후 복원
- **calcNewPrice 0원 상품** (AdminPage.jsx): `!price`가 0을 falsy로 처리 → `price == null` 체크로 변경
- **handleUpdateOrder customerName** (App.jsx): `setOrders` 콜백 내 side-effect → 외부에서 미리 추출
- **handleDeleteMultipleOrders 부분 실패** (App.jsx): `Promise.all` → `Promise.allSettled` + 성공 건만 삭제/복원, 실패 건 경고

#### 백업/복구 방법
- **현재 배포 버전**: 정밀 검증 + 견적서 통일 + DB 복원 완성 (2026-04-02, 91e10f0)
- **이전 배포 버전**: 거래처 동기화 + 정리모드 + DB백업 (2026-04-02, e737f8b)
- **백업 브랜치**: `backup/before-order-optimization-20260321` (4f02594)

### 2026-03-31 작업 내역

#### Sentry 에러 모니터링 연동 (main.jsx)
- **@sentry/react** 패키지 설치
- `main.jsx`에서 `Sentry.init()` 호출 (앱 최상단 초기화)
- 프로덕션(`import.meta.env.PROD`)에서만 활성화
- 에러 50% 샘플링 (`tracesSampleRate: 0.5`)
- 세션 리플레이: 에러 발생 시 100% 녹화 (`replaysOnErrorSampleRate: 1.0`)
- Sentry 대시보드: https://error01.sentry.io (org: error01, project: pos-calculator-web)

#### 모바일 제품명 잘림(truncation) 전면 제거 (10개 파일, 25곳)
- **문제**: 모바일에서 긴 제품명(허브스페이스, TVB 등)이 "..."으로 잘려 식별 불가
- **수정 패턴**: `truncate` → `break-words leading-snug` (줄바꿈 허용 + 행간 조밀)
  - `items-center` → `items-start` (멀티라인 상단 정렬)
  - `max-w-[140px]` 등 하드코딩 제거
  - `min-w-0` 추가 (flex 자식 축소 허용)
- **수정 파일**:
  | 파일 | 수정 개소 | 대상 |
  |------|-----------|------|
  | MainPOS.jsx | 3곳 | 제품 그리드, 장바구니, 주문확인 모달 |
  | AdminPage.jsx | 4곳 | 제품/거래처 테이블, 번웨이 재고 리스트 |
  | TextAnalyze.jsx | 4곳 | AI 인식 결과, 검색, 제품 추가 |
  | OrderDetail.jsx | 2곳 | 반품 목록, 반품 처리 |
  | SavedCarts.jsx | 2곳 | 장바구니 아이템, 아이템 요약 |
  | CustomerList.jsx | 2곳 | 주문/반품 아이템 |
  | BurnwayStock.jsx | 1곳 | 상세 모달 제품 리스트 |
  | Dashboard.jsx | 2곳 | 최근 주문, 재고 부족 알림 |
- **검증**: Playwright 모바일(390x844)에서 "허브스페이스", "가변", "TVB" 검색 + 장바구니 전체 확인 완료

> **주의**: 제품명 표시 영역에 `truncate`, `line-clamp`, `text-overflow: ellipsis` 사용 금지.
> 반드시 `break-words leading-snug` 패턴 사용하여 모바일에서 전체 제품명 표시.

#### 전수 검사 및 버그 수정 (에이전트 5개 투입)
- **검사 범위**: src/ 전체 30개 파일 (코드 품질, 보안, 설계 일치, UI 레이아웃, 빌드/런타임)
- **Critical 버그 수정**:
  - `CustomerList.jsx:141` - **반품 저장 실패** 버그. `onUpdateOrder(객체)` → `onUpdateOrder(id, data)` 시그니처 불일치로 반품이 DB에 저장되지 않던 문제 수정
  - `supabase.js:45,162,177` - `catch` 파라미터 누락으로 ReferenceError 발생 가능. `catch { e }` → `catch (e) { e }` 수정
  - `supabase.js:204` - 미사용 `ADMIN_PASSWORD = '1234'` export 제거
- **레이아웃 수정 (truncate 잔존 + flex 누락)**:
  - `TextAnalyze.jsx:963,1016` - `flex-1 min-w-0` 누락 수정
  - `Dashboard.jsx:231` - `flex-1 min-w-0` 누락 수정
  - `OrderDetail.jsx:1065` - 반품 금액 `flex-shrink-0` 추가
  - `AdminPage.jsx:2386` - AI 입고 탭 제품명 `truncate` → `break-words` 수정
  - `CustomerList.jsx:914` - 반품 처리 제품명 `truncate` → `break-words` 수정
- **안정성 수정**:
  - `OrderDetail.jsx:370`, `ShippingLabel.jsx:579` - `window.open` 팝업 차단 시 null 에러 방지
  - `supabase.js`, `SavedCarts.jsx` - 프로덕션 `console.log` 4곳 제거
- **검사 결과 요약**:
  | 항목 | 점수 |
  |------|------|
  | 코드 품질 | 68/100 (+6) |
  | 보안 | 22/100 (인증 부재 주요 감점, 내부용이라 실질 리스크 낮음) |
  | 설계-구현 일치 | 86% |
  | 빌드 | 통과 (에러 0건) |
- **미수정 (향후 작업)**:
  - Gemini API 키 도메인 제한 설정 필요 (Google Cloud Console)
  - WebSocket 재연결 로직 없음 (네트워크 불안정 시)
  - 재고 차감 race condition (동시 주문 시)
  - CLAUDE.md 섹션 7 Props 트리 대폭 갱신 필요 (매칭률 72%)

### 2026-03-28 작업 내역

#### 날짜 필터 하루 밀림 버그 수정 (OrderHistory, SavedCarts, ShippingLabel, utils.js)
- **문제**: 어제/이번주/이번달 필터에서 날짜가 하루 뒤로 밀림 (어제 → 그저께 주문 표시)
- **근본 원인**: `new Date(todayKST + 'T00:00:00+09:00')`로 Date 생성 후 `toISOString()`(UTC 출력)으로 날짜 추출
  - `+09:00` 오프셋은 JS가 UTC로 9시간 빼서 저장 → 자정 KST가 전날 15:00 UTC가 됨
  - `toISOString().split('T')[0]`이 전날 날짜를 반환 → 하루 밀림
- **수정**:
  - `utils.js`: `getTodayKST()`, `toDateKST()` 단순화 (`getTimezoneOffset` 제거, `getTime() + 9h` 방식)
  - `utils.js`: `offsetDateKST(dateStr, days)`, `offsetMonthKST(dateStr, months)` 유틸 함수 추가 (UTC 기반 `T00:00:00Z`)
  - `OrderHistory.jsx`: `+09:00` 인라인 계산 → `offsetDateKST()` / `offsetMonthKST()` 사용
  - `SavedCarts.jsx`: 동일 수정 + `getDeliveryDateLabel`의 `+09:00` → `Z` 변경
  - `ShippingLabel.jsx`: 동일 수정
- **KST 자정 리셋**: `getTodayKST()`는 정확히 KST 00:00:00에 날짜 전환됨 (UTC 15:00 기준)
- **검증**: Playwright로 배포 사이트에서 어제 필터(2건, 3/27) 및 이번주 필터(19건, 3/21~) 정상 확인
- **배포 완료**: 2026-03-28

> **주의**: 날짜 계산 시 `+09:00` 오프셋과 `toISOString()`(UTC) 조합 금지.
> 반드시 `offsetDateKST()` 또는 `T00:00:00Z` + `setUTCDate()` 패턴 사용.

### 2026-03-21 작업 내역

#### 모바일 주문 저장 성능 최적화 (App.jsx, MainPOS.jsx)
- **문제**: 모바일에서 주문 확인 버튼 누르면 PC 대비 로딩이 길고 화면이 멈춘 것처럼 보임
- **원인 분석**:
  1. `saveOrder()` 내부에서 `await refreshOrders()` 호출 → 전체 orders 테이블 재조회 (WebSocket이 이미 처리하므로 불필요)
  2. `deductStock()` 에서 아이템별 순차 API 호출 (`for...await` 루프) → 3개 아이템 시 3번 순차 호출
  3. 모바일 네트워크 레이턴시(80~150ms/호출)가 순차 호출에서 누적
  4. `isSaving={false}` 하드코딩 → OrderPage의 스피너 UI가 작동하지 않음
- **수정 내용**:
  1. **`refreshOrders()` 제거**: 주문 저장/병합 후 로컬 state 직접 업데이트 (WebSocket이 이미 실시간 반영)
  2. **`deductStock()` 병렬화**: `for...await` → `Promise.all()` 변경
  3. **`isSaving` state 추가**: App.jsx에서 관리, MainPOS → OrderPage로 전달
  4. **로딩 오버레이 추가**: 주문 저장 중 전체 화면 오버레이 표시 (스피너 + 단계별 메시지)
- **로딩 오버레이 z-index**: `z-[80]` (OrderPage `z-50`, successModal `z-[70]` 위에 표시)
- **실측 결과** (Playwright, 제품 3개, PC 모바일 시뮬레이션 390x844):
  | 항목 | 최적화 전 | 최적화 후 (실측) |
  |------|----------|----------|
  | API 호출 수 (3개 아이템) | 5회 순차 | 2회 (저장1 + 재고차감 병렬) |
  | 주문 완료 소요시간 | ~2~3초 | **~981ms** |
  | 사용자 피드백 | 없음 (멈춘 것처럼 보임) | 로딩 오버레이 + 단계별 메시지 |
- **Supabase 리전**: 도쿄 (ap-northeast-1), 한국에서 왕복 ~30-50ms (서울 대비 체감 차이 거의 없음)
- **남은 ~1초는 Supabase 서버 응답 시간** (주문 저장 + 재고 차감 API), 코드 최적화 한계

#### 전체 점검 결과 요약 (에이전트 3개 투입, 2026-03-21)
- **빌드**: 정상 (에러 0건)
- **코드 품질**: 62/100 (code-analyzer) → 2026-03-31 전수 검사 후 68/100
- **설계-구현 일치율**: 90% (gap-detector) → 2026-03-31 전수 검사 후 86%
- **보안**: Critical 3건 (Gemini API 키 노출, RLS 미확인, 인증 부재)
- **핵심 기능**: 100% 구현 완료

#### 발견된 추가 이슈 (미수정, 향후 작업)
- **[Critical]** TextAnalyze.jsx:44 - Gemini API 키 Base64 노출 → 즉시 revoke 필요
- **[High]** OrderDetail.jsx, ShippingLabel.jsx - `document.write()` XSS 취약점
- **[Medium]** ~~supabase.js:206 - 미사용 `ADMIN_PASSWORD = '1234'` 잔존~~ (2026-03-31 제거 완료)
- **[Info]** shippingCount와 todayOrderCount가 동일 로직 중복

#### 외부 서비스
- **Sentry 에러 모니터링**: https://error01.sentry.io (org: error01, project: pos-calculator-web)
  - DSN은 `main.jsx`에 직접 포함 (public DSN이라 보안 무관)
  - 프로덕션만 활성화, 에러 발생 시 이메일 알림

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

### 2026-03 초기 작업 내역

#### 관리자 페이지 (AdminPage.jsx)
- 모달 크기 확대: `max-w-5xl`, `max-h-[90vh]`
- 입력필드/버튼 크기 확대: `px-4 py-3 text-base`
- **인라인 편집**: 제품 리스트에서 더블클릭으로 이름/도매가/소매가/재고/최소재고 즉시 편집
- **인라인 편집**: 거래처 리스트에서 더블클릭으로 이름/전화/주소/메모 즉시 편집
- **제품 복사**: Copy 아이콘 버튼 → 제품 복제 기능

#### 스크롤 버그 수정
- `index.css`에서 `overscroll-behavior: contain` 광범위 적용 제거 (scroll trapping 해결)
- `StockOverview.jsx` 테이블 래퍼: `overflow-hidden` → `overflow: clip` (스크롤 전파 허용)
- `AdminPage.jsx` SectionCard 3곳에서 `overflow-hidden` 제거

#### 번웨이 다운파이프 (BurnwayStock.jsx) - 완전 리디자인
- **이전**: 아코디언 펼침/접힘 방식 (복잡, 긴 스크롤)
- **현재**: 대시보드 카드 그리드 + 클릭 시 상세 모달
  - `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` 반응형
  - `ModelCard`: 차종명, 총재고, 품절뱃지, 타입별 재고 요약
  - `DetailModal`: 전체 제품 리스트 (타입별 그룹핑)
  - `card-interactive` CSS 클래스로 호버/클릭 애니메이션

#### 모바일 헤더 통합
- 6개 풀스크린 페이지(StockOverview, CustomerList, OrderHistory, BurnwayStock, ShippingLabel, SavedCarts)에 메뉴 버튼 + 사이드바 연동 적용
