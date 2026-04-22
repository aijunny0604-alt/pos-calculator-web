# Plan: 완불 체크 기능 실전 투입 전 최소 안전장치

> Feature: pos-manual-paid-improve
> Created: 2026-04-22
> Phase: Plan → Do
> Scope: `src/hooks/useManualPaid.js` 한정, 실전 투입 직전 Critical 이슈 2건만 해결

---

## 1. 목적

운영 POS 웹앱(`pos-calculator-web`)의 완불 체크 기능을 실전 배포하기 전,
사고 발생 시 **복구 가능성**과 **원인 추적**을 보장하는 최소 안전장치를 추가한다.

본 Plan은 별도 앱 `pos-payments`(docs/01-plan/features/payments-management.plan.md)와 **무관**하며,
현재 웹앱 내부의 간단한 완불 체크 기능만 대상으로 한다.

---

## 2. 현황 (Before)

- 저장소: localStorage 키 `pos-payments.manual-paid-orders.v1`
- 구조: `{ [orderId]: { method, paidAt } }` — 현재 상태 스냅샷만 존재
- 변경 이력: 없음 (setPaid/clearPaid 호출 시 이전 값이 덮어써지고 소실)
- 에러 처리: `catch {}` 로 모든 예외 무음 처리 (Sentry 연동되어 있음에도 불구하고)
- 결과: 누가/언제/무엇을 바꿨는지 추적 불가, 실수로 해제해도 복구 경로 없음

---

## 3. 이번 범위 (IN)

| # | 항목 | 목표 |
|---|------|------|
| A | **Audit Log** | 모든 set/clear/change-method 이벤트를 별도 localStorage 키에 누적. FIFO 500건 회전. 조회는 콘솔에서 직접 (`localStorage.getItem('pos-payments.audit-log.v1')`) |
| B | **Error Capture** | `useManualPaid.js` 내부 try/catch 블록에서 Sentry.captureException 호출 (기존 Sentry 이미 초기화됨: `src/main.jsx:3,7`) |

---

## 4. 범위 외 (OUT)

- Supabase 동기화: 별도 Plan 필요 (DB 마이그레이션 수반)
- 금액 기록/분할 결제: 기존 `payments-management.plan.md`의 `pos-payments` 앱에서 해결
- 반품 발생 시 완불 상태 재계산: 별도 이슈
- Audit Log 조회 UI: 지금은 디버깅 시 콘솔 충분. 필요 시 후속 기능

---

## 5. 영향도 맵

```
📦 수정 파일
└── src/hooks/useManualPaid.js (유일)
    ├── import: @sentry/react 추가
    ├── 상수: AUDIT_LOG_KEY, AUDIT_MAX_ENTRIES 추가
    ├── 함수: appendAuditLog() 신규
    ├── 기존: loadMap/saveMap/setPaid/clearPaid — catch 블록에 Sentry.captureException
    └── 공개 API 변경 없음 → 호출부(OrderHistory.jsx, OrderDetail.jsx) 수정 불필요
```

**백워드 호환**: 기존 `pos-payments.manual-paid-orders.v1` 키는 그대로, 신규 키 추가만.

---

## 6. 데이터 스키마

### localStorage: `pos-payments.audit-log.v1`
```ts
type AuditEntry = {
  ts: string;           // ISO timestamp
  action: 'set' | 'clear' | 'change';
  orderId: string;
  method?: string;      // set/change 시
  prevMethod?: string;  // change 시
  ua: string;           // navigator.userAgent 앞 80자
};

// 저장 형태: AuditEntry[] 최대 500건 (초과 시 앞에서 FIFO 제거)
```

---

## 7. 수용 기준 (Acceptance)

- [ ] `setPaid(orderId, 'card')` 호출 시 audit log에 `action: 'set'` 엔트리 추가
- [ ] `setPaid(orderId, 'cash')` 호출 시 기존 method 있으면 `action: 'change'`, `prevMethod: 'card'`
- [ ] `clearPaid(orderId)` 호출 시 `action: 'clear'`, `prevMethod` 포함
- [ ] 501번째 엔트리 추가 시 가장 오래된 1건 제거
- [ ] JSON parse 실패 시 Sentry 캡처 + 빈 배열로 복구
- [ ] localStorage quota exceeded 시 Sentry 캡처 + 로그는 무시 (메인 데이터는 보존)
- [ ] 기존 UI/동작 변경 없음 (OrderHistory/OrderDetail 회귀 없음)
- [ ] `npx vite build` 성공

---

## 8. 리스크 & 대책

| # | 리스크 | 대책 |
|---|--------|------|
| 1 | Audit log가 커져서 quota 잡아먹음 | 500건 제한 + 엔트리당 ~200바이트 = 최대 ~100KB |
| 2 | Sentry에 너무 많은 이벤트 전송 | `captureException`은 실제 에러에만. 정상 로그는 Sentry 미전송 |
| 3 | 로그 포맷 변경 시 과거 로그와 호환 안 됨 | 키 이름에 `.v1` 버전 포함. 향후 v2 마이그레이션 여지 |

---

## 9. 다음 단계 (이후 Plan)

실전 1~2주 운용 후 이슈 수집 → 다음 이터레이션:
- Supabase `payments` 테이블 mirror (기기간 동기화)
- 금액 필드 도입 (분할 결제 준비)
- 반품 발생 시 완불 상태 자동 플래그
