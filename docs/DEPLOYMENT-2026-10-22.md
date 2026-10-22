# MOVE POS 웹 배포 — 2026-10-22

## 현재 운영 버전

- 최종 웹 배포: **2026-10-22 13:06:50 KST**, Pages `9fb58c1d`.
- 포함: 제품 교체창 안정화·제품명/규격 검색 개선 및 오전 배포의 미발송 상시 모니터링.
- 소스 기능 커밋 `33276dd7`, 후속 검증 문서 커밋 `bedc6311`.
- 전체 테스트 164 통과 / 0 실패 / 1 건너뜀, 운영 파일 12개 일치. 상세는 아래 추가 배포 항목 참조.
- 이후 문서만 변경하는 커밋은 웹 정적 배포 버전을 변경하지 않는다.

## 오전 배포 범위 (11:17:59 KST)

[미발송 상시 모니터링](STORE-MONITORING-2026-10-22.md): 오늘 필터에도 이전 발주확인·내부 등록 미발송 유지, 최신 200건 밖 대기 조회, 집계·필터·발송 대상 통일, 실패 안내와 모바일 배너 보완.

## 배포 전 검증

- 전체 테스트 161 통과, 0 실패, 환경 의존 검사 1건 건너뜀.
- 빌드 성공(57.48초), 코드 diff 검사 통과.
- 로컬 PC/360/768px 확인. 운영 자료 읽기 검증에서 과거 내부 등록 발주확인 1건 유지.
- DB 수정, 실제 발송/취소 요청, Windows 설치 파일 변경 없음.
- 소스 master 및 정적 gh-pages 배포. 기존 정적 자산과 .nojekyll 유지.

## 원격 배포 결과

- 운영: https://aijunny0604-alt.github.io/pos-calculator-web/
- 검증 소스: `d1825dd9` (master 반영).
- 정적 배포: `1de4627c028f70201805d1b6162442ddf864cf01` (gh-pages).
- Pages **built**, 오류 없음, 2026-10-22 11:17:59 KST 갱신.
- 운영 파일 8개 모두 HTTP 200 및 SHA-256 일치.
- 실제 운영에서 오늘(10/22) + 발주확인 선택 시 이전 날짜(10/21) 미발송 1건 유지. 위젯 1건 = 목록 1건, 해제 시 미발송 2건, 다시 선택 시 1건. 오늘 선택 유지 및 콘솔 오류 0건 확인.
- 기존 정적 배포 `6680706e5cd1aa2cbcc5ef5f3ab390baaf7721b3`의 자산은 보존했다. 필요 시 해당 빌드의 루트 파일을 새 커밋으로 복원한다.


| 파일 | SHA-256 |
|---|---|
| `index.html` | `55982e631997284f3c0d8f27f78c68ec9a966c6f80a4415de4a3809ad5c96b8b` |
| `assets/index-C0NF_-dq.js` | `dba48195939c19db994d071bd55d8f82f23393b9c87a5107df4a6b1437c31e39` |
| `assets/SmartStoreOrders-zGNQNjXS.js` | `67c0028b526fb0058bfa9547df4e432411bf0c86ad1767f63898d82b07feb4cb` |
| `assets/InvoicesContainer-B9BY1k91.js` | `7f4bdf9bd304f2a6b65ed402af71dc42573e75836ec80c7f53731ebef6ba9228` |
| `assets/PaymentsContainer-CVCTJpX7.js` | `cbeb935009a41bc0d8c59dac620b35e960c6ea1074cfe5f047ffca54c6fc5d3f` |
| `assets/exportExcel-LtAC9CoZ.js` | `02026b4be474f26ada2c96658763769d5d655a4f714f21745ce62808e3619075` |
| `assets/index-legacy-BJzjuTNX.js` | `4ddf243ef932d3e3eb03aa15e0e29abf5596a225e5515f73af00cff03df10aab` |
| `assets/index-Cly5xELr.css` | `96e9700563087e70eec6303fca2dbbc1a2986c850cffb3704ff9371aad474266` |

## 추가 배포: 제품 교체창·검색 개선 (13:06:50 KST)

- 소스 커밋: `33276dd7` (master).
- 정적 배포: `9fb58c1dc622d163d0e347dbb5c0f744375b160e` (gh-pages).
- GitHub Pages `built`, 오류 없음. 2026-10-22 04:06:50 UTC 완료.
- 전체 자동 테스트 164 통과 / 0 실패 / 선택적 MOVIS 서버 검사 1 건너뜀.
- 빌드 54.45초 성공. 기존 큰 번들 경고만 유지.
- 결과 0/1/40건 교체창 크기 동일, 360×450 내부 스크롤·취소 접근·Escape 부모 유지 재검증.
- 목록/카드 보기와 카테고리 필터 조합 정상. 모바일 및 태블릿 검증은 브라우저 뷰포트 기준, 실제 iOS 키보드 미검증.
- 운영 674개 상품에서 플랜지 64 / 64플랜지 → 동일한 근접 규격 4개, H64/X64/CH 무관 상품 제외. 자바라 64 → 정확 규격 3개. 오류 로그 없음.
- 운영 파일 12개 모두 HTTP 200 및 SHA-256 일치. 실제 주문 저장·재고 변경 없이 조회 검증.
- 이전 정적 자산 보존. 롤백 기준 `1de4627c028f70201805d1b6162442ddf864cf01`.

| 파일 | SHA-256 |
|---|---|
| `index.html` | `474a461a1ed993c91e0724fd04b1edec4410e42bcb0dec93d2192cf254770ca7` |
| `assets/polyfills-BuIMzCmj.js` | `540b5fa7c6a9c558b2ea322d7b89f9220b794ead829d543caae094397f689664` |
| `assets/index-I-Hqo1ZG.js` | `197390db8690995391fe92611382a1bb738de093dbbf5062973c1137c762e04a` |
| `assets/sentry-CsY0hej4.js` | `9fe0c4b368b1ed7dfdac2b86d2a6b56090fd9dc588812de1da8d6ca376923946` |
| `assets/react-core-C_nVshIL.js` | `c592fa79fa78914144b4b049a63308302fa81b9534bc14a82c4c3c428f505880` |
| `assets/supabase-js-CfVawArw.js` | `fc41fe3db7dd2cf6b87087b7c2ef0dce8f46d1d4f4f45e39e188e6d3964a76cd` |
| `assets/index-BKtfIJpI.css` | `5ec422e3078d021f8f8569c964ac4686c0a327608085a13bc769caebd1a723e1` |
| `assets/polyfills-legacy-D6nrY_rc.js` | `4905f7be8d3ff03eab0c6d7588def3b70d858ffe2097005dd6a86b9d2dcfedcd` |
| `assets/index-legacy-D7-ye0dh.js` | `4c15edce7b78f665dd4a2a6561adc671c5511b9105de25822c800fa596c3518c` |
| `assets/SmartStoreOrders-C8ACTXkd.js` | `df3ce145949e6321f5fc0b8d353efe6de5e3f894d962ec2de8166d0620cdbf92` |
| `assets/InvoicesContainer-B4UlFC0x.js` | `7708f1e9d21e7a13c20108d8875e0cab2d5a7ebc14eb981aecf19d7891eb4b8b` |
| `assets/PaymentsContainer-BTGakU4o.js` | `0fdf3e80040677782eb2c20c79aba471260ed437de134846f85c9208c2a0b11b` |


## 추가 배포: 스토어 발송 반응성·무비스·업체 검색 (15:24:23 KST)

- 기능 소스 `9ee550a4`, 정적 배포 `4dc2964ffd5c974b591f95b3c8b9259b5539fcf9`.
- GitHub Pages built, 오류 없음. 2026-10-22 06:24:23 UTC 완료.
- 전체 172 통과 / 0 실패 / MOVIS_TEST_URL 미지정 1 건너뜀. 최종 빌드 56.45초 성공. 기존 큰 번들/unknown minify 옵션 경고 유지.
- 운영 자산 14개 모두 HTTP 200·SHA-256 일치. 스토어 배송중 표시, 상시 모션 data-move-motion=always, 스토어 콘솔 오류 없음 확인.
- 실제 주문/결제/발송 쓰기 없이 샘플 전환과 운영 읽기 전용으로 검증. 실제 네이버 발송 처리 주기는 이번 웹 배포로 바꾸지 않았다.
- [발송 검증](STORE-DISPATCH-LIVE-2026-10-22.md), [업체 검색·전체 모션·무비스](CUSTOMER-SEARCH-MOTION-2026-10-22.md).
- 이전 정적 자산 보존. 롤백 기준 `9fb58c1dc622d163d0e347dbb5c0f744375b160e`.

| 파일 | SHA-256 |
|---|---|
| `index.html` | `11f81b016e90954388f5d26d8639e393ac5e82cd035797860652960b027de305` |
| `assets/polyfills-BuIMzCmj.js` | `540b5fa7c6a9c558b2ea322d7b89f9220b794ead829d543caae094397f689664` |
| `assets/index-c1vj71vW.js` | `886d600bfc7cb828445972cd36da6bcdb363711c7274a513165f193129d15305` |
| `assets/sentry-CsY0hej4.js` | `9fe0c4b368b1ed7dfdac2b86d2a6b56090fd9dc588812de1da8d6ca376923946` |
| `assets/react-core-C_nVshIL.js` | `c592fa79fa78914144b4b049a63308302fa81b9534bc14a82c4c3c428f505880` |
| `assets/supabase-js-CfVawArw.js` | `fc41fe3db7dd2cf6b87087b7c2ef0dce8f46d1d4f4f45e39e188e6d3964a76cd` |
| `assets/index-C0x6n5Di.css` | `66914b758b36797aae3e48df296db290fe9dc6d9197aa443f3fa2deaf702d776` |
| `assets/polyfills-legacy-D6nrY_rc.js` | `4905f7be8d3ff03eab0c6d7588def3b70d858ffe2097005dd6a86b9d2dcfedcd` |
| `assets/index-legacy-CUkfb-MG.js` | `cfe4454f0fcafdceb49b423a477d711665afcfe28863f516fcfdf823eb9a75a2` |
| `assets/AIAnalytics-5VAxSXD6.css` | `e44123ffe25b8258cb5186b8adede7687c5cf1deacd3e9849a07b987f0fb2ed7` |
| `assets/AIAnalytics-CPRifuZg.js` | `e11c0393030af25b018ad9db30232a3efc758f5cda664bc6e4d2569b67f004aa` |
| `assets/InvoicesContainer-DGDWT7t9.js` | `d9804801da1700103261ee3b9dfba155dd97fd59c79aca22815f67ab09d1d9a2` |
| `assets/PaymentsContainer-2X-e7bwM.js` | `1df540aba609317778fb20c23337c89079b24ed6c73ee3d4f140e7a8832330fc` |
| `assets/SmartStoreOrders-D-VKJxF6.js` | `9297c36ff1534ca3bd73b5208376ffaea641c88dbe3de5f60ec3e59daa82b0cd` |
