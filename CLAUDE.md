# POS Calculator Web

> 마지막 업데이트: 2026-04-23
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry.

## 🆕 v2026-04-23 주요 변경 — 명세서·결제 UX 대개편

- **거래명세서 모던 양식**: 전통 격자 → 공급자/공급받는자 2단 + 대형 합계 배너 + 줄무늬 품목 테이블. `규격` 컬럼 제거
- **미수 업체 원클릭 리스트**: 좌측 사이드바에 76개 미수 업체 내림차순 표시, 클릭 한 번으로 해당 업체 명세서 즉시 전환
- **이월 날짜 드로어**: 기본 접힘, 체크된 날짜만 본문/PNG/인쇄에 포함 (69일 중 선택)
- **페이먼트 → 거래처 관리 통합**: 사이드바 `페이먼트` 메뉴 제거, 거래처 관리 페이지 상단 탭으로 흡수
- **주문 카드에 결제 임베드**: 업체 상세의 각 주문 카드에 [미수/부분/완납] 배지 + 잔금 + 입금 이력 + [💵 입금 등록] 버튼

## 🗂️ v2026-04-20 이전 변경

- **OrderDetail 모달**: 드래그 이동 + 8방향 리사이즈 + 더블클릭 전체화면 (데스크톱 전용, 모바일은 기존 중앙 유지)
- **OrderHistory/OrderDetail**: 수동 완불 체크 기능 (카드/현금/계좌이체/기타) — **pos-payments와 localStorage 공유**
- **4개 모달 드래그/리사이즈 적용**: SaveCartModal, QuickCalculator, NotificationSettings, ShippingLabel 부속 모달
- **접근성**: `prefers-reduced-motion` 대응 + `focus-visible` 포커스 링 통일
- 신규 훅: `src/hooks/useDraggableResizable.jsx`, `src/hooks/useManualPaid.js`

## 빌드/배포

```bash
npm run dev              # 개발 서버
npx vite build           # 빌드 (--base 플래그 절대 금지!)
npx gh-pages -d dist     # GitHub Pages 배포
```

> `vite.config.js`에 `base: '/pos-calculator-web/'` 설정됨. `--base` 사용 시 빈 페이지 발생.

## 핵심 규칙

- **텍스트 표시**: `truncate` 금지. 제품명/메모는 `break-words leading-snug`, 한국어 주소/이름은 `break-keep leading-snug` 사용. flex 자식에는 `min-w-0`, 아이콘/버튼은 `flex-shrink-0` 필수
- **날짜 계산**: `+09:00` + `toISOString()` 조합 금지, `offsetDateKST()` 사용
- **새 제품 추가**: `supabase.addProduct(POST)` 사용. `saveProduct`은 id 있으면 PATCH
- **주문 저장**: 같은 고객 당일 주문 자동 병합. WebSocket 실시간 반영
- **AI 학습**: 주문인식 수동 교정 시 자동 학습 → 다음 인식에 반영 (3중: DB → Gemini 프롬프트 → 패턴 매칭)

## Supabase

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 테이블: orders, products, customers, customer_returns, saved_carts, ai_learning
- 관리자 비밀번호: `4321`
- **orders 주의**: `updated_at`, `status` 컬럼 없음. PATCH 시 미존재 컬럼 포함하면 PGRST204로 전체 실패
- **customer_returns 주의**: PK는 `id`(bigint auto), 삭제 시 `return_id`(text) 사용

## 상세 문서

| 문서 | 내용 |
|------|------|
| [프로젝트 구조](docs/ARCHITECTURE.md) | 파일 구조, 아키텍처 패턴, Props 연결 |
| [데이터베이스](docs/DATABASE.md) | Supabase 연결, 테이블 스키마, API 래퍼 |
| [변경 이력](docs/CHANGELOG.md) | 날짜별 구현/수정 사항 |
| [스타일 가이드](docs/STYLE-GUIDE.md) | CSS 변수, 반응형, z-index 계층 |
| [테스트/이슈](docs/TESTING.md) | 검증 체크리스트, 알려진 이슈 |
| [보안 설정](docs/SECURITY-SETUP.md) | API 키 referrer 제한, Vite 포트 가이드 |

## 원본 프로젝트

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
