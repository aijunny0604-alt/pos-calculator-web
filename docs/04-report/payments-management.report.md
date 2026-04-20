# PDCA 완료 보고서: payments-management

> Feature: payments-management
> Date: 2026-04-15
> Phase: Report (PDCA 종료)
> Match Rate: **96%** ✅

---

## 1. 프로젝트 개요

**목표**: 자동차 튜닝 부품 POS 시스템(`pos-calculator-web`)의 **주문 데이터를 기반**으로 업체 입출금/미수/이월 잔금을 관리하고, 세금계산서 단위로 명세서를 인쇄/PNG/클립보드로 내보낸다.

**핵심 제약**: 실사용 중인 운영 앱에 **0% 영향**. 별도 저장소 + 신규 DB 테이블만 사용.

**기간**: 2026-04-14 (Plan) ~ 2026-04-15 (Do + Check) — 약 1일 집중 개발

---

## 2. PDCA 진행 경로

| 단계 | 작업 | 산출물 |
|------|------|--------|
| **Plan** | 7가지 결정 사항 확정 + 격리 전략 설계 | [plan.md](../01-plan/features/payments-management.plan.md) |
| **Design** | *생략* (구현이 단순하고 Plan이 상세해서) | — |
| **Do** | v1.0.0-beta (7단계) → v1.1.0-beta (동기화 추가) | `pos-payments` 저장소 |
| **Check** | gap-detector로 Plan vs Code 비교 → 96% | [analysis.md](../03-analysis/payments-management.analysis.md) |
| **Act** | *불필요* (매치율 96% > 90% 기준) | — |
| **Report** | 본 문서 | [report.md](payments-management.report.md) |

---

## 3. 격리 전략 (실제 검증)

```
운영 앱 (pos-calculator-web)     [ZERO IMPACT]     베타 앱 (pos-payments)
├── GitHub: aijunny0604-alt/      ❌ 변경 없음      ├── GitHub: aijunny0604-alt/pos-payments
│   pos-calculator-web                                 │  (신규 저장소)
├── URL: .../pos-calculator-web/                     ├── URL: .../pos-payments/
└── DB 테이블 (공유)               ⚠️ 읽기만        └── DB 테이블 (공유)
    • orders (234행) ─────────────────────────────→ SELECT only
    • customers (138행) ──────────────────────────→ SELECT only
    • products (593행) ───────────────────────────→ SELECT only
                                                      • payment_records (신규)  ✨
                                                      • payment_history (신규)  ✨
```

### 검증 결과
- 운영 앱 코드 수정: **0개 파일**
- 운영 테이블 ALTER: **0건**
- 운영 DB 데이터 변경: **0건** (234/138/593/8 그대로 유지)
- 운영 앱 배포 영향: **0**
- 베타 앱 장애 시 운영 영향: **0** (격리됨)

---

## 4. 구현 내역 (v1.1.0-beta)

### 4-1. 기술 스택
- React 18 + Vite 6 + Tailwind CSS v3 + Supabase
- 신규: `html-to-image` (PNG/클립보드), 기존 `exceljs` 재사용
- Sentry 제거 (베타라 에러 추적 불필요)

### 4-2. DB 변경
```sql
-- 신규 2 테이블 (Supabase MCP apply_migration)
CREATE TABLE payment_records (id, order_id TEXT, customer_id TEXT, total_amount,
  paid_amount, balance GENERATED, payment_status GENERATED, invoice_date,
  invoice_number, due_date, memo, created_at, updated_at);

CREATE TABLE payment_history (id, payment_record_id FK, amount, method, memo, paid_at);

-- 트리거: payment_history 변경 → payment_records.paid_amount 자동 재계산
CREATE TRIGGER trg_recalc_payment ...;

-- 인덱스 7개 (성능)
```

### 4-3. UI 구조 (단일 SPA)
```
┌────────────────────────────────┐
│ 헤더: 💰 MOVE 결제 관리 [BETA]  │
│        [📄 명세서] [📊 Excel] [↻] │
├────────────────────────────────┤
│ 요약 카드: [오늘 입금][미수][연체] │
│ 등록 카운트 + 🔄 동기화 버튼     │
│ 🚨 연체 주문 리스트             │
│ 🏢 업체별 미수 랭킹 (클릭→상세)  │
│ 💵 최근 입금                    │
│ 🗺️ 개발 진행 (8/8 ✅)          │
│ ⚠️ BETA 안내                   │
├────────────────────────────────┤
│ 플로팅 + 버튼 (빠른 입금 등록)   │
└────────────────────────────────┘

모달 4개:
├── PaymentRegisterModal (기존/신규 2모드)
├── CustomerDetailModal (미수/입금/주문 3탭 + 일괄 입금 진입)
├── BulkPaymentModal (자동 배분 미리보기 + 확정)
└── InvoiceModal (PNG/인쇄/클립보드 + 업체 그룹핑)
```

### 4-4. 핵심 기능
1. **대시보드 요약** — 오늘 입금/미수/연체 실시간
2. **입금 등록** (기존 레코드 or 신규 생성+입금)
3. **업체별 4탭 뷰** (미수/입금/주문 + 일괄 입금 진입)
4. **일괄 입금 자동 배분** — 오래된 순 순차 상쇄 미리보기
5. **명세서** (PNG / 인쇄 / 클립보드) — 카톡 붙여넣기 지원
6. **Excel 3시트** (결제 레코드 / 입금 이력 / 업체별 미수)
7. **WebSocket 실시간** — 다른 PC 변경 즉시 반영
8. **운영 주문 동기화** (v1.1) — 234건 일괄 변환, 업체 이름/전화 매칭

---

## 5. 품질 지표

| 항목 | 결과 |
|------|------|
| 매치율 (Plan vs Code) | **96%** |
| 빌드 | ✅ 성공 (JS 1.3MB / gzip 384KB) |
| 배포 | ✅ GitHub Pages (자동 CDN) |
| 콘솔 에러 | 0건 |
| 모바일 반응형 | 360×640, 390×800 OK |
| 한국어 줄바꿈 (break-keep) | OK |
| DB 트리거 검증 | unpaid → partial → paid + CASCADE 모두 OK |

---

## 6. 발견 이슈 + 해결

| # | 이슈 | 해결 |
|---|------|------|
| 1 | GitHub 저장소 생성 | `gh repo create` 자동 처리 |
| 2 | `.gitignore` `/*.png`가 dist PNG 차단 | 규칙 변경 + 수동 `git push -f origin gh-pages` |
| 3 | gh-pages npm 패키지 Windows 캐시 버그 | dist 폴더 직접 `git init` + force push로 우회 |
| 4 | `payment_records.order_id`가 BIGINT였으나 orders.id는 TEXT | `ALTER TABLE ... TYPE TEXT` 마이그레이션 |
| 5 | 동기화 누락 (초기에 Plan에 없었음) | v1.1에 Step 0 추가 |

---

## 7. 메트릭

| 항목 | 값 |
|------|------|
| 커밋 수 | 5개 (Initial → Fix assets → Step 1 → Step 2 → Steps 5-7 → v1.1) |
| 생성 파일 | 8개 (App.jsx 재작성, 모달 4, exportExcel, schema.sql, CLAUDE.md) |
| 수정 파일 | 3개 (supabase.js, index.html, package.json) |
| 삭제 파일 | 대량 (기존 pos 페이지 15개, 테스트 파일 234개 PNG 등) |
| 최종 번들 크기 | 1.3MB (gzip 384KB) |
| 로컬 빌드 시간 | 6초 |
| DB 테이블 추가 | 2개 |
| DB 트리거 추가 | 1개 |
| DB 인덱스 추가 | 7개 |

---

## 8. 학습 / 인사이트

### 잘 된 것
- **격리 전략이 실제로 통함**: 운영 앱에 손 대지 않고 같은 DB에서 병행 작업 가능
- **GENERATED COLUMN + TRIGGER** 조합으로 `paid_amount` 로직을 DB에서 보장 (앱 버그 방지)
- **단일 SPA가 Plan의 멀티페이지보다 실용적** — 모바일 중심 BETA에선 모달이 더 빠름

### 개선 포인트
- **사전 스키마 검증 부족** — orders.id 타입을 Plan 단계에서 확인했어야 함 (BIGINT 가정 오류)
- **gh-pages npm 버그** — 수동 `git init` 우회가 비표준. 향후 GitHub Actions로 대체 검토
- **번들 1.3MB 큼** — ExcelJS + html-to-image 무거움. 사용자 활동 적으니 OK, 추후 동적 import 고려

---

## 9. 운영 환경 전달 사항

### 🌐 접속
- https://aijunny0604-alt.github.io/pos-payments/

### 🔐 접근 제어
- 비밀번호 없음 (BETA) — URL 유출 주의. 브라우저 히스토리 동기화 주의.

### 🔄 첫 실행 (데이터 초기화)
1. 대시보드 진입
2. "🔄 운영 주문 → 결제 레코드 동기화" 클릭 → 확인
3. 234건 중 매칭된 것만 INSERT (수 분 소요)

### 🔍 모니터링
- 실시간 반영: WebSocket 구독 작동
- 에러: 콘솔 확인 (Sentry 제외)
- 복구: 문제 시 `TRUNCATE payment_records CASCADE` 한 줄로 초기화 가능 (운영 무영향)

---

## 10. 다음 단계 (미결정)

베타 운영 중 결정 필요:

| 항목 | 선택지 |
|------|--------|
| 베타 기간 | 1주 / 2주 / 1개월 |
| 베타 후 처리 | 분리 유지 / 운영 앱 통합 |
| 출금/환불 추가 | 포함 / 제외 (현재 제외) |
| PDF 지원 | 현재 PNG만, PDF 추가 여부 |
| 정식 공개 시 인증 | 비밀번호 / OAuth / 유지 |

---

**결론**: ✅ **Plan 96% 달성, 운영 무영향, 실사용 준비 완료.**

> **다음 명령**: `/pdca archive payments-management --summary` (베타 종료 후 아카이빙)
> 또는 실사용 중 발견된 이슈 피드백 → 바로 수정
