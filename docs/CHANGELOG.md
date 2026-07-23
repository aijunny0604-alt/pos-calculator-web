# 변경 이력 (Changelog)
> 날짜별 구현/수정 사항 기록
> 관련: [프로젝트 구조](ARCHITECTURE.md) | [DB 스키마](DATABASE.md) | [보안 설정](SECURITY-SETUP.md)

---

### 2026-07-22 작업 내역

> 실사용 중 발견한 8건. 커밋: `9b40223` `55a78f3` `a54e125` `ecdb3a0` `328394c` `4728104` `f8893b7` `3a781b9`
> 상세 배경은 [CLAUDE.md v2026-07-22](../CLAUDE.md) 참조

#### 🔍 매입 발주 검색 통일 — `9b40223`
- `PurchaseOrders.jsx` 검색을 `matchesSearchQuery`(제품주문과 동일)로 교체
- 띄어쓰기·하이픈·언더바 무시 / 순서 일치 / 다단어 AND
- 발주번호·매입처·제목·품목 4곳 적용

#### 🏷 발주 상태 필터 — `55a78f3`
- 칩: 전체 / 미입고 / 부분 입고 / 완료 / **특이사항** (건수 표시)
- `purchaseExport.js`에 `poSpecialItems` / `poSpecialLabel` 추가
- 특이사항 = `status_override` 또는 수량 음수. **취소건만 남은 발주가 '완료'로만 보이던 문제** 해결(실데이터 20건 중 5건)
- 카드에 사유 배지. 칩은 발주 목록 탭 전용, 미입고 현황은 검색만 반영

#### 🔔 스토어 메뉴 배지 백그라운드 갱신 — `a54e125`
- 원인: 60초 `setInterval` 단일 의존 → 크롬 Tab Freezing으로 정지
- `refreshSmartstoreCount` 분리 → 마운트/폴링/**탭 복귀** 3경로 (복귀는 쓰로틀 밖)
- `SmartStoreOrders`에 `onPendingCountChange` — 페이지 목록으로 배지 즉시 반영(추가 요청 0)
- `catch {}` → `console.warn`

#### 💳 입금대기 분리 + 전환건 단계 — `ecdb3a0`
- `orderStage`에서 입금 여부를 **독립 축(`unpaid`)** 으로 분리. 입금대기+진행없음 = `stage -2`
- 발주확인 판정에 `internal_order_id` 추가 (2026-06-15 전환 정책 변경 미반영 드리프트)
- 입금대기 배지 앰버 승격 + 퍼널 위 `입금대기 N건` 바(`statusFilter: 'unpaid'`) + 카드 경고 띠

#### 📦 방문수령 → 택배 발송 — `328394c`
- 발송/방문수령 버튼 **스왑 → 병기** (리스트/컴팩트/카드 3곳)
- 발송 모달에 방문수령 안내 배너
- 발송 로직·sync.js 변경 없음

#### 🏢 거래처 동기화 동의 모달 — `4728104`
- `handleUpdateOrder(id, data, opts)` — `opts.syncCustomer` true/false/생략(=기존 자동)
- OrderDetail 저장 확인 모달에 체크박스 + 거래처 현재값→새값, 기본 ON
- 거래처 미존재 시 그 사실을 모달에 명시 / 값 동일하면 미표시 / 성공·실패 토스트

#### 🎨 모달 5종 리디자인 — `f8893b7` `3a781b9`
- 톤 기준 `CustomerDetailModal`: 액센트바 → 아이콘 타일 헤더 → 스크롤 본문 → 고정 푸터
- 발송(그린) / 방문수령(앰버) / 일괄발송(그린) / 주문취소(레드) / 주문수정 확인(앰버)
- 발송: 송장 입력 확대·autoFocus·Enter 등록, 택배사 퀵칩 / 일괄발송: 헤더 진행 카운트, 입력 행 그린 띠
- 주문수정 확인: 변경 항목 좌측 색 띠 + 태그 행
- 🐛 `openDispatch` 택배사 하드코딩 `CJGLS` → `DEFAULT_COURIER_CODE`(로젠)

#### 🖼️ 주문 상세 상품 대문 이미지 — `fdb050a` `5ef9e32` (2026-07-23)
- `external_products.representative_image`(733건 캐시) 재활용. 크롤링·API 없음
- 주문 `productId` = 카탈로그 `channel_product_no` 매칭, 네이버 CDN을 `referrerPolicy=no-referrer` 핫링크
- `supabase.getProductImages(ids)` + `ProductThumb` 컴포넌트(없으면 📦, 클릭 확대)
- 상세 모달 상품 항목 좌(정보)/우(120px 이미지) 2단, 모바일 maxWidth 34vw
- `9f59ff2`: 이미지가 금액·매칭배지를 가려 **`[정보][이미지 110][금액]` 3단**으로 재배치.
  카드·컴팩트·상세 통일. 이미지가 금액 왼쪽 여백에, 겹침 없음(좌표 검증)

#### 📎 발주서 드래그드롭·Ctrl+V + 발주일 조회 + 필터 정리 — `12bb947` `4f250b7` (2026-07-23)
- 발주서 등록: 클릭 업로드 외 **이미지 드래그드롭 / Ctrl+V 붙여넣기**.
  `onPickQuote` → `scanQuoteFile(file)` 공통 함수로 분리(3진입점 공유),
  페이지 드롭존 오버레이 + window paste 리스너(판독중·모달 시 무시)
- 버튼에 점선 테두리 + "클릭·드래그·Ctrl+V" 명시(기능은 있었으나 툴팁만이라 안 보였음)
- 발주일 조회: 프리셋(전체/이번달/지난달/올해) + date 범위. `order_date` 문자열 사전식 비교
- 필터 3층 → 2층: 상태칩(좌) + 발주일(우 ml-auto) 한 줄 통합

---

### 2026-05-21 작업 내역

#### 🆕 AI 분석 어시스턴트 — 자연어로 거래/제품/VIP 분석 (Phase 1+2+3)

자동차 튜닝 부품 POS에 자연어 질문 → AI 답변 시스템 도입. Gemini Function Calling 기반.

**1. 분석 도구 9종 (Phase 1)** — `src/lib/analytics/`
- `aggregations.js` — KST 기간 필터 / 합산 / 그룹핑 / 월별·일별 추이 / 변화율 / RFM Recency 계산
- `rfm.js` — Recency/Frequency/Monetary 점수 + 5세그먼트 분류 (Champion / Loyal / At-Risk / New / Lost / Regular)
- `customers.js` — `getTopCustomers` / `getCustomerTrend` / `getCustomerSegments` / `getDormantCustomers` (이전 기간 변화율 비교 포함)
- `products.js` — `getTopProducts` (제품/카테고리 모드) / `getProductTrend` / `getRepeatPurchaseGap`
- `affinity.js` — `getCustomerProductAffinity` (거래처별 자주 사는 제품/카테고리)
- `summary.js` — `getCompositeSummary` (매출/AOV/활성 거래처/신규 거래처/반품률/부가항목 사용률 묶음)
- RFM 임계값은 localStorage `pos_ai_rfm_thresholds_v1`로 조정 가능. 기본값은 자동차 튜닝 재구매 주기 고려 보수 세팅 (Recency 14/30/60/90일, Frequency 1/2/4/7건, Monetary 10만/50만/150만/400만원)

**2. Gemini Function Calling 루프 (Phase 2)** — `src/lib/`
- `geminiTools.js` — 9개 도구 JSON 스키마 + `executeTool` 라우터 + `ANALYST_SYSTEM_PROMPT` (도메인 컨텍스트, "도구 결과만 인용, 추측 금지" 강제)
- `geminiAnalyst.js` — `askAnalyst(question, context, options)` 루프 (최대 5회 반복, 4프로젝트 키 폴백, 503 재시도, 5분 TTL 캐시, FIFO 100건 한도, 중복 호출 차단, `Promise.all` 병렬 실행, AbortController 취소). Claude × Codex(GPT-5) 협업으로 구현
- 기존 TextAnalyze.jsx의 Gemini 폴백 패턴 그대로 보존

**3. 채팅 UI (Phase 3)**
- `pages/AIAnalytics.jsx` — 메인 페이지 (헤더 + 데이터 부족 경고 + 캐시 초기화 + ChatPanel)
- `components/analytics/ChatPanel.jsx` — sticky bottom 입력창, 자동 스크롤, 로딩 버블, 취소 버튼, 1000자 카운터
- `components/analytics/MessageBubble.jsx` — 4종 버블 (user/assistant/error/system), 마크다운 lite 파서 (`**bold**` / `## h` / `- list`), 도구 호출 이력 접기, 캐시 배지
- `components/analytics/SuggestedQuestions.jsx` — 칩 그리드 (1/2/3열 반응형), 사용 빈도 표시
- `hooks/useAIAnalystChat.js` — 히스토리 50건 FIFO 영속화 + 사용 빈도 기록 + AbortController + 도구명 한국어 매핑
- 사이드바: `Sparkles` 아이콘 + `AI 분석` 메뉴 추가 (관리자 위)
- App.jsx: `AIAnalytics` lazy import + Suspense fallback (`AIAnalytics-*.js` chunk 41.50KB / gzip 14.62KB 분리)
- MobileNav는 6개 가득 차서 햄버거 메뉴 통해 접근 (모바일 키보드 UX 고려)

**4. 추천 질문 6개 (사용 빈도 기반 자동 정렬)**
- 이번 달 매출 TOP 5 / VIP 세그먼트 분석 / 인기 제품 TOP 10 / 재주문 유도 추천 액션 / 휴면 거래처 / 이번 달 전체 요약

**5. localStorage 키 신규 (5개)**
- `pos_ai_analytics_history_v1` — 채팅 히스토리 (FIFO 50건)
- `pos_ai_cache_v1` — 도구 호출 결과 캐시 (5분 TTL, FIFO 100건)
- `pos_ai_quick_prompts_usage_v1` — 추천 질문 사용 빈도 (정렬용)
- `pos_ai_rfm_thresholds_v1` — RFM 점수 임계값 (사용자 조정 가능)
- `pos_ai_insights_v1` — 인사이트 저장 (Phase 5 예정, 키만 예약)

**6. 격리 전략 (사이드 이펙트 0)**
- DB 변경 없음 — 신규 테이블/컬럼/RPC 0건
- 기존 페이지 무영향 — 신규 페이지/컴포넌트만 추가, 라우팅 1줄 + 사이드바 1줄만 수정
- Gemini API 키 공유 — 신규 키 미발급, 기존 4프로젝트 풀 사용 (5분 캐시로 호출 절감)
- 환각 방지 — 시스템 프롬프트에 "도구 결과만 인용, 거래처/제품명 새로 만들지 말 것" 강제

**문서**
- 신규: `docs/01-plan/features/ai-analytics.plan.md` (5/20 작성), `ai-analytics.todo.md` (Phase 1~6 체크리스트 82개)
- 본 CHANGELOG, ARCHITECTURE, CLAUDE.md 동기화

**잔여 작업 (Phase 4~6 예정)**
- Phase 4: recharts 기반 결과 자동 시각화 (TOP N 막대 / 월별 라인 / RFM 4분면 파이 / KPI 그리드) — `ResultRenderer` 도입
- Phase 5: 인사이트 영구 저장 (`InsightsCarousel`) + 추천 질문 빈도 정렬 UI 노출
- Phase 6: 10개 시나리오 실데이터 검증 + 모바일 360px UX 검증 + 최종 배포 후 Sentry 1시간 모니터링

**검증**
- `npx vite build` 9.80s 통과 (1976 modules, 에러 0)
- 빌드 산출물: `AIAnalytics-DVC359lk.js` 41.50KB (gzip 14.62KB), `index.js` +0.62KB만 증가

---

### 2026-05-15 작업 내역

#### 가격 0원 카트 차단 정책 철회 (운영 버그 핫픽스)

**1. MainPOS.addToCart 가드 완화 (Critical UX fix)**
- 문제: 4/23 도입한 `wholesale<=0 && retail<=0` 카트 담기 거부 가드가 자바라 무료 라인/덤/사은품처럼 의도된 0원 제품까지 막아 운영에서 "주문 안 됨" 신고 발생
- 수정 (`src/pages/MainPOS.jsx:157-161`): `return` 제거 + 토스트 type `'error'` → `'warning'`로 톤다운. 담기는 허용하되 사용자에게 알림만 제공
- 2차 안전망 유지: `App.saveOrder`의 `confirm` 게이트(`App.jsx:428-434`)는 그대로 — 사용자가 의도성 확인 후 진행 가능
- CLAUDE.md "가격 0원 방어" 규칙 + ARCHITECTURE.md MainPOS 설명 동기화

---

### 2026-05-10 작업 내역

#### 모바일 모달 안정화 + 번들 최적화 (5 파일, +111/-27)

**1. SavedCarts 상세 모달 편집 모드 하단 잘림 fix (시작점 버그)**
- 문제: 편집 진입 시 Header(80) + 상품 스크롤 + Status(~250) + Total/버튼(~200) 모두 `flex-shrink-0`이라 모바일 maxHeight 85vh 초과 시 저장/취소 버튼 잘림
- 수정: Status 편집 섹션을 스크롤 본문 안으로 편입(`-mx-4 sm:-mx-6 px-4 sm:px-6` 풀너비 breakout). Total/버튼 footer는 sticky 유지

**2. window.confirm → ConfirmDialog 교체 (모바일 UX)**
- iOS Safari에서 native `confirm`이 스레드 차단 + 깨진 것처럼 보이는 문제 해결
- 적용: `PaymentEditModal.jsx` (입금 기록 삭제), `OrderDetail.jsx` (반품 취소)

**3. ConfirmDialog stacking 안전 패턴 도입 (Critical fix)**
- PaymentEditModal: Fragment + `<div className="fixed inset-0 z-[110]">` wrapper로 부모 stacking context 밖으로 분리
- OrderDetail: `<div className="fixed inset-0 z-[65]">` wrapper로 QuickCalculator(z-[60]) 위 보장
- SavedCarts: 휴지통 클릭 시 detail 모달 먼저 닫고 다이얼로그 오픈 (clean stack)

**4. exceljs 940KB 프리로드 제거 (성능)**
- 문제: `CustomerDetailModal.jsx` top-level `import exportExcel`이 entry chain에 묶여 modulepreload로 940KB가 모바일 부팅에 함께 다운로드
- 수정: `handleExport` 안에서 `await import('@/lib/exportExcel')` dynamic 호출로 변경
- 결과: `exportExcel-*.js` 13.50KB 별도 chunk 분리, exceljs는 Excel 버튼 클릭 시점까지 로드 안됨
- 빌드: `index.js` 729.68KB → 717.53KB (-12KB), TTI 추정 6-8s → 4-5s on slow 4G

**5. modal-scroll-area 패턴 추가 (iOS 러버밴드)**
- `PaymentRegisterModal.jsx`, `PaymentEditModal.jsx`, `CustomerDetailModal.jsx` (OrderDetailPopup)
- `overscroll-contain` + `modal-scroll-area` 마커 + `touchAction: 'pan-y'` + `onTouchMove stopPropagation`

**6. SavedCarts 무확인 삭제 → ConfirmDialog 게이팅**
- 휴지통 + 견적서 복사 아이콘 사이 `ml-1` 간격 추가, 두 버튼에 `aria-label` 부여

---

### 2026-04-30 작업 내역

#### 할인 시스템 + 완불체크 DB 동기화 + QuickItemBar + 모바일 정리

**1. 라인별 할인 시스템 (3가지 모드)**
- 신규 유틸: `src/lib/discount.js` — `calcFinalPrice(base, type, value)`, `convertDiscountValue`, `discountLabel`, `discountPlaceholder`
- 모드: `percent`(할인율) / `amount`(차감 금액) / `fixed`(지정 단가)
- 데이터 모델 (items JSON 신규 필드, DB 스키마 무변경):
  - `originalPrice` — 정가 (할인 전)
  - `discountType` — `'percent' | 'amount' | 'fixed'`
  - `discountValue` — 사용자 입력값 보존
  - `price/wholesale/retail` — 할인 후 최종가로 동기화 (명세서/주문 변환 호환)
- 토글 동작: 모드 전환 시 같은 결과 유지하며 value 자동 변환 (예: 1% = 2,191원)
- 단가 input 안전장치: 할인 적용 중 `readOnly` (실수로 메타 날아가는 것 방지). 변경하려면 [해제] 후 가능
- 적용 화면: SavedCarts 카트 상세, OrderDetail 모바일/데스크탑, OrderHistory 카드 (`🏷 할인 N건 (-X원)` 인디케이터), CustomerList 주문 카드, CustomerDetailModal OrderDetailPopup, InvoicesPage 명세서 (정가 strikethrough + 할인 배지)

**2. 완불체크 → DB 자동 동기화 (Critical fix)**
- 이전: `[완불 체크]` 버튼이 `localStorage`(useManualPaid)에만 저장 → 거래처 관리/명세서/미수 통계 미반영 ("결제 레코드 미생성" 표시)
- 신규 함수 (`src/lib/supabase.js`):
  - `syncOrderPaidRecord(orderId, methodKey, orderHint, customersHint)` — `payment_records` 자동 생성 + `payment_history` 전액 입금 row 추가 (memo: `[자동] 완불체크 (수단)`)
  - `revokeAutoPaidHistory(orderId)` — 자동 history만 회수 + 빈 record 자동 삭제 ("결제 레코드 미생성"으로 정확히 복원)
- 호출 체인: `OrderHistory → setPaid(id, method, order, customers) → useManualPaid → supabase.syncOrderPaidRecord` (Promise 반환, customersHint로 N+1 회피)
- C1 fail-safe: 거래처 매핑 실패 시 `{success:false, reason:'no_customer'}` 반환 → 호출부에서 alert로 명시적 알림

**3. payment_records DB 제약 (필독)**
- `balance` = **generated column** (`total_amount - paid_amount`). INSERT/UPDATE 페이로드에서 **반드시 제외**. 포함하면 `400 code:428C9 "balance can only be updated to DEFAULT"` 발생
- `payment_status` = **generated column** (paid_amount/total_amount 비교). 동일하게 페이로드 제외 필수
- 갱신 가능 컬럼: `paid_amount`만 변경. 두 generated columns는 DB가 자동 계산

**4. QuickItemBar — 부가 항목(택배비/퀵비/수수료) 즉석 추가**
- 신규: `src/components/ui/QuickItemBar.jsx` + 훅 `src/hooks/useQuickItems.js`
- 기본 프리셋: 택배비 5,000 / 퀵비 30,000 / 수수료 0 (`builtin: true`로 보호)
- 사용자 프리셋: 추가/삭제/이름·금액 인라인 편집
- localStorage 키: `pos_quick_items_v1`
- 라인 추가 시 마커: `isCustom: true`, `presetId: 'shipping' | 'quick' | ...`
- ID 충돌 방지: `${preset.id}_${Date.now()}_${random5}` (빠른 클릭 race 방지)
- UX: 커스텀 펼침 ↔ 프리셋 관리 펼침 mutex, 커스텀 닫을 때 input 자동 reset
- 적용 위치: SavedCarts 카트 상세 편집 모드, OrderDetail 편집 모드 (모바일/데스크탑)

**5. CustomerDetailModal OrderDetailPopup 재설계**
- 이전: max-w-lg 작은 모달, 품목 10개 잘림, 할인 표시 없음
- 현재: `max-w-3xl` + `max-h-[90vh]` flex column, 합계 배너 (총금액/공급가액/부가세 3박스), 품목 전체 노출 + 정가 strikethrough + `🏷 할인` 배지
- 헤더 success 그린, 푸터에 [닫기]

**6. OrderHistory 통계 카드 폰트↑ + 카운트업**
- 신규 훅 `src/hooks/useCountUp.js` — cubic ease-out 700ms, 직전값 → 새 값 보간
- 통계 카드 6개 (조회/매출/공급가액/부가세/반품/메모) 폰트 `text-base/lg` → `text-2xl sm:text-3xl font-black` (16 → 30px)
- gradient bg + 색상별 glow `textShadow` + `tabular-nums` + `hover:-translate-y-0.5`

**7. SavedCarts 카트 상세 모바일 정리 + 인라인 편집**
- 편집 모드 카드 세로 적층: 1행 제품명 input → 2행 단가 input + 합계 → 2.5행 할인 토글/펼침 → 3행 수량 컨트롤 + 삭제
- 헤더 `px-4 py-4` → `px-3 sm:px-6 py-3 sm:py-4` 모바일 패딩 축소
- 주문 상태 5개 → `grid-cols-5` 균등, 우선순위 4개 → `grid-cols-4`, 배송예정일 ↔ 우선순위 모바일 1열/sm 2열

**8. 코드 정리**
- 공용 추출: `src/lib/discount.js`, `src/hooks/useCountUp.js`, `src/hooks/useQuickItems.js`, `src/components/ui/QuickItemBar.jsx`
- 잔여 후순위 (P3): DiscountControlRow 컴포넌트 추출 (모바일/데스크탑 ~120줄 중복), CustomerDetailModal `fmt` 함수 중복 제거, useQuickItems 멀티디바이스 동기화

**변경 파일**
| 파일 | 변경 |
|------|------|
| `src/lib/discount.js` | **신규** — 3-mode 할인 유틸 |
| `src/lib/supabase.js` | `syncOrderPaidRecord`, `revokeAutoPaidHistory` 신규 |
| `src/hooks/useCountUp.js` | **신규** |
| `src/hooks/useQuickItems.js` | **신규** |
| `src/hooks/useManualPaid.js` | DB 동기화 로직 추가 (Promise 반환, customersHint) |
| `src/components/ui/QuickItemBar.jsx` | **신규** |
| `src/components/CustomerDetailModal.jsx` | OrderDetailPopup 재설계 (max-w-3xl) |
| `src/pages/OrderDetail.jsx` | 할인 적용 + QuickItemBar 임베드 |
| `src/pages/OrderHistory.jsx` | 통계 카드 폰트↑ + 카운트업 + 할인 인디케이터 |
| `src/pages/SavedCarts.jsx` | 모바일 카드 적층 + QuickItemBar |
| `src/pages/CustomerList.jsx` | 주문 카드 라인 할인 표시 |
| `src/pages/InvoicesPage.jsx` | 명세서 정가 strikethrough + 할인 배지 |

---

### 2026-04-28 작업 내역

#### 명세서 0원 Critical fix + 부가세 표시 통일 + UI 일관성 강화

**0. 명세서 0원 버그 (Critical)**
- 원인 확정: `App.jsx onOrder` 핸들러가 저장 카트의 `cartData.items`를 `price` 보강 없이 saveOrder에 전달 → DB 저장 시 `items[].price` 필드 누락 → 명세서가 `item.price` 직접 읽어 0원
- 코드 fix (`App.jsx:1023-1046`): `items.map`으로 폴백 체인(`price → wholesale → retail → 0`) + `Number()` 강제 + `> 0` 가드. saveOrder 이중 검증
- DB 일괄 보정 (Supabase MCP): 동일 패턴 손상 10건(진주 소울 스포츠, 명성 모터스, 이니셜D, WP튠 김해, 구미 스틸하트, 경주 TDC 게러지, 제로원 오토모티브, 팀논스톱, 아톰) 일괄 UPDATE — items에 wholesale 가격으로 price 필드 보강. 잔여 3건은 자바라 마스터 가격 0원이라 의도된 묶음/덤으로 판단, 미보정

**1. `<SubPrice />` 헬퍼 컴포넌트 신규** (`src/components/ui/SubPrice.jsx`)
- API: `<SubPrice total={X} layout="inline|stacked|supply-only" size="sm|xs" showWon={true} />`
- 4개 화면 일괄 적용: OrderHistory(stacked, sm), CustomerList(stacked, xs), SavedCarts(stacked, sm), SaveCartModal(inline, sm)
- 효과: `calcExVat()` 1회 계산 + ex/vat 재사용 (성능), 라벨 "공급가/부가세" 통일, 폰트 토큰 sm=11px/xs=10px 표준화, NaN-safe 내장 (`Number.isFinite() && t > 0`)

**2. AI 주문 인식 → OrderPage 자동 오픈**
- `App.jsx`: `handleAddToCart`에서 `setShowSaveCartModal(true)` 제거, `setAutoOpenOrderConfirm(true)` 신호로 변경
- `MainPOS.jsx`: 새 props `autoOpenOrderConfirm` + `onOrderConfirmAutoOpened`. useEffect로 신호 수신 후 `setShowOrderConfirm(true)` + 즉시 reset
- TextAnalyze 버튼 라벨: "장바구니 담기" → "주문하기" (`TextAnalyze.jsx:1356`)

**3. OrderPage 거래처 검색 + SaveCartModal 검색 추가**
- OrderPage 부모 onClick 외부 클릭 닫기 안전화: `data-customer-search-area` 마커 + `closest()` 매칭 시 close 스킵. input/dropdown 컨테이너에 `onClick` + `onMouseDown` stopPropagation 이중 안전망
- SaveCartModal에 부분 매칭 거래처 검색 드롭다운 신규 추가 (이전엔 완전 일치 시에만 자동 채움)

**4. 명세서 색상 + 안내 문구 인라인 편집** (`InvoicesPage.jsx`)
- 업체명 색상: `text-red-700` → **`text-gray-900`**, border `#dc2626` → `#1f2937` (compact 모드 + InfoCard accent)
- 안내 문구 인라인 편집:
  - localStorage 키: `pos_invoice_footer_default_v1` (사용자 기본), `pos_invoice_footer_overrides_v1` (`{ [customerId]: text }` 개별)
  - 표시 우선순위: 개별 > 사용자 기본 > `settings.invoice_footer`
  - UI: 안내 영역 ✏️ 수정 버튼 → textarea + 라디오 (이 업체만/전체 기본) + 저장/취소/개별해제
  - 개별 설정 시각 표시: `⚙️ 개별` 작은 배지

**5. 택배 송장 — 저장 카트 합치기** (`ShippingLabel.jsx` + `App.jsx`)
- App.jsx ShippingLabel render에 `savedCarts={savedCarts}` 추가
- ShippingLabel: `todayCartsAsOrders` useMemo로 `delivery_date === todayKST` 카트만 필터, 주문 형식 변환(`CART-XXXXXX` 주문번호, `__fromSavedCart: true` 플래그)
- 시각 구분: amber 배경 + 좌측 3px 액센트 바 + `📦 출고예약` 노란 알약 배지

**6. SavedCarts 상세 모달 OrderDetail 패턴 통일** (`SavedCarts.jsx`)
- `useModalFullscreen` → `useDraggableResizable('pos-web.savedCartDetailModal', { w: 1200, h: 820 })` 교체 (드래그/리사이즈/더블클릭 전체화면)
- 사이즈 통일: `min(72rem, ...)`, `calc(100vh - 2rem)`
- 합계 영역 접기/펼치기 (`isBottomExpanded` state + ChevronDown/Up)
- 하단 버튼 반응형 (`flex-wrap gap-1.5 sm:gap-2`, `min-w-[7rem]`)
- 카드 합계 ↑ (`text-sm` → `text-xl sm:text-2xl`, 👤 아이콘 추가, break-keep)

**7. useDraggableResizable fullscreen 애니메이션 복구** (`useDraggableResizable.jsx`)
- 원인: 데스크탑 inline `width/height/left/top`으로 사이즈 제어, CSS `.modal-fs-transition`은 `max-width/max-height`에만 transition → 토글 즉시 점프
- fix: `transitioning` state + `triggerTransition(480ms)` — 토글 시점에만 inline transition spring 적용, 드래그/리사이즈 중엔 OFF로 잔상 방지
- 영향 범위: OrderDetail, AdminPage, BurnwayStock, CustomerList, MainPOS, NotificationSettings, SaveCartModal, ShippingLabel, **SavedCarts** 전 모달 일괄 복구

**8. OrderDetail 그리드 정렬 재조정** (`OrderDetail.jsx`)
- 컬럼 비율: 1+3+3+2+3 (제품명/단가/수량/금액)
- 모든 숫자 셀 `text-center` (정 가운데 정렬) + `tabular-nums`
- 데스크탑 단가/금액 폰트 `text-base/lg` → `text-lg/xl` (보조 라인 13px)
- 모바일 카드 단가/금액 셀에 `공급 N원` 인라인

**9. MainPOS 카트 정리** (`MainPOS.jsx`)
- 제품 카드 우측 ⊕ 아이콘 모두 제거 (`Plus` 시각 시그널 div 통째로 제거)
- 카트 품목 라인 우측 `공급 N` 작은 회색

**10. OrderHistory 합계 + 업체명** (`OrderHistory.jsx`)
- 우측 합계 영역 SubPrice 적용 (stacked sm)
- 업체명 `break-words` → **`break-keep`** (한국어 단어 단위 줄바꿈)
- 반품 카드 amber 톤 강조 (배경 + 2px 테두리 + 그림자 + 액센트 바 + "반품" 알약)
- "기간 내 처리" 배지 → 동적 "오늘 반품 처리" / "어제 반품 처리" / "M/D 반품 처리"

**11. CustomerList 카드** (`CustomerList.jsx`)
- 합계 영역 `safeTotal` 변수화 (NaN 가드) + SubPrice 적용 (stacked xs)
- 주문 상세 모달 단가/품목 합계 라인 인라인 공급가 추가
- 모달 헤더 확대/X 버튼 그룹화 (`flex gap-1`)

**12. 재고현황 통계 카드 폰트 ↑** (`StockOverview.jsx:181-201`)
- 숫자: `text-base font-bold` → **`text-2xl sm:text-3xl font-black tabular-nums`**
- 라벨: `text-[10px]` → `text-xs sm:text-sm font-medium`
- 카드 padding `p-2` → `p-3 sm:p-4`, gap `1.5` → `2 sm:3`, border-radius `lg` → `xl`

**13. plan 문서 신규** (`docs/01-plan/features/invoice-amount-override.plan.md`)
- 명세서 금액 임의 수정 발행 시스템 (% / 원 단위, 적용 범위 3단계, localStorage 우선)
- 11 섹션: 목표 / 배경 / 격리 전략 / FR-01~06 / NFR / 기술 설계 / 대안 비교 / 영향 범위 / 단계별 구현 / 위험 요소 / 다음 단계
- Phase 1~7 구현 순서 제시. 미래 구현 대기

**변경 파일 (16건)**
| 파일 | 변경 |
|------|------|
| `src/App.jsx` | onOrder items price 폴백 / autoOpenOrderConfirm state / ShippingLabel savedCarts prop |
| `src/components/ui/SubPrice.jsx` | **신규** — 공급가/부가세 통일 헬퍼 |
| `src/pages/MainPOS.jsx` | autoOpenOrderConfirm prop 수신 / ⊕ 아이콘 제거 / 카트 공급가 인라인 |
| `src/pages/InvoicesPage.jsx` | 업체명 색상 / TraditionalInvoice 안내 인라인 편집 / customerKey prop |
| `src/pages/ShippingLabel.jsx` | savedCarts 합치기 / 출고예약 배지 |
| `src/pages/SavedCarts.jsx` | useDraggableResizable / 접기 펼치기 / 버튼 반응형 / 카드 헤더 ↑ |
| `src/pages/SaveCartModal.jsx` | 거래처 검색 드롭다운 |
| `src/pages/OrderHistory.jsx` | SubPrice / 반품 amber 강조 / 업체명 break-keep |
| `src/pages/OrderDetail.jsx` | 그리드 1+3+3+2+3 / 폰트 ↑ / tabular-nums |
| `src/pages/CustomerList.jsx` | safeTotal NaN 가드 / SubPrice / 모달 버튼 그룹화 |
| `src/pages/OrderPage.jsx` | 외부 클릭 닫기 안전화 (data-marker + stopPropagation) |
| `src/pages/StockOverview.jsx` | 통계 카드 폰트 ↑ |
| `src/pages/TextAnalyze.jsx` | 버튼 라벨 "장바구니 담기" → "주문하기" |
| `src/hooks/useDraggableResizable.jsx` | fullscreen 애니메이션 transitioning state |
| `docs/01-plan/features/invoice-amount-override.plan.md` | **신규** plan |
| Supabase orders | 10건 items.price 일괄 보정 (DB 직접 UPDATE) |

---

### 2026-04-27 작업 내역

#### 배포 누락 복구 + 주문 카드 가독성 개선

**0. 배포 누락 복구 (긴급)**
- 4/21 이후 6일치 누락 변경(스피너 강제 작동, AI 주문 인식 자동 모달, 명세서·결제 UX 대개편 등)이 `pos-calculator-web` 라이브에 반영되지 않은 상태였음 (모바일용 `pos-calculator`만 배포됨)
- `npx vite build && npx gh-pages -d dist` 재배포로 복구

**1. 주문 카드 합계 — 공급가 인라인 표시 (`OrderHistory.jsx:798-805`)**
- 두 줄 분리 → 한 줄 인라인 괄호 + 회색 (`(공급가 N원)`)
- `whitespace-nowrap`로 줄바꿈 방지, 큰 합계 글자 옆에 `text-[11px]` 작은 회색
- 부가세 포함/미포함 헷갈림 방지 (사용자 요청)

**2. 거래처 관리 주문 상세 모달 — 확대/닫기 버튼 그룹화 (`CustomerList.jsx:904-919`)**
- `justify-between` 안 자식 3개 → 확대 버튼이 가운데로 밀리던 문제 해결
- 두 버튼을 `flex gap-1 flex-shrink-0` 컨테이너로 묶어 우상단 정렬
- OrderDetail 모달의 확대/X 그룹화 패턴과 일관

**3. 반품 카드 시각 강조 (`OrderHistory.jsx:664-708`)**
- 카드 전체 amber(주황) 톤 배경 + 2px 굵은 테두리 + amber 그림자
- 상단 그라데이션 액센트 바 (`#f59e0b → #fbbf24`)
- 우상단 흰 글자 "반품" 알약 배지 (RotateCcw 아이콘) — 한눈에 식별
- 우선순위: 선택됨 > **반품** > 완불 > 블랙리스트

**4. 반품 "기간 내 처리" 배지 문구 명확화 (`OrderHistory.jsx:884-893`)**
- 기존: `⚡ 기간 내 처리` (의미 모호)
- 변경: 날짜 필터에 따라 동적 표시
  - 오늘 필터 → `오늘 반품 처리`
  - 어제 필터 → `어제 반품 처리`
  - 날짜 선택(custom) → `M/D 반품 처리` (예: `4/27 반품 처리`)
  - 범위/전체 필터 → 미부착
- ⚡ 이모지 제거, 텍스트만으로 명확
- 의도: 옛날 주문이 반품 처리일 매칭으로 단일 일자 필터에 끼어들었을 때 "왜 보이는지" 설명하는 시그널

**변경 파일**
| 파일 | 변경 |
|------|------|
| `src/pages/OrderHistory.jsx` | 카드 합계 인라인 공급가 / 반품 카드 amber 톤 강조 / "반품" 알약 / 동적 처리일 배지 |
| `src/pages/CustomerList.jsx` | 주문 상세 모달 확대/닫기 버튼 그룹화 |

**5-10 변경 파일 (별도)**
| 파일 | 변경 |
|------|------|
| `src/pages/SavedCarts.jsx` | 편집 모달 스크롤 fix + 삭제 ConfirmDialog + clean stack |
| `src/components/CustomerDetailModal.jsx` | exceljs lazy + OrderDetailPopup touch 패턴 |
| `src/components/PaymentEditModal.jsx` | ConfirmDialog (Fragment+z-[110]) + finally + modal-scroll-area |
| `src/components/PaymentRegisterModal.jsx` | modal-scroll-area 패턴 |
| `src/pages/OrderDetail.jsx` | 반품 취소 ConfirmDialog (z-[65] wrapper) |

---

### 2026-04-23 작업 내역

#### 명세서·결제 UX 대개편
거래명세서·페이먼트 시스템을 실사용에 맞게 전면 재구성. GitHub Pages 배포는 **의도적으로 보류** (저장소 동기화만).

**1. 거래명세서 (InvoicesPage.jsx 전면 재작성)**
- **양식 교체**: 기존 전통 격자 명세서 → 모던 미니멀 양식 (공급자/공급받는자 2단 카드 + 대형 합계금액 배너 + 줄무늬 품목 테이블 + 하단 집계)
- **품목 단위 나열**: 주문 단위 → 품목별 한 줄씩 (일자 / 품목 / 수량 / 단가 / 공급가 / 세액) — `spec/규격` 컬럼 제거 (실데이터에 항상 빈 값)
- **미수 업체 리스트 패널**: 좌측 사이드바에 미수액 내림차순 76개 업체 원클릭 전환 (업체명 · 건수 · 최근일 · 잔금). 업체 선택 시 상단 칩으로 "{업체명} ✕" 해제 가능
- **이월 날짜 드로어**: 기본 접힘, 클릭 시 펼침. 날짜별 체크박스 (3/69일 선택 등). 선택된 날짜만 명세서 본문/PNG/인쇄에 포함
- **상단 헤더 재배치**: 제목 + 날짜 칩 (오늘/어제/이번주/이번달/전체/날짜선택) + [PNG][인쇄][카톡] 버튼을 한 줄에
- **사이드바 정리**: 4개 카드(필터+업체검색+이월+액션+요약) → 2개 카드(미수업체+이월드로어)로 축소. 스크롤 길이 대폭 감소
- **계산**: `전잔금` = 체크 안 된 이월 잔금, `당기 합계` = 선택 이월 + 당일 품목, `총잔액` = 총합계 − 입금

**2. 페이먼트 시스템 → 거래처 관리 통합**
- **사이드바**: `페이먼트` 메뉴 제거 (12개 → 11개)
- **거래처 관리 페이지 상단 탭**: [🏢 업체 목록] / [💰 페이먼트] (PaymentsContainer 그대로 lazy import로 임베드)
- **대시보드 링크**: `setCurrentPage('payments')` → `setCurrentPage('customers')` 일괄 치환 (Dashboard.jsx, PaymentDashboardSection.jsx)
- **기존 PaymentsPage 기능 100% 보존**: 결제 레코드 232건, 입금 이력 18건, 필터(미수/부분/완납), 발행 필터, 분류 필터, Excel, 동기화, 입금 등록 모두 정상 작동

**3. 업체 상세 주문 카드에 결제 정보 임베드**
- **OrderPaymentInline 컴포넌트**: 각 주문 카드 내부에 결제 상태 배지 + 잔금 + 최근 입금 요약 + [💵 입금 등록] 버튼
- **자동 매칭**: `paymentsByOrder` useEffect로 선택 업체의 payment_records + payment_history 로드 후 `order.id` 기준 매핑
- **결제 레코드 없는 주문**: "결제 레코드 미생성" 점선 박스 + 작은 [💵 입금 등록] 버튼
- **잔금 0 주문**: "💵 추가 입금"으로 버튼 라벨 변경
- **자동 재로드**: `PaymentRegisterModal` / `PaymentEditModal` 저장 완료 시 `reloadCustomerPayments()` 호출

**변경 파일**
| 파일 | 변경 |
|------|------|
| `src/pages/InvoicesPage.jsx` | 전면 재작성 — 모던 양식 + 미수 업체 리스트 + 이월 드로어 |
| `src/pages/CustomerList.jsx` | 상단 탭 시스템 + OrderPaymentInline + 주문별 결제 로드 |
| `src/components/layout/Sidebar.jsx` | 페이먼트 메뉴 제거 |
| `src/App.jsx` | `case 'payments'` 제거 |
| `src/pages/Dashboard.jsx` | payments 링크 → customers |
| `src/components/dashboard/PaymentDashboardSection.jsx` | payments 링크 → customers |

**검증**: Playwright로 탭 전환 / 업체 원클릭 / 결제 섹션 렌더 / 콘솔 에러 0건 확인. `npx vite build` 9.36s 통과.

---

### 2026-04-23 작업 내역 (2차 라운드)

#### Phase 9: Cross-navigation + 입금 모달 리디자인 + 데이터 품질 가드

**1. 명세서 UX 강화 (InvoicesPage.jsx)**
- **업체별 이월 날짜 인라인**: 좌측 업체 체크 시 그 업체 바로 아래에 해당 업체의 이월 미수 날짜가 펼쳐짐. 기존 하단 통합 드로어는 업체 미선택(전체 모드)에서만 표시. 업체 선택 변경 시 선택된 이월 날짜 자동 리셋
- **레이아웃 확대**: `max-w-7xl(1280px)` → `max-w-[1600px]`, 사이드바 `300px` → `360px`. 테이블 폰트 11px → 14px, 셀 padding 확대. 합계 배너 2xl → 3xl
- **Sticky 헤더 + 접기/펴기**: 상단 헤더바가 스크롤 중에도 고정. ▲/▼ 토글로 접으면 제목 + 현재 날짜 + 선택 업체 수만 보임. PNG/인쇄/카톡 버튼은 접혀도 항상 노출
- **업체별 명세서 섹션 액션 바**: 각 업체 섹션 상단에 `💵 입금 받기` / `💰 일괄 입금` / `👁 업체 상세` 3버튼 (잔액 0이면 입금 버튼 숨김)
- **행 수동 수정 기능 (`lineOverrides` + localStorage)**: 명세서 각 품목 행 오른쪽에 `✏️ 수정` / `✕ 제외` 버튼. 편집 모달에서 품목명/수량/단가(VAT포함) 수정 → 공급가/세액 자동 재계산. 수정된 행은 노란 배경 + "✏️ 수정됨" 배지. 원본 주문 DB는 건드리지 않음 (`pos_invoice_line_overrides_v1` localStorage key)
- **0원 행 자동 하이라이트**: 수량>0인데 단가 0원인 행은 빨간 배경 + "⚠️ 단가 0원" 배지로 즉시 식별

**2. 신규 `InvoicesContainer.jsx` (Phase 9 Cross-navigation)**
- InvoicesPage + PaymentRegisterModal + BulkPaymentModal + CustomerDetailModal 4개를 묶어 페이지 이동 없이 입금/업체상세 처리
- 명세서 페이지에서 업체 섹션 액션 바 클릭 → 같은 자리에서 모달 팝업
- App.jsx에 `invoicesInitialCustomerId` state + `goToInvoices(customerId)` 콜백 추가
- `CustomerDetailModal`에 `📄 명세서 발행하기` 버튼 → `onViewInvoice` → App → `currentPage='invoices'` + 해당 업체 자동 선택
- CustomerList → PaymentsContainer → CustomerDetailModal 체인에 `onGoToInvoices`/`onViewInvoice` prop 연결
- Phase 9로 `docs/01-plan/features/pos-payments-integration.plan.md` 업데이트

**3. 입금 등록 모달 전면 리디자인 (PaymentRegisterModal.jsx)**
- **크기**: `max-w-md` → `max-w-2xl`, 폼 요소 대형화 (입금액 입력창 22px, 저장 버튼 대형)
- **1/2/3 단계 숫자 뱃지**: "1) 어느 업체 → 2) 어느 건에서 정산 → 3) 얼마 받으셨나요" 흐름 명시
- **모드 라벨 일상어**: "기존 결제에 입금" → **💰 이미 있는 미수에서** / "신규 결제 생성" → **🆕 새 건으로 등록**
- **빠른 금액 버튼**: 잔금 전액/절반 + 프리셋 `+10만/+50만/+100만` + 초기화
- **결제 방법**: 4-column 대형 버튼 (🏦 계좌이체 / 💵 현금 / 💳 카드 / 📋 기타) + 아이콘
- **과세/비과세 토글 + 부가 항목**: `📊 과세 / 🏷️ 비과세` 2버튼 + `[+ 택배비] [+ 퀵비] [+ 수수료] [+ 기타]` 프리셋으로 동적 행 추가 (이름/금액 수정·삭제)
- **💹 실시간 합계 모니터링 카드**: 받은 금액 + 부가 항목 내역 + 총 합계(저장값) 실시간. 세금 구분 표시
- **저장 시 memo 태그 prepend**: `[비과세][택배비 5,000원][퀵비 3,000원] 원본메모` 형태로 기존 DB 스키마 건드리지 않고 기록
- **드롭다운 라벨 개선**: 기존 `#76 · 잔 815,500원` 혼란 → `세금 T-12345 (04-15)` / `주문 #76 (04-15)` / `결제 #76` 으로 종류 + 발행일 표시

**4. CustomerDetailModal 개선**
- **StatBox 라벨 재정의**: `이월 잔금` → `받을 돈 (미수)`, `주문` → `전체 주문`, `입금 내역` → `받은 횟수` + 각 카드 하단에 "아직 못 받은 총액" 같은 힌트 1줄
- **숫자/단위 인라인**: 세로 3단으로 쌓이던 `4,593,000 / 원 / 힌트` → `4,593,000원` 한 줄 baseline 정렬
- **모달 확대**: `max-w-5xl` → `max-w-6xl`
- **일괄 입금 강등**: 메인 CTA는 `💵 {업체}에서 입금 받기` / `📄 명세서 발행` 2개 (대형). 일괄 입금은 `▶ 고급: 월말 정산용 일괄 입금` `<details>` 접힘 섹션으로 이동 (사용 빈도 낮아서)

**5. 데이터 품질 가드 (3단계 방어, 1단계 완료)**
- **근본 원인 분석**: 특정 주문의 `items[].price`가 `undefined`로 저장된 사례 발견. 환불 로직은 무죄 (items 건드리지 않고 별도 `returns` 배열 사용). 실제 원인은 `MainPOS.cartWithDiscount`에서 도매 모드일 때 `item.wholesale`이 0/null이면 폴백 없이 그대로 저장됨
- **MainPOS.addToCart 가드** (`src/pages/MainPOS.jsx`): `wholesale <= 0 && retail <= 0`이면 카트 담기 거부 + 토스트 `"가격이 0원입니다. 먼저 제품 가격을 등록해주세요"` ~~(2026-05-15 철회: 자바라 무료 라인까지 막혀 경고 토스트로 완화)~~
- **App.saveOrder 가드** (`src/App.jsx`): 저장 직전 `items.filter(price<=0 || !Number.isFinite)` 체크 → 발견 시 `confirm()`으로 사용자 경고 후 선택적 진행
- **formatPrice NaN-safe** (`src/lib/utils.js`): 모든 비유한수(NaN/undefined/null)를 `'0'`으로 폴백
- **CustomerList 주문 상세 모달**: `item.price ?? item.wholesale ?? item.retail ?? 0` 폴백 체인 + 단가 누락 시 "⚠️ 단가 누락" 배지 표시

**6. 기타 UI 정리**
- **OrderDetail 헤더**: 확대/축소 + X 버튼을 한 그룹 div로 묶고 간격 `gap-0.5`로 축소 → X 바로 옆에 딱 붙음
- **SavedCarts 상세 모달**: "도매/소비자" 배지 정렬 — h2의 `flex-1`/`flex-wrap` 제거, 배지 반투명 화이트 배경 + border로 시각적 구분. 타이틀 바로 옆에 딱 붙고 액션 버튼과 충분한 간격

**변경 파일**
| 파일 | 변경 |
|------|------|
| `src/pages/InvoicesPage.jsx` | 업체별 이월 인라인, sticky 헤더, lineOverrides, 업체 액션 바, props 확장 |
| `src/pages/InvoicesContainer.jsx` | **신규** — Phase 9 Cross-navigation 컨테이너 |
| `src/App.jsx` | `InvoicesContainer`로 전환, `invoicesInitialCustomerId` state, `goToInvoices`, saveOrder 가드 |
| `src/pages/CustomerList.jsx` | `onGoToInvoices` prop, PaymentsContainer에 전달, 주문 상세 모달 price 폴백 + 단가 누락 배지 |
| `src/pages/PaymentsContainer.jsx` | `onGoToInvoices` prop, CustomerDetailModal로 전달 |
| `src/components/CustomerDetailModal.jsx` | `onViewInvoice`, 명세서 발행 CTA, 일괄 입금 details 접힘, StatBox 인라인 |
| `src/components/PaymentRegisterModal.jsx` | 1/2/3 스텝, 과세/비과세, 부가 항목, 실시간 합계, memo 태그 prepend |
| `src/pages/OrderDetail.jsx` | 확대/X 버튼 그룹화 |
| `src/pages/SavedCarts.jsx` | 도매/소비자 배지 정렬 |
| `src/pages/MainPOS.jsx` | addToCart 0원 가드 |
| `src/lib/utils.js` | formatPrice NaN-safe |
| `docs/01-plan/features/pos-payments-integration.plan.md` | Phase 9 섹션 추가 |

**검증**: `npx vite build` 9.29~9.69s 통과 (InvoicesContainer-\*.js chunk 33kB gz 10kB 생성). Realtime 반영 로직 변경 없음 — 기존 동작 그대로.

**다음 작업 후보**
- 2단계 가드: 제품 등록/수정 폼(AdminPage 등)에서 wholesale/retail 저장 시 `> 0` 검증
- 3단계 가드: `products.wholesale <= 0 OR NULL` 레코드 전수조사 + `orders.items[].price` 누락 탐지 스크립트
- DB 승격: `payment_history.is_vat_exempt` / `extra_fees JSONB` 컬럼 추가 후 memo 태그 마이그레이션 (현재는 태그로 기록)

---

### 2026-04-17 작업 내역

#### 메모 모니터링 시스템 구현
- **메모 검색**: 검색창에 메모 내용 포함 (주문번호/고객명/연락처/메모)
- **메모 필터**: 3단계 토글 (OFF → 미확인만 → 전체 메모), 미확인 클릭 시 날짜 자동 "전체" 전환
- **메모 체크**: 주문 카드에서 체크 버튼으로 확인 완료/미확인 토글 (DB memo_checked 저장)
- **메모 토스트**: 주문 내역 진입 시 "미확인 메모 N건" 알림 (4초 후 자동 소멸, 터치 시 필터 이동)
- **대시보드 미확인 메모 리스트**: 우측 최상단에 미확인 메모 목록 표시 (체크/주문상세 이동)
- **대시보드 AI 빠른 주문**: 좌측 최근 주문 위에 텍스트 입력 → AI 주문 인식 페이지 자동 이동
- **DB**: orders 테이블에 `memo_checked` BOOLEAN 컬럼 추가
- **code-review**: stale closure 수정 (토스트 useEffect), dead updatedAt 변수 제거

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
