# 테스트 & 검증 (Testing)
> 핵심 플로우 검증 체크리스트, 모바일 검증, 알려진 이슈
> 관련: [프로젝트 구조](ARCHITECTURE.md) | [변경 이력](CHANGELOG.md)

---

## 검증 체크리스트

### 핵심 플로우
- [x] POS 상품 추가 → 장바구니 → 주문확인 → 저장
- [x] 주문 금액 정상 계산/저장
- [x] 주문내역 날짜 필터 조회
- [x] 대시보드 매출 통계 정상 반영

### 기능별
- [x] 관리자: 상품 추가/수정/삭제/복사, 거래처 관리, 인라인 편집
- [x] 거래처: 상세보기, 블랙리스트, 주문이력, 반품
- [x] 저장 장바구니: 저장/불러오기/삭제/주문전환
- [x] 재고현황: 상품별 재고, 스크롤 정상
- [x] 번웨이 다운파이프: 카드 대시보드, 상세 모달
- [x] 택배 송장: 주소 입력/출력
- [x] AI 주문인식: 텍스트 → 상품 매칭 → 주문

### 모바일 (390x844 기준)
- [x] 모든 풀스크린 페이지 메뉴 버튼 동작
- [x] 사이드바 열기/닫기 (메뉴 버튼 토글)
- [x] 사이드바가 sticky 헤더 위에 정상 표시 (z-[45] > z-40)
- [x] 하단 네비게이션 정상
- [x] 스크롤 잠김 없음
- [x] 번웨이 카드/모달 정상
- [x] 배송 정보 복사 (거래처 관리, 주문 상세)
- [x] 재고 부족 시 주문 허용 (경고만 표시)
- [x] 주문 후 재고 실시간 차감
- [x] 주문 내역 반품 카드 클릭 필터
- [x] 택배 송장 소형 화면 레이아웃 (280px~375px 검증)

---

## 알려진 이슈 / 개선 가능 항목

### 해결된 이슈 (2026-04-09)
- **이중 모달 터치 스크롤**: OrderPage touchmove 전역 차단이 SaveCartModal 등 상위 모달 스크롤 막음 → overflow-y-auto 자동 허용으로 근본 수정
- **신규 고객 주소 누락**: saveOrder에서 auto-register 시 name만 저장 → phone/address 포함
- **AI 학습 데이터 hit_count 중복**: DB +1 후 로컬에서 또 +1 → DB 응답 그대로 사용

### 남은 이슈
- `OrderPage.jsx` (~1000줄) 미사용 레거시 파일 → 삭제 가능
- 스크린샷 PNG 파일 다수 → `.gitignore`에 추가 권장
- `.playwright-cli/` 폴더 → `.gitignore`에 추가 권장

### 보안 이슈 (미수정, 향후 작업)
- **[Critical]** TextAnalyze.jsx:44 - Gemini API 키 Base64 노출 → 즉시 revoke 필요
- **[High]** OrderDetail.jsx, ShippingLabel.jsx - `document.write()` XSS 취약점
- **[Medium]** ~~supabase.js:206 - 미사용 `ADMIN_PASSWORD = '1234'` 잔존~~ (2026-03-31 제거 완료)
- **[Info]** shippingCount와 todayOrderCount가 동일 로직 중복
- Gemini API 키 도메인 제한 설정 필요 (Google Cloud Console)
- WebSocket 재연결 로직 없음 (네트워크 불안정 시)
- 재고 차감 race condition (동시 주문 시)
- docs/ARCHITECTURE.md Props 트리 갱신 필요 (매칭률 72% → CLAUDE.md 분할로 이관됨)

### 향후 개선 아이디어
- 다크 모드 지원
- PWA (오프라인 지원)
- 재고 자동 알림 (Supabase Edge Functions)
- 주문 통계 차트 (일/주/월별)

### 최근 점검 결과 (2026-03-31 전수 검사)
| 항목 | 점수 |
|------|------|
| 코드 품질 | 68/100 |
| 보안 | 22/100 (인증 부재 주요 감점, 내부용이라 실질 리스크 낮음) |
| 설계-구현 일치 | 86% |
| 빌드 | 통과 (에러 0건) |

> 상세 점검 이력은 [CHANGELOG.md](CHANGELOG.md)의 "전수 검사 및 버그 수정" 항목 참조
