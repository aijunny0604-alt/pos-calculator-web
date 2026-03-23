# 보안 감사 보고서 (security-architect)

> 감사일: 2026-03-23 | 보안 점수: 22/100

## Critical (2건)

### C-01. Gemini API 키 클라이언트 노출
- **파일**: `TextAnalyze.jsx:45`, `AdminPage.jsx:1881`
- **내용**: Base64 인코딩된 API 키가 번들에 포함. 누구나 추출 가능
- **조치**: 사용자가 현 상태 유지 결정. 추후 서버 프록시 전환 권장

### C-02. 관리자 비밀번호 하드코딩
- **파일**: `AdminPage.jsx:18`
- **내용**: `ADMIN_PASSWORD = '4321'` 평문 비교. 브루트포스 무방어
- **조치**: 사용자가 현 상태 유지 결정

## High (3건)

### H-01. addProduct ID 레이스 컨디션
- **파일**: `supabase.js:69-76`
- **내용**: max(id)+1 방식은 동시 호출 시 PK 충돌 가능
- **위험도**: 단일 사용자 환경이므로 실질 위험 낮음

### H-02. PostgREST 필터 인젝션
- **파일**: `supabase.js` 전역 (50, 58, 85행 등)
- **내용**: id 파라미터가 URL에 검증 없이 삽입
- **조치**: `encodeURIComponent(id)` 적용 권장

### H-03. document.write() 사용
- **파일**: `OrderDetail.jsx:371`, `ShippingLabel.jsx:584`
- **내용**: escapeHtml() 적용되어 현재 XSS 위험 낮음
- **조치**: 장기적으로 iframe.srcdoc 패턴 전환 권장

## 이전 대비 개선사항
- ✅ `supabase.js`의 `ADMIN_PASSWORD = '1234'` 제거 완료
- ✅ 제품/거래처 저장 시 null 체크 추가
