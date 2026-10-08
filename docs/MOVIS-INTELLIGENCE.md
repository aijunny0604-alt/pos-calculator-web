# MOVIS Intelligence v2

MOVIS는 매장 PC에서 실행되는 Codex App Server를 통해 ChatGPT 구독 사용량으로 작동합니다. 기본 모델은 `gpt-6-astra`, 추론 강도는 지원 시 `high`입니다. 다른 모델로 자동 전환하거나 API 키로 과금하지 않습니다.

## 실행

Node.js와 Codex 데스크톱 앱이 설치된 PC에서 `Start-MOVIS.cmd`를 실행합니다. 소스 체크아웃에서는 먼저 `npm ci`, `npm run build`를 실행하세요. 빌드된 배포 패키지는 추가 패키지 설치 없이 실행할 수 있습니다.

프로그램은 `http://127.0.0.1:43127/pos-calculator-web/`에서 열립니다. 기존 POS와 같은 Supabase 데이터를 사용합니다. localhost는 기존 GitHub Pages와 브라우저 저장 공간이 다르므로 로컬 전용 대화·기기 설정은 자동으로 옮겨지지 않습니다.

상단 **Codex 연결**에서 계정 연결, 모델, 남은 한도를 확인합니다. 최초 실행은 현재 PC의 Codex 로그인 캐시를 별도 런타임에 재사용합니다. 연결이 만료되면 **ChatGPT 로그인 → 로그인 창 열기 → 연결 새로고침**을 누르세요. API 키 로그인은 허용하지 않습니다. 토큰과 런타임 로그는 `.movis-runtime/`에만 저장되며 Git이나 배포 ZIP에 포함하지 않습니다.

브리지는 IPv4 loopback에만 바인딩합니다. 허용된 웹 Origin, 임의 세션 토큰, Host 검사로 연결을 제한합니다. GitHub Pages에서 새 버전을 배포해 사용할 때도 같은 PC의 브리지가 켜져 있어야 하며, 브라우저가 요청하면 로컬 네트워크 접근을 허용해야 합니다. 휴대폰에서 매장 PC로 원격 접속하는 기능은 포함하지 않습니다.

## 지능과 자료

- 모델이 제공된 POS 도구를 선택하고 결과를 바탕으로 다음 조회를 이어갑니다. 이전의 키워드 기반 강제 분기, 답변에서 주문을 합성하는 코드, 가짜 검색 답변은 제거했습니다.
- 서버가 살아 있는 동안 Codex 대화 상태를 유지합니다. 재시작·모델 변경 시 화면의 최근 대화(최대 200개, 전송 크기 상한 내)를 배경 자료로 전달합니다. 무제한 장기 기억을 보장하지 않습니다.
- 요청마다 POS 22개 테이블을 페이지 단위로 새로 읽습니다. 최대 50,000행에서 멈추면 부분 자료로 표시합니다. 저장소는 별도 `listImageFiles`로 폴더별 조회하므로 총 23개 자료 범주가 제공됩니다.
- 상품, 거래처, 판매 주문, 견적, 매입 발주, 매입 단가, 입금·미수, 반품, 스마트스토어, 사업자등록증, 매입 증빙, 공급처 원장, 포장, 완불 표시, 주문 감사 기록, 운영 설정, 이미지 파일을 조회할 수 있습니다.
- `inspectLibraryImage`는 실제 조회한 POS 레코드/이미지 저장소에 존재하는 HTTPS 이미지만 모델에 전달합니다. 사진 첨부는 5MB 이하 JPG·PNG·WebP입니다. PDF 원문 추출과 PC 문서 폴더 탐색은 포함하지 않습니다.
- 셸·파일 수정·개발 플러그인은 무비스 런타임에서 끕니다. 업무 도구의 쓰기는 기존 POS 확인창에서만 수행합니다.

## 오류 방지와 한계

1. 도구 인자의 자료형·필수값·범위와 업무 목적을 검사합니다. 발주를 재고 증가/판매로 바꿔 실행할 수 없습니다.
2. 원본 조회 없는 변경 미리보기, 중복 대상, 음수 재고, 잘못된 수량, 단가×수량과 총액 불일치를 거부합니다.
3. `verifyWork`는 도구 실패·조회 근거·자료 누락·대기 변경을 점검합니다. 답변 아래에서 실제 결과를 펼쳐볼 수 있습니다. 이는 AI가 쓴 모든 문장의 사실 정확성 보증이 아닙니다.
4. 확인 클릭 시 대상 재고·가격·거래처·주문을 다시 조회하여 미리보기 당시 값과 다르면 중단합니다. 같은 화면에서 중복 클릭을 막습니다.
5. 기존 Supabase 쓰기 API를 사용하므로 실행 전 검사와 DB 저장 사이의 다른 기기 변경까지 원자적으로 막는 것은 아닙니다. 여러 테이블에 걸친 완전한 트랜잭션·전역 idempotency는 별도 DB 마이그레이션이 필요합니다.
6. 실제 운영 데이터에 쓰는 테스트는 하지 않았습니다. 실제 데이터는 읽기 연결만 확인하고 변경 시나리오는 가상 데이터의 미리보기까지만 검증했습니다.

브라우저 기본 TTS, 자동 음성 전송, MOVIS 효과음은 제거했습니다. 고품질 음성 API를 몰래 추가하지 않습니다.

## 검증 명령

```powershell
npm run test:movis
npm run build
npm run movis
$env:MOVIS_TEST_URL = 'http://127.0.0.1:43127/api/movis'
npm run test:movis
```

`tests/movis-live.mjs`, `tests/movis-write-preview.mjs`, `tests/movis-vision.mjs`는 실제 구독 사용량을 소비하는 명시적 통합 테스트입니다. `tests/movis-library-audit.mjs`는 실제 POS를 읽고 건수·상태만 기록합니다. `tests/movis-browser.mjs`와 `tests/movis-ui-interactions.mjs`는 기존 Playwright 설치로 UI/응답/취소/HTML 주입 방어를 검사합니다. 기본 회귀 테스트는 AI 사용량을 소비하지 않습니다.

## 참고

- [OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [ChatGPT 구독 인증](https://learn.chatgpt.com/docs/auth)

App Server의 dynamic tools는 실험 기능입니다. Codex 업데이트 이후 연결이 바뀌면 위 회귀 테스트와 샘플 통합 테스트를 다시 실행하세요.
