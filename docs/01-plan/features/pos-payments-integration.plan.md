# Plan: pos-payments 결제 관리 시스템 → pos-web 통합

> Feature: pos-payments-integration
> Created: 2026-04-22
> Source: `C:\Users\MOVEAM_PC\pos-payments` (sandbox, v3.11.0-beta)
> Target: `pos-calculator-web` (운영)
> Strategy: **Phase 단위 점진적 통합 + 각 Phase 체크포인트**

---

## 1. 배경

sandbox `pos-payments`는 pos-web에 결제 기능을 추가하기 위한 **테스트베드**였음.
sandbox는 이미 배포되어 운영 중(`aijunny0604-alt.github.io/pos-payments/`)이며,
실제 데이터(`payment_records` 232행 / `payment_history` 18행)가 쌓이고 있음.

목표: sandbox의 **기능**을 pos-web에 통합 → sandbox는 점진적으로 deprecation.
(sandbox의 UI 디자인/구조는 참고만. pos-web의 기존 네비게이션/레이아웃에 편입)

---

## 2. Sandbox 인벤토리 (4,302줄)

### Pages (2,651줄)
| 파일 | 줄 | 통합 대상 (pos-web) |
|---|---|---|
| DashboardPage.jsx | 190 | 기존 Dashboard.jsx에 카드 추가 (merge) |
| PaymentsPage.jsx | 404 | 신규 페이지 (currentPage='payments') |
| CustomersPage.jsx | 180 | 기존 CustomerList.jsx에 "미수" 탭 추가 |
| InvoicesPage.jsx | 542 | 신규 페이지 (currentPage='invoices') |
| OrdersPage.jsx | 877 | **pos-web OrderHistory 이미 존재 → skip** |
| SettingsPage.jsx | 345 | 기존 AdminPage.jsx에 "회사정보/PIN" 섹션 추가 |
| AuthPage.jsx | 113 | **skip** (pos-web은 AdminPage 비밀번호만 사용) |

### Modals (1,751줄)
| 파일 | 줄 | 비고 |
|---|---|---|
| PaymentRegisterModal.jsx | 419 | 신규 |
| PaymentEditModal.jsx | 180 | 신규 |
| CustomerDetailModal.jsx | 586 | 신규 (업체 상세 3탭) |
| BulkPaymentModal.jsx | 222 | 신규 (일괄 입금 자동 배분) |
| InvoiceModal.jsx | 244 | 신규 (명세서 발행) |

### lib (4개 파일)
| 파일 | 처리 |
|---|---|
| `supabase.js` | pos-web supabase.js에 payment_* + app_settings API + sync 로직 추가 |
| `vatHelper.js` | 신규 복사 (calcVat, DEFAULT_CATEGORIES, getCategoryInfo) |
| `exportExcel.js` | 신규 복사 (3종 Excel) |
| `utils.js` | pos-web utils.js에 `formatTime` 등 누락분만 추가 |

---

## 3. Phase 분할 (체크포인트별 커밋)

### Phase 1: Foundation (비침투) — 지금
**목표**: 공통 인프라만 이식. 기존 pos-web 동작 변화 0.
- `src/lib/vatHelper.js` 신규 복사
- `src/lib/exportExcel.js` 신규 복사
- `src/lib/utils.js`에 `formatTime` 추가
- `src/lib/supabase.js`에 payment_records / payment_history / app_settings / 집계 / 동기화 API 추가
- 빌드 검증 → 커밋 → tag `phase-1-foundation`

**영향**: 없음 (import 없이 코드만 추가)

---

### Phase 2: Core Modals (UI 추가, 기존 화면 변화 없음)
**목표**: 모달 4개 이식. 페이지 UI는 아직 안 바꿈.
- PaymentRegisterModal, PaymentEditModal, BulkPaymentModal, InvoiceModal 복사
- CustomerDetailModal 복사
- 모달을 쓰는 컨테이너(페이지)는 다음 Phase에서

**영향**: 파일만 추가, 라우팅 미연결 → 실행 동작 변화 없음

---

### Phase 3: Payments Page + 네비게이션 편입
**목표**: "페이먼트" 메뉴 추가 + PaymentsPage 이식 → 실제로 쓸 수 있게
- `src/pages/PaymentsPage.jsx` 복사 + pos-web 레이아웃에 맞게 수정
- `App.jsx`에 `case 'payments'` 추가
- Sidebar/AppLayout에 "페이먼트" 메뉴 항목 추가
- 모달들을 PaymentsPage에서 호출하도록 연결
- 빌드 + 커밋 → tag `phase-3-payments-page`

**영향**: 새 메뉴 등장. 기존 메뉴 동작 변화 없음.

---

### Phase 4: 업체별 미수 (CustomerList 확장)
**목표**: 기존 업체 관리 화면에 미수 정보 결합
- 기존 CustomerList에 탭 시스템 추가 (주문 / 미수 / 입금 이력)
- CustomerDetailModal 연결
- 업체 클릭 시 미수 요약 표시

**영향**: 업체 관리 UI가 더 풍부해짐. 기존 기능 회귀 없음.

---

### Phase 5: 명세서 (InvoicesPage)
**목표**: 세금계산서 일자별 명세서 발행 기능
- `src/pages/InvoicesPage.jsx` 복사
- App.jsx에 `case 'invoices'` 추가
- PNG/인쇄/카톡 복사 + Excel 내보내기 연결

---

### Phase 6: Dashboard 카드 머지
**목표**: 기존 Dashboard에 결제 관련 요약 카드 추가 (오늘 입금 / 미수 / 연체)

---

### Phase 7: Settings + 동기화
**목표**: AdminPage에 회사정보 + 동기화 버튼 섹션 추가
- `syncOrdersToPaymentRecords` 기능으로 운영 orders → payment_records 일괄 생성

---

### Phase 8: Sandbox Deprecation (선택)
- sandbox app에 "본 기능은 pos-web으로 이전됨" 배너
- 6개월 후 sandbox 배포 중단

---

## 4. 공통 규칙 (모든 Phase)

- **기존 운영 테이블(orders, customers, products 등) ALTER 금지** — 유지
- **RLS 정책 유지** — sandbox와 동일 (payment_* 테이블은 anon 접근 허용)
- **pos-web 기존 UI/UX 변경 최소화** — 사이드 메뉴 추가만, 기존 페이지 기능 변경 금지
- **각 Phase 끝에 빌드 + 커밋 + tag** → 롤백 경로 보장
- **sandbox와 같은 Supabase 프로젝트 공유** (`jubzppndcclhnvgbvrxr`) — 데이터 중복 없음
- **동시 운영 기간**: Phase 1~7 동안 sandbox는 유지. Phase 8에서 deprecation 결정

---

## 5. 체크리스트 (Phase 1 한정)

- [ ] vatHelper.js 복사
- [ ] exportExcel.js 복사
- [ ] utils.js에 formatTime 추가
- [ ] supabase.js에 결제 관련 API 추가
- [ ] `npx vite build` 통과
- [ ] 기존 페이지(MainPOS/OrderHistory/AdminPage 등) 동작 변화 없음 (smoke)
- [ ] 커밋 + tag `phase-1-foundation`

---

## 6. 위험 관리

| 위험 | 대응 |
|---|---|
| 이식 중 기존 기능 깨짐 | Phase별 커밋 + tag → 즉시 롤백 가능 |
| payment_records 스키마 충돌 | sandbox와 같은 DB라 스키마 공유. 변경 시 양쪽 동시 영향 |
| pos-web + sandbox가 같은 Supabase 쓸 때 Realtime 구독 중복 | 각각 subscribe, 문제없음 (이미 manual_paid_orders에서 검증) |
| 사용자 혼란 (두 앱 병존) | Phase 3 이후 pos-web 메뉴에 안내: "기존 sandbox 링크는 곧 종료 예정" |

---

## 7. 다음 단계

**바로 진행**: Phase 1 Foundation → 1시간 내 완료 예상
**이후**: Phase 2-7은 사용자와 논의 후 순차 진행
