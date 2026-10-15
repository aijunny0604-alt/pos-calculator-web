# 2026-10-15 디자인 운영 배포

공통 디자인 업데이트를 GitHub Pages와 매장 PC 실행 파일에 반영했다. 운영 HTML·주요 JS·CSS가 로컬 검증 빌드와 동일함을 SHA-256으로 확인했다.

## 배포 정보

- 운영: https://aijunny0604-alt.github.io/pos-calculator-web/
- Pages 커밋: `e8c5a4870ccea6e0077ef62d7cf44917834ce760`
- 소스 PR: https://github.com/aijunny0604-alt/pos-calculator-web/pull/15
- 검증 소스: `986bc825` (최신 master `f696e111`의 POS 복구·MOVIS 안정화 수정 유지)
- 이전 Pages 커밋: `ca162574444a4134821e186a2e160c834f7aa473` — 필요 시 이 정적 빌드로 복원한다.
- 기존 해시 자산은 이미 열려 있는 화면의 동적 로딩을 위해 보존했다.

## 확인 결과

- `node --test tests/*.test.mjs`: 82개 통과, 실패 0개, HTTP 접근 제어 1개 환경 미지정으로 건너뜀.
- 17개 메뉴 PC/모바일: 전체 페이지 넘침 및 검사 대상 요소 잘림 0건.
- 6개 화면 크기·DPR: 주요 모달 버튼, 스크롤, 포커스 검사 통과.
- 모션 설정 두 조건: 페이지 420ms, 모달 360ms 실행 확인.
- 로고 중앙 정렬 및 기본 미리보기 테스트 도구 숨김 확인.
- 운영 빌드 성공. 기존 큰 청크·import 혼용·Rollup 옵션 경고는 남아 있다.
- 샘플 미리보기는 개발 전용이며 운영 빌드에서 제외.
- 운영 파일 아래 3개 HTTP 200 및 SHA-256 일치.

| 파일 | SHA-256 |
|---|---|
| `index.html` | `24e56d49eeb07585a025d66703931e4e510b40c6d638660eb3fff4805a350032` |
| `assets/index-CVYipyH6.js` | `be3388cd39dec5793e14bc661b8278050cf6f17822ed7029cb4ebc8a0e210f3e` |
| `assets/index-BqU1OFCa.css` | `6f61d00bf5cf1a108aea7b4e8f4dced71c85d38a49abd021f79af9f52c639e88` |

## 범위와 제한

DB 스키마·권한·운영 주문 데이터는 변경하지 않았다. 기존 모바일 원격 GPT 연결 및 10월 13일 기록된 브라우저별 로컬 연결 제한은 이번 디자인 배포에서 해결한 항목이 아니다. 실물 모바일/Safari/가상 키보드/모든 데이터 조합 검증은 포함하지 않는다.

웹 사용자는 새로고침 후 이용한다. 이전 화면이 남으면 `Ctrl+Shift+R`로 다시 불러온다. 다른 PC에 이미 설치된 로컬 패키지는 자동 업데이트되지 않으므로 최신 배포 패키지로 갱신해야 한다.

## Windows 패키지

`movis-windows-2026.10.13` 릴리스의 `MOVIS-Intelligence.zip`을 새 디자인 빌드와 최신 사용설명으로 교체했다. 허용 목록으로 압축했으며 인증 저장소·환경 파일·바로가기 백업이 ZIP에 없는 것을 검사했다(585개 항목). 매장 PC 실행 폴더의 정적 화면도 동일 빌드로 갱신했다. Pages 빌드 상태는 `built`이다.
