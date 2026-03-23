# 코드 분석 보고서 (code-analyzer)

> 분석일: 2026-03-23 | 품질 점수: 72/100

## Critical 이슈

| # | 파일:라인 | 이슈 | 상태 |
|---|-----------|------|------|
| 1 | `CustomerList.jsx:142` | onUpdateOrder 시그니처 불일치 → 반품 DB 미반영 | ✅ 수정 완료 |
| 2 | `TextAnalyze.jsx:45`, `AdminPage.jsx:1881` | Gemini API 키 Base64 노출 | 사용자 유지 결정 |
| 3 | `AdminPage.jsx:386-388` | retail/stock/min_stock null → DB 400 에러 | ✅ 수정 완료 |
| 4 | `supabase.js:69-76` | addProduct id 미생성 → 앱 크래시 | ✅ 수정 완료 |

## Warning 이슈

| # | 파일:라인 | 이슈 | 상태 |
|---|-----------|------|------|
| 1 | `App.jsx:452` | saveOrder useCallback deps 누락 (deductStock, setCartWithHistory) | 미수정 (동작에 큰 영향 없음) |
| 2 | `App.jsx:302-318` | shippingCount == todayOrderCount 중복 로직 | 미수정 |
| 3 | `AdminPage.jsx:896` | CustomersTab saved null 체크 누락 | ✅ 수정 완료 |
| 4 | `AdminPage.jsx:18` | 관리자 비밀번호 '4321' 하드코딩 | 사용자 유지 결정 |

## 양호한 점
- API 최적화 3가지 정상 구현 (쓰로틀링/폴링/WS 개별 반영)
- escapeHtml() 인쇄 함수에 적용 확인
- React 자동 XSS 방어 활용
- 오프라인 폴백 (priceData) 정상
