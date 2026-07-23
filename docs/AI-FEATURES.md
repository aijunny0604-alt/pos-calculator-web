# AI 기능 작동 원리

> 이 앱의 모든 AI 기능이 **어떻게 동작하고, 왜 이렇게 설계됐는지**를 정리한 문서.
> 관련: [프로젝트 구조](ARCHITECTURE.md) | [변경 이력](CHANGELOG.md) | [DB 스키마](DATABASE.md)
> 코드가 정답 — 이 문서와 코드가 어긋나면 코드를 믿고 이 문서를 고칠 것.

---

## 0. 한눈에

| 기능 | 입력 → 출력 | 엔진 | 파일 |
|---|---|---|---|
| 발주서 사진 판독 | 견적서 사진 → 발주 데이터 | Gemini flash **vision** | [quoteVision.js](../src/lib/quoteVision.js) |
| 사업자등록증 판독 | 등록증 사진 → 상호·번호·주소 | Gemini flash **vision** | [certVision.js](../src/lib/certVision.js) |
| AI 주문 인식 | 주문 텍스트 → 구조화 주문 | Gemini flash **text** (+Groq 폴백) | [TextAnalyze.jsx](../src/pages/TextAnalyze.jsx) |
| MOVIS 분석 어시스턴트 | 자연어 질문 → 데이터 분석 답변 | Gemini **Function Calling** (58 도구) | [geminiAnalyst.js](../src/lib/geminiAnalyst.js) · [geminiTools.js](../src/lib/geminiTools.js) |
| 제품 **AI 검색** | 검색어(오타·초성) → 관련도순 제품 | **로컬 fuzzy 랭킹** (LLM 아님) | [MainPOS.jsx](../src/pages/MainPOS.jsx) · [productMatch.js](../src/lib/productMatch.js) |
| 제품 매칭 | 품명 문자열 → 내부 제품 | 규칙 기반 (AI 학습 우선) | [productMatch.js](../src/lib/productMatch.js) |
| MOVIS 리뷰 답글 | 리뷰 붙여넣기 → 답글 2안 초안 | Gemini text (수동 붙여넣기) | [geminiAnalyst.js](../src/lib/geminiAnalyst.js) |

### 관통하는 4대 원칙
1. **무료 Gemini flash** — `gemini-2.5-flash` / `gemini-2.0-flash`. 이미지 입력도 무과금. 신용카드 안 나감
2. **키·모델 로테이션** — 내장 키 4개 + 사용자 키. 한도(429)·장애(503)면 다음으로 자동 폴백
3. **낮은 temperature** — 증빙/주문 판독은 `0`, 텍스트 주문은 `0.1`. AI가 창의성 부리면 안 되는 영역
4. **AI를 그대로 안 믿는다** — 판독은 AI가, **검증은 산술로, 최종 결정은 사람이**. 자동 저장 금지

---

## 1. 공통 인프라

### 1.1 API 키 — [geminiAnalyst.js `getGeminiKeys`](../src/lib/geminiAnalyst.js)
```
내장 키 4개(base64 난독화, 프로젝트 A~D로 할당량 분산) + localStorage 'geminiApiKey'
```
- 모든 AI 기능이 이 한 함수를 공유. 키가 여러 개인 이유 = **할당량 분산**. 한 키가 429(한도)면 다음 키로
- ⚠️ **브라우저 전용**: 내장 키는 HTTP referrer 제한이 걸려 있어 node에서 직접 호출하면 403. 반드시 브라우저에서
- 사용자가 자기 키를 넣으면 목록 맨 뒤에 추가됨(설정 → API 키)

### 1.2 모델 로테이션 — `MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']`
- 2.5-flash 우선, 실패하면 2.0-flash. 둘 다 무료
- vision(사진 판독)도 같은 flash 모델 재사용 (`GEMINI_VISION_MODELS`)

### 1.3 재시도 루프 (분석 어시스턴트 기준)
```
for 모델 in [2.5, 2.0]:
  for 키 in [4개]:
    for retry in [0,1,2]:        # 503(서버 장애)이면 sleep 후 재시도
      호출 → 성공 시 반환
```
= 최대 **모델 2 × 키 4 × 재시도 3**. 어지간한 일시 장애는 뚫고 나감

### 1.4 사용량 추적 — [apiUsageTracker.js](../src/lib/apiUsageTracker.js)
- 모든 호출을 localStorage에 기록 (토큰 수·모델·시각). MOVIS 사용량 위젯이 이걸 읽음
- in-memory 캐시 + 3초 flush로 burst 시 write thrashing 방지. 하루 5000건 상한

---

## 2. 발주서 사진 판독 — [quoteVision.js](../src/lib/quoteVision.js)

JSR 제품견적서(발주서)를 찍으면 표를 읽어 발주 데이터로. **손으로 안 쳐도 됨.**

### 흐름
```
사진 → 1600px 리사이즈 → Gemini vision(표 판독) → JSON → 자기검산 → 확인 모달 → [등록]
```

1. **리사이즈** (`fileToScaledBase64(file, 1600)`) — 원본 그대로면 요청이 크고 느림
2. **판독 요청** — 이미지 + `QUOTE_PROMPT`를 flash에 전송. `temperature: 0`, `responseMimeType: 'application/json'`
3. **자기검산** (`normalizeQuote`) — 아래 참조
4. **사람 확인** — 확인 모달에서 사장님이 [등록] 눌러야 저장. **자동 저장 절대 안 함** (매입 증빙 = 돈)

### 프롬프트에 박힌 실전 함정 (견적서 21장 판독 경험)
- 첫 줄 `자동차_부품 / 자동차_부품 / 0 / 1 / 0` **더미행**이 거의 항상 있다 → 읽되 나중에 거른다
- 규격명 언더바·슬래시·대소문자를 **인쇄된 그대로** (`TVB64Y_L_C`, `57h89`의 소문자 h) — 추측해 고치지 말 것
- 단가 0원 + 수량 양수 = **무상 보전**(과거 미입고분 채워준 것, 신규 발주 아님)
- 수량 음수 = **취소 차감**
- 공급가액은 **계산하지 말고 인쇄된 숫자를 그대로** 읽어라 (원본이 단가×수량과 달라도)
- 흐리면 지어내지 말고 `uncertain: true`

### 자기검산 — AI를 안 믿는 핵심
`normalizeQuote`가 세 값을 교차 대조한다:
- `calcTotal` = Σ(단가 × 수량)
- `printedTotal` = Σ(인쇄된 공급가액)
- `stated` = 하단 "합 계" 칸
셋이 어긋나면 경고. 실제로 원본 견적서에 5원 오차가 있던 적이 있어 이 검산이 잡아냈다.

### 진입점 3개 (2026-07-23)
클릭 업로드 / 드래그드롭 / Ctrl+V 붙여넣기 — 셋 다 `scanQuoteFile(file)` 공통 함수를 탄다.
판독 엔진은 동일, 입구만 늘린 것.

---

## 3. 사업자등록증 판독 — [certVision.js](../src/lib/certVision.js)

거래처 등록증을 찍으면 상호·사업자번호·주소·업태·종목을 추출. quoteVision과 **쌍둥이 패턴**.

- `EXTRACT_PROMPT` — `isBusinessCert`(진짜 등록증인지) + `name`(통용 상호로: `(주)무브모터스` → `무브모터스`) + `bizNo`(000-00-00000) + 주소·업태·종목·법인번호
- `temperature: 0`, JSON 강제
- **DB 변경 없음** — 추출만. 저장은 사람 확인 후
- `ANALYZE_PROMPT` — 이미지 종류 자동 판별(사업자등록증 / 주문 / 기타)을 **한 번의 호출로 분류+추출**

---

## 4. AI 주문 인식 — [TextAnalyze.jsx](../src/pages/TextAnalyze.jsx)

카톡·문자로 온 주문 텍스트를 붙여넣으면 제품·수량·가격으로 구조화.

### 판독
- 프롬프트: "자동차 튜닝/배기 부품 전문 주문서 분석 AI. 정확도 최우선"
- `temperature: 0.1`, `maxOutputTokens: 8192`
- 모델 로테이션 후 **Groq Llama 3.3 70B 폴백** — Gemini가 다 막히면 Groq으로 (`askGroqChat`, 같은 프롬프트)

### 제품 매칭 (텍스트 → 내부 제품) — [productMatch.js](../src/lib/productMatch.js)
AI가 뽑은 품명을 내부 제품에 연결하는 단계. **문자열만으로 매칭하면 위험**하다:
1. **ai_learning 우선** — 과거에 사람이 확정한 매칭을 먼저 본다 (학습)
2. Fallback `matchWithTolerance` — 정규화(공백·특수문자 제거) 후 허용 오차 매칭
- 🚨 이름 매칭만 믿다가 **금액 2배 사고**가 날 뻔했다 → 발주 쪽에선 (단가, 수량)으로 매칭하는 원칙이 나옴

---

## 5. MOVIS 분석 어시스턴트 — [geminiAnalyst.js](../src/lib/geminiAnalyst.js) + [geminiTools.js](../src/lib/geminiTools.js)

"이번 달 매출 TOP 5", "휴면 거래처", "재고 부족 뭐야" 같은 **자연어 질문 → 실제 데이터 분석 답변**.
단순 채팅이 아니라 **Function Calling** — AI가 필요한 도구를 골라 호출하고, 그 결과로 답한다.

### 도구 58개 ([geminiTools.js](../src/lib/geminiTools.js))
- **읽기(대부분)**: `getTopCustomers` `getCustomerSegments`(RFM) `getTopProducts` `getLowStockProducts`
  `getRestockRecommendations` `getDeadStock` `getCollectionPlan` `searchProducts` `searchNaverCatalog` …
- **쓰기(9개)**: `saveOrder` `updateProductStock` `updateProductPrice` `updateProductName` `updateCustomer`
  `updateOrderMemo` `createReturn` `addProduct` `addCustomer`

### 실행 루프 (`askAnalyst`, 최대 5회 반복)
```
질문 → Gemini가 "어떤 도구를 어떤 인자로 부를지" 결정(functionCall)
     → executeTool로 로컬 데이터에서 실제 실행
     → 결과를 다시 Gemini에 → 답 or 추가 도구 호출
     → (최대 maxIterations=5회)
```

### 안전장치
- **쓰기 의도 감지** — 질문에 쓰기 키워드가 있으면 첫 iteration에서 `mode: 'ANY'` + `allowedFunctionNames`로
  **특정 쓰기 도구만** 강제. 엉뚱한 데이터를 못 바꾸게 (이후 후속 분석은 `AUTO`)
- **중복 호출 차단** — 같은 함수·같은 인자를 반복하면 루프가 길어지고 비용↑ → 막는다
- **부정 답변 캐시 안 함** — "그 기능 없어요" 류 답변(`isNegativeAnswer`)은 캐시에서 제외.
  시스템 프롬프트를 개선하면 다음엔 새 답을 받도록
- **5분 캐시** (`CACHE_TTL=300000`, 최대 100건, 날짜 포함 해시) — 같은 질문 반복 시 재호출 안 함.
  프롬프트 바뀌면 캐시 키 버전(`_v2`)을 올려 옛 캐시 자동 무효화
- **환각 방지** — 시스템 프롬프트가 "도구 결과만 인용, 추측 금지" 강제. 도구가 반환한 숫자만 말한다

---

## 6. 제품 AI 검색 — [MainPOS.jsx](../src/pages/MainPOS.jsx) + [productMatch.js](../src/lib/productMatch.js) `searchProductsRanked`

제품 주문 화면 검색창의 **⚡ AI 검색** 토글(기본 ON). 오타·초성·동의어·치수 흔들림을 보정해 관련도순으로.

### 🚨 이름은 "AI"지만 LLM이 아니다
**Gemini를 부르지 않는다.** 100% 로컬 알고리즘이라 **즉시·오프라인·무과금·무제한**.
"AI 검색"은 사장님이 알아보기 쉬운 이름일 뿐, 실체는 fuzzy 랭킹 엔진.

### 보정 기법 (`scoreProducts` → `searchProductsRanked`)
- **오타 보정** — Levenshtein 편집거리 유사도 (`스뎬` → `스덴`)
- **초성 매칭** — `스덴밴딩` → `ㅅㄷㅂㄷ` 로 부분 검색 (`ㅅㄷ` 만 쳐도 뜸)
- **동의어 정규화** — 40개 정규식(모듈 로드 시 1회 컴파일). 현장 통용어 ↔ 정식명
- **치수 순서 무관** — 규격 숫자 집합으로 매칭 (`64 200` = `200 64`)
- **토큰 일치** — 여러 단어 중 몇 개 맞는지

### 랭킹 & 노이즈 컷
- 점수순 정렬 후 **1순위 점수의 32% 미만은 노이즈로 제거**(또는 절대 하한 16). SKU처럼 정확할수록 좁게
- 과도하게 잘리면 **최소 상위 6개 보장**. 화면엔 상위 18개까지
- **최상위 매칭**(`topMatch`)은 정확일치 여부와 함께 가장 눈에 띄게 강조
- AI 검색 ON이면 카테고리 그룹 대신 `🔎 관련도순` 단일 그룹으로

### OFF일 때
`matchesSearchQuery`(정확검색 — 부분일치·자모순서)로 돌아간다. 제품주문·매입발주 등 다른 검색창과 동일 로직.

---

## 7. 안전장치 총정리 — "왜 자동으로 안 하나"

| 기능 | AI가 하는 것 | 사람/코드가 막는 것 |
|---|---|---|
| 발주서 판독 | 표 읽기 | 산술 자기검산 + **사람이 [등록]** |
| 등록증 판독 | 정보 추출 | 사람 확인 후 저장 |
| 주문 인식 | 텍스트 구조화 | ai_learning 매칭 + 사람 검토 |
| 분석 어시스턴트 쓰기 | 도구 제안 | 쓰기 도구 화이트리스트 강제 |

- 🚨 **네이버 상품 PUT은 아예 금지** — read-modify-write 전체 PUT이 detailContent를 파손시킴(2026-07-16 사고).
  MOVIS에 네이버 쓰기 도구 0개, 읽기/진단만. [CLAUDE.md 참조](../CLAUDE.md)

---

## 8. 비용

**전부 무료.** Gemini flash는 텍스트·이미지 입력 모두 무과금(무료 티어). Groq도 무료 티어.
키 4개를 돌려 할당량을 분산하고, 한도에 걸리면 자동으로 다음 키/모델로 넘어간다.
유일한 유료 가능성은 사용자가 자기 유료 키를 직접 넣는 경우인데, 기본은 내장 무료 키.

---

## 9. 함정·교훈 (재발 방지)

1. **이름 문자열 매칭 금지** — 규격명이 제각각(`TVB64Y L` / `TVB64Y_L_C`)이라 문자열 매칭은 금액 2배 사고를 낸다.
   발주는 (단가, 수량)으로 매칭. 매칭은 ai_learning(사람 확정) 우선
2. **판독을 그대로 저장하지 마라** — 증빙·주문은 돈이다. 반드시 확인 모달 → 사람 승인
3. **부정 답변을 캐시하면** 프롬프트를 고쳐도 옛 "안 돼요"가 계속 나온다 → NEGATIVE_PATTERNS로 제외
4. **temperature는 판독에서 0** — 창의성이 증빙을 왜곡한다
5. **내장 키는 브라우저 전용** — referrer 제한. node 스크립트에서 호출하면 403
6. **네이버 상품은 읽기만** — 쓰기 PUT이 상세페이지를 파손 (복구 불가, 센터 수동)
