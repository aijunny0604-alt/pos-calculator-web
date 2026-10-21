# MOVE POS 웹 배포 — 2026-10-21

사용자 요청에 따라 검증된 프런트엔드 수정과 관련 문서를 배포했다. GitHub Pages 빌드 성공과 운영 파일 일치를 확인했다.

## 포함 범위

- [스마트스토어 위젯](STORE-WIDGET-AUDIT-2026-10-21.md): 조회 범위·상태 집계와 클릭 필터 통합, 단계 재클릭 해제, 완료/클레임 구분.
- [주문 카드 할인 표시](ORDER-DISCOUNT-CARD-2026-10-21.md): 기존 청록색 톤의 작은 할인 배지, 이전 금액 취소선과 차감액 표시.
- [명세서·입출금](INVOICE-LEDGER-AUDIT-2026-10-21.md): 선입금 이월, 수기 원장 표시, 조회 누락/실패 처리, 업체별 잔액, 완불 저장 결과 검증과 불일치 출력 차단. 이전 점검에서 검증한 프런트엔드 수정 포함.

## 배포 전 확인

- 전체 테스트 **156 통과 / 0 실패 / 1 건너뜀**. 별도 MOVIS 브리지 환경 검사는 미설정으로 건너뜀.
- `npm run build` 성공(56.64초), `git diff --check` 통과. 기존 청크 크기/import 혼용/minify 옵션 경고는 남아 있다.
- 할인 배지 1280/768/360px 확인. 스토어 위젯의 실제 클릭·해제·마켓·검색 및 모바일 360px 확인.
- 운영 자료 GET 확인만 수행. 운영 입금/주문/발송/취소를 테스트로 변경하지 않았다.
- 소스 `master`, 정적 파일 `gh-pages` 루트. `.nojekyll` 포함, 이전 해시 자산 보존.

## 적용 한계

과거 주문/원장 불일치 3건과 원장 없는 완불 표시 4건은 증빙 확인 후 별도 정정이 필요하다. 서버 요청 중복 방지·동시 배분·다중 요청 트랜잭션도 이번 웹 배포로 해결하지 않는다. SQL/운영 장부 정정이나 네이버 동기화 브리지 변경은 포함하지 않는다.

Windows 설치 ZIP 및 이미 설치한 로컬 정적 파일은 이번 GitHub Pages 배포와 별개다. 웹 사용자는 새로고침 후 이용한다.

## 1차 원격 확인 (상품별 배송 상태 추가 보완 전)

- 운영: https://aijunny0604-alt.github.io/pos-calculator-web/
- 검증 소스 커밋: `4f1dd02a` (`master` 반영).
- 정적 배포 커밋: `8cb436f29e821f041347bf0b598cd6bf80c6b6e8` (`gh-pages`).
- 이전 정적 배포: `2e2c967b`. 문제가 확인되면 이 빌드의 루트 파일을 새 커밋으로 복원할 수 있다.
- GitHub Pages: **built**, 오류 없음. 2026-10-21 19:03:47 KST 갱신.
- 운영 HTML·주요 JS/CSS·명세서/결제/스토어/Excel 지연 로딩 파일 **8개 모두 HTTP 200 및 SHA-256 일치**.
- 개발 미리보기 HTML과 샘플 자료는 이번 `dist`에 포함되지 않았음을 확인했다.

| 파일 | SHA-256 |
|---|---|
| `index.html` | `3d1dea4c6f36758d2202fe4d5f1190372498c7e6986d3c49d7ea1593ba883f15` |
| `assets/index-6RhC9DTi.js` | `6eb3f7a344c47325a52005ff35d78920432d9a2bdbd7c919233fc13c3d7f4494` |
| `assets/index-B1p5nuSR.css` | `ac8094c20593fc4716999861a081d2d84805994549fb8b4049c5a65c6b7c6469` |
| `assets/index-legacy-C-chmNNK.js` | `9739612903615a5be7246525360439cfdec0e0a41385961bca98731c86e13f5f` |
| `assets/SmartStoreOrders-DpMuNvxD.js` | `c6b52d9fd2814117af25011e3ec9ab557d7af4b0def9de4cdd74e350a13acff0` |
| `assets/InvoicesContainer-0JQDuUgM.js` | `8d424f2c4fae341c9c33a38ca860edb37fbeede0a16fb2cbcb70c6629ff6bd7c` |
| `assets/PaymentsContainer-Du7XcxRa.js` | `160c672f4bbd5f55b46a944970fc1303d960302433804ec905c914b8d31aa9b0` |
| `assets/exportExcel-BuuQHKiW.js` | `02f826eda21a54e1d08de2878ff70c14988a31a1255e373cfbeae29abced37f2` |


## 최종 추가 보완

운영 화면에서 대표 주문 `shipped`와 상품별 네이버 배송중 상태의 차이를 발견했다. 상품별 상태를 위젯·목록·스텝퍼·CSV에 반영하고 부분 배송/상태 누락을 검사하는 2개 테스트를 추가했다. 최종 전체 테스트는 156 통과 / 0 실패 / 1 건너뜀이다. 후속 배포 및 라이브 일치 확인은 아래에 기록한다.
