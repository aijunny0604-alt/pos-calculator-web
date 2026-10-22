# MOVE POS 웹 배포 — 2026-10-22

## 배포 범위

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
