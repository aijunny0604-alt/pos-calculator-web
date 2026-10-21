# MOVE POS 웹 배포 — 2026-10-21

사용자 요청에 따라 검증된 프런트엔드 수정과 관련 문서를 배포했다. GitHub Pages 빌드 성공과 운영 파일 일치를 확인했다.

## 포함 범위

- [스마트스토어 위젯](STORE-WIDGET-AUDIT-2026-10-21.md): 조회 범위·상태 집계와 클릭 필터 통합, 단계 재클릭 해제, 완료/클레임 구분, 상품별 네이버 배송중/완료 반영.
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

## 최종 원격 확인

- 운영: https://aijunny0604-alt.github.io/pos-calculator-web/
- 검증 소스: `b3480b0af8981ca0ca58423be2f4a84178002864` (`master` 반영).
- 정적 배포: `6680706e5cd1aa2cbcc5ef5f3ab390baaf7721b3` (`gh-pages`).
- GitHub Pages **built**, 오류 없음. 2026-10-21 19:10:12 KST 갱신.
- 운영 HTML·JS/CSS·스토어/명세서/결제/Excel 지연 로딩 파일 **8개 모두 HTTP 200 및 SHA-256 일치**.
- 개발 미리보기 HTML 및 샘플 자료는 프로덕션 빌드에서 제외했다.
- 실제 운영 화면에서 **배송중 위젯 2건 → 조회 목록 2건** 확인. 목록의 상태도 배송중으로 표시된다. 콘솔 오류 0건. 주문/발송/입금은 변경하지 않았다.
- 이전 운영 배포 `2e2c967b`의 정적 자산은 보존했다. 필요 시 해당 빌드의 루트 파일을 새 커밋으로 복원한다.

1차 배포 `8cb436f2` 검증 과정에서 대표 주문의 로컬 shipped 값과 상품별 네이버 상태 차이를 발견해 추가 수정했다. 원본 DB 상태는 유지하면서 위젯·카드/목록·스텝퍼·CSV 표시를 함께 보완했다. 일부 상품만 완료되거나 상태가 누락된 경우 전체 완료로 올리지 않는 회귀 테스트를 추가했다.

| 파일 | SHA-256 |
|---|---|
| `index.html` | `76d5939826b2d09663201075c094cd1c1793a1224a7e47296b8eebf61cf3c3c1` |
| `assets/index-Btw3RIkS.js` | `38201e71de620585368c2ee7fc5f02fa0ad48ba29be837967ad04fb100b307e3` |
| `assets/index-B1p5nuSR.css` | `ac8094c20593fc4716999861a081d2d84805994549fb8b4049c5a65c6b7c6469` |
| `assets/index-legacy-BddROw2N.js` | `d3ba0cec965ec284a9a2d90185003aa77b5dab8d6f9bd827307cb70987f88162` |
| `assets/SmartStoreOrders-B5cBtRMV.js` | `4fec7d2f6587aefe498a3042cb561dd78d887e52dac606d6f9fb117370ddfb30` |
| `assets/InvoicesContainer-1DSTH0-v.js` | `00b41663947a6decd4a4298534f7769369d8623568bc281805111528d2c56511` |
| `assets/PaymentsContainer-BIwIy3PE.js` | `d2a6082d5b0fdea998d8ab05441b267c23b5226473cbe28ab31eeacc2198818c` |
| `assets/exportExcel-D3-aRgm_.js` | `f47282df488d57b98e9e63cf23b8ed3d360456400840a3438730ed32480b7c40` |
