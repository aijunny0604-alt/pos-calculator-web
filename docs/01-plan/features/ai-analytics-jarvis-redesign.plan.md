# Plan: AI 분석 페이지 JARVIS 리디자인 + 음성 인식

> Feature: ai-analytics-jarvis-redesign
> Created: 2026-05-21
> Phase: Plan
> Strategy: **JARVIS HUD + 3D 입체 공간감 + SF 미래 + Web Speech API 음성 통합**

---

## 1. 목표

AI 분석 페이지를 단순 채팅 UI → **Move Motors만의 SF/입체/몽환 정체성을 담은 JARVIS급 인터페이스**로 재구축.

핵심 키워드:
- **HUD/홀로그래픽**: 자동차 대시보드 + Iron Man 시그니처 결합
- **3D 입체/공간감**: perspective + parallax + z-축 깊이 (떠다니는 카드, 멀리/가까이 레이어)
- **몽환적**: 부드러운 글로우, 빛 번짐(bloom), chromatic aberration, fade-in 다중 레이어
- **SF 미래 지향**: 사이버펑크 톤, 양자/홀로그램, 비현실적 우주감
- **양자 AI 분위기**: 시안 글로우 + 데이터 흐름 + 미세 입자 (volumetric light)
- **음성 인터랙션**: "Hey 자비스" 식 자연어 음성 → 즉시 분석
- **시각적 임팩트**: 단순 텍스트 답변 → 움직이는 데이터 시각화

자동차 튜닝 부품 매장의 "기술적 전문성" + "미래 지향성" + "SF 우주관"을 입체적으로 표현. 평면 채팅을 넘어 **공간 속에 떠있는 인터페이스** 체감.

---

## 2. 배경

### 2-1. 현재 상태 (한계)
- 일반적인 ChatGPT/Claude 스타일 채팅 UI (Bootstrap 느낌)
- 메시지 버블 = 평범한 회색/파랑 박스
- 추천 질문 = 단순 둥근 칩
- 차트 = 정적 색상 (recharts 기본)
- 로딩 = 단순 스피너 + "AI가 응답 중..."
- 음성 입력 X — 모바일에서 긴 질문 입력 불편

### 2-2. 사업 정체성
- **Move Motors** = 자동차 튜닝 부품 (다운파이프, 머플러, ECU 튠 등)
- 고객층: 기술/속도/퍼포먼스에 민감한 운전자
- 브랜드 톤: 전문성 + 약간의 거친 매력
- 현재 UI는 사업 정체성과 무관 → 어떤 업종이든 같아 보임

### 2-3. JARVIS가 적합한 이유
- Iron Man = 자동차 광들에게 익숙한 아이콘
- HUD = 자동차 계기판과 자연스럽게 연결
- "분석/계산/예측" 동작 = AI 분석 시스템의 본질
- 시각적 임팩트 = 단골/방문객에게 "와, 이 매장 기술 좋네" 인상

---

## 3. 격리 전략

- **DB/백엔드 변경 0건** — 순수 프론트엔드 디자인 + 음성 API 추가
- **다른 페이지 영향 0건** — `src/pages/AIAnalytics.jsx`와 `src/components/analytics/`만 수정
- **음성 인식**: 브라우저 내장 `webkitSpeechRecognition` (Web Speech API) — 무료 + 한국어 지원
- **애니메이션**: CSS keyframes만 사용 (외부 라이브러리 없음)
- **기존 색상 토큰 유지** — 별도 `jarvis-*` 토큰 추가 (`src/index.css` 확장)
- **점진적 적용** — 핵심 컴포넌트부터 단계적, 빌드 사이즈 영향 최소화

---

## 4. 기능 요구사항 (FR)

### FR-01: JARVIS 컬러 + 타이포 시스템
- **주 컬러**: JARVIS Cyan `#00d4ff`, Soft Cyan `#4dffff`, Glow rgba(0,212,255,0.5)
- **배경**: Deep Navy `#0a1929` (모드 토글로 라이트/다크 전환, **다크 우선**)
- **액센트**: 위험 `#ff3860` (Hot Pink), 경고 `#ffaa00` (Amber), 성공 `#00ff88` (Neon Green)
- **타이포**: 본문 `Pretendard`(한글), 숫자 `JetBrains Mono`(monospace + tabular-nums)
- **테두리**: 모든 카드 1px Cyan border + 안쪽 글로우 (`box-shadow: inset 0 0 20px rgba(0,212,255,0.1)`)

### FR-02: 음성 인식 통합 (Web Speech API)
- **입력창 왼쪽에 마이크 버튼** (큰 원형)
- 클릭/탭 → 음성 녹음 시작 → 한국어 인식 → 텍스트 입력 후 자동 전송
- 듣는 중: **음성 파형 시각화** (마이크 주변 동심원 ripple + 진동 막대)
- 인식 완료 시 0.3초 글로우 후 텍스트 입력창에 반영 (사용자 확인 후 전송도 옵션)
- 권한 거부/미지원 브라우저 시 마이크 버튼 비활성 (안내 toast)
- **단축키 Spacebar 길게 누르기** (PTT, Push-to-Talk) — 데스크탑 한정

### FR-03: 홀로그래픽 메시지 카드
- 사용자 메시지: 우측 정렬, **시안 그라데이션 보더 + 미세 펄스**
- AI 메시지: 좌측 정렬, **반투명 글라스모피즘**(`backdrop-filter: blur(12px)`) + 글로우
- 새 메시지 등장: **slide-in + fade-up + 글로우 burst** (300ms cubic ease-out)
- AI 답변 텍스트: **타이프라이터 효과** (글자별 30ms, 한국어는 음절별)
- 도구 호출 이력 토글: ▼ ▲ 아이콘이 회전하며 펼침

### FR-04: 추천 질문 = 회전 칩 클러스터
- 빈 상태 화면: 중앙에 **회전하는 원형 칩 cluster** (5~7개 추천 질문)
- 칩 위 마우스 hover: **확대 + 글로우 burst + 회전 정지**
- 칩 클릭: 칩이 **포물선 궤적**으로 입력창에 빨려들어가며 자동 전송
- 사용 빈도 높은 칩은 **크기 ↑ + 글로우 ↑**

### FR-05: 분석 중 시각 효과
- 로딩 시 단순 스피너 → **회전하는 데이터 입자 + 진행 텍스트**
- 진행 메시지: `🔍 매출 TOP 거래처 조회 중...` → `📡 [Gemini]` `⚡ [Groq fallback]` 상태 배지
- 도구 1개 호출당 진행률 25% 가중 (시각화)
- 답변 도착 시 **글로우 burst + 데이터 입자 모임 애니메이션**

### FR-06: 차트 시각화 재설계
- recharts 차트의 색상 토큰을 **JARVIS 컬러 시퀀스**로 교체 (`#00d4ff`, `#4dffff`, `#ff3860`, `#ffaa00`, `#00ff88`)
- 차트 컨테이너: **글래스모피즘 카드 + 글로우 보더**
- 라인 차트: **글로우 dot + animated stroke-dasharray** (그리는 동안 애니메이션)
- 막대 차트: **하단에서 위로 차오르는 모션** (cubic ease-out 800ms)
- 파이 차트: **회전 등장 + 호버 시 슬라이스 분리**

### FR-07: 헤더 = 자동차 계기판 모티프
- 좌측: `<Sparkles>` → **펄스하는 arc reactor 형태** (회전하는 다층 원)
- 중앙 타이틀: `AI 분석` → `MOVE INTELLIGENCE` (영문 모노스페이스 + 글로우)
- 우측 데이터 카운트: `📊 주문 N · 거래처 N · 제품 N` → **각각 작은 게이지 + 디지털 카운트업**
- 우상단 ⚙️: **회전 톱니바퀴 hover 시 부드럽게 회전**

### FR-08: 백그라운드 분위기
- 페이지 배경: **다크 navy + 미세 격자 (0.05 opacity) + 부동 입자** (CSS keyframes로 떠다님)
- 입자: 30~50개, 시안색, 무작위 path, 5~15초 주기
- 모바일: 입자 수 ↓ (성능 보호)
- `prefers-reduced-motion: reduce` 사용자는 입자/펄스 자동 비활성

### FR-09: 3D 입체 공간감 (SF 우주관) ⭐ 신규
- **Perspective wrapper**: 페이지 루트에 `perspective: 1200px` — 모든 자식이 z-축 인식
- **3-Layer Parallax**:
  - 원경 (z: -200px) — 별/입자, 천천히 떠다님 (배경 깊이)
  - 중경 (z: 0px) — 메시지/차트 카드 (기준면)
  - 근경 (z: +50px) — 헤더/입력창/마이크 (앞에 떠있음, 약간 큰 글로우)
- **메시지 카드 3D Tilt**: hover 시 마우스 위치 기반 `rotateX/rotateY ±5°` (subtle, 어지럽지 않게)
- **스크롤 패럴럭스**: 메시지 리스트 스크롤 시 배경 입자/격자가 더 느리게 움직임
- **God Rays / Volumetric Light**: 우상단/좌하단에서 비스듬한 빛 줄기 (very low opacity, 시안)
- **Depth-of-field 효과**: 활성/포커스 영역은 선명, 비활성 카드는 미세 blur (`backdrop-filter: blur(2px)`)
- **AI 응답 도착 시**: 카드가 **공간 깊이에서 앞으로 튀어나오는 모션** (translateZ -100px → 0)

### FR-10: 몽환적 시각 효과
- **Chromatic Aberration (RGB shift)**: 큰 숫자/제목에 미세 RGB 분리 (0.5px) — 홀로그램 느낌
- **Bloom Glow**: 모든 발광 요소에 다단계 글로우 (inner glow + outer halo + atmospheric)
- **Slow Fade Layers**: 메시지 등장 시 단순 fade가 아닌 **3겹 fade** (텍스트 → 카드 → 글로우 0.1s 차이)
- **Liquid Cursor (선택)**: 마우스 따라가는 시안 트레일 (데스크탑 한정, 모바일 X)
- **Hologram Scanline**: 카드 위로 가끔(10초 주기) 빛 줄기가 위→아래 통과 (subtle, 1초)
- **Particle Burst on Action**: 음성 전송/메시지 도착 시 입자 burst (방사형, 0.6초)

### FR-11: 효과음 시스템 (Web Audio API 합성) ⭐ 신규
- **자체 합성** — 외부 mp3/wav 0개. `OscillatorNode` + `GainNode`로 SF 톤 만들기
- 효과음 종류:
  - **mic-on**: 200Hz → 800Hz sweep, 120ms (상승, "삐릭~")
  - **mic-off**: 800Hz → 200Hz sweep, 120ms (하강, "삐릭")
  - **message-arrive**: 880Hz + 1320Hz 화음, 200ms reverb (시안 "띵~")
  - **tool-call**: 1500Hz square wave, 40ms (짧은 "틱")
  - **answer-complete**: 440Hz → 880Hz → 1100Hz arpeggio, 350ms (시안 "투웅~")
  - **error**: 200Hz sawtooth, 300ms (낮은 "삐~")
  - **burst**: white noise 50ms + 게이트 (방사형 시각 효과 동반)
- **음소거 토글** — 헤더 우상단 🔊/🔇 버튼 + localStorage `pos_ai_sfx_muted_v1`
- **매장 환경 고려** — 기본값 ON이지만 첫 방문 시 안내 toast "🔊 효과음 켜짐 (헤더 🔇로 끄기)"

### FR-12: TTS 음성 응답 (Web Speech Synthesis API)
- **Web Speech Synthesis API** (브라우저 내장, 무료, 한국어 OK)
- **한국어 여성 voice 우선** — 영화 Her의 사만다 / 한국 AI 비서 느낌
  - Edge: Microsoft Heami / SunHi (한국어 여성)
  - Chrome: Google 한국어 여성
  - voice 우선순위 fallback: Heami → SunHi → Google 한국어 (female 키워드 매칭) → 첫 한국어
- TTS 설정:
  - `lang: 'ko-KR'`, `rate: 1.0` (자연스럽게), `pitch: 1.1` (여성 톤 약간 상향)
- **기본 OFF** — 사용자가 메시지별 🔉 재생 아이콘 클릭해서 들을 수 있음
- **음성 출력 중 시각화**: 메시지 카드 글로우 펄스 + 우상단 ⏸ 일시정지 버튼
- localStorage `pos_ai_tts_enabled_v1` — 자동 재생 옵션 켜기 가능 (설정 모달)
- 페이지 이탈/메시지 새로 들어옴 시 자동 cancel

### FR-13: 음성 입력 + JARVIS 응답 통합
- 마이크 클릭 시 → **효과음 mic-on** + **TTS "네, 듣고 있습니다."** (짧게, 0.8초)
- 음성 인식 완료 시 → **효과음 mic-off** + 텍스트 전송
- AI 답변 도착 + 사용자가 음성으로 질문했다면 → **자동 TTS 재생** (음성 입력 사용자만 자동, 키보드 입력자는 수동)
- Spacebar 길게 누르기 (200ms 이상) = PTT (Push-to-Talk) — 데스크탑 한정
- 시각 효과: 마이크 ripple 3겹 + 진동 막대 5개 (실시간 amplitude 시각화)

---

## 5. 비기능 요구사항 (NFR)

- **다크 우선** — 라이트 모드는 후순위 (Phase 2)
- **모바일 360px 동작** — 음성 버튼 모바일 우선 (44px 터치 영역)
- **번들 크기 영향 < 30KB** — CSS 추가, 외부 라이브러리 무사용
- **음성 인식 권한**: 처음 시도 시 브라우저 권한 요청. 거부 시 toast로 안내. 거부 상태 기억(localStorage)
- **음성 미지원 브라우저** (Firefox 등): 마이크 버튼 회색 비활성 + tooltip "Chrome/Edge/Safari 14+ 필요"
- **접근성**: 스크린리더용 aria-live="polite" 유지, 음성 파형은 `aria-hidden`
- **모션 민감**: `prefers-reduced-motion: reduce` 자동 감지 → 펄스/회전/입자 비활성

---

## 6. 기술 설계 초안

### 6-1. 파일 구조

```
src/
├── pages/
│   └── AIAnalytics.jsx                 # 메인 페이지 (테마 wrapper 추가)
├── components/analytics/
│   ├── ChatPanel.jsx                   # 입력창 + 마이크 버튼 통합
│   ├── MessageBubble.jsx               # 글라스모피즘 + 타이프라이터
│   ├── SuggestedQuestions.jsx          # 회전 클러스터 (신규 모드)
│   ├── VoiceButton.jsx                 # 신규 — 마이크 + 파형 시각화
│   ├── JarvisHeader.jsx                # 신규 — Arc reactor + 게이지
│   ├── ParticleBackground.jsx          # 신규 — 부동 입자 캔버스
│   ├── ToolProgressIndicator.jsx       # 신규 — 도구 호출 진행 시각
│   └── charts/                         # 색상 토큰 교체만
├── hooks/
│   ├── useVoiceInput.js                # 신규 — Web Speech API 래퍼
│   └── useTypewriter.js                # 신규 — 타이프라이터 효과
├── lib/
│   └── jarvisTheme.js                  # 신규 — 컬러/애니메이션 토큰
└── index.css                            # @keyframes 추가 (8~10개)
```

### 6-2. Web Speech API 음성 인식

```javascript
// hooks/useVoiceInput.js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SR();
recognition.lang = 'ko-KR';
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map((r) => r[0].transcript).join('');
  setInterimText(transcript);
};

recognition.onend = () => {
  setIsListening(false);
  onComplete(finalText); // 자동 전송 또는 텍스트박스 채우기
};
```

지원 브라우저:
- Chrome / Edge / Opera: 완전 지원
- Safari 14+: 지원 (iOS는 일부 제한)
- Firefox: 미지원 → 버튼 비활성

### 6-3. CSS 토큰 (index.css 추가)

```css
:root {
  /* JARVIS Theme */
  --jarvis-cyan: #00d4ff;
  --jarvis-cyan-soft: #4dffff;
  --jarvis-purple: #a855f7;      /* 보조 (SF 우주감) */
  --jarvis-magenta: #ec4899;     /* 액센트 (사이버펑크) */
  --jarvis-glow: 0 0 20px rgba(0, 212, 255, 0.5);
  --jarvis-glow-strong: 0 0 40px rgba(0, 212, 255, 0.8);
  --jarvis-glow-bloom: 0 0 8px rgba(0,212,255,0.6), 0 0 24px rgba(0,212,255,0.4), 0 0 64px rgba(0,212,255,0.2);
  --jarvis-bg: #0a1929;
  --jarvis-bg-deep: #050b18;     /* 더 깊은 우주 배경 */
  --jarvis-bg-card: rgba(15, 23, 41, 0.6); /* 글라스모피즘 베이스 */
  --jarvis-border: rgba(0, 212, 255, 0.3);
  --jarvis-warning: #ffaa00;
  --jarvis-danger: #ff3860;
  --jarvis-success: #00ff88;

  /* 3D 공간 */
  --jarvis-perspective: 1200px;
  --jarvis-depth-far: -200px;
  --jarvis-depth-mid: 0px;
  --jarvis-depth-near: 50px;
  --jarvis-tilt-deg: 5deg;
}

/* Keyframes */
@keyframes jarvis-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3); }
  50% { box-shadow: 0 0 40px rgba(0, 212, 255, 0.8); }
}

@keyframes jarvis-arc-spin {
  to { transform: rotate(360deg); }
}

@keyframes jarvis-particle-float { /* 30s + random delay */ }
@keyframes jarvis-typewriter { /* 글자 등장 */ }
@keyframes jarvis-voice-ripple { /* 마이크 동심원 */ }
@keyframes jarvis-slice-bar { /* 음성 인식 막대 */ }
@keyframes jarvis-data-flow { /* 차트 진입 */ }
@keyframes jarvis-glitch { /* 클릭 임팩트 */ }
```

### 6-4. 음성 인식 UX 흐름

```
[기본 상태]
   🎤 마이크 버튼 (cyan 글로우)
     ↓ 클릭/스페이스 길게
[권한 요청 (최초만)]
   브라우저 권한 prompt
     ↓ 허용
[듣는 중]
   🎤 마이크 + 동심원 ripple (3개)
   하단에 진동 막대 5개 (실시간 amplitude 시각)
   "듣고 있어요..." 텍스트
     ↓ 사용자 말함
[인식 중 (interim)]
   입력창에 회색 텍스트로 실시간 표시
     ↓ 침묵 1.5초 또는 다시 클릭
[완료]
   글로우 burst → 검은색 텍스트로 확정
   자동 전송 (옵션) 또는 [전송] 버튼 강조
```

### 6-5. 타이프라이터 효과

```javascript
// hooks/useTypewriter.js
function useTypewriter(text, { speed = 30, enabled = true } = {}) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!enabled || !text) { setDisplayed(text); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, enabled]);
  return displayed;
}
```

`prefers-reduced-motion` 감지 시 즉시 전체 표시.

---

## 7. 대안 비교

| 대안 | 장점 | 단점 | 채택 |
|------|------|------|------|
| **A. JARVIS HUD + Web Speech (현재 plan)** | 정체성↑, 시각 임팩트↑, 무료 음성 | 다크모드 위주 = 데이터 가독성 검증 필요 | ✅ |
| B. Material Design 3 (구글 표준) | 익숙, 빠른 구현 | 정체성 X, 모든 사이트 비슷 | ❌ |
| C. Spline 3D + Three.js | 가장 화려 | 번들 +500KB↑, 성능 부담 | ❌ |
| D. Lottie 애니메이션 라이브러리 | 풍부한 모션 | 외부 의존성 + 파일 크기 | △ |
| E. **음성: Groq Whisper 등 외부 STT** | 정확도↑ | API 비용, 지연, 키 관리 | ❌ (Web Speech API 우선) |

---

## 8. 영향 범위

### 변경 (신규)
- `src/components/analytics/VoiceButton.jsx`
- `src/components/analytics/JarvisHeader.jsx`
- `src/components/analytics/ParticleBackground.jsx`
- `src/components/analytics/ToolProgressIndicator.jsx`
- `src/hooks/useVoiceInput.js`
- `src/hooks/useTypewriter.js`
- `src/lib/jarvisTheme.js`

### 변경 (수정)
- `src/pages/AIAnalytics.jsx` — 테마 wrapper + Particle 통합
- `src/components/analytics/ChatPanel.jsx` — VoiceButton 통합 + 글래스 스타일
- `src/components/analytics/MessageBubble.jsx` — 타이프라이터 + 글라스
- `src/components/analytics/SuggestedQuestions.jsx` — 회전 클러스터 모드
- `src/components/analytics/charts/*` — 색상 토큰 교체
- `src/index.css` — JARVIS keyframes + 토큰

### 무영향
- 모든 lib/analytics 함수
- geminiTools.js / geminiAnalyst.js / groqAnalyst.js
- 다른 페이지 (POS, OrderHistory, CustomerList 등)

---

## 9. 단계별 구현 (Phase)

### Phase 1: 음성 인식 (2일) ⭐ 가장 가치 큼
- `useVoiceInput.js` — Web Speech API 래퍼
- `VoiceButton.jsx` — 마이크 + ripple + 진동 막대
- ChatPanel 통합 + 권한 처리 + 자동 전송 옵션
- **완료 기준**: "이번 달 매출" 음성 → 텍스트 변환 → 자동 전송 → 답변

### Phase 2: JARVIS 컬러/타이포 (1일)
- `jarvisTheme.js` 토큰 정의
- `index.css` 키프레임 + CSS 변수
- 다크 navy 배경 적용
- 모든 컴포넌트 색상 교체 (먼저 라이트 → 다크 토글 가능하게)

### Phase 3: 메시지/입력 글라스모피즘 (2일)
- MessageBubble: 글래스 + 타이프라이터 + slide-in
- ChatPanel: 입력창 글로우 + 마이크 통합
- SuggestedQuestions: 회전 클러스터 모드 (옵션)
- 도구 호출 이력: 펼침 애니메이션

### Phase 4: 헤더 + 백그라운드 (1일)
- `JarvisHeader.jsx`: arc reactor 아이콘 + 게이지 카운터
- `ParticleBackground.jsx`: 부동 입자 캔버스
- 헤더 디지털 카운트업

### Phase 5: 차트 재설계 (1일)
- recharts 색상 토큰 교체
- 컨테이너 글래스 + 글로우
- 진입 애니메이션 (stroke-dasharray, fade-up)

### Phase 6: 로딩/진행 시각화 (1일)
- `ToolProgressIndicator.jsx`: 회전 데이터 입자 + 진행률
- 도구별 진행 메시지 + 배지
- 답변 도착 시 burst 효과

### Phase 7: 검증 + 배포 (1일)
- 모바일 360px 동작 확인
- `prefers-reduced-motion` 동작 확인
- 음성 권한 거부/미지원 분기 검증
- 다크/라이트 토글 (옵션, 다크 우선)

**총 예상 기간**: 9일 (단계 일부 병렬 가능 시 6~7일)

---

## 10. 위험 요소

| 위험 | 영향 | 대응 |
|------|------|------|
| **iOS Safari 음성 인식 제한적** | 모바일 사용자 일부 불편 | 미지원 시 텍스트 입력만 사용, 명확한 안내 |
| **다크모드에서 차트 색상 가독성** | 데이터 인식 어려움 | 색상 명도/대비 WCAG AA 검증, 글로우로 보강 |
| **애니메이션 과다로 멀미** | 일부 사용자 불편 | `prefers-reduced-motion` 자동 감지 + 기본 옵션 OFF 가능 |
| **번들 크기 증가** | 모바일 부팅 ↓ | 외부 라이브러리 0건, CSS only. 측정 후 분리 검토 |
| **음성 권한 거부 흐름 누락** | 사용자 혼란 | 첫 거부 시 명확한 안내 + localStorage 기억 |
| **CSS 효과가 성능 저하 (모바일)** | 끊김 | `will-change` 적절 사용, 입자 수 모바일 감소 |
| **JARVIS 컨셉이 너무 화려해서 매장 분위기와 안 맞음** | 사용자 불만 | Phase 1만 먼저 배포 (음성) → 시각 변경은 토글로 옵트인 가능 |

---

## 11. 다음 단계 (Plan 승인 후)

1. **Plan 검토** — 사용자 의견 반영 (컬러 미세조정, 단계 우선순위 등)
2. **`/pdca design ai-analytics-jarvis-redesign`** — 토큰/컴포넌트 상세 설계
3. **Phase 1부터 구현** — 음성 인식 먼저 (사용자 체감 가치 최대)
4. **단계별 배포** — 각 Phase 완료 시 gh-pages 즉시 배포
5. **검증** — 음성 권한, 모바일 UX, 다크모드 가독성

---

## 부록 A. JARVIS 컨셉 영감 자료

- Iron Man / Avengers 영화 HUD 인터페이스
- 자동차 디지털 계기판 (Tesla, McLaren, Porsche Taycan)
- 게임 사이버펑크 2077 UI
- Apple Vision Pro visionOS

## 부록 B. 추가 아이디어 (Phase 7+ 향후)

- **음성 출력 (TTS)**: AI 답변을 Web Speech Synthesis로 읽어주기 (JARVIS 목소리)
- **3D 차트**: Three.js로 인터랙티브 데이터 큐브
- **음성 wake word**: "야 자비스" 같은 호출어 (privacy 고려 필요)
- **AR 모드**: 카메라 + WebXR 통한 매장 내 AR 표시
- **다크/라이트/홀로그래픽 3-모드 토글**
