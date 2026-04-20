# Gap Analysis: payments-management

> Feature: payments-management
> Date: 2026-04-15
> Phase: Check (PDCA)
> Plan: [docs/01-plan/features/payments-management.plan.md](../01-plan/features/payments-management.plan.md)
> Implementation: `C:\Users\MOVEAM_PC\pos-payments\` (별도 저장소)

---

## 전체 매치율: **96%** ✅ (Match — Act 불필요)

| 카테고리 | 점수 |
|----------|:-----:|
| 기능 요구사항 (Sec 4) | 100% (8/8) |
| 격리 전략 (Sec 3) | 100% |
| DB 스키마 (Sec 3-2) | 100% |
| UI 구조 (Sec 6) | 85% (SPA로 통합, 기능 동일) |
| 체크리스트 (Sec 9) | 100% |

---

## 1. 계획대로 구현됨

| Plan 항목 | 증거 |
|-----------|------|
| 4-1 자동/수동 결제 레코드 생성 | `supabase.syncOrdersToPaymentRecords()` + `PaymentRegisterModal` |
| 4-2 부분/연속 입금 | `addPaymentHistory` + `PaymentRegisterModal` |
| 4-3 DB 트리거 상태 전이 | `schema.sql` GENERATED COLUMN + `recalc_payment_record()` |
| 4-4 일괄 입금 자동 배분 (오래된 순) | `BulkPaymentModal.jsx` sortedRecords + allocation |
| 4-5 필터/검색 | `getPaymentRecords(filters)` customerId/invoiceDate/hasBalance |
| 4-6 업체별 뷰 (4탭) | `CustomerDetailModal` outstanding/payments/orders |
| 4-7 명세서 인쇄/PNG/클립보드 | `InvoiceModal` + `html-to-image` (toPng, toBlob) |
| 4-8 Excel 내보내기 | `exportExcel.js` (3시트) |
| 3-2 DB 스키마 (2테이블 + 트리거 + 인덱스) | `docs/schema.sql` Plan과 일치 |
| 3-1 폴더/저장소 격리 | `pos-payments` 독립 저장소, base `/pos-payments/` |
| Sec 8 WebSocket 실시간 | `App.jsx` `supabaseClient.channel('postgres_changes')` |
| Sec 11-1 비번 없음 (BETA) | 인증 모달 없음, 대시보드 직접 |

## 2. 범위 변경 (계획 대비 다르게 구현)

| Plan | 구현 | 영향 |
|------|------|------|
| 멀티 페이지 라우팅(`/payments`, `/customers`, 등) — Sec 6 | 단일 SPA (대시보드 + 모달) | 낮음 — 기능 보존, 모바일 BETA에 더 적합 |
| `/payments` 별도 목록 페이지 | 대시보드 + Excel + CustomerDetailModal로 분산 | 낮음 — 파워 유저는 Excel 사용 |
| 업체 랭킹 별도 페이지 | 대시보드 "업체별 미수 랭킹" 패널로 통합 | 낮음 — 클릭 시 상세 모달 |

## 3. 미구현

**차단 항목 없음.** 로드맵 8단계 모두 완료.

- Sec 11 "미정" 결정사항(저장소 이름, 베타 기간, 동기화 주기)은 Do 단계에서 확정됨 (gap 아님)

## 4. 과잉 구현 (Plan 초과 — 실사용 가치 확보)

| 항목 | 증거 | 가치 |
|------|------|------|
| **운영 주문 → 결제 레코드 자동 동기화** (v1.1.0-beta) | `App.jsx:handleSync` + `syncResult` 3-way counter | **실사용 핵심** — 234건 주문 일괄 변환 |
| 업체 랭킹 패널 (대시보드) | `App.jsx:212-230` | 빠른 접근 |
| 플로팅 액션 버튼 (FAB) | `App.jsx:309-315` | 모바일 UX |
| BETA 배지 + 안내 배너 | `App.jsx:129, 273-277` | 환경 명확화 |
| 로드맵 진행 패널 (인앱) | `App.jsx:251-271` | 자기 문서화 |
| 중복 제출 방어 | 모든 모달 `submitting` state | Plan Sec 9 품질 항목 |

## 5. 안전성 검증 (Plan Sec 3-3, 9)

✅ 모든 zero-impact 약속 검증 완료:
- 운영 테이블(`orders`, `customers`, `products`) ALTER 0건 — 오직 SELECT만
- 신규 테이블 2개만 추가 (`payment_records`, `payment_history`)
- `orders.id` / `customers.id`는 soft link (FK 없음) → 운영 무영향
- 별도 저장소 + 별도 base path → 운영 `pos-calculator-web` 무변경
- 운영 DB 행 수 변경 0 (234/138/593/8 그대로)

## 6. 권장 조치

1. ✅ **없음** — 모든 핵심 결함 해소됨
2. 문서 업데이트: Plan Sec 6 "UI 구조"를 실제 SPA 구현에 맞춰 주석 추가 (선택)
3. 다음 PDCA: `/pdca report payments-management` — 완료 보고서 생성
4. 향후: Step 0 동기화 기능을 Plan에 공식 추가(retro-plan) 또는 별도 하위 feature 문서화

---

**판정**: ✅ **Check 통과. Report 단계 진입 가능.**
