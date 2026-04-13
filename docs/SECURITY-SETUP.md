# 보안 설정 가이드 (Security Setup)

> API 키 HTTP referrer 제한 설정 및 로컬 개발 포트 관리
> 작성일: 2026-04-13

---

## 1. Gemini API 키 HTTP Referrer 제한

### 목적
GitHub 공개 레포에 노출된 Gemini API 키를 **다른 도메인에서 쓰지 못하도록** 차단.
- 키 자체는 계속 노출되지만 무력화됨
- 본인 일일 할당량을 남이 쓰는 문제 방지

### 허용 도메인 목록 (4개)

각 Gemini API 키의 "애플리케이션 제한사항 > 웹사이트"에 아래 4개 URL을 등록:

```
https://aijunny0604-alt.github.io/*
https://aijunny0604-alt.github.io/pos-calculator-web/*
http://localhost:5173/*
http://localhost:4173/*
```

| URL | 용도 |
|-----|------|
| `github.io/*` | GitHub Pages 배포 사이트 (루트) |
| `github.io/pos-calculator-web/*` | POS 앱 배포 경로 |
| `localhost:5173` | Vite 개발 서버 (`npm run dev`) |
| `localhost:4173` | Vite 프리뷰 서버 (`npx vite preview`) |

### 주의사항
- `*` 와일드카드 **반드시 포함** (없으면 하위 경로 차단)
- `localhost:*/*` 같은 포트 와일드카드는 **Google이 거부**. 포트를 명시해야 함
- 설정 반영까지 **최대 5분** 소요

---

## 2. Vite 포트 정보

### 기본 포트

| 명령어 | 기본 포트 | 용도 |
|--------|----------|------|
| `npm run dev` | **5173** | 개발 서버 (핫 리로드) |
| `npx vite preview` | **4173** | 빌드 후 로컬 프리뷰 |

### 포트가 다르면?

터미널에서 `npm run dev` 실행 시 나오는 메시지 확인:
```
  VITE v6.0.5  ready in 234 ms

  ➜  Local:   http://localhost:XXXX/pos-calculator-web/
  ➜  Network: use --host to expose
```

이 `XXXX` 포트를 Google Cloud Console에 추가 등록.

### 포트 고정하기 (선택)

포트가 자주 바뀌는 게 싫으면 `vite.config.js`에 명시:
```javascript
export default defineConfig({
  base: '/pos-calculator-web/',
  server: { port: 5173 },      // 개발 서버 포트 고정
  preview: { port: 4173 },     // 프리뷰 서버 포트 고정
  plugins: [react()],
  resolve: { alias: { '@': '/src' } }
})
```

---

## 3. 등록 대상 API 키 목록

### 프로젝트별 Gemini API 키 (4개)

| 프로젝트 | 키 끝자리 | Cloud Console 링크 |
|---------|----------|-------------------|
| 프로젝트A (MOVE POS) | `...H8Pc` | [gen-lang-client-0630331595](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0630331595) |
| 프로젝트B (move ai pos) | `...DNPw` | [gen-lang-client-0598778313](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0598778313) |
| 프로젝트C (move wep2) | `...J8D4` | [gen-lang-client-0563685833](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0563685833) |
| 프로젝트D (move wep3) | `...40gs` | [gen-lang-client-0721681295](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0721681295) |

각 키마다 위 4개 URL을 동일하게 등록.

### 코드에서의 위치

`src/pages/TextAnalyze.jsx` (54-57줄) 및 `src/pages/AdminPage.jsx` (2174-2177줄):
```javascript
atob('...') // 프로젝트D → ...40gs
atob('...') // 프로젝트C → ...J8D4
atob('...') // 프로젝트B → ...DNPw
atob('...') // 프로젝트A → ...H8Pc
```

---

## 4. 설정 후 테스트

### 정상 작동 확인 (5분 대기 후)

1. **배포 사이트 테스트**:
   - https://aijunny0604-alt.github.io/pos-calculator-web/ 접속
   - "AI 주문인식" 메뉴 → 간단한 텍스트 입력 → 분석 실행
   - ✅ 정상 응답 → 성공
   - ❌ 에러 → 허용 목록 확인

2. **로컬 테스트**:
   ```bash
   npm run dev
   ```
   - http://localhost:5173/pos-calculator-web/ 접속
   - 동일하게 AI 인식 테스트

### 에러 발생 시 확인 사항

브라우저 개발자 도구(F12) → Network 탭 → `generativelanguage.googleapis.com` 요청 확인:
- 응답 코드 `403 PERMISSION_DENIED` → HTTP referrer 제한 차단
- 응답 메시지 `API key not valid` → 키 자체 문제

### 롤백 (임시 해제)

AI 기능이 전혀 안 되는 긴급 상황:
1. Cloud Console → 해당 키 편집
2. "애플리케이션 제한사항" → **"없음"** 선택
3. 저장 → 5분 대기 → 정상 작동

---

## 5. 새 키 추가/교체 시

기존 키 노출이 심각해서 **rotate (재발급)** 할 때:

1. Google AI Studio (https://aistudio.google.com/app/apikey) → 새 키 만들기
2. 새 키를 코드 `atob('...')` 부분에 Base64 인코딩해서 삽입 (또는 `.env`로 관리)
3. 새 키에도 위 4개 URL 제한 동일 적용
4. 기존 키는 **삭제** (더 이상 필요 없음)
5. 빌드/배포

### Base64 인코딩 방법
브라우저 개발자 도구 콘솔에서:
```javascript
btoa('AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX')
// 결과 문자열을 atob() 안에 삽입
```

---

## 6. 보안 수준 요약

| 항목 | 현재 상태 |
|------|----------|
| Gemini API 키 (GitHub 노출) | 🟡 노출됨, 하지만 referrer 제한으로 무력화 |
| Supabase anon key | 🟢 공개용 키라 노출 OK (RLS 없으면 위험) |
| 관리자 비밀번호 (`4321`) | 🟡 하드코딩, 개인용이라 문제없음 |
| HTTPS | 🟢 GitHub Pages 자동 적용 |
| Sentry DSN | 🟢 공개용 DSN이라 OK |

### 추가 고려사항 (선택)
- Supabase Dashboard에서 RLS 정책 활성화 (공격 표면 최소화)
- Gemini 키를 `.env`로 이전 (GitHub 노출 완전 제거)
- Supabase Auth 도입 (다중 사용자 대비)

---

## 참고 자료
- [Google Cloud: API 키 제한](https://cloud.google.com/docs/authentication/api-keys#restrictions)
- [Vite: 서버 옵션](https://vite.dev/config/server-options.html)
- 이 프로젝트 보안 감사 보고서: [security-spec.md](02-design/security-spec.md)
