# Plan: 명세서 금액 임의 수정 발행 시스템

> Feature: invoice-amount-override
> Created: 2026-04-28
> Phase: Plan
> Strategy: **DB 무영향 — 명세서 출력 한정 오버라이드**

---

## 1. 목표

명세서 발행 시점에 **DB의 실제 제품/주문 가격은 그대로 두고, 명세서 상 표시 금액만** 임의로 조정해서 출력할 수 있는 기능. 할인/할증, % 단위, 원 단위 모두 지원.

운영 데이터(`orders.items`, `products`, `payment_records` 등)는 **0% 영향**.

---

## 2. 배경

### 2-1. 현재 상태
- 명세서 페이지(`InvoicesPage.jsx`)는 `orders.items[].price * quantity`로 합계 계산
- 라인 단위 수정은 일부 가능 (`pos_invoice_line_overrides_v1` localStorage)
  - 이름/수량/단가 수정 + 라인 제외(`deleted: true`)
  - 단, 합계/일괄 할인 기능 없음
- 안내 문구 인라인 편집은 직전 추가됨 (`pos_invoice_footer_default_v1` / `_overrides_v1`)
- **할인/할증을 % 또는 원 단위로 일괄 적용하는 UI 없음**

### 2-2. 비즈니스 시나리오
- "단골에게 5% 할인해서 발행" → 합계 5% 차감
- "현금으로 받기로 했으니 부가세 빼고 발행" → 부가세 0 처리 또는 -10%
- "이번에만 -50,000원 빼주기" → 절대 금액 차감
- "할증 +10% 적용 (긴급/특별 단가)" → 할증
- "라인 한 개만 가격 임의 수정" → 이미 가능 (line override)
- "명세서 전체 합계만 끝값 깔끔하게 (829,440 → 830,000 올림)" → 끝값 보정

---

## 3. 격리 전략

- **DB 변경 없음**: `orders` 테이블, `products` 테이블 모두 미수정
- **localStorage 우선**: `pos_invoice_amount_override_v1` 신규 키
- **Supabase 동기화는 후속 단계** (다기기 사용 시 필요): `invoice_overrides` 테이블 — 본 plan에는 포함 안 함, 별도 plan으로

---

## 4. 기능 요구사항 (FR)

### FR-01: 명세서별 합계 오버라이드
- 명세서마다 (업체+발행일 단위) 다음 메타 저장 가능:
  - 할인 % (예: -5)
  - 할인 원 (예: -50000)
  - 할증 % (예: +10)
  - 할증 원 (예: +30000)
  - 끝값 보정 모드: `none|round1000|round10000|floor|ceil`
- 우선순위: % 적용 → 원 적용 → 끝값 보정

### FR-02: 인라인 편집 UI
- 명세서 합계 배너 옆에 **`💰 금액조정` 버튼** (인쇄 시 안 보임 `no-print`)
- 클릭 시 작은 패널 펼침:
  - 할인/할증 토글
  - % 입력 필드 (-100 ~ +100)
  - 원 입력 필드 (-9999999 ~ +9999999)
  - 끝값 보정 셀렉트
  - "이 명세서만" / "이 업체 기본" / "전체 기본" 적용 범위
  - [미리보기] [저장] [초기화] [취소]

### FR-03: 시각 표시
- 오버라이드 적용된 명세서는 합계 옆에 **`✏️ 조정 -5%` 같은 작은 배지**
- 원본 합계는 작은 회색 글자로 옆에 표시 (예: `(원래: 829,440원)`)
- 인쇄/PNG 출력에는 **조정된 합계만** 표시 (배지 없음)

### FR-04: 적용 범위 (Scope)
- **이 명세서만** (기본): 업체+발행일 단위 단일 적용
- **이 업체 기본**: 같은 업체의 모든 미래 명세서에 자동 적용
- **전체 기본**: 모든 업체 명세서에 자동 적용 (단골 할인 등)

### FR-05: 표시 우선순위 (안내 문구 패턴 일관)
1. 이 명세서만 (가장 우선)
2. 이 업체 기본
3. 전체 기본
4. 적용 안 함 (원본 그대로)

### FR-06: 부가세/공급가 재계산
- 조정된 합계 기준으로 공급가/부가세 자동 재계산
- 예: 조정 후 합계 800,000원 → 공급가 727,273원, 부가세 72,727원
- 라인 단위 단가는 조정 비율로 안분 (선택사항, 후속 단계)

---

## 5. 비기능 요구사항 (NFR)

- **DB 무영향**: 테이블/컬럼 변경 없음
- **인쇄/PNG 출력 정합성**: 조정된 금액만 노출, 편집 UI 안 보임
- **성능**: 76개 업체 × N명세서 동시 렌더 시 추가 N번 localStorage read 발생 → 부모 컴포넌트에서 한 번 읽고 props 주입 (직전 SubPrice 검토에서 지적된 M1·M2 패턴 동시 해결)
- **데이터 손실 방지**: localStorage 쓰기 실패 시 toast 알림
- **다기기**: 본 plan은 단일 디바이스 한정. 다기기 동기화는 후속 plan

---

## 6. 기술 설계 초안

### 6-1. 저장 구조 (localStorage)

```js
// 키: pos_invoice_amount_override_v1
{
  "global": {                    // FR-04 전체 기본 (있을 때만)
    "discountPercent": -5,
    "discountAmount": 0,
    "roundMode": "none"
  },
  "byCustomer": {                // FR-04 이 업체 기본
    "<customerId>": {
      "discountPercent": -3,
      ...
    }
  },
  "byInvoice": {                 // FR-04 이 명세서만
    "<customerId>__<issueDate>": {
      "discountPercent": -5,
      "discountAmount": -10000,
      "roundMode": "round1000"
    }
  }
}
```

### 6-2. 적용 함수 (utils)

```js
// src/lib/invoiceAmountOverride.js
export function applyOverride(originalTotal, override) {
  if (!override) return originalTotal;
  let v = originalTotal;
  if (override.discountPercent) v *= (1 + override.discountPercent / 100);
  if (override.discountAmount) v += override.discountAmount;
  switch (override.roundMode) {
    case 'round1000': return Math.round(v / 1000) * 1000;
    case 'round10000': return Math.round(v / 10000) * 10000;
    case 'floor': return Math.floor(v);
    case 'ceil': return Math.ceil(v);
    default: return Math.round(v);
  }
}

export function resolveOverride(customerId, issueDate, store) {
  return store.byInvoice[`${customerId}__${issueDate}`]
      || store.byCustomer[customerId]
      || store.global
      || null;
}
```

### 6-3. 컴포넌트 분리

- `<InvoiceAmountOverridePanel />` — FR-02 UI (인라인 편집 패널)
- `TraditionalInvoice` — 기존 컴포넌트에 props 추가:
  - `override` (조정 메타)
  - `onSaveOverride` (저장 콜백)

### 6-4. UI 위치

```
[합계금액 배너]
  ₩ 829,440  → ₩ 788,000  ✏️ 조정 -5%
  (원래: 829,440원)         [💰 금액조정]
```

---

## 7. 대안 비교

| 안 | 장점 | 단점 |
|----|------|------|
| (A) localStorage 단독 | DB 무영향, 빠른 구현 | 다기기 미동기화 |
| (B) Supabase 신규 테이블 | 다기기 동기화, 영구 보관 | DB 변경, 권한 정책 추가 필요 |
| (C) `orders.items`에 직접 추가 | 한 군데에 집약 | 운영 데이터 오염 위험 (DB 무영향 원칙 위반) |

→ **선택: (A) localStorage**. 후속 단계에서 (B) 별도 plan으로 진행.

---

## 8. 영향 범위

| 파일 | 변경 |
|------|------|
| `src/lib/invoiceAmountOverride.js` | 신규 — 적용/조회 함수 |
| `src/components/invoice/InvoiceAmountOverridePanel.jsx` | 신규 — 인라인 편집 패널 |
| `src/pages/InvoicesPage.jsx` | TraditionalInvoice에 override prop 추가, 합계 계산 시 applyOverride 호출 |
| 라이브러리 추가 | 없음 |
| DB 마이그레이션 | **없음** |

---

## 9. 단계별 구현 순서

1. **Phase 1 — 기반**: `invoiceAmountOverride.js` 유틸 + 단위 테스트 (선택)
2. **Phase 2 — 데이터**: localStorage 읽기/쓰기 헬퍼 + 부모 InvoicesPage 상태 hoist
3. **Phase 3 — 패널 UI**: `<InvoiceAmountOverridePanel>` 폼 (할인/할증/끝값/적용범위)
4. **Phase 4 — 통합**: TraditionalInvoice 합계 배너에 패널 연결 + 합계/공급가/부가세 재계산
5. **Phase 5 — 시각 표시**: 조정 배지 + 원본 합계 표시
6. **Phase 6 — 인쇄/PNG 정합성**: `no-print` 검증, html-to-image 출력 시 깔끔한 결과
7. **Phase 7 — 회귀 검증**: 기존 line override + footer override와 충돌 없는지 확인

---

## 10. 위험 요소

- **부가세/공급가 재계산 오해**: 사용자가 "% 할인"을 합계 기준으로 봤는데 시스템이 공급가 기준으로 계산하면 결과 다름 → **합계(부가세 포함) 기준으로 통일**, 미리보기로 직관 확인
- **인쇄 시 조정 정보 누락**: 받는 측이 "왜 금액이 다르지?" 의심 가능 → 조정 사유 메모 옵션 추가 검토
- **잔금 계산 영향**: payment_records 잔금은 `orders.total - 입금합` 기반인데, 조정된 명세서 금액과 잔금이 다르면 혼동 → 명세서 조정은 **표시 한정**임을 UI에 명시 (`(원래 829,440원, 잔금 계산은 원본 기준)`)
- **다명세서 일괄 발행**: "전체 발행"에서 각 명세서마다 다른 조정 적용 시 PNG 분리 출력 정상 작동 검증

---

## 11. 다음 단계

- 본 plan 승인 후 → `/pdca design invoice-amount-override` 로 상세 설계 (UI 와이어프레임 + API 스펙)
- 또는 → 즉시 Phase 1 구현 시작
