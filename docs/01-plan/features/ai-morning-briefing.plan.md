# AI 아침 브리핑 (자율 일일 요약) — Plan

> 작성일: 2026-06-10
> 상태: Plan (구현 대기)
> 한 줄: "분석만 하던 AI"를 "매일 아침 할 일을 먼저 알려주는 AI"로. 기존 스마트알림 인프라 재활용.

## 1. 목적 (Why)

사장님이 매일 아침 출근해서 **여러 페이지를 돌며 직접 확인하던 것들**(오늘 처리할 주문, 발송마감 임박, 재고 부족, 어제 매출, 미수 임박)을 AI가 **한 장 카드로 자동 요약**해 대시보드 최상단에 띄운다. 클릭하면 해당 페이지로 딥링크.

**핵심 가치**: 사장님 "확인 노동"을 0으로. 놓치는 발송마감/품절을 AI가 선제 경고.

## 2. 범위 (Scope)

### 포함
- 대시보드 진입 시(또는 하루 첫 접속 시) **AI 아침 브리핑 카드** 자동 생성·고정
- 6개 섹션 집계:
  1. **오늘 처리할 주문** — 네이버 미처리(`isOrderPending`) 건수 + 발송마감 D-day/D-1/초과
  2. **재고 임박** — `getStockCoverageForecast` (14일 내 품절)
  3. **마진 누수** — `getMarginLeakage` (도매가 이하/마진 10% 미만)
  4. **이상 징후** — `detectAnomalies` (매출 급감/급증, 반품 급증 등)
  5. **미수 임박** — `payment_records` 미수 상위
  6. **어제 매출 요약** — `getCompositeSummary` 전일 대비
- **AI 한 줄 브리핑** — 위 데이터를 Gemini가 자연어 한 문단으로 요약 ("오늘은 발송마감 3건이 급해요. 재고는 CH250 2주 내 품절 예상...")
- 각 항목 클릭 → 해당 페이지 딥링크 (스토어주문/재고/거래처)
- "오늘 브리핑 확인함" 토글 → 당일 재노출 안 함 (localStorage)

### 제외 (다음 사이클)
- 카카오/문자 자동 발송 (초안만, 발송은 수동)
- 음성 브리핑(TTS)
- 자율 발주서 생성 (#5 기획 별도)

## 3. 재활용 자산 (기존 코드)

| 자산 | 위치 | 용도 |
|------|------|------|
| `useSmartAlerts` | `src/hooks/useSmartAlerts.js` | 이상징후+품절+마진 이미 집계 (그대로 확장) |
| `detectAnomalies` | `src/lib/analytics/anomalyDetector.js` | 매출/반품 이상 |
| `getStockCoverageForecast` / `getMarginLeakage` | `src/lib/analytics/advanced.js` | 재고·마진 |
| `getCompositeSummary` | `src/lib/analytics/` | 어제 매출 KPI + 전기 대비 |
| `isOrderPending` / `isOrderDone` | `src/lib/orderStatus.js` | 네이버 미처리 카운트 |
| 네이버 발송마감 stats | `SmartStoreOrders.jsx` `stats` useMemo | overdue/dueD1/dueDday 로직 |
| MOVIS Gemini 호출 | `src/lib/geminiAnalyst.js` | 한 줄 브리핑 생성 |

→ **신규 분석 로직 거의 없음.** 집계 묶기 + 카드 UI + Gemini 요약 1콜이 전부.

## 4. 구현 설계 (How)

### 4-1. 데이터 훅 — `useMorningBriefing.js` (신규)
- `useSmartAlerts` 결과를 받아 **네이버 발송마감 + 미수 임박 + 어제 매출**을 추가 집계
- 네이버 발송마감: `getExternalOrders({limit:200})` → SmartStoreOrders의 `stats` 계산 로직 공용 추출(`src/lib/naverOrderStats.js`)해서 재사용
  - ⚠️ stats 로직을 SmartStoreOrders에서 빼서 공용 모듈화 → 양쪽 1:1 일관 유지 (중복 계산 금지)
- 캐시: 기존 `pos_smart_alerts_v1` 패턴 따라 `pos_morning_briefing_v1` (당일 1회 + 30분 TTL)

### 4-2. AI 한 줄 요약 — Gemini 1콜
- 집계 결과 JSON → `geminiAnalyst`에 "아침 브리핑 톤(간결·실무·우선순위)" 시스템프롬프트로 요약 요청
- **환각 방지**: 도구 결과 숫자만 인용, 새 거래처/제품명 생성 금지 (기존 MOVIS 규칙 재사용)
- 실패/오프라인 시: AI 문장 없이 **숫자 카드만** 표시 (graceful degradation)
- `recordApiCall({ source: 'movis' })` 계측 필수

### 4-3. UI — `MorningBriefingCard.jsx` (신규)
- 대시보드 최상단(`SmartAlertFeed` 위)에 고정
- 상단: 📅 날짜 + "굿모닝, 사장님" + AI 한 줄 브리핑
- 6개 미니 섹션(아이콘+숫자+딥링크), 심각도 색상(긴급 빨강/주의 노랑/정상 초록)
- 우상단 [새로고침] [오늘 확인함 ✓]
- 0건이면 "오늘은 급한 일 없어요 ☕" 초록 카드

### 4-4. 자율성 레벨 (1단계)
- **현재 기획 = 알림형 자율** (AI가 먼저 띄움, 행동은 사장님). 추천 액션 버튼만 제공.
- 2단계(추후): 발송마감 임박 건 **자동 발주확인 큐 등록 제안 → 원클릭 승인**

## 5. 안전장치 / 격리

- DB 변경 **0** (신규 테이블/컬럼 없음) — 읽기 전용 집계
- 메인 번들 영향 최소 — 분석 함수 dynamic import 유지
- Gemini 실패해도 카드 동작 (숫자 폴백)
- 네이버 stats 공용 추출 시 SmartStoreOrders 동작 회귀 주의 → Playwright로 양쪽 카운트 일치 검증

## 6. 작업 분해 (Tasks)

1. `src/lib/naverOrderStats.js` 공용 추출 (SmartStoreOrders stats 로직 이동 + 양쪽 import)
2. `useMorningBriefing.js` — smartAlerts + 네이버 + 미수 + 어제매출 집계
3. Gemini 한 줄 브리핑 함수 (`geminiAnalyst`에 `buildMorningBriefing`)
4. `MorningBriefingCard.jsx` UI + 딥링크
5. Dashboard 최상단 마운트 + "오늘 확인함" 토글
6. Playwright 검증 (네이버 카운트 일치 / Gemini 폴백 / 딥링크)

## 7. 완료 기준 (DoD)

- [ ] 대시보드 진입 시 브리핑 카드 자동 표시 (당일 1회 자동 생성)
- [ ] 6개 섹션 숫자가 각 페이지 실제 값과 일치 (특히 네이버 발송마감 = SmartStoreOrders 위젯과 동일)
- [ ] AI 한 줄 요약 정상(환각 없음) + Gemini 실패 시 숫자 카드 폴백
- [ ] 각 항목 클릭 → 정확한 페이지 딥링크
- [ ] Console 에러 0, 모바일/PC 레이아웃 정상

## 8. 향후 연계 (이 기획 이후)

- #4 매칭 오토파일럿 → 브리핑에서 "AI가 N건 자동확정 대기" 표시
- #5 자동 발주 제안 → 재고 임박 섹션에서 바로 발주서 생성
- 카카오/문자 연동 → 미수 임박·휴면 거래처 메시지 자동 발송
