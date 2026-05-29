# POS Calculator Web

> 마지막 업데이트: 2026-05-29 (모바일 스크롤 + 위젯 폰트/필터 + 일괄발송 + 취소모달 + STATUS_RANK fix + received_at fix + 디스크 인프라 보강)
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry + Gemini AI.

## 🆕 v2026-05-29 — 모바일 UX 전면 개편 + sync.js 상태 머신 + 인프라 보강

오늘 13 커밋 (pos-calculator-web 10 + naver-sync-bridge 5 = 총 15 변경). 인프라 사고 1건 + 데이터 정합성 버그 2건 해결.

### A. SmartStore 모바일 UX 전면 개편 (da743fc + bf3119a + 002bfb3 + 9d26f37 + bf79bc0 + f7870f9 + e6f6391)

#### A-1. 모바일 스크롤 (`da743fc`)
**문제**: SmartStoreOrders 페이지가 root에 `h-full overflow-hidden` + 카드 영역만 `flex-1 min-h-0 overflow-y-auto` 중첩 스크롤. 모바일 viewport(667px)에서 헤더+Sync위젯+KPI+네이버위젯6+날짜필터+상태필터 6블록이 460~540px 차지 → 스크롤 영역 100px 이하로 줄어 사실상 스크롤 불가.

**수정**: 헤더만 고정으로 두고 KPI/위젯/필터/카드 전체를 단일 wrapper `flex-1 min-h-0 overflow-y-auto`로 통합.

**검증**: Playwright 모바일 viewport 375x812 → `innerScroll.scrollHeight=1744px in clientHeight=499px` → scrollable: true ✅

#### A-2. 상단 위젯 폰트/사이즈 + 클릭 액션 (`da743fc`)
- `KpiCard`: `text-xl` → `text-2xl sm:text-3xl`, `p-2.5` → `p-3 sm:p-3.5`, hover 효과 + onClick prop
- `NaverStatBox`: `text-base` → `text-xl sm:text-2xl`, `text-[9px]` → `text-[11px] sm:text-xs`, `minHeight: 92`, hover/active
- 그리드: KPI 4열 → 모바일 2x2, 네이버 위젯 3열 → 모바일 2x3 / 태블릿 3x2 / 데스크탑 1x6
- 10개 카드 모두 `<button>` 으로 변경, hover `shadow-md + -translate-y-0.5`, active `scale-[0.98]`

#### A-3. 위젯 카운트↔클릭필터 1:1 일관성 (`bf3119a`)
**Codex Major fix**: 위젯 카운트와 클릭 필터가 다른 로직을 쓰던 문제.

**해결**: `widgetFilter` state 도입 (`'overdue' | 'dueDday' | 'dueD1' | 'autoPending' | 'newAfterConfirm' | 'cancel'`).
- `filtered` useMemo에 stats 카운트 로직과 1:1 동일 적용
- 토글: 같은 위젯 재클릭 = 해제
- 일반 status/provider/date filter 변경 시 widgetFilter 자동 해제
- 활성 위젯: accent 색 테두리 2px + ring shadow + bg `color-mix(in srgb, ... 12%, var(--background))`
- "필터 해제 ✕" 칩 (active 시)

#### A-4. "발주 후 신규" 카드 안 보이던 버그 (`002bfb3`)
**문제**: `newAfterConfirm` 카운트는 `converted` 상태 포함이지만 `showCompleted` 토글이 OFF면 converted 카드가 숨겨져서 위젯 클릭해도 카드 0건.

**수정**: `widgetFilter` active 시 `showCompleted` 토글 우회. M4 추가 fix: `autoPending`에 `isDone`/`dispatched` 가드 (polling latency false positive 방지).

#### A-5. 일괄 발송 multi-select UI (`9d26f37`)
- 컴팩트 모드 row 앞에 체크박스 컬럼 + 헤더 전체 선택
- 선택 시 상단 floating bar: "N건 선택 / [일괄 발송처리] / [해제]"
- 일괄 발송 모달: 택배사 공통 선택 + 주문별 송장번호 input
- 송장 입력된 건만 등록, 발주확인 미완료 건은 자동 함께 등록
- M1 부분 실패 처리: 실패 주문만 selection + tracking 보존, 모달 유지, 토스트에 buyer_name 3건 + "외 N건"

#### A-6. 주문 취소 모달 (`bf79bc0` + `e6f6391`)
- `cancelOrder` 함수: `Ban` 아이콘 버튼 → 모달 오픈
- C1 fix: `window.prompt/confirm` → 모달 UI (iOS Safari 안정성, CLAUDE.md 모달 정책 일관성)
- 5개 사유 preset 버튼 (`상품 품절 / 구매자 요청 / 배송 지연 / 가격 오류 / 기타`) + textarea + 200자 카운터
- 구매자/주문번호/금액 미리보기 + disabled 상태 처리
- DB: `order_status='cancelled'` + `needs_naver_cancel=true` + `naver_cancel_reason` PATCH

#### A-7. 채널 분류 헬퍼 (`bf79bc0`)
**Codex Major D fix**: 옛 엠파츠 단일 거래처 + 새 분산 거래처(category 태그) 둘 다 일관 처리.

**파일**: `src/lib/channelClassifier.js`
- `classifyOrderChannel(order)` → `'naver' | 'general'`
- `aggregateByChannel(orders, customers)` → 채널별 매출 집계
- `extractNaverBuyer(order)` → memo에서 구매자 이름

OrderHistory.jsx의 isNaverOrder 정규식 인라인 → channelClassifier 호출로 통합 (M2 DRY).

#### A-8. OrderHistory 네이버 카드 강조 (★ M5 핫픽스 - 가장 중요!)
**버그**: borderWidth/boxShadow를 같은 style 객체에 두 번 정의 → 뒤 값이 덮어써서 **네이버 카드 강조(2px+초록 glow)가 실효성 0**.

```jsx
// 버그 코드
borderWidth: isNaverOrder ? '2px' : undefined,  // ← 이게
boxShadow: isNaverOrder ? '0 0 0 1px rgba(3,199,90,0.35)...' : undefined,
borderWidth: isReturned ? '2px' : '1px',  // ← 이거로 덮어써짐!
boxShadow: isReturned ? '...' : isPaid ? '...' : undefined,  // 네이버 glow 사라짐
```

**수정** (`f7870f9`): 단일 조건문으로 통합, isReturned 우선 + 그 외 isNaverOrder 적용.

**Playwright 라이브 검증**: 네이버 카드 `boxShadow: rgba(3, 199, 90, 0.35) 0px 0px 0px 1px, rgba(3, 199, 90, 0.18) 0px 4px 14px 0px` ← **초록 glow 실제로 보임** ✅

### B. 거래처 카테고리 자동 태그 (`09432b0`)

**버그**: 신규 거래처만 customer_category 적용 → 기존 거래처와 매칭되면 카테고리 누락.

**수정**: App.jsx saveOrder 흐름 — `existingCustomer.category`가 비어있고 `orderData.customer_category` 있으면 `supabase.updateCustomer(id, { category })` PATCH + setCustomers 동기화.

**효과**: 네이버 주문 buyer가 기존 거래처와 매칭돼도 '엠파츠' 카테고리 필터에 잡힘.

### C. 스마트스토어 메뉴 빨간 알림 배지 (`fa82893`)

- App.jsx `smartstoreCount` state 추가
- `useEffect` 1분 polling: `supabase.getExternalOrders` 호출 → 오늘 received_at + non-DONE 카운트
- Sidebar/MobileNav badgeMap에 `'smartstore': smartstoreCount` 추가
- 빨간 배지 표시 (다른 페이지 패턴 일관)

### D. DONE_STATUSES 확장 (`057980f`)

**문제**: 처리완료 표시 토글 OFF인데도 DELIVERED/PURCHASE_DECIDED/CANCELED 카드 표시.

**수정**: DONE_STATUSES Set에 네이버 원본 종결 상태 추가.
```js
const DONE_STATUSES = new Set([
  'converted', 'shipped', 'cancelled',           // 내부
  'DELIVERED', 'PURCHASE_DECIDED',                // 네이버 종결
  'CANCELED', 'CANCEL_REQUEST',                   // 취소
]);
```

### E. sync.js 상태 머신 정정 (★ 데이터 정합성 fix)

#### E-1. STATUS_RANK 도입 - 후퇴만 방어 (`40d75fa`)
**버그**: `LOCAL_PROCESSED_STATUSES`에 `'confirmed'` 포함 → 사장님이 발주확인한 주문이 네이버에서 DISPATCHED/DELIVERED로 진행해도 polling 차단. 화면에 "어제 보냈는데 발주확인" stuck.

**수정**: STATUS_RANK 도입.
```js
const STATUS_RANK = {
  received: 1, PAYMENT_WAITING: 1,
  PAYED: 2, matched: 2,
  confirmed: 3,
  DELIVERING: 4, DISPATCHED: 4,
  shipped: 5,
  DELIVERED: 6,
  PURCHASE_DECIDED: 7,
  CANCEL_REQUEST: 90,
  CANCELED: 91, cancelled: 91,
  converted: 99,
};
```

**로직**: 새 status rank가 현재보다 높으면 **갱신**(전진 허용), 낮거나 같으면 **보존**(후퇴 방어).
- `confirmed(3) → DISPATCHED(4)`: 갱신 OK
- `confirmed(3) → PAYED(2)`: 보존
- `converted(99) → 무엇이든`: 절대 변경 안 함

#### E-2. received_at = paymentDate || orderDate (`6933e4e`)
**버그**: sync.js upsertOrderAndItem에서 `received_at` 명시 설정 안 함 → DB default(NOW) 사용 → **backfill 시 옛 주문이 backfill 실행 시각으로 표시**. 5/26 공효빈 주문이 5/29로 잘못 표시.

**수정**: `orderRow.received_at = od.paymentDate || od.orderDate || new Date().toISOString()`

**검증**: 5일치 backfill 18건 재실행 → Playwright 라이브 11건 카드 모두 주문번호 prefix와 일치하는 정확한 날짜 표시 (`202605**26**... = 5/26 16:25` 등).

### F. 인프라 사고 + 자동 보강 4건 (★ 운영 안정성)

#### F-1. 매장 PC 디스크 0GB 사고 (오전 9:47~14:30)
**증상**: 사장님이 "오늘 주문 안 들어옴" 보고. 네이버 관리자엔 주문 1건 있는데 우리 시스템엔 0건.

**원인**: C 드라이브 0GB Free (Downloads 폴더 혼자 267GB). sync.js PID 401272는 살아있지만 디스크 write 실패로 polling 결과 저장 못함. OS swap/temp도 실패해 시스템 전반 hang.

**복구**:
1. Vite/npm/Temp 캐시 정리 → 67GB Free 확보
2. sync.js kill (PID 401272) → 직접 재시작 (PID 425044)
3. 1일치 backfill → 어제 6건 동기화
4. 누락 1건 (신민철, 5/29 14:28) 5분 polling 자동 수집

#### F-2. 자동 보강 4건 등록 (`d146a7d`, `f060ca5`)
재발 방지 인프라:

| # | 항목 | 파일 | 효과 |
|---|---|---|---|
| 1 | **디스크 SessionStart 경고** | `~/.claude/hooks/session-start.sh` | Free < 5GB 빨강 / < 15GB 노랑 자동 경고 + sync.js 살아있는지 확인 |
| 2 | **sync.js watchdog** | `naver-sync-bridge/watchdog.ps1` | 5분마다 체크 → 죽었으면 자동 부활 (디스크 3GB 미만이면 skip) |
| 3 | **로그 파일 출력 + 회전** | `start.bat` 수정 | stdout→`logs/sync-YYYYMMDD.log`, stderr→`.err`, 7일 후 자동 삭제 |
| 4 | **Task Scheduler 트리거 강화** | `install-scheduler.ps1` | AtLogon → **AtStartup 추가** + RestartCount 3 (5분 간격) |

**등록 완료**:
```
MOVE-WEP-Naver-Sync-Bridge   Ready  ← AtLogon + AtStartup + RestartCount 3
MOVE-WEP-Naver-Sync-Watchdog Ready  ← 5분마다 sync.js 살아있는지 체크
```

### G. flow-check 라이브 검증 결과

오늘 마지막 단계로 Playwright MCP 직접 검증:
- ✅ sync.js LIVE 표시, 마지막 sync "방금 전", 24h 성공률 100% (288회)
- ✅ 오늘 누락 1건 (신민철 320,000원) 자동 수집됨
- ✅ 위젯 클릭 → border 2px active 강조 작동
- ✅ 컴팩트 모드 체크박스 5개 (헤더+row 4)
- ✅ 카드 모드 [주문취소] 버튼 + 모달 정상
- ✅ **OrderHistory 네이버 카드 boxShadow 초록 glow 적용** (M5 핫픽스 효과)
- ✅ 모바일 viewport 스크롤 1744px in 499px → scrollable
- ✅ Console 에러 0건
- 최종 판정: **PASS (95점)**

### H. 사장님이 발견한 의문 2건

| 의문 | 원인 | 해결 |
|---|---|---|
| "공효빈 왜 오늘 떠있어?" | received_at 미설정 → DB default(NOW) | E-2 수정 후 5/26로 정확 표시 |
| "어제 발송한 게 왜 발주확인?" | STATUS_RANK 없어 confirmed→DISPATCHED 차단 | E-1 수정 후 DELIVERED/PURCHASE_DECIDED 정확 반영 |

### I. Codex 2차 리뷰 Critical 3건 핫픽스 (저녁 추가, `f3e49c6` + `c6cea32`)

저녁에 /bkit:code-review 실행 → Critical 3건 발견 → 즉시 핫픽스:

#### I-1. C-1 watchdog 무한 재시작 가드 (`c6cea32`)
**위험**: sync.js가 syntax error/throw로 즉시 crash하는 코드 배포 시 watchdog이 5분마다 무한 재시작 → 디스크/로그 폭증 → F-1 사고 재발 트리거.

**수정**: `logs/restart-count-YYYYMMDDHH.txt` 카운터 파일. 시간당 5회 초과 시 skip + `FAIL hourly restart limit exceeded` 로그.

#### I-2. C-2 STATUS_RANK 누락 status 추가 (`c6cea32`)
**위험**: `TERMINAL_PRODUCT_ORDER_STATUSES`에는 등재됐는데 `STATUS_RANK`에 없는 status들이 polling 응답에 나타나면 → newRank=0 → `shouldKeepLocal=true` → polling 결과 통째 skip (사일런트 실패).

**수정**: 5개 추가.
- `PAY_WAITING: 1` (PAYMENT_WAITING 변형)
- `DELIVERED_COMPLETED: 6` (DELIVERED 종결 단계)
- `RETURNED: 95, EXCHANGED: 95` (반품/교환)
- `CANCELED_BY_NOPAYMENT: 91` (미입금 자동 취소)

#### I-3. C-3 CANCEL_REQUEST를 미처리로 분류 (`f3e49c6`)
**위험**: 구매자가 취소 요청한 주문이 DONE_STATUSES에 포함되어 화면에서 숨겨짐 → 사장님 응답 지연 → 클레임.

**수정**: `DONE_STATUSES`에서 `CANCEL_REQUEST` 제거. 네이버 위젯 "❌ 취소 요청"으로만 노출.

**+ 보강**: `DELIVERED_COMPLETED`, `RETURNED`, `EXCHANGED`, `CANCELED_BY_NOPAYMENT` 추가하여 종결 상태 정합성 완성.

### J. watchdog v2: 옛 코드 자동 감지 (`26db818`)

오후 사고: STATUS_RANK fix(`40d75fa`) 후 sync.js 재시작 누락 → PID 489920이 옛 코드로 polling → 신민철 status 미반영 → 사장님 "왜 그대로지" 보고.

**수정**: watchdog.ps1 강화.
```powershell
if (sync.js 파일 mtime > 프로세스 CreationDate + 2분) {
  Restart-SyncJs "stale-code"  # 옛 코드 감지 → 자동 재시작
}
```

**효과**: 코드 변경 후 최대 5분 내 자동 적용. 운영 사고 자가 복구.

### K. SessionStart 훅 sync.js 감지 수정 (저녁 추가)

오후 사고 후폭풍: SessionStart 훅의 `pgrep -f "sync.js"` 가 Windows 프로세스를 못 감지 → false alarm "sync.js 미실행" 경고가 실제로는 살아있는데 표시되던 문제.

**수정**: `wmic process where "name='node.exe'" get commandline | grep "sync.js"` 우선 시도, 실패 시 pgrep 폴백.

---



오늘 누적 27 커밋. 핵심 기능 13가지 + Codex Critical/Major fix 8건.

### 🔄 POS ↔ 네이버 양방향 자동화 (60초 폴링, 매장 PC IP 우회)

**큐 패턴 3종** (모두 매장 PC sync.js 가 처리, IP 화이트리스트 통과):
- **발주확인 큐**: `needs_naver_confirm=true` → sync.js confirmPendingNaverOrders() → POST `/external/v1/pay-order/seller/product-orders/confirm`
- **발송처리 큐**: `needs_naver_dispatch=true` + 송장정보 → sync.js dispatchPendingNaverOrders() → POST `.../dispatch`
- **취소 큐** (DB 준비 완료, UI 다음 사이클): `needs_naver_cancel` 컬럼 + `naver_cancel_reason`

**큐 처리 패턴 (Codex 권장)**:
- 원자적 claim: PATCH ?claimed_at=is.null AND needs_*=true → 동시 실행 방지
- Retry backoff: exponential (1·2·4·8·16분, max 60분) + MAX_CONFIRM_RETRIES=5
- 영구 4xx (429 제외) 2회 후 즉시 큐 제거
- "already/이미/중복" 응답은 성공으로 간주
- LOCAL_PROCESSED_STATUSES = {confirmed, shipped, converted, cancelled} 보호 — polling 으로 절대 덮어쓰지 않음
- dispatch 큐는 confirm 성공 + 2분 grace 후만 처리 (race 방지)

**네이버 → POS 반영**:
- last-changed-statuses API 60초 polling
- polling 응답 ID 는 변경 감지 시그널 → detail 강제 재조회 (7일 skip 무력화, Codex Critical fix)
- order_status 자동 갱신 + Supabase Realtime postgres_changes → 화면 자동 reload

### 🎨 SmartStoreOrders 카드 UI 전면 개편

**5블록 카드** ([src/pages/SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx)):
1. 상태 헤더 (status chip + provider chip + ✓ 발주확인/발송완료 마커 + 날짜)
2. 구매자 블록 (큰 글씨 이름 + 전화 + 주소 + 주문번호)
3. 상품/금액 블록 (매칭 chip + 매칭 변경 [변경]/[해제] 인라인 패널)
4. 발송 정보 (택배사·송장번호, dispatched_at 있을 때만)
5. 액션 버튼 (발주확인 / 내부주문 / 발송처리 / 송장) - 모바일 2x2, 데스크탑 4열

**뷰 모드 토글** (localStorage `smartstore_view_mode` 영구 저장):
- 카드 모드: lg 2열 grid + 모바일 1열
- 컴팩트 모드: 5열 grid row + 클릭 시 인라인 펼침 패널 (상품 + 매칭 변경 + 처리 마커 + 합계)
- 액션 버튼은 e.target.closest('button[title]') 가드로 펼침 트리거 분리

**처리완료 토글**: DONE_STATUSES (converted/shipped/cancelled) 기본 숨김 + "처리완료 표시" 체크박스 (건수 chip)

**모바일 햄버거 메뉴**: 다른 페이지 동일 패턴 — `md:hidden` + `window.dispatchEvent(new CustomEvent('toggle-sidebar'))`

### 📊 네이버 관리자 페이지 위젯 6개 통합

KPI 4개 (전체/오늘/대기/오늘매출) + 네이버 위젯 6개:
- ⏰ 발송기한 초과 (`dispatch_due_date < now() AND !shipped`)
- 🤖 자동처리 예정 (`needs_naver_confirm OR needs_naver_dispatch`)
- 🚚 발주 후 신규 (`confirm_succeeded_at AND !dispatch_succeeded_at`)
- ❌ 취소 요청 (raw_payload.cancelRequest 또는 status CANCEL_*)
- 📅 발송마감 D-1 / 🔥 D-day (KST 자정 경계 계산)

`stats useMemo` 는 `ordersInRange` (dateRange 적용된) 기반 — 날짜 조회와 일관 (Codex Major A fix).

### 📅 날짜 조회 필터 (네이버 관리자 페이지 스타일)

- 5 프리셋: 오늘 / 1주일(기본) / 1개월 / 3개월 / 전체
- date input 2개 (from/to) — 변경 시 자동 `custom` 모드
- KST 자정 경계 (`new Date().setHours(0,0,0,0)`)
- filtered 와 stats(ordersInRange) 모두 dateRange 적용

### 👤 거래처 정책 변경 — 구매자별 분리 + 카테고리 태깅

**이전**: 모든 네이버 주문 → "엠파츠" 단일 거래처
**현재**: 거래처 = 실제 구매자 (matchCustomer fuzzy 매칭, 재구매 시 자동 합쳐짐) + `customers.category='엠파츠'` 자동 부여

**memo 형식**:
```
[엠파츠] [네이버 스마트스토어] {provider_order_id}
구매자: 권찬수 / 010-3529-4697
주소: 경북 영천시 ...
```

**App.jsx saveOrder**: `customerData.category = orderData.customer_category` (네이버 주문이면 '엠파츠' 자동)
**OrderHistory 식별**: `/\[엠파츠\]|\[네이버/i.test(memo) || customerName==='엠파츠'` (구·신 데이터 둘 다 인식)

### 🛒 OrderHistory 네이버 카드 시각 차별화

- 배경: `color-mix(in srgb, #03c75a 16%, var(--card))`
- borderWidth: 2px + boxShadow `0 0 0 1px rgba(3,199,90,0.35), 0 4px 14px rgba(3,199,90,0.18)`
- 좌측 세로 컬러 바 (linear-gradient 180deg, #03c75a→#22c55e, w-1.5)
- 상단 accent bar (linear-gradient 90deg 3-stop, h-2, glow shadow)
- 인라인 chip "🛒 네이버" (업체명 옆, 우측 상단 absolute 제거로 겹침 방지) — gradient 배경 + 흰 글씨 + textShadow
- 옛 엠파츠 데이터 호환: memo 파싱하여 "엠파츠 → 권찬수 님" 표시
- 발송처리 인라인 [📦 발송] 버튼 + 모달 (memo 의 provider_order_id 정규식 추출 → external_orders 매칭 → 큐 PATCH)

### 🔧 매칭 직접 수정 + freeform 전환

**카드 매칭 변경**:
- 모든 매칭 상태에서 [변경] 버튼 (matched·manual·pending·no-candidate)
- 인라인 검색 패널 (products 검색 + 후보 8개 드롭다운)
- matched 상태에선 [해제] 버튼 추가 → 매칭 풀고 pending 으로

**freeform 주문 전환** (사용자 정책 — "굳이 제품 등록 안 해도"):
- 매칭 안 된 item 도 네이버 제품명·금액 그대로 내부 주문에 포함
- id = `naver-{provider_product_order_id}` 마커 (같은 주문 합산 사고 방지)
- placeholder 만 안전 차단

### 🔍 자동 제품 등록 (sync.js)

매칭 실패 시 sync.js 가 products 테이블 자동 INSERT:
- name = provider_product_name
- retail = wholesale = unit_price (네이버 소비자가만)
- category = '네이버 자동등록' (단일 카테고리)
- 같은 이름 product 이미 있으면 그것 재사용 (중복 방지)
- placeholder 가드: `name.includes('⏳')` + `detail_fetch_error === 'pending-detail-fetch'`
- partial unique index (`WHERE category='네이버 자동등록'`) — 409 conflict 시 재조회 fallback

### 📦 송장 발송인 자동화

- 네이버 주문 [📦 송장] → ShippingLabel 자동 이동 + entry.sender='엠파츠'
- ShippingLabel.jsx 의 `newCustomEntry.sender` 동적 default — `computeDefaultSender()` 가 localStorage 최신 entry sender 자동 추적
- useEffect 감지 → customEntries 변경 시 자동 동기화 (페이지 진입 직후 즉시 반영)
- 신규 entry reset 시 prev.sender 보존 (네이버=엠파츠 / 매장=무브모터스 연속 입력 시 매번 변경 부담 제거)

### 🏷 거래처 관리 카테고리 필터

[src/pages/CustomerList.jsx](src/pages/CustomerList.jsx):
- categoryOptions useMemo (등록된 카테고리 자동 발견)
- 필터 buttons: [전체] [🛒 엠파츠] [미분류] (건수 chip 동시 표시)
- categoryFilter state: 'all' | 'none' | <category name>
- "엠파츠" 카테고리만 클릭하면 모든 네이버 구매자 한눈에

### 🚨 Codex 검토 결과 적용 (Critical 1 + Major 8 + Minor 2)

| 등급 | 항목 | 적용 |
|---|---|---|
| 🔴 Critical | sync.js 7일 skip → polling 응답 ID 강제 detail | ✅ |
| 🔴 Critical | order_status 순환 덮어쓰기 → LOCAL_PROCESSED_STATUSES 보호 | ✅ |
| 🟡 Major | confirm 큐 race condition → claimNaverConfirmRow 원자적 PATCH | ✅ |
| 🟡 Major | retry backoff + MAX 5 → 영구 stuck 방지 | ✅ |
| 🟡 Major | dispatch confirm 안 됨 거부 → SELECT 에 succeeded_at NOT NULL 조건 | ✅ |
| 🟡 Major | dispatch 같은 cycle race → confirm 후 2분 grace | ✅ |
| 🟡 Major | dispatch body 필수값 누락 → trim 검증 + 에러 분기 | ✅ |
| 🟡 Major | needs_naver_confirm 조건 → succeeded_at IS NULL 기준 | ✅ |
| 🟡 Major | stats vs dateRange 충돌 → ordersInRange 통일 | ✅ |
| 🟡 Major | dispatch_due_date 컬럼 미활용 → 컬럼 우선 폴백 | ✅ |
| 🟡 Major | autoRegister race → partial unique index + 409 재조회 | ✅ |
| 🟡 Major | autoRegister placeholder 가드 → detail_fetch_error 추가 검사 | ✅ |
| 🟢 Minor | STATUS_LABEL fallback → 원본 status 표시 | ✅ |
| 🟢 Minor | isNaverOrder 공백 정규화 | ⏭️ 다음 사이클 (Task #112) |

### 📦 DB 마이그레이션 추가 (002·003·004)

- **002 `external_orders_naver_confirm_hardening`**: needs_naver_confirm + retry/claim 컬럼 + partial index
- **003 `external_orders_naver_dispatch_queue`**: needs_naver_dispatch + 송장정보 + retry 컬럼 + dispatch_due_date 컬럼 + partial index (generated column 시도 IMMUTABLE 제약으로 실패 → 일반 column + sync.js 자동 채움)
- **003 후속 `naver_cancel_queue`**: needs_naver_cancel + 취소 사유 + retry 컬럼 + partial index
- **004 `customers_category`**: customers.category 컬럼 + index (자동 태깅 활용)

### 🔧 매장 PC sync.js 자동 시작

`MOVE-WEP-Naver-Sync-Bridge` Windows 작업 스케줄러 — At Logon 트리거. PC 부팅·로그온 시 자동 시작 (사용자 별도 실행 불필요).

### 📋 신규 파일

```
src/pages/SmartStoreOrders.jsx (대폭 개편)
src/pages/OrderHistory.jsx (네이버 카드 + 발송 모달)
src/pages/CustomerList.jsx (categoryFilter)
src/pages/ShippingLabel.jsx (sender 동적 default)
src/App.jsx (saveOrder customer_category 전달)

C:\Users\MOVEAM_PC\naver-sync-bridge\
  ├── sync.js (양방향 큐 + 자동 등록 + Codex hardening)
  └── migrations/
      ├── 002_*.sql (이미 적용)
      ├── 003_naver_cancel_queue.sql (적용 완료)
      └── 004_customers_category.sql (적용 완료)
```

### 🚦 다음 사이클 후보 (Task #108~112 등록)

1. `needs_naver_cancel` 큐 활용 — 취소 액션 버튼 + sync.js cancelPendingNaverOrders()
2. 일괄 발송 multi-select UI (네이버 "엑셀 일괄 발송처리" 동등)
3. Codex Major D — memo 채널 기반 별도 매출 집계 (옛 엠파츠 + 신규 분산 합산)
4. Playwright 풀 flow-check (Claude Code 재시작 후 활성)
5. Codex Minor B — isNaverOrder 공백 정규화

---

## 🆕 v2026-05-27 — 네이버 스마트스토어 실시간 연동 + API 사용량 게이지 + MOVIS 매칭 강화

오늘 누적 23 커밋. 핵심 기능 5가지 추가 + 다수 fix.

### 🛍 네이버 스마트스토어 주문 실시간 연동 (Phase 1+2)

**아키텍처:**
- **DB**: `external_orders` + `external_order_items` (provider, raw_payload JSONB, 매칭/발주확인/발송처리/배송비/착불선불 컬럼)
- **DB 추가**: `external_oauth_tokens` (토큰 캐시), `external_sync_cursors` (cursor), `external_sync_logs` (실행 로그)
- **Edge Functions** ([Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/jubzppndcclhnvgbvrxr/functions)):
  - `naver-webhook` — Phase 1 mock 수신 (x-webhook-token 인증)
  - `naver-order-action` — 발주확인 + 발송처리 (OAuth + 실제 네이버 API 호출)
  - `naver-sync-orders` — 변경 주문 polling (DEBUG MODE)
- **매장 PC sync bridge** (`C:\Users\MOVEAM_PC\naver-sync-bridge\`):
  - 네이버 IP 화이트리스트(`115.22.7.219`) 우회용 매장 PC polling
  - Node 스크립트 + Windows 작업 스케줄러 (1분 주기)
  - bcryptjs OAuth + DB 토큰 캐시 + 401 fallback
  - 변경 주문 polling + 상세 일괄 fetch (batch query API, 7일 skip)
  - 자동 매칭: 제품 fuzzyMatch + 고객 전화번호 정확일치 우선
- **Supabase Secrets** (사장님이 Dashboard에 직접 등록):
  - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_WEBHOOK_SECRET`
- **`.env`** (매장 PC만): 위 3개 + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` + `SYNC_INTERVAL_SECONDS=60`

**UI** ([src/pages/SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx)):
- Realtime 구독 (`supabaseClient.channel`) → 새 주문 즉시 토스트
- **SyncMonitorWidget** ([src/components/SyncMonitorWidget.jsx](src/components/SyncMonitorWidget.jsx)) — LIVE/STALE 배지, 마지막 sync, 24h 성공률, [지금 동기화] 버튼 (RPC `request_naver_sync_now()` 호출)
- 헤더 [네이버 관리자] 외부 링크 (https://sell.smartstore.naver.com/#/home/dashboard)
- 주문 카드: 🚚 착불 / 💰 선불 배지 + 배송비 표시
- 액션 버튼: [발주확인] / [내부주문 전환] / [발송처리 모달] / [📦 택배 송장]
- 택배 송장 연동: localStorage `shippingCustomEntries`에 prefill 후 ShippingLabel 페이지 자동 이동
- 매칭 시도 dropdown (수동 확정 필수)

**라우팅**: 사이드바 메뉴 `스마트스토어 주문` (Store 아이콘, AI 주문인식 다음), `case 'smartstore'` 라우팅 + `setCurrentPage` prop 전달.

### 📊 MOVIS API 사용량 실시간 게이지 (Gemini + Groq 듀얼)

- **트래커** ([src/lib/apiUsageTracker.js](src/lib/apiUsageTracker.js)): localStorage 기반 호출 기록, in-memory + 3초 flush 패턴, 모델별 가격표, 무료티어 한도 (override 가능)
- **위젯** ([src/components/analytics/ApiUsageGauge.jsx](src/components/analytics/ApiUsageGauge.jsx)): JARVIS 테마 게이지 + Portal (z-index 충돌 회피) + Popover (1초 갱신, 칩 토글)
- **계측 위치 5개**: `geminiAnalyst.postGemini` / `groqAnalyst.postGroq+askGroqChat` / `embedding.embedText` / `TextAnalyze.jsx` Gemini fetch / `AdminPage.jsx` 자연어 fetch — 모두 `usageMetadata` 또는 `data.usage` 기반 토큰 정확 측정
- **source 분류**: `movis` / `order-recog` / `admin-nl` / `embedding` — 4 카테고리 자동 분류, Popover에 BY SOURCE 섹션
- **마운트 위치**: MOVIS 페이지 + AI 주문인식 페이지 헤더 우측

### 🧠 MOVIS 주문 등록 강화 — 유사 후보 + 편집 모달

- **fuzzyMatch.js 신규** ([src/lib/fuzzyMatch.js](src/lib/fuzzyMatch.js)): matchCustomer + matchItem (Levenshtein + 초성 + 토큰 + 부분일치 점수 max). 정확 매칭만 status:'exact', 후보 0.6 임계
- **OrderConfirmEditable.jsx 신규**: saveOrder 전용 편집 모달
  - 거래처 후보 dropdown ("💡 혹시 이거?") + 검색 input + [신규 등록] 명시 버튼
  - 항목 inline 편집 (수량/단가) + [변경] dropdown (alternatives + 검색)
  - 추가 비용 (택배비 7,300원 / 퀵비 30,000원 / 수수료 + 커스텀) — `useQuickItems` preset 활용
  - 추가 지시사항 textarea
  - canConfirm 가드: 거래처 OK + 0원 없음 (surcharge 제외) + 항목 1개+
  - max-h calc(100vh - 80px) + 내부 스크롤
  - [수정] 버튼 항상 노출
- **geminiTools.js saveOrder**: matchCustomer 사용 (exact만 통과), customerCandidates + items.alternatives + zeroPrice 플래그 + needsConfirmation 첨부
- **MOVIS 시스템 프롬프트 강화**: 동의어 매핑 30+ (스텐→스덴, 직관레조→CH 등), 자판 오타(ㅡ→-), 수량 분리 vs 규격 보존, AI 학습 사례 15건 주입

### 🚀 PC 페이드인 + 구형 갤럭시 호환

- **AIAnalytics 자체 마운트 페이드인**: AppLayout wrapper의 페이드인이 PC에서 Suspense swap에 무력화되는 문제 → 자체 opacity transition 1100ms cubic-bezier 추가
- **`@vitejs/plugin-legacy`**: 구형 Samsung Internet 8+ / Android 7+ / iOS 11+ 호환 (SystemJS 폴리필 자동 주입). React.lazy 동적 import 흰 화면 fix

### 📦 매장 PC sync bridge 폴더 구조

```
C:\Users\MOVEAM_PC\naver-sync-bridge\
  ├── sync.js              # OAuth + polling + detail + 매칭 + upsert (1분 주기)
  ├── package.json         # bcryptjs + dotenv
  ├── .env                 # 4개 필수 환경변수 (Naver + Supabase)
  ├── .env.example         # 템플릿
  ├── .gitignore           # .env 보호
  ├── start.bat            # 더블클릭 실행
  ├── install-scheduler.ps1  # Windows 작업 스케줄러 자동 등록
  └── README.md            # 설치/실행 가이드
```

**작업 스케줄러**: `MOVE-WEP-Naver-Sync-Bridge` (At Logon 트리거).

**CLI 옵션**:
- `node sync.js` — 무한 루프 (60초 간격)
- `node sync.js --once` — 1회 실행
- `node sync.js --backfill 30` — 30일치 backfill (24시간 윈도우 분할 + rate limit sleep 1.2s)

### 🚦 외부 주문 매칭 점수 임계

| 점수 | 상태 | 처리 |
|------|------|------|
| 0.95+ | matched | 자동 확정 |
| 0.7~0.95 | manual | 후보 표시, 사용자 확인 필요 |
| <0.7 | missing / no-candidate | 사용자 수동 매칭 |

**Codex 경고 반영**: 토큰 매칭 너무 관대 fix — substring 매칭 4자 이상만, STOPWORDS 제외 (`타이어` `제품` `용` 등), F1 (양방향 hits / sum) 계산.

### 📋 환경변수 (전체)

**클라이언트 (.env.local 또는 vite-config) — 없음** (모든 API 키는 코드 내장 또는 Supabase Secrets).

**Supabase Edge Function Secrets** (Dashboard → Settings → Edge Functions → Secrets):
- `NAVER_CLIENT_ID` — 네이버 커머스 API Application ID
- `NAVER_CLIENT_SECRET` — 네이버 커머스 API Application Secret (`$2a$10$...` bcrypt 형식)
- `NAVER_WEBHOOK_SECRET` — 임의 secret 토큰 (매장 PC sync bridge ↔ Edge Function 인증)

**매장 PC `.env`** (`C:\Users\MOVEAM_PC\naver-sync-bridge\.env`):
- 위 3개 + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SYNC_INTERVAL_SECONDS=60`

### 🔑 Supabase RPC

- `request_naver_sync_now()` — `external_sync_cursors.last_changed_at`을 `now() - 1분`으로 갱신. anon/authenticated 호출 가능. SmartStoreOrders 페이지의 [지금 동기화] 버튼에서 사용

### 📦 DB 테이블 추가 (Supabase)

- `external_orders` — 외부 마켓플레이스 주문 마스터 (provider, provider_order_id UNIQUE, 매칭, 발주확인, 배송정책, raw_payload)
- `external_order_items` — 주문 라인 + 매칭 + 발송처리 (productOrderId UNIQUE, dispatch_status, tracking_number)
- `external_oauth_tokens` — provider별 OAuth 토큰 캐시 (RLS service_role only)
- `external_sync_cursors` — provider별 마지막 동기화 cursor (RLS SELECT anon 허용)
- `external_sync_logs` — sync 실행 로그 (RLS SELECT anon 허용, 운영 모니터링용)

### 💸 택배비 기본 금액 7,300원

- `useQuickItems.js` DEFAULT_PRESETS 변경 + 일회성 마이그레이션 (`pos_quick_items_migration_v2` 플래그) — 기존 사용자 5,000원 → 7,300원 자동 갱신
- MOVIS 주문 모달 [수정] 모드에서 택배비/퀵비/수수료 빠른 추가 + 커스텀 입력

### 🆕 신규 파일 목록

```
src/components/SyncMonitorWidget.jsx       # 스마트스토어 sync 모니터링 위젯
src/components/analytics/ApiUsageGauge.jsx # API 사용량 실시간 게이지
src/components/analytics/OrderConfirmEditable.jsx # MOVIS 주문 편집 모달
src/lib/apiUsageTracker.js                 # API 사용량 트래커 (Gemini + Groq + 임베딩)
src/lib/fuzzyMatch.js                      # 거래처/제품 공통 fuzzy 매칭
src/pages/SmartStoreOrders.jsx             # 스마트스토어 주문 페이지
```

**외부 폴더**: `C:\Users\MOVEAM_PC\naver-sync-bridge\` (Git 무관, 매장 PC 전용)

---

## 🆕 v2026-05-25 (2차) — Containing-block 함정 6건 핫픽스

CSS `transform`/`perspective`가 자식 `position: fixed`의 containing block을 viewport에서 부모로 바꾸는 spec 함정 + Tailwind transform 클래스가 animation 종료 transform에 덮어써지는 함정. Playwright 검증으로 모두 PASS (offset 0, sidebar 제외 main 영역 정확히 맞춤).

### 🐛 증상 → 원인 → 픽스
1. **모바일 MOVIS 빅뱅 인트로가 화면 아래로 밀림** — `AIAnalytics.jsx`의 `perspective: 1200px` 부모 div가 자식 BigBangIntro의 `fixed inset-0`을 가둠.
   - **최종 fix**: BigBangIntro 컴포넌트 자체를 `fixed inset-0` → `absolute inset-0`으로 변경 + AIAnalytics에서 `ai-analytics-root` (relative + perspective) 안에 다시 넣음. `absolute`는 nearest positioned ancestor 기준이라 ai-analytics-root 영역 안에 정확히 갇힘 = **데스크탑 사이드바 제외 main 영역, 모바일은 viewport 전체** ([src/pages/AIAnalytics.jsx](src/pages/AIAnalytics.jsx), [src/components/analytics/BigBangIntro.jsx](src/components/analytics/BigBangIntro.jsx))
   - 중간 시도 (Fragment로 perspective 부모 밖 hoist)는 viewport 전체 렌더라 데스크탑 사이드바를 가리는 부작용 발견 → 위 absolute 방식으로 정정
2. **MOVIS 페이지 재진입 시 검은 화면에서 안 끝남** — `BigBangIntro`의 모듈 레벨 `lastBigBangStartTime` 1000ms 가드가 페이지 재진입에 걸려서 `onComplete` 안 호출 → 부모 `introDone=false` 영원히 → 가드 100ms로 축소(StrictMode 더블 마운트는 <16ms이므로 충분) + 가드 트립 시 `completedRef=true` + `Promise.resolve().then(() => onComplete?.())` 마이크로태스크 보장 ([src/components/analytics/BigBangIntro.jsx](src/components/analytics/BigBangIntro.jsx))
3. **미확인 메모 토스트가 사이드바 빼고 main 중앙으로 밀림 (1차 원인)** — AppLayout의 `.animate-page-in` wrapper가 `transform: translateY(6px → 0)` + `fill-mode: both`로 transform이 영구 적용된 상태 → 자식 fixed 토스트가 main 영역 기준 → 키프레임을 opacity-only로 변경 ([src/index.css](src/index.css) `@keyframes page-fade-in`)
4. **MOVIS 메인화면 양자 sphere 회전이 너무 빠름** — `JarvisDotSphere` 4개 상태의 `spinSpeed`를 원본 대비 1/4로 추가 감속 (standby 0.0025 / listening 0.005 / analyzing 0.009 / responding 0.003) ([src/components/analytics/JarvisDotSphere.jsx](src/components/analytics/JarvisDotSphere.jsx))
5. **미확인 메모 토스트가 +124px 오프셋으로 밀림 (2차 원인, Playwright 검증 중 발견)** — 토스트 inline `animation: 'modal-slide-up 0.35s ... both'` 키프레임의 `to { transform: translateY(0) scale(1) }`(identity matrix)가 `animation-fill-mode: both`로 영구 적용 → Tailwind `-translate-x-1/2`를 **덮어씀** → 토스트가 left:50%에서 자기 width 절반만큼 왼쪽 이동 안 함. **토스트는 위치 보존이 필수**라 Tailwind 클래스 의존 없애고 inline `transform: translateX(-50%)` + `animation: page-fade-in`(opacity-only)로 변경 ([src/pages/OrderHistory.jsx](src/pages/OrderHistory.jsx))
6. **PC 빅뱅이 viewport 전체 렌더로 좌측 사이드바를 가림 (사용자 의도 명확화 후 발견)** — 1번 항목 중간 fix(Fragment hoist)의 부작용. 위 1번의 최종 `absolute` 방식으로 자동 해결

### 🎓 규칙 추가 (containing-block 함정)
- **자식 `position: fixed`가 viewport 기준이 되어야 하는 곳에는 부모 체인에 `transform` / `translate` / `perspective` / `filter` / `will-change: transform` 금지**. 페이지 전환/모달 진입 애니메이션은 opacity-only로 작성 (또는 fixed 자식을 `createPortal(document.body)`로 빼내기). 새로운 transform-bearing wrapper 추가 시 fixed 자식이 안에 있는지 반드시 확인.
- **반대로 자식을 특정 컨테이너(예: 사이드바 제외 main 영역) 안에 가둬야 할 때는 `fixed` 대신 `absolute` + 컨테이너에 `relative` 부여** — `absolute`는 nearest positioned ancestor 기준이라 자동으로 영역 제한됨. `perspective` 같은 transform-bearing 부모도 `absolute`의 containing block을 정상적으로 잡음.
- **Tailwind `-translate-x-1/2 left-1/2` 패턴 + inline `animation: ... both`** 조합 주의: animation 키프레임이 transform property를 정의하면 종료 transform이 Tailwind transform을 덮어쓴다. 위치 보존이 필수면 inline transform + opacity-only 키프레임 사용. 동일 패턴 사용 중인 미수정 파일: [JarvisHologramHUD.jsx:168](src/components/analytics/JarvisHologramHUD.jsx#L168), [InvoiceModal.jsx:200](src/components/InvoiceModal.jsx#L200), [InvoicesPage.jsx:772](src/pages/InvoicesPage.jsx#L772) — modal-slide-up animation 사용 여부 확인 필요.

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

> **v2026-05-27 추가**: `@vitejs/plugin-legacy` 도입 → 빌드 시 `*-legacy-*.js` chunk 자동 생성 (구형 Samsung Internet 8+ / Android 7+ 호환). 빌드 시간 ~1분으로 증가했지만 호환성 ↑

### 매장 PC sync bridge (별도 폴더, GitHub 미포함)

```bash
cd C:\Users\MOVEAM_PC\naver-sync-bridge
npm install                  # 최초 1회
node sync.js --once          # 1회 테스트
node sync.js                 # 무한 루프 (60초 간격)
node sync.js --backfill 30   # 30일 backfill
start.bat                    # 더블클릭 실행
powershell -ExecutionPolicy Bypass -File install-scheduler.ps1  # 작업 스케줄러 자동 등록
```

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
- **부가 항목 (QuickItemBar)**: 택배비/퀵비/수수료 등은 `items` 배열에 `{ name, price, quantity:1, isCustom:true, presetId? }`로 저장. 프리셋은 localStorage `pos_quick_items_v1`에 보관. 빌트인 3개는 `builtin:true`로 보호되어 삭제 불가. **v2026-05-27 변경**: 택배비 기본 5,000 → 7,300원 + 일회성 마이그레이션 (`pos_quick_items_migration_v2` 플래그)
- **MOVIS 주문 등록 (v2026-05-27)**: `saveOrder` 전용 모달 `OrderConfirmEditable`. 거래처/제품 fuzzy 매칭 후보 dropdown + 명시 등록 클릭 (자동 신규 등록 금지) + 인자 직접 편집 + 추가 비용 (택배비 등 surcharge isSurcharge:true 플래그) + 추가 지시사항 textarea. `id: surcharge-{timestamp}` 접두사라 `deductStock` 자동 skip
- **MOVIS API 호출 계측 (v2026-05-27)**: 모든 Gemini/Groq fetch에 `recordApiCall({ source: 'movis'|'order-recog'|'admin-nl'|'embedding' })` 호출 필수. usageMetadata/data.usage 기반 토큰 정확 측정. `setContextTokens(promptTokens)` — 다음 호출 컨텍스트 추정용
- **네이버 스마트스토어 연동 (v2026-05-27)**: 매장 PC `naver-sync-bridge`가 1분마다 polling. **IP 화이트리스트(115.22.7.219)는 사장님 매장 KT IP**. 모뎀 재부팅 시 IP 바뀌면 재등록 필요. cursor를 7일 전으로 강제 갱신하면 옛 주문 다시 fetch (의도된 동작)
- **외부 주문 매칭 임계 (v2026-05-27)**: 0.95+ matched / 0.7~0.95 manual (사용자 확인 필수, top1 자동 선택 금지) / <0.7 missing. 토큰 매칭은 STOPWORDS (`타이어` `제품` `용` 등) 제외 + F1 양방향 계산

## Supabase

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 테이블: orders, products, customers, customer_returns, saved_carts, ai_learning, **payment_records**, **payment_history**, **manual_paid_orders**, **external_orders**, **external_order_items**, **external_oauth_tokens**, **external_sync_cursors**, **external_sync_logs**
- 관리자 비밀번호: `4321`
- **orders 주의**: `updated_at`, `status` 컬럼 없음. PATCH 시 미존재 컬럼 포함하면 PGRST204로 전체 실패
- **customer_returns 주의**: PK는 `id`(bigint auto), 삭제 시 `return_id`(text) 사용
- **payment_records 주의** (v2026-04-30): `balance`, `payment_status`는 **generated columns** (DB 자동 계산). UPDATE 페이로드에 포함하면 `400 code:428C9 "can only be updated to DEFAULT"`. `paid_amount`만 갱신
- **payment_history**: `payment_record_id`(FK), `amount`, `method`, `paid_at`, `memo`. 자동 생성된 row는 `memo` prefix `[자동] 완불체크 (수단)`로 식별
- **manual_paid_orders**: 수동 완불 체크의 시각 마커 (UPSERT key: `order_id`). useManualPaid 훅이 멀티 디바이스 Realtime 동기화
- **external_orders 주의** (v2026-05-27): `provider` + `provider_order_id` UNIQUE. REPLICA IDENTITY FULL (Realtime UPDATE 알림). `delivery_policy_type` (착불/선불), `delivery_fee_amount`, `detail_fetched_at` (7일 skip 키)
- **external_order_items 주의**: `provider_product_order_id` UNIQUE. `match_status` (pending/matched/manual/no-candidate), `dispatch_status` (pending/sending/success/failed), `tracking_number`. `provider_product_name` NOT NULL — detail 없으면 placeholder
- **external_oauth_tokens 주의**: provider별 1개 row (PK = provider). RLS 차단 (service_role only). 만료 5분 전 자동 갱신
- **external_sync_cursors 주의**: provider별 마지막 sync 시점. SELECT는 anon 허용 (위젯 read용), UPDATE는 service_role + RPC `request_naver_sync_now()`만
- **external_sync_logs 주의**: 5분 cron + 매장 PC 1분 polling 모두 기록. SELECT anon 허용 (SyncMonitorWidget 24h 성공률 계산)
- **Edge Functions**: `naver-webhook` (Phase 1 mock 수신), `naver-order-action` (발주확인+발송처리, OAuth+401 fallback), `naver-sync-orders` (polling DEBUG MODE)
- **RPC**: `request_naver_sync_now()` — cursor 1분 전으로 갱신 (수동 동기화 트리거)

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
- `pos_quick_items_migration_v2` — v2026-05-27 택배비 5,000 → 7,300 일회성 마이그레이션 플래그
- `movis_api_usage_v1` — API 사용량 트래커 (Gemini + Groq + 임베딩 호출 기록, 1일 보관, in-memory + 3초 flush)
- `movis_api_limits_override` — 무료티어 한도 override (`{ gemini: {rpd, rpm}, groq: {rpd, rpm} }` JSON, 옵셔널)
- `movis_ctx_tokens` — 현재 대화 prompt token 추정치 (sessionStorage)
- `shippingCustomEntries` — 택배 송장 사용자 정의 항목 (스마트스토어 주문에서 prefill 추가됨)

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
