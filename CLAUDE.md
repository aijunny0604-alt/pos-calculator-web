# POS Calculator Web

> 마지막 업데이트: 2026-04-07
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase.

## 빌드/배포

```bash
npm run dev              # 개발 서버
npx vite build           # 빌드 (--base 플래그 절대 금지!)
npx gh-pages -d dist     # GitHub Pages 배포
```

> `vite.config.js`에 `base: '/pos-calculator-web/'` 설정됨. `--base` 사용 시 빈 페이지 발생.

## 핵심 규칙

- **제품명 표시**: `truncate` 금지, `break-words leading-snug` 사용 (모바일 전체 표시)
- **날짜 계산**: `+09:00` + `toISOString()` 조합 금지, `offsetDateKST()` 사용
- **새 제품 추가**: `supabase.addProduct(POST)` 사용. `saveProduct`은 id 있으면 PATCH
- **주문 저장**: 같은 고객 당일 주문 자동 병합. WebSocket 실시간 반영
- **AI 학습**: 주문인식 수동 교정 시 자동 학습 → 다음 인식에 반영 (3중: DB → Gemini 프롬프트 → 패턴 매칭)

## Supabase

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 테이블: orders, products, customers, customer_returns, saved_carts, ai_learning
- 관리자 비밀번호: `4321`

## 상세 문서

| 문서 | 내용 |
|------|------|
| [프로젝트 구조](docs/ARCHITECTURE.md) | 파일 구조, 아키텍처 패턴, Props 연결 |
| [데이터베이스](docs/DATABASE.md) | Supabase 연결, 테이블 스키마, API 래퍼 |
| [변경 이력](docs/CHANGELOG.md) | 날짜별 구현/수정 사항 |
| [스타일 가이드](docs/STYLE-GUIDE.md) | CSS 변수, 반응형, z-index 계층 |
| [테스트/이슈](docs/TESTING.md) | 검증 체크리스트, 알려진 이슈 |

## 원본 프로젝트

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
