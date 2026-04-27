# POS Calculator Web

> 마지막 업데이트: 2026-04-23 (2차)
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry.

## 🆕 v2026-04-23 (2차) — Phase 9 Cross-navigation + 입금 모달 리디자인 + 데이터 품질 가드

- **명세서 Phase 9 Cross-navigation** (`InvoicesContainer.jsx` 신규): 명세서 페이지의 각 업체 섹션에 `💵 입금 받기` / `💰 일괄 입금` / `👁 업체 상세` 액션 바. 거래처 관리의 `CustomerDetailModal`에는 `📄 명세서 발행하기` 버튼 → 해당 업체 자동 선택된 명세서로 점프. 페이지 이동 없이 양방향 통합
- **명세서 UX**: 업체 선택 시 그 업체 이월 날짜가 **체크박스 옆에 인라인 펼침**, Sticky 헤더 + ▲/▼ 접기 토글, 레이아웃 `max-w-[1600px]` + 폰트/패딩 확대, 테이블 행 **✏️ 수정 / ✕ 제외** 버튼 (localStorage 오버라이드, 원본 DB 무영향), 단가 0원 행 자동 빨간 하이라이트
- **입금 모달 리디자인** (`PaymentRegisterModal.jsx`): `max-w-md` → `max-w-2xl`, **1/2/3 단계 숫자 뱃지**, 전액/절반/+10만/+50만/+100만 빠른 금액 버튼, 대형 결제 방법 버튼, **과세/비과세 토글 + 택배비/퀵비/수수료 동적 부가 항목 + 💹 실시간 합계 모니터링 카드**. 저장 시 memo에 `[비과세][택배비 5,000원]...` 태그 prepend (DB 스키마 무변경)
- **CustomerDetailModal**: StatBox 라벨 `받을 돈(미수)/전체 주문/받은 횟수` + 힌트 1줄, 숫자+단위 인라인 한 줄, 일괄 입금은 `▶ 고급: 월말 정산용` details 접힘으로 강등
- **데이터 품질 가드 (1단계)**: `MainPOS.addToCart`에서 wholesale·retail 둘 다 0원이면 카트 담기 거부. `App.saveOrder`에서 price 누락/0원 item 발견 시 confirm 경고. `formatPrice` NaN-safe. `CustomerList` 주문 상세 모달에 `item.price ?? wholesale ?? retail ?? 0` 폴백 + "⚠️ 단가 누락" 배지
- **기타 UI**: `OrderDetail` 확대/X 버튼 그룹화(딱 붙음), `SavedCarts` 도매/소비자 배지 타이틀 옆 정렬

## 🆕 v2026-04-23 (1차) — 명세서·결제 UX 대개편

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
- **가격 0원 방어**: 카트 담기·주문 저장 전 `wholesale/retail/price > 0` 검증 필수. `formatPrice`는 NaN-safe (모든 비유한수 → '0'). 명세서 등 소비자 표시에서는 `price ?? wholesale ?? retail ?? 0` 폴백 체인 사용
- **명세서 수동 수정**: 원본 `orders.items`는 절대 건드리지 않음. 명세서 한정 조정은 localStorage 키 `pos_invoice_line_overrides_v1`에 `{ [recordId:itemIndex]: {name, qty, unitWithVat, deleted} }` 형태로 저장
- **입금 확장 필드**: `payment_history`에 컬럼 추가 대신 `memo` 앞에 `[과세/비과세][택배비 N원][퀵비 N원]` 태그 prepend. 집계 필요 시 DB 컬럼(`is_vat_exempt`, `extra_fees JSONB`)으로 승격 예정
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
