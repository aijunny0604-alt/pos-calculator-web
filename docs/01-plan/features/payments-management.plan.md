# Plan: 입출금/미수/잔금/명세서 관리

> Feature: payments-management
> Created: 2026-04-14
> Phase: Plan
> Strategy: **완전 격리 (Zero Impact to Production)**

---

## 1. 목표

주문 데이터 기반으로 **업체별 입금/미수/잔금/이월**을 체계적으로 관리하고,
**세금계산서 날짜 단위 명세서**를 인쇄/이미지로 발행한다.

현재 운영 중인 `pos-calculator-web`에는 **0% 영향**을 주는 격리 전략으로 개발한다.

---

## 2. 배경

### 2-1. 현재 상태
- 운영 앱: `pos-calculator-web` — POS 기능(주문 생성/저장/내역)만 존재
- 결제/수금 기능 없음 → 수기로 관리 중
- 업체별 미수 누적 추적 불가
- 세금계산서 발행일 기반 명세서 뽑기 불가

### 2-2. 실제 업무 흐름 (반영 필요)
```
주문 1,000만원 (1일)
  ↓ 세금계산서 500만 발행 (10일) + 당일 300만 입금
  → 잔금 200만 (부분 결제)
  ↓ 세금계산서 500만 발행 (말일) + 당일 0원
  → 누적 잔금 700만 (이월)
  ↓ 다음달 5일 700만 입금
  → 잔금 0 (완납)
```

- 한 주문에 **N회 부분 입금**이 기본
- 세금계산서는 월 2회(10일/말일) 분할 발행 관행
- "이월 잔금" = 업체가 아직 안 갚은 누적 미수

### 2-3. 리스크 관리 (핵심 제약)
사용자 요구: **"실제 쓰고 있는 프로그램에 영향 가지 않았으면 좋겠어"**
→ 기존 앱/DB에 ALTER/UPDATE/DELETE 절대 불가. 신규 테이블만 생성. 신규 폴더로 별도 앱 빌드.

---

## 3. 격리 전략 (Architecture)

### 3-1. 폴더 분리
```
C:\Users\MOVEAM_PC\pos-calculator-web\   ← 운영 (읽기 전용, 절대 안 건드림)
C:\Users\MOVEAM_PC\pos-payments\          ← 신규 개발 전용 앱
```

- 신규 앱은 `pos-calculator-web` 복제 후 base path 변경
- 별도 GitHub 저장소로 배포 → `aijunny0604-alt.github.io/pos-payments/`
- 공유: 같은 Supabase 프로젝트 (`jubzppndcclhnvgbvrxr`)
- **접근 제어**: 비밀번호 없음 (테스트 편의, URL 본인만 공유) — 세부 섹션 11-1

### 3-2. DB 분리 (신규 테이블만 추가)

**운영 테이블은 ALTER 금지**. 신규 테이블 2개만 추가:

```sql
-- 주문별 결제 집계 (orders FK 없이 soft link로 원본 미영향)
CREATE TABLE payment_records (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT,              -- orders.id 참조 (soft link)
  customer_id BIGINT,           -- customers.id 참조 (soft link)
  total_amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  balance NUMERIC GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN paid_amount = 0 THEN 'unpaid'
      WHEN paid_amount < total_amount THEN 'partial'
      ELSE 'paid'
    END
  ) STORED,
  invoice_date DATE,
  invoice_number TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 입금 이력 (1:N)
CREATE TABLE payment_history (
  id BIGSERIAL PRIMARY KEY,
  payment_record_id BIGINT REFERENCES payment_records(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT,                    -- 현금/계좌이체/카드
  memo TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRIGGER: payment_history 변경 시 payment_records.paid_amount 자동 재계산
CREATE OR REPLACE FUNCTION recalc_payment_record() RETURNS TRIGGER AS $$
BEGIN
  UPDATE payment_records SET
    paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM payment_history WHERE payment_record_id = COALESCE(NEW.payment_record_id, OLD.payment_record_id)),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.payment_record_id, OLD.payment_record_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_payment
AFTER INSERT OR UPDATE OR DELETE ON payment_history
FOR EACH ROW EXECUTE FUNCTION recalc_payment_record();

-- 인덱스
CREATE INDEX idx_payment_records_customer ON payment_records(customer_id);
CREATE INDEX idx_payment_records_order ON payment_records(order_id);
CREATE INDEX idx_payment_records_invoice_date ON payment_records(invoice_date);
CREATE INDEX idx_payment_records_status ON payment_records(payment_status);
CREATE INDEX idx_payment_history_record ON payment_history(payment_record_id);
CREATE INDEX idx_payment_history_paid_at ON payment_history(paid_at);
```

### 3-3. 운영 앱 영향 검증 체크
- [ ] `orders` / `customers` / `products` / `saved_carts` / `ai_learning` 테이블 ALTER 없음
- [ ] 새 테이블 추가만 → 운영 앱 쿼리는 새 테이블을 모르므로 영향 0
- [ ] 운영 앱 빌드/배포 파이프라인 변경 없음

---

## 4. 기능 요구사항

### 4-1. 결제 레코드 생성 (Auto + Manual)

**자동**: 운영 앱에서 주문 생성/수정되면 신규 앱 진입 시 해당 주문을 스캔하여 `payment_records`에 없으면 자동 생성
- 주문 ID 기준 LEFT JOIN으로 "결제 레코드 없는 주문" 리스트 생성
- 한 번에 백필(backfill) 또는 진입 시마다 누락분 생성

**수동**: 운영 DB 외부 주문(현금 직접 수금 등)을 신규 앱에서 단독 생성도 가능

### 4-2. 입금 등록

- 주문 선택 → "입금 등록" 모달 → 금액/방법/메모 입력 → `payment_history` 삽입
- 부분 입금 가능 (total_amount보다 작은 금액)
- 연속 입금 가능 (같은 주문에 여러 행)
- 트리거가 자동으로 paid_amount / balance / status 갱신

### 4-3. 상태 자동 전이 (DB 트리거 기반)

| 조건 | payment_status |
|------|----------------|
| `paid_amount = 0` | `unpaid` |
| `0 < paid_amount < total_amount` | `partial` |
| `paid_amount >= total_amount` | `paid` |
| `due_date < today AND paid_amount < total_amount` | `overdue` (앱 레이어 계산) |

### 4-4. 일괄 입금 (자동 배분)

- 업체 상세 → "일괄 입금" 버튼 → 금액 입력 → **오래된 주문부터** 자동 배분
- 예: 업체에 700만 잔금 (2월 200 + 3월 500) → 350만 입금 시
  - 2월 주문 200만 완납 → 잔금 0
  - 3월 주문에 150만 입금 → 잔금 350만

### 4-5. 필터 / 검색

- 기간(invoice_date 기준): 오늘/어제/이번주/이번달/사용자 정의
- 상태: unpaid / partial / paid / overdue
- 업체(customer_id): 드롭다운 or 자동완성
- 세금계산서 번호 / 금액 범위

### 4-6. 업체별 뷰 (CustomerDashboard)

```
┌──────────────────────────────────┐
│ 🏢 ○○모터스                       │
│ 📞 010-xxxx  📍 대구…              │
│ 💰 이월 잔금: 1,234,567원          │
│ ──────────────────────────────── │
│ [주문내역] [입출금] [미수] [명세서] │
└──────────────────────────────────┘
```

탭별:
- **주문내역**: 운영 DB의 `orders` 읽기 (이 업체 전체 주문)
- **입출금**: `payment_history` 조회 (시간순)
- **미수**: `payment_records WHERE balance > 0 AND customer_id = ?`
- **명세서**: 세금계산서 일자 선택 → 해당일 발행분 명세서 인쇄/PNG

### 4-7. 명세서 발행 (Invoice)

| 포맷 | 용도 |
|------|------|
| **인쇄(A4)** | 오프라인 전달 |
| **PNG 다운로드** | 카톡 전송용 |
| **클립보드 복사** | 즉시 카톡 붙여넣기 |

**명세서 내용**
```
[업체명]
2026-04-14 발송 내역

주문번호       │ 품목요약      │ 금액     │ 상태
ORD-xxx-1234  │ 실리콘 호스 등 │ 750,680 │ 미수
ORD-xxx-5678  │ 플랜지 외     │ 1,200,000│ 입금
──────────────────────────────────────────────
당일 합계:      1,950,680원
미수 합계:      750,680원
이월 잔금 포함: 1,234,567원

입금 계좌: xxx-xxxx-xxxx (예금주: ○○)
```

- `html-to-image` (~20KB) 라이브러리로 DOM → PNG 변환
- `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`
- `window.print()` + @media print CSS

### 4-8. Excel 내보내기
- 기간별 입출금 내역 Excel
- 업체별 미수 리스트 Excel
- **ExcelJS 이미 설치됨** 재사용

---

## 5. 데이터 흐름

```
[운영 앱] orders INSERT
   └── 신규 앱이 다음 진입 시 감지 → payment_records 자동 생성
                                           ↓
                          [신규 앱] "입금 등록" 클릭
                                           ↓
                          payment_history INSERT (예: 100만)
                                           ↓
                          TRIGGER: payment_records.paid_amount 자동 갱신
                                           ↓
                          payment_status / balance 자동 재계산
                                           ↓
                          UI 실시간 반영 (WebSocket or 새로고침)
```

---

## 6. UI 구조 (신규 페이지)

```
신규 앱 pos-payments
  ├── / (대시보드)
  │   ├── 오늘 입금 총액
  │   ├── 오늘 미수 총액
  │   ├── 전체 이월 잔금
  │   └── 연체 주문 Top 10
  ├── /payments (입출금 내역)
  │   ├── 필터 (기간/상태/업체)
  │   ├── 리스트 (주문번호/업체/총액/잔금/상태)
  │   └── [입금 등록] 모달
  ├── /customers (업체별)
  │   ├── 업체 리스트 (이월 잔금순 정렬 가능)
  │   └── /customers/:id → CustomerDashboard (탭 4개)
  ├── /invoices (명세서)
  │   ├── 날짜 선택
  │   ├── 업체별 그룹핑
  │   └── [인쇄] [PNG 저장] [클립보드 복사]
  └── /export (Excel)
```

---

## 7. 구현 범위 (IN / OUT)

### IN (이번 스코프)
- 격리된 신규 앱 `pos-payments` 개발
- Supabase 신규 테이블 2개 + 트리거
- 입금 등록 / 부분 결제 / 일괄 입금
- 업체별 대시보드 (4탭)
- 명세서 발행 (인쇄/PNG/클립보드)
- Excel 내보내기
- WebSocket 실시간 반영

### OUT (이번 안 함)
- 출금/환불 (운영 앱에 `customer_returns` 이미 있음)
- 세금계산서 자동 발행 (수기 번호 입력만)
- PDF 출력 (PNG만, 추후)
- 결제 알림 자동 발송 (SMS/카톡 API 연동은 별도)
- 다중 사용자 권한 (1인 운영 전제)
- 운영 앱과의 통합 (나중 별도 결정)

---

## 8. 단계별 일정

| Step | 작업 | 시간 | 운영 영향 |
|------|------|------|-----------|
| 0 | 폴더 복제 + 별도 저장소 배포 | 30분 | 0 |
| 1 | Supabase 테이블 2개 + 트리거 추가 | 30분 | 0 (운영 테이블 미변경) |
| 2 | 대시보드 + 필터 + 리스트 | 2시간 | 0 |
| 3 | 입금 등록 모달 + 부분 결제 | 1.5시간 | 0 |
| 4 | 업체별 대시보드 (4탭) | 2시간 | 0 |
| 5 | 일괄 입금 (자동 배분) | 1시간 | 0 |
| 6 | 명세서 (인쇄/PNG/클립보드) | 2시간 | 0 |
| 7 | Excel 내보내기 | 30분 | 0 |
| 8 | WebSocket 실시간 반영 | 1시간 | 0 |
| 9 | 1~2주 실사용 베타 | - | 0 |
| **합계** | — | **약 11시간 + 베타** | **0** |

---

## 9. 체크리스트 (완료 기준)

### 기능
- [ ] 운영 앱 orders를 읽어 누락된 payment_records 자동 생성
- [ ] 부분 입금 N회 → paid_amount 자동 합산
- [ ] 업체 이월 잔금 실시간 표시
- [ ] 일괄 입금 → 오래된 주문부터 자동 배분
- [ ] 세금계산서 일자 기준 명세서 필터
- [ ] PNG 다운로드 + 클립보드 복사
- [ ] A4 인쇄 (모바일/데스크톱)
- [ ] Excel 내보내기 (기간/업체별)

### 안전성
- [ ] 운영 앱 기존 테이블 ALTER 0건
- [ ] 운영 앱 코드 수정 0건
- [ ] 운영 앱 빌드 영향 0건
- [ ] 신규 앱 장애가 운영 앱에 영향 없음
- [ ] 신규 앱 잘못된 데이터 입력해도 운영 앱 0영향

### 품질
- [ ] 콘솔 에러 0건
- [ ] 모바일 360×640 가로 스크롤 없음
- [ ] 명세서 PNG 가독성 OK
- [ ] WebSocket 끊겨도 UI 복구 가능
- [ ] 동일 금액 이중 입력 방어 (더블 클릭/중복 제출)

---

## 10. 리스크 & 대책

| # | 리스크 | 대책 |
|---|--------|------|
| 1 | 신규 테이블이 운영 앱 쿼리에 영향 | Supabase API는 테이블 명시 호출. 영향 0 |
| 2 | 트리거 로직 버그로 paid_amount 오염 | 트리거는 신규 테이블에만 적용. 운영 테이블 영향 0 |
| 3 | 같은 계정 동시 수정 경합 | Supabase 낙관적 락 + updated_at 체크 |
| 4 | PNG 생성 시 한글 폰트 깨짐 | 명세서는 system-ui + 웹폰트 프리로드 |
| 5 | 주문 데이터량 많을 때 성능 | 인덱스 + 페이지네이션 + 기간 필터 기본 30일 |
| 6 | 실수로 payment_records 삭제 | 소프트 삭제(`deleted_at`) or 관리자만 삭제 |
| 7 | 신규 앱 배포 주소 헷갈림 | `pos-payments` 명확한 네이밍 + 상단 배지 "[결제 관리 - BETA]" |
| 8 | 비번 없음 + URL 유출 시 무방비 | 브라우저 히스토리 공유 금지 / 개인 Chrome 프로필만 / 의심 시 새 저장소로 즉시 이전 / 정식 공개 시 인증 반드시 추가 |

---

## 11. 결정 사항

1. 신규 앱 GitHub 저장소 이름: `pos-payments` / `pos-calculator-payments` / 기타 — **미정**
2. 관리자 비밀번호: **❌ 비번 없음** (2026-04-14 결정) — 테스트 단계 편의, URL 아는 본인만 접근
3. 베타 기간: 1주 / 2주 / 1개월 — **미정**
4. 베타 종료 후: 분리 유지 / 운영 앱에 통합 — **미정**
5. 주문 자동 감지 주기: 진입 시마다 / 수동 [동기화] 버튼 — **미정**

### 11-1. 비번 없음 결정에 따른 후속 조치

- 진입 시 비번 입력 모달 제거 → 홈 대시보드 바로 표시
- URL은 **다른 사람에게 공유하지 않음** (본인 PC/모바일/태블릿 즐겨찾기만)
- URL 자체가 "접근 토큰" 역할 → URL 유출 시 즉시 새 저장소로 이전
- 안전 장치:
  - Supabase RLS(Row Level Security) 비활성 유지 (이미 현재 구조)
  - 브라우저 히스토리/북마크 동기화 시 유출 가능성 → 개인 Chrome 프로필만 사용
  - 베타 종료 후 정식 공개 시 **비밀번호 or 더 강한 인증 추가** 필수

---

## 12. 다음 단계

1. 본 Plan 승인
2. `/pdca design payments-management` — 상세 설계 (UI 와이어프레임, 컴포넌트 분해, API 시그니처)
3. `/pdca do payments-management` — 격리 환경 구축 시작

> 이 기획안은 운영 앱(`pos-calculator-web`)에 **0% 영향**을 전제로 작성됨.
> 기존 테이블 수정 없이, 신규 폴더와 신규 테이블만으로 구현.
