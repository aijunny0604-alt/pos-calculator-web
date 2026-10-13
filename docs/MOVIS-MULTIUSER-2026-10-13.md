# 사용자별 ChatGPT 구독 연결

2026-10-13 사용자 결정: 각 사용자가 본인의 ChatGPT 계정과 구독을 사용한다. 대표자 계정 공유 방식은 사용하지 않는다.

## 현재 제공 가능한 Windows 설치

배포 ZIP에는 인증정보를 포함하지 않는다. 다른 PC에서 Node.js LTS와 Codex 데스크톱 앱을 준비한 뒤 ZIP 전체를 풀고 Install-MOVIS.cmd를 실행한다. 현재 Windows 사용자의 LocalAppData에 설치하고 바탕화면 MOVE POS 및 로그인 시 자동 연결 바로가기를 만든다. 관리자 권한을 요구하지 않는다.

각 PC는 해당 Windows 사용자의 로컬 인증을 사용한다. 첫 연결 또는 인증 만료 시 본인의 ChatGPT 계정으로 로그인한다. 이는 여러 사람이 한 Windows 계정을 공유하는 환경에서 사용자별 격리를 보장하는 기능은 아니다.

## 모바일 웹·다중 사용자 서버의 차단 조건

현 브리지는 단일 로컬 계정을 위한 구조다. 전역 CodexClient, 작업 상태, 인증 토큰을 사용하므로 외부에 공개해서 여러 사용자를 연결해서는 안 된다.

공식 Sign in with ChatGPT 문서에서 웹/호스팅형 구독 사용은 승인된 파트너 범위로 안내된다. 일반 로그인용 OAuth client ID만으로 구독 사용 권한이 생기는 것도 아니다. 이 저장소에는 승인된 MOVIS OAuth 등록과 호스팅형 구독 사용 구성이 없다. 따라서 모바일 서비스 연결은 미완료다.

필수 외부 준비:
1. MOVIS 앱의 Sign in with ChatGPT 등록 및 호스팅형 ChatGPT plan usage 승인.
2. 승인된 client ID, 정확한 HTTPS callback URL, 인증 방식·허용 scope.
3. 사용자 인증 및 비밀정보를 보관할 백엔드와 고정 HTTPS 주소.

승인 뒤 구현할 서버 요구사항:
- state·nonce·PKCE를 브라우저 세션에 묶고 만료 및 일회 소비를 보장한다.
- 서명·issuer·audience·nonce 검증 후 사용자와 workspace를 식별한다.
- ChatGPT 로그인 신원과 POS 매장 접근 권한은 별도로 확인한다. 로그인했다고 공용 POS 자료를 자동 개방하지 않는다.
- 사용자별 인증 저장소, 작업·대화·사용량·모델 설정을 분리한다. OpenAI 인증정보는 브라우저에 제공하지 않는다.
- 계정 요금제 표시와 모델 자동/수동 선택을 제공하고, 구독 사용 승인이 없으면 사용을 차단한다. API 키 과금으로 전환하지 않는다.

## 등록 설명 초안 — 미제출

앱: MOVIS / MOVE POS

운영 화면: https://aijunny0604-alt.github.io/pos-calculator-web/

용도: 사용자가 자신의 ChatGPT 계정으로 로그인하여 PC·모바일에서 매장 업무 질문을 처리하는 POS 보조 시스템. 사용자의 구독으로 추론하며 별도 유료 API 키를 요구하지 않는 구성을 희망한다. 모델 자동 선택과 수동 선택, 계정 사용량 표시를 제공한다.

등록 시 추가 확정할 항목: 담당자 연락처, 운영 주체 정보, 백엔드 HTTPS 주소와 callback URL, 적용할 계정·workspace 범위, 개인정보 처리 안내. 현재 제출 또는 승인된 신청이 아니다.

공식 출처:
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/request-client-id
- https://developers.openai.com/siwc/website
- https://developers.openai.com/siwc/token-sharing-open-source
