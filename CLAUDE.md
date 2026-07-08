# POS Calculator Web

> 마지막 업데이트: 2026-07-08 (MOVIS 대규모 고도화 + 방문수령 발송 + 거래처 카드 리디자인 + 블랙버튼/TTS)
> 배포 URL: https://aijunny0604-alt.github.io/pos-calculator-web/

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry + Gemini AI.

## 🆕 v2026-07-08 — MOVIS 대규모 고도화(Claude+Codex 협업) + 방문수령 발송 + 거래처 카드 + 블랙버튼/TTS

### 🤖 MOVIS AI 능력 대폭 확장 ([geminiTools.js](src/lib/geminiTools.js) + [geminiAnalyst.js](src/lib/geminiAnalyst.js) + [AIAnalytics.jsx](src/pages/AIAnalytics.jsx) + [useAIAnalystChat.js](src/hooks/useAIAnalystChat.js) + [MessageBubble.jsx](src/components/analytics/MessageBubble.jsx))
- **멀티엔티티 일괄 쓰기**: `bulkUpdateCustomer`에 `newName`(상호변경)·`isBlacklist` 추가 → "A랑 B 둘 다 블랙 지정/상호 변경"을 **한 번의 confirm**으로. 상호변경 시 `renameCustomerCascade`로 주문/카트/반품 이력 자동 이전. WRITE_INTENT 블랙/상호 패턴에 bulkUpdateCustomer 허용
- **되묻기(Clarification)**: 도구 dry-run이 `{ __clarification, question }` 반환 → 에이전트 루프가 **추가 모델호출 없이 질문 즉시 반환**(short-circuit, 토큰 절약). `updateProductPrice` 도매/소매 불명확 시 되물음. useAIAnalystChat가 `needsClarification`이면 pending/주문합성 스킵
- **조건부 일괄** `bulkUpdateProductsByCondition`: 조건(category/nameContains/stockBelow/stockAtMost/allProducts)으로 **로컬 필터**(토큰 절약) → 재고(setStock/addStock) 또는 가격(pricePercent+priceType, 100원 반올림) → 기존 `bulkUpdateProductStock/Price` apply 핸들러 **action 재사용**. "재고 10개 미만 전부 30개로", "○카테고리 5% 인상". ⚠️ Codex 리뷰로 버그 5건 수정(0원가격 방어·NaN검증·조건설명 통일·setStock+addStock 동시금지·HARD_CAP 500)
- **메시지/문서 자동작성** `draftMessage`(읽기): 미수 안내문·재구매 제안·**견적서/발주서** → 데이터 조회 후 완성 텍스트를 `{ __messageDraft }` 반환 → MessageBubble이 **채팅 인라인 복사 카드**로 렌더(모달 아님). DB·발송·저장 없음
- **오늘 마감 요약** `getDailyClose`(읽기): "오늘 정리/마감" → 오늘 주문·매출·입금·반품·재고부족·스토어 미처리 종합
- **안 나가는 재고(데드스톡)** `getDeadStock`(읽기, [inventory.js](src/lib/analytics/inventory.js)): 최근 N개월 판매 0 + 재고 있는 제품을 묶인금액(재고×도매가)순
- **질문 이해도 강화**(시스템프롬프트): 지시대명사/생략("그거/방금/그 업체")→직전 대화 대상 유지, 한글숫자(오만원=50000·삼개=3·반값=×0.5), 읽기 현장표현 사전, 복합요청 도구 연쇄, **"뭐 할 수 있어?" 역량 안내**(발견성)
- **확인 UX 다건 개선**: pending 여러 건일 때 헤더 "확인 대기 N건·1번째" + **[건너뛰기](이 건만)/[전체 취소]** 분리(기존 취소=전체취소만). MOVIS 확인모달 사이즈·폰트 확대(본문 text-base~lg)
- **발견성**: 첫 진입 예시 칩에 "📅 오늘 마감 정리"·"✉️ 미수 안내 문자 작성" 추가
- ⚠️ **임베딩 의미검색**(`embedText`/`cosineSim`/VectorIndexer) 인프라는 존재하나 MOVIS 검색엔 미연결(findProductSmart 퍼지매칭만) — 다음 후보(벡터 인덱스 사전구축 필요)

### 🔊 TTS 자연화 ([useTextToSpeech.js](src/hooks/useTextToSpeech.js) + [lib/tts.js](src/lib/tts.js))
- 발화 전 `sanitizeForSpeech`로 **마크다운·이모지·장식기호·구분선 제거** → "별표별표"·이모지 읽던 문제 해결. pitch 1.1→1.0(붕뜸 해소), rate 자연화. 앞 구두점 정리

### 🏬 방문수령 발송처리 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx) + 매장PC [sync.js](../naver-sync-bridge/sync.js))
- 네이버 방문수령 주문(`expectedDeliveryMethod===VISIT_RECEIPT`)을 **송장 없이 발송처리**. 방문수령 주문이면 [발송] 버튼→**[🏬 방문수령]**으로 스왑(카드/컴팩트/상세 3곳). `submitVisitReceipt`가 `naver_dispatch_company_code='VISIT_RECEIPT'` 센티널+tracking=null 큐 등록
- **sync.js**: `company_code==='VISIT_RECEIPT'` → `deliveryMethod:'VISIT_RECEIPT'` 페이로드(택배사/송장 면제), 필수값 검증 방문수령 예외. ⚠️ 네이버 VISIT_RECEIPT dispatch 계약 best-guess — **1건 라이브 검증 필요**(실패 시 안전히 에러기록, 오발송 표기 방지). watchdog가 stale코드 자동 재시작 확인

### 🚫 스토어 블랙리스트 지정 버튼 혼동 수정 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx))
- 미지정 구매자 버튼이 빨강+🚫+"블랙리스트"라 이미 등록된 것처럼 오인 → **미지정=회색 점선+"블랙 지정"(행동)**, 지정됨=초록 "블랙 해제". 실제 블랙 등록 고객은 빨간 배지+카드 유지

### 🏢 거래처 관리 업체 주문이력 카드 리디자인 ([CustomerList.jsx](src/pages/CustomerList.jsx))
- **콤팩트 카드 그리드**(사용자 선택): 예전 큰 카드보다 작게, 품목 최대 3줄 표시 + 미수/복사 하단. md 2컬럼/2xl 3컬럼. 금액 24px, 좌측 액센트바. (리스트↔카드 왕복 후 콤팩트 카드로 확정)
- **상세 모달 확대**: 폭 672→832px(52rem), 제목 16→24px, 총금액/공급/부가 18→30px, 품목명 14→16px
- ⚠️ 참고: `CustomerDetailModal.jsx`(별도 모달)도 폰트 확대돼 있으나 이 화면과 다른 곳(대시보드 미수 클릭 등)에서 쓰임

## 🆕 v2026-07-06 — 택배송장 카톡복사 + 주문검색/수정확인 + 메모페이지 + MOVIS 도구확장·모달확대 + 그리드 디자인

### 택배 송장 카톡용 복사 ([ShippingLabel.jsx](src/pages/ShippingLabel.jsx))
- 송장 페이지에 **노란 [카톡용 발송내역 복사]** 버튼(수출 버튼 위, 모바일 강조). `buildKakaoText()` — 오늘 발송분을 **발송인(무브모터스/엠파츠)별로 묶어** `받는분·전화 / 📍주소 / 📦품명 / 📮포장·착불선불` 형태로 생성 → 택배사 카톡에 그대로 붙여넣기. **선택분 있으면 그것만, 없으면 오늘 전체**(`selectedOrders` 0건 시 filteredOrders 폴백). `copyKakaoText` = navigator.clipboard + 구형/비보안 textarea 폴백, 복사 시 초록 "복사됨!"
- ⚠️ **핫픽스 사고**: `kakaoCopied` 상태를 하위 컴포넌트(NaverDispatchPanel)에 잘못 선언 → 메인 렌더에서 스코프 밖 참조 → **택배송장 페이지 전체 크래시**(`ReferenceError`). **빌드는 통과**(식별자가 타 스코프 존재)해서 못 걸러짐 → Playwright 라이브 재현으로 특정 → 메인 컴포넌트로 이동. **교훈: 배포 전 변경 페이지 실브라우저 진입+콘솔 확인 필수**(빌드 통과만 믿지 말 것)

### 주문 내역 제품명 검색 ([OrderHistory.jsx](src/pages/OrderHistory.jsx))
- 검색이 **주문번호·거래처·전화·메모만** 보고 **제품명(items) 미검색** → "HKS BOV 밸브" 등 0건 버그. 수정: 검색 대상에 **제품명 포함 + 토큰 AND 매칭**(공백제거 후 각 단어 모두 포함 검사 — "HKS 점화플러그"가 "HKS 점화 플러그"에도 매칭). placeholder "제품명, …"로 갱신. 라이브 검증: 16건 정확 반환

### 주문 수정 확인 모달 (실수 방지) ([OrderDetail.jsx](src/pages/OrderDetail.jsx))
- 편집 [저장] 시 즉시 반영 대신 **변경점 목록 모달**(`pendingSave` 상태 + `buildEditDiff()`): ➕추가/➖삭제/✏️수량·단가 변경/거래처·주소·메모/💰합계 before→after 표시 → **[✅ 적용] 눌러야 실제 `onUpdateOrder` 호출**. 변경 없으면 모달 없이 종료. 라이브 검증(수량 20→21, 합계 105,600→110,880, 취소=미반영)
- **주문 단건 삭제 확인**에 거래처명·품목요약·합계 표시 + "Ctrl+Z/실행취소 복구 가능" 안내

### 메모 모아보기 페이지 ([MemosPage.jsx](src/pages/MemosPage.jsx) 신규) + 거래처 주문이력 폰트↑
- 사이드바 **[메모 모아보기]**(StickyNote) + 대시보드 "메모 전체보기" → `setCurrentPage('memos')`. 탭(주문메모/제품주의사항)·미확인필터·검색. OrderHistory와 **동일한 `isStoreAutoMemo` 정규식**으로 스토어 자동메모 제외, `FLAG_MAP`=AdminPage 실제 색키(red/amber/blue/green/purple). 주문메모 클릭→주문상세, 확인처리→`memo_checked`
- **거래처 관리 주문이력 카드 폰트 확대**([CustomerDetailModal.jsx](src/components/CustomerDetailModal.jsx)): 주문번호 `text-lg~xl`, 금액 `text-2xl~3xl`, 날짜/품목/상세표 확대 + 좌측 파란 액센트바

### MOVIS 실전 도구 4종 확장 (2026-07-03) ([geminiTools.js](src/lib/geminiTools.js) + [AIAnalytics.jsx](src/pages/AIAnalytics.jsx) + [geminiAnalyst.js](src/lib/geminiAnalyst.js))
- **상호 변경**(`updateCustomer` newName): "○○ 상호 △△로" → [supabase.js](src/lib/supabase.js) `renameCustomerCascade(oldName,newName)`가 orders.customer_name·saved_carts.`name`·customer_returns.customer_name 일괄 PATCH(주문 이력 자동 이전). **블랙리스트 지정**(is_blacklist)
- **주문내역 조회**(`searchOrders`, 읽기): days/customerName/keyword/limit → 기간/건수/합계/목록. KST 자정 since. **주문 메모**(`updateOrderMemo`, 쓰기): orderNumber 또는 최근주문 매칭, append/replace. **제품명 수정**(`updateProductName`/`bulkUpdateProductName`, 쓰기): newName/appendText/scope
- 6요소 체인: GEMINI_TOOLS 정의 → buildPendingAction 실행자 → WRITE_TOOLS Set → AIAnalytics apply 핸들러 → cancel 라벨 → WRITE_INTENT_PATTERNS. `saveOrder`는 `배송(?!지|\s*주소|메모|\s*비|료)` negative lookahead(배송지 변경 오인식 방지)
- **스토어 구매자 블랙리스트 카드 색상**([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx)): phone-first 판정, 블랙=빨강 액센트+배너. 제품명 검색(종결숨김·날짜필터 우회 `searching` 가드). **주문등록 시 QuickItemBar**([OrderPage.jsx](src/pages/OrderPage.jsx) 택배비/퀵비)

### MOVIS 확인 모달 확대 + 제품 그리드 디자인 (2026-07-06)
- **MOVIS 일반 확인 모달**([AIAnalytics.jsx](src/pages/AIAnalytics.jsx)): `max-w-md→lg~xl`, 제목 `text-lg→xl~2xl`, **미리보기 본문 `text-sm→base~lg`**, 경고 `text-xs→sm`, 버튼 `py-2→3.5 text-base~lg`, `rounded-xl`. **주문등록 모달**([OrderConfirmEditable.jsx](src/components/analytics/OrderConfirmEditable.jsx)) `max-w-2xl→3xl`+제목 확대
- **제품 그리드 세련화**([MainPOS.jsx](src/pages/MainPOS.jsx) + [index.css](src/index.css)): 카드 `rounded-lg→xl`, `.card-interactive`에 **은은한 기본 그림자**(입체 깊이감, 앱 전체 카드 공용), 그리드 `gap-1.5→2.5`+패딩 여유

## 🆕 v2026-06-26 — 제품검색 AI 토글(강조 애니메이션·성능 최적화) + 전역 Ctrl+Z 삭제복구 스낵바

### 제품 주문(MainPOS) AI 검색 토글 ([MainPOS.jsx](src/pages/MainPOS.jsx) + [productMatch.js](src/lib/productMatch.js))
- 검색창 옆 **⚡ AI 검색 ON/OFF 토글**(localStorage `pos_ai_product_search`, 기본 ON). ON+검색어면 `searchProductsRanked`로 **관련도순** 랭킹 → `groupedProducts`를 `'🔎 관련도순'` 단일 그룹으로 평탄화(카테고리 그룹 대신 최상위 매칭 먼저). 카테고리 select은 랭킹 후 1회 필터
- **엔진 = 기존 `productMatch.js` `scoreProducts` 재사용** (동의어 스텐→스덴/후렌지→플랜지·초성 ㅅㄷ·오타 Levenshtein·치수 ±1·숫자단위). **🚨 100% 로컬·즉시 — Gemini/벡터/API 호출 0 → 토큰·비용 0, 무료티어 한도 무관** (전화받으며 막 쳐도 끊김 없음). 신규 export `searchProductsRanked(q, products, {limit})` = 제품객체를 점수순 반환
- **검색 전용 토큰 동의어 보강**: `scoreProducts(q, products, {synonymTokens:true})` 옵션 — 한글/숫자 경계로 쪼갠 part에 동의어 적용해 부분매칭("스텐밴딩54"→[스덴밴딩,54]가 "스덴 밴딩 **파이프** 54"에 각각 hit, 중간 '파이프' 무관). 의미부(한글) +18 / 숫자 +5 가중(숫자는 흔해서 약하게 — 안 그러면 짧은 'CH 150 54'가 길이비율로 앞섬). ⚠️ MOVIS `findProductSmart`는 이 옵션 미적용(영향 0)
- **🎯 최상위 일치 강조** ([index.css](src/index.css) `top-match-card`/`top-match-badge`): 관련도 1순위 카드 **딱 1개**에 빛나는 파란 테두리 글로우(`topMatchGlow`)+시머 스윕(`topMatchShimmer`)+배지(정확일치=`✓ 정확`/퍼지=`🎯 1순위`, `topMatchBadgePop` 탄성). `topMatch` useMemo로 `filteredProducts[0]` + 정규화 동일 여부 판정. `prefers-reduced-motion`이면 애니메이션 끄고 정적 테두리만
- **⚡ 성능 최적화 (버벅임 해결)**: ① **동의어 정규식 모듈 로드 시 1회만 컴파일**(`SYNONYM_RULES` — 매 호출 `new RegExp`×40 폐기) ② **제품 파생값 `WeakMap` 캐시**(`getProductDerived` — pn/pnNoSpace/pnWithSyn/pnSynNoSpace/pnChoseong/units/words를 제품객체별 1회 계산, 키입력마다 재계산 방지) ③ **쿼리 파생값을 제품 루프 밖으로 hoist** ④ **MainPOS 렌더 80개 상한**(`.slice(0,80)` — DOM 부담↓, #1은 강조). 결과: 625개 검색 1회 **≈4ms**(이전 키입력마다 2.5만 정규식 컴파일). ⚠️ WeakMap이라 products 배열 교체 시 옛 캐시 자동 GC
- ⚠️ 한계: *틀린 동의어+틀린 치수+띄어쓰기* 3중 오류(예 "스텐밴딩 55") 같은 극단 조합은 숫자 토큰이 다른 제품에 끌릴 수 있음(정상 범위). 실패 검색어 제보 시 `SYNONYMS` 사전에 점진 추가

### 전역 Ctrl+Z 삭제 복구 — 보이는 스낵바 ([App.jsx](src/App.jsx))
- ⚠️ **undo 엔진(undoStackRef·Ctrl+Z 리스너·삭제 연결)은 기존부터 존재**했음 — 사장님이 "없다"고 느낀 건 **(1) 안 보임 (2) 태블릿/폰엔 Ctrl+Z 없음**. → **하단 중앙 `[↩️ 실행취소]` 스낵바** 추가(10초 자동소멸, 데스크탑 Ctrl+Z + 터치 공용). `performUndo` 공용 함수(키+버튼)
- `pushUndo`는 **삭제류 타입(`/delete/i`)에만 스낵바** 노출(제품 추가/수정·재고·단가 등 비삭제는 Ctrl+Z만, 노이즈 방지). `entry.toast` true/false로 강제 가능. cart 변경은 `toast:false`
- 주문 복원 정확화: 단건/일괄 모두 `received_at` 보존(누락 시 DB default=NOW로 날짜 틀어짐). **일괄삭제 undo는 `successOrders`(실제 삭제분)만 복원**(부분실패 시 안 지워진 건 재삽입 안 함 — Codex 지적 수정)

## 🆕 v2026-06-23 — 스토어 클레임/취소승인 + 주문 감사로그 + 성능 + 단가/모달/MOVIS

### 구매자 클레임(취소·반품·교환 요청) 감지·표시·필터 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx))
- ⚠️ **네이버는 취소요청을 `productOrderStatus`가 아니라 `raw_payload.productOrder.claimStatus`(CANCEL_REQUEST/RETURN_REQUEST 등)에 넣고 status는 PAYED/DELIVERED 유지** → `order_status`만 보던 프론트가 취소/반품요청을 전혀 못 잡던 버그. `getClaimInfo(order, items)`(모듈 레벨)로 claimStatus/claimType 직접 파싱(DONE/REJECT/WITHDRAW 제외=진행중만). 단건 order.raw_payload + 다건 items 둘 다 탐색
- **표시**: 카드/컴팩트행에 🚨 취소요청/반품요청/교환요청 배지(깜빡임) + 카드 전체 **종류별 색 차별화**(`CLAIM_COLORS` 취소=주황#fb923c/반품=핑크#ec4899/교환=마젠타#d946ef: 배경 틴트+2px 테두리+글로우+상단바, 컴팩트행=좌측 액센트). 위젯 "🚨 취소·반품 요청" 카운트·클릭필터·상태필터 "취소·반품"·하단 모니터바 모두 claim 포함
- **가시성**: claim 주문은 order_status가 DELIVERED(종결)여도 숨기지 않음(반품요청이 종결로 묻히던 문제) — 종결 토글·날짜필터 예외

### 구매자 취소요청 "승인" API 연동 (비가역) — 1차: 취소만
- 카드/컴팩트에 **[취소요청 승인 (환불 확정)]** 버튼(CANCEL 클레임 한정) → 비가역 확인 모달 → `external_orders.needs_naver_cancel=true` 큐 등록(컬럼은 마이그003 기존, 마이그 불필요). 처리중/완료 상태 표기(`naver_cancel_succeeded_at`)
- **매장PC [sync.js](../naver-sync-bridge/sync.js)** `processNaverCancelApprovals()` 추가(발주확인 큐와 동일 패턴: 원자적 claim+재시도 backoff) → `POST /external/v1/pay-order/seller/product-orders/{poid}/claim/cancel/approve`. ⚠️ **엔드포인트 best-guess — 1건 라이브 검증 필요**(틀리면 환불 안 되고 `naver_cancel_error`에 HTTP에러만 기록=안전). **sync.js 수정 후 매장PC 재시작 필요**. 정상 검증되면 반품승인 확장 예정. ⚠️ 다건 부분취소는 poid 한정 미적용(1차 단건만 테스트)

### 일괄 내부주문 + 발주확인 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx))
- 컴팩트 선택바 [일괄 내부주문] → 선택 네이버 주문 모아 전환 모달([전환+발주확인]/[전환만]). `bulkConvertTargets`(이미 전환/종결/비네이버 제외) + `doBulkConvert(sendConfirm)` 순회(silent). `convertToInternalOrder`는 `Array.isArray(result)?result[0]:result`로 internal_order_id 정규화 유지

### 배송메모 + 받는분 표시
- **스토어 패널**(`parseNaverMeta.shippingMemo`): 카드/펼침/상세에 📝 배송메모(구매자 배송요청) 파란 박스. 전환 메모(`convertToInternalOrder`)도 단건/다건 모두 `po.shippingMemo`||items 폴백으로 기록
- **카드뷰 받는분 배지**: 구매자명 옆 🎁 받는분(주문자≠받는분 주황, `getReceiverName`)
- **주문내역/상세 받는분**([OrderHistory.jsx](src/pages/OrderHistory.jsx)/[OrderDetail.jsx](src/pages/OrderDetail.jsx)): 전환 memo의 `구매자:`/`받는분:` 파싱(`parseStoreParties`) → 주문자≠받는분일 때 카드 배지 + 상세에 🎁받는분 카드(주황)

### 주문 변경 감사 로그 (order_audit_log) — 혹시 모를 사고 대비
- **신규 테이블** `order_audit_log`(마이그 [007](../naver-sync-bridge/migrations/007_order_audit_log.sql) **적용완료**): `order_id,action(create/update/delete),changes jsonb,actor,source,created_at`. RLS **append-only**(anon insert/select만, update/delete 정책 없음 → 위변조·삭제 불가, 라이브 검증)
- [supabase.js](src/lib/supabase.js): `updateOrder`(변경 전 select→바뀐 필드만 `{from,to}` 기록), `deleteOrder`(삭제 전 전체 스냅샷), `saveOrder`(생성 요약) 자동 기록 + `getOrderAuditLog(orderId)`. **actor=기기ID**(localStorage `pos_device_id`/`pos_device_name`). 테이블 없거나 실패해도 **주문 흐름 안 막음**(조용히 무시). ⚠️ 화면 뷰어는 미구현(다음)

### 스토어 로딩 성능 + 날짜 필터
- **N+1 제거**: `reload`이 주문마다 items를 따로 49번 요청하던 것 → `getExternalOrderItemsByOrders(ids)` **단일 `in.()` 배치 쿼리**(49요청→1). 배지 60초 폴링도 `select`로 필요 4컬럼만(raw_payload 제외)
- **날짜 필터 = 오늘결제 OR 오늘작업(발주확인/발송/취소 처리시각) OR 미처리(needsAction) OR 클레임**. ⚠️ "전환 주문 전체(trackingConverted) 끌어올림"은 **제거**(오늘에 옛 이력 다 뜨던 원인). 미처리·클레임만 날짜 무관 노출

### 관리자 단가조정 + 모달 잘림 ([AdminPage.jsx](src/pages/AdminPage.jsx))
- **개별 선택**: 카테고리 펼침 목록 제품을 카테고리 미선택이어도 개별 선택(`selectedIds`, 초록체크) 가능(전체선택 후 빼던 불편 해소)
- **반올림 단위**: 없음/1원/10원/100원(기본)/1,000원 — % 조정 시 소수점 정리(`applyRound`). IRP 제품 11개 100원 반올림 DB 백필 완료
- **Modal 모바일 버튼 잘림 fix**: `flex-1 overflow-y-auto` 자식 **`min-h-0`** 누락으로 콘텐츠가 부풀어 모달이 화면 밖 넘쳐 저장버튼 잘리던 버그 → `min-h-0`+`100dvh`+`pb-24 md:pb-5`. 관리자 전 모달 공용 일괄 해결(Playwright 좌표 검증)

### MOVIS
- **추론 트레이스 애니메이션**([useAIAnalystChat.js](src/hooks/useAIAnalystChat.js)/[ChatPanel.jsx](src/components/analytics/ChatPanel.jsx)): Claude/GPT식 — `loadingSteps` 누적(`onProgress` 도구 호출마다 단계 추가, 이전=✓done 흐림, 현재=양자코어+막대). `ThinkingChip` 다단계 카드
- **가격 도구 도매/소비자 매핑 강화**([geminiTools.js](src/lib/geminiTools.js)): `updateProductPrice`/`bulkUpdateProductPrice` 설명+파라미터+시스템프롬프트에 명시 — 도매가/도매/매입가→wholesale만, 소비자가/소매가/판매가→retail만, **말한 쪽만 채우고 양쪽 동시 금지**, 구분 없으면 되묻기
- **자연어 인식 대폭 보강 + 동의어 사전**([geminiAnalyst.js](src/lib/geminiAnalyst.js) `WRITE_INTENT_PATTERNS` + [geminiTools.js](src/lib/geminiTools.js) 시스템프롬프트): "스페셜라인 배송지 …로 변경"을 못 잡던 문제 → **배송지/배송주소/납품처/보내는곳/위치=주소(address), 연락처/번호/핸드폰/폰=전화(phone)** 동의어로 `updateCustomer` 인식. 재고도 들어왔어/입고/소진/맞춰 등 확장. 시스템프롬프트에 **현장 표현→도구/필드 매핑 사전**(거래처=업체=고객, 재고=수량=개수, 들어왔어=입고/품절=0 등) + 조사/오타/어순 변형 허용. ⚠️ **변경 동사 없으면 조회 유지**(읽기 오트리거 0 — 정규식 11문장 실측 검증). 미트리거여도 시스템프롬프트 사전이 자율 호출로 2차 보완. 실패 문장 제보 시 점진 추가가 토큰 효율적

### 택배 송장 발송인(엠파츠) 안전망 ([ShippingLabel.jsx](src/pages/ShippingLabel.jsx))
- `isStoreOrder` = memo 마커(`[엠파츠]`/`네이버 스마트스토어`) **OR 거래처 카테고리='엠파츠'**(`isEmpartsCustomer`, 마커 유실 대비). export 그룹화에서 커스텀 항목도 네이버(`[네이버` note)/엠파츠 거래처면 발송인 강제 엠파츠. ⚠️ 표시 변경 후엔 브라우저 강력새로고침(stale JS) 안내

## 🆕 v2026-06-15 — 스토어 UI 고급화 + 전환 발주확인 선택 + 날짜 이동 + 명세서/메모 정리

### 스마트스토어 주문 목록·상세 UI ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx))
- **컴팩트 테이블 정렬 정비**: 그리드 분기점 `sm:grid` → **`lg:grid`(≥1024)** 로 상향 — 1024 미만(태블릿·모바일)은 깔끔한 wrap 카드 레이아웃, 1024 이상만 7컬럼 그리드. 768px에서 사이드바+그리드가 욱여넣어져 금액/주문일/액션 글자가 겹치던 문제 근본 해결. 헤더행/데이터행/자식 `sm:` 토글 전부 `lg:`로 통일
- **그리드 컬럼 비율**: `34px / 주문자2.2fr / 배송88px / 상태0.85fr / 금액1.1fr / 주문일0.9fr / 액션1.75fr`. 상태 뱃지는 좁은 상태칸 **중앙 정렬**(`sm:w-full` 제거), 헤더 라벨과 세로 일치
- **액션 버튼 고급화** — 공용 `ActionBtn`(모듈 레벨) + `ACTION_VARIANTS`(primary/purple/green/blue/red) 팔레트. 아이콘(ArrowRight/ClipboardCheck/Truck/Printer/Ban) + 테두리 + 호버 입체감(`-translate-y-px`+shadow+brightness). 컴팩트행은 **좌측 정렬**(`lg:justify-start`)로 행마다 `내부주문` 버튼 세로 일치(발주확인 끝난 행도 어긋나지 않음). 카드뷰=`CARD_ACTION_CLASS`, 상세모달 푸터=`MODAL_FOOTER_CLASS` 동일 톤. 형광초록(#00ff88) → 정제 초록(#06a850), 송장 보라 → 파랑(#2f7df0)
- **상세 모달 가독성**: 상품 라인 옵션을 `🎚️` 파란 칩(15px 볼드)으로, 수량을 **`×N` 솔리드 파란 칩(17px)** 으로 확대. 헤더 닫기 X를 **빨강 배경 버튼**으로 강조 + 푸터에 **`✕ 닫기` 버튼 추가**. 푸터는 `flex-shrink-0` 고정이라 스크롤·작은화면에서도 안 잘림

### 내부주문 전환 시 네이버 발주확인 = 선택 (자동 → 모달)
- `convertToInternalOrder(order, { sendConfirm })`로 시그니처 변경 — `sendConfirm`이 true일 때만 `needs_naver_confirm` 큐 등록. 전환 버튼은 `requestConvert(order)` 경유: **네이버 미확인 주문이면 선택 모달**(`convertModalOrder`) → [전환+발주확인 보내기] / [전환만(안 보냄)]. 이미 confirmed/비네이버는 묻지 않고 바로 전환. (이전엔 전환 시 무조건 발주확인 자동 큐잉 → 사장님이 원치 않음). 모달은 아이콘 칩 헤더+정보카드+솔리드/아웃라인/고스트 버튼
- **스토어 자동메모 카드 숨김**: 전환 시 생성되는 메모(`[엠파츠] [네이버 스마트스토어] {id}\n구매자../주소../배송:착불·선불`)를 [OrderHistory.jsx](src/pages/OrderHistory.jsx) `isStoreAutoMemo()`/`hasUserMemo()`로 **주문 카드 메모박스 + 미확인메모 알림/집계/필터에서만 제외**. ⚠️ **DB memo는 그대로 유지** — 송장 발송인=엠파츠·착불/선불 자동, 주문내역 네이버 초록카드 강조, 구매자명 파싱, channelClassifier가 전부 raw memo 마커에 의존하므로 **memo 자체 삭제 금지**. 상세/거래내역 뷰엔 메모 계속 표시

### 명세서 ([InvoicesPage.jsx](src/pages/InvoicesPage.jsx))
- **PNG/카톡 저장 시 버튼 제외**: `toPng`/`toBlob`에 `filter: exportFilter` 적용 — `.no-print` 요소(입금등록·일괄입금·업체상세 + 행별 수정/✕ + 안내 수정)를 캡처에서 제거해 **진짜 명세서**(일자·품목·수량·단가·공급가·세액 + 안내·인수자)로 저장. (no-print는 `@media print` 전용이라 캡처엔 찍히던 문제)
- **날짜 ◀ M/D ▶ 스테퍼**: 프리셋 줄 앞에 하루씩 이동 버튼(`stepInvoiceDate`/`invAnchorDate`) → 단일 날짜(`custom`) 모드로 고정. 특정 날짜(예: 12일)로 이동하면 그날 명세서만 표시(오늘 자동포함 혼입 해소). 미래일은 비활성

### 주문 내역 ([OrderHistory.jsx](src/pages/OrderHistory.jsx))
- **날짜 ◀ M/D ▶ 스테퍼**(`DateStepper`/`stepDate`/`currentAnchorDate`): 날짜 필터 줄에 하루 전/후 이동. 클릭 시 `custom` 단일 날짜로 전환, 미래일 비활성. 접힘/펼침 두 줄 모두 적용
- **모바일 하단 잘림 fix**: 주문 목록 컨테이너 `py-4` → **`pt-4 pb-24 md:pb-4`** — 마지막 카드의 장바구니/재주문 버튼이 하단 MobileNav(약 64px)에 가려지던 문제 해결(갤럭시 실측)

## 🆕 v2026-06-11 — 스토어 주문금액 정확화 + 전역 알림 + 송장 받는사람 + MOVIS 보강

### 스토어 주문 금액/수수료/배송수단 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx))
- **주문금액 정확화**: `external_orders.total_amount`가 sync에서 상품주문 1건치(lineTotal)만 저장돼 다건 과소계상(실수령>주문금액 역전, MOVIS 오답)되던 버그. `orderPaymentTotal(order, items)` 헬퍼 = **order레벨 결제액**(raw_payload.order의 generalPaymentAmount+naverMileagePaymentAmount+payLaterPaymentAmount+chargeAmountPaymentAmount) 우선 → items 합 → total_amount 폴백. 표시 경로(모달·카드·목록·복사)에 적용. ⚠️ 정렬(`sortBy==='amount'`)·CSV export·KPI 합산은 여전히 `o.total_amount` 직접 참조하지만, **sync.js 수정 + 기존 14건 백필로 DB total_amount 자체가 정확**해져 결과는 올바름. total_amount는 **int 컬럼** — float PATCH 시 22P02
- **네이버 수수료/정산예정금액**: `computeNaverFees(items)` — 결제+매출연동(knowledgeShopping)+판매+채널 수수료 합산 + 수수료율. 실수령액(`parseNaverMeta.netAmount`)=`expectedSettlementAmount`(정산예정) 우선. 모달/카드에 수수료 분해 + 정산예정 표기, 목록행에 `수수료 -N원`
- **배송수단 배지**: `getDeliveryMethod(order, items)` — `DELIVERY_METHOD` 맵(📦택배/🏬방문수령/🚚직접배송/🛵퀵/🚫배송없음). `expectedDeliveryMethod`||`delivery.deliveryMethod` 기준. 목록·카드·모달 표기
- **받는사람 강조 + 카톡 복사**: 고객정보 카드에 🎁받는분(주문자≠받는분 시 주황 경고). `buildOrderCopyText`/`buildCustomerCopyText`(입금자+받는분 라벨), `copyToClipboard`(https 폴백). 선택 주문 [전체 복사]
- **상세모달**: 확대(max-w-3xl)+전체화면 토글(`modalFullscreen`)+반응형(모바일 풀스크린), 컴팩트 테이블 `grid-cols minmax(0,fr)` 정렬 정합
- **취소 버튼 = 로컬 표시 전용**: sync.js에 네이버 취소 핸들러 없음 → `needs_naver_cancel` 안 세움(오작동 방지). 모달에 "네이버 실제취소 아님 + 판매자센터 링크" 경고
- **택배 송장 연동 = 받는사람 기준**: `handleCreateShippingLabel`이 배송지(shippingAddress) 받는사람 이름·전화·주소 우선(이전엔 주문자 전화로 잘못 들어감). 내부주문 거래처는 입금자 유지(회계)

### 전역 주문 알림 ([StoreOrderAlerts.jsx](src/components/StoreOrderAlerts.jsx)) — 신규
- App 최상단 마운트. **어느 페이지든** external_orders realtime(INSERT/UPDATE) 구독 → 신규주문/취소 시 **Web Audio 합성음 + 상단 팝업 + 브라우저 OS Notification**. `window 'external-orders-changed'` 이벤트로 각 페이지 reload
- 사운드 on/off: localStorage `pos_store_alert_sound`('1'/'0'). 취소 중복알림 방지 ref(상한 500). SmartStoreOrders는 자체 구독 제거하고 이벤트 리스너로만 reload
- (참고) [ChunkErrorBoundary.jsx](src/components/ChunkErrorBoundary.jsx): App에서 `key={currentPage}`로 페이지별 에러 바운더리 — 한 페이지 청크404가 다른 페이지로 안 번지게 격리

### MOVIS 쓰기의도 감지 보강 ([geminiAnalyst.js](src/lib/geminiAnalyst.js) `WRITE_INTENT_PATTERNS`)
- 자연어 쓰기 명령이 도구 강제(mode=ANY) 못 받고 검색으로 빠지던 누락어 보강: 가격='금액/단가/도매가/소비자가', 재고='수량/정정/재고없음', 주문='팔았어/나갔어/판매', 거래처='주소/연락처' 수정. 어순/비인접도 매칭(`[\s\S]{0,25}`), 조회성 문장은 비매칭
- 작업 완료 알림: ✅완료/❌실패 system 메시지를 [MessageBubble.jsx](src/components/analytics/MessageBubble.jsx)에서 **큰 색상 카드**(초록/빨강)로 렌더(기존 작은 회색 알약 → 적용 여부 식별)

### 재고현황 ([StockOverview.jsx](src/pages/StockOverview.jsx))
- 테이블에 **소매가·마진(액/율)** 컬럼 추가(마진=소매-도매, 색 구분). 모바일 압축 표기. 검색 토큰매칭(name+category+code+barcode, null 안전)
- 모바일 카드 탭 시 거슬리던 파란 빛 스윕 제거(`@media (hover:none)` — order-hover-premium/order-row-premium 비활성)

## 🆕 v2026-06-10 — AI 자율개입 + 네이버 카탈로그 검색 + 제품 주의사항/단가 모니터링

### AI 아침 브리핑 ([MorningBriefing.jsx](src/components/dashboard/MorningBriefing.jsx))
- 대시보드 상단 카드. 규칙 집계(장바구니 출고/지연·재고부족·미수·오늘매출) + **네이버 스마트스토어 긴급도**(발송기한 초과/D-day/D-1/미처리/취소요청) + **✨ AI 한 줄 요약**(Gemini)
- 네이버 긴급도: [naverOrderStats.js](src/lib/naverOrderStats.js) `computeNaverBriefing()` — `isOrderPending`/`isOrderDone` 재사용, dispatch_due_date 기준. ⚠️ 취소요청은 **미처리 `CANCEL_REQUEST`만** 카운트(종결 `CANCELED` 제외 — 안 그러면 취소완료건이 "확인 필요"로 오표시)
- AI 요약: [geminiAnalyst.js](src/lib/geminiAnalyst.js) `summarizeMorningBriefing()` — 도구 없는 순수 텍스트 호출, 실패 시 숫자카드만 폴백. **동적 import**로 메인번들 분리. 30분 캐시 `pos_morning_briefing_ai_v1`

### 네이버 스토어(엠파츠) 상품 카탈로그 검색 (MOVIS)
- **목적**: MOVIS에서 "엠파츠 스토어에 HKS 흡기 관련 상품 다 찾아줘" → 네이버 실제 등록 상품·옵션 전체 검색 (POS DB 625개와 별개)
- **DB**: `external_products`(channel_product_no PK, name, status_type, sale_price, options JSONB, product_url 등) + `external_sync_cursors.force_sync`. 마이그레이션 [005](../naver-sync-bridge/migrations/005_external_products_catalog.sql) (적용완료)
- **sync.js**(매장PC): `syncNaverCatalog()` — `POST /external/v1/products/search` 페이징 + 옵션은 **`GET /external/v2/products/channel-products/{no}`**(⚠️v1은 404) 단건조회. 하루1회 자동(새벽4시+) + RPC `request_naver_catalog_sync_now()`. CLI `--catalog [--no-options] [--limit N]`, `--probe <no>`. **주문 sync와 try/catch 격리** + MAX_CATALOG_PAGES=300 폭주가드. ⚠️ watchdog가 `*sync.js*` 프로세스 전부 죽이므로 백필 전 메인 깨끗이 재시작 필요
- **MOVIS 도구**: [geminiTools.js](src/lib/geminiTools.js) `searchNaverCatalog({keyword,limit,inStockOnly})` — 토큰매칭(옵션명 포함)+관련도순. `searchProducts`(POS DB)도 토큰매칭 개선. AIAnalytics가 `getExternalProducts()`로 로드해 context 주입
- 검증: 729개 상품 적재, 343개 옵션 보유

### 제품 주의사항(메모/색상) + 단가 변경 기록 + 초기금액 모니터링
- **DB**: products에 `note`, `flag_color`, `initial_wholesale/initial_retail`, `initial_set_at`, `price_history JSONB`. 마이그레이션 [006](../naver-sync-bridge/migrations/006_product_notes_price_history.sql) (적용완료, 초기금액 전제품 백필)
- [supabase.js](src/lib/supabase.js) `updateProduct`: 도매/소매 변경 시 `price_history`에 자동 기록(최근50) + 초기금액 백필. `addProduct`: 초기금액 설정. **PGRST204 폴백**(`stripProduct006`)으로 마이그 미적용 시에도 편집 무중단
- [AdminPage.jsx](src/pages/AdminPage.jsx): 제품 수정 폼에 ⚠️주의사항 메모 + 강조색상 6색(`FLAG_COLORS`) + 📊단가 모니터링(초기→현재 증감 + 변경이력)
- [MainPOS.jsx](src/pages/MainPOS.jsx): 카드 왼쪽 색 액센트바 + ⚠️ 메모 **카드 하단 상시 표시**(`FLAG_MAP`). 담은 상태에서도 VAT제외 표시 유지

### 장바구니 수정 모달 개편 + 기타
- [SavedCarts.jsx](src/pages/SavedCarts.jsx): 편집 라인을 단일 응집 카드로 재설계(제품명+수량·단가·합계 한 줄 연결) + **제품 교체**(`replaceLineProduct` — 잘못 주문한 제품 다른 것으로, 수량 유지, 중복 id 차단). 합계영역 기본 접힘(`isBottomExpanded=false`)
- [SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx): 상단 요약 위젯 접기/펼치기 토글(`smartstore_widgets_collapsed`) + [상품 동기화] 버튼
- 모달 중앙 정렬: `useDraggableResizable` `centerOnOpen` 기본 true (구석 박힘 방지)
- 0원 복사 버그 fix: 저장카트 복사 시 단가 폴백 체인(`wholesale||price||retail||0`)

## 🆕 v2026-06-02 — 스마트스토어 진행단계/전환/송장 연동 + 네이버 발송 정합성

### 진행단계 스텝퍼 ([SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx) `OrderStepper`/`orderStage`)
- 카드·컴팩트 펼침에 5단계 바: **결제완료 → 발주확인 → 발송 → 배송중 → 배송완료** (지난=초록✓, 현재=청록, 취소/반품=빨강 별도 트랙)
- `orderStage(o)`: 발송시각(`naver_dispatch_succeeded_at`)·`order_status`로 stage 산출. 발송시각만 찍힌(상태 PAYED) 건도 stage 2로 정확 분류
- 기본 조회기간 `1w` → **`today`**

### 내부주문 전환 시 네이버 상태 유지 (핵심 정합성)
- `convertToInternalOrder`: **`order_status='converted'` 덮어쓰기 제거**. 전환해도 네이버 원본 status(PAYED/confirmed/DELIVERING…)가 유지돼 sync가 계속 추종. (이전엔 converted=STATUS_RANK 99에 막혀 전환 즉시 네이버 연동이 영구 정지됨)
- 전환 여부는 `internal_order_id`로만 판정 → 상태 칩 옆 **`📥 내부주문 등록됨`** 별도 마커
- 페이지 기본 숨김: `DONE_STATUSES` → **`isOrderTerminal`**(배송완료/구매확정/취소/반품/교환만). converted/shipped/배송중은 계속 표시(추적). 토글 라벨 "배송완료·취소 표시"
- 액션 버튼 게이팅: 내부주문 `!internal_order_id && !isOrderDone`, 발송/취소 `!isOrderDone`

### orderStatus.js — `isOrderPending` 배지 가드
- `isOrderPending`에 **`!o.internal_order_id`** 추가: 전환된 주문(상태는 PAYED/confirmed 유지)이 메뉴 빨간 배지에 잔존하지 않도록. 배지↔페이지 게이팅 기준 일치
- `TERMINAL_STATUSES`/`isOrderTerminal(o)` 신규 (페이지 숨김 단일 소스)

### 송장 → 네이버 발송 연동 ([ShippingLabel.jsx](src/pages/ShippingLabel.jsx) `NaverDispatchPanel`)
- 택배 송장 페이지에서 **네이버 주문**(📦 커스텀항목 `naver-{poid}` / 전환주문 memo `[네이버 스마트스토어] {poid}`)을 펼치면 **🟢 네이버 발송 연동** 패널: 택배사+송장번호 → `needs_naver_dispatch` 큐 등록 → sync.js가 60초 내 네이버 발송처리
- patch 계약은 SmartStoreOrders `submitDispatch`와 동일(9필드). `supabase.getExternalOrderByProviderOrderId(poid)`로 외부주문 조회
- **3경로 모두 가능**: SmartStore 단건 `발송처리`, 일괄 `발송처리`, 송장 페이지 패널 (전부 같은 큐)
- SmartStore 발송 모달의 옛 "Phase 1 Mock — 네이버 전송 안 됨" 오안내 → "🟢 60초 내 네이버 자동 연동"으로 교정

### 택배사 코드 단일 소스 ([src/lib/naverCouriers.js](src/lib/naverCouriers.js) 신규)
- SmartStoreOrders·ShippingLabel 공유. ⚠️ **로젠택배 = `KGB`**(옛 KGB택배), `LOGEN` 아님 — 실측 검증(KGB 성공/LOGEN 104119 거부). 경동=`KDEXP`, 롯데=`HYUNDAI`
- 틀린 코드면 네이버가 `104119 택배사코드 확인`으로 거부 → 주문 카드에 **빨간 발송 실패 배너**(`dispatchErrorHint`)로 즉시 표시. (이전엔 "대기열 등록 성공"만 뜨고 실패는 안 보여 사일런트)

### 착불/선불 필드 수정 (매장 PC sync.js)
- 착불/선불 = `productOrder.shippingFeeType`("착불"/"선불"). `deliveryPolicyType`("유료"/"무료")는 배송비 유무라 무관 — 잘못 저장하던 것 교정. 송장 발송인=엠파츠 + 착불/선불 자동은 이 값을 사용

## 🆕 v2026-06-01 — 스마트스토어 배지/색상/옵션/송장 + 네이버 연동 정합성

배지 의미 재정의 + 완료판정 단일화 + 상태별 색상 분리 + 내부주문 옵션 보존 + 송장 발송인(엠파츠)/착불선불 자동 + 네이버 종결·발송 API 연동 수정.

### 단일 소스: [src/lib/orderStatus.js](src/lib/orderStatus.js) (신규)
- `DONE_STATUSES` — 종결 상태 10종 (converted/shipped/cancelled/DELIVERED/DELIVERED_COMPLETED/PURCHASE_DECIDED/CANCELED/CANCELED_BY_NOPAYMENT/RETURNED/EXCHANGED)
- `IN_TRANSIT_STATUSES` — 배송중 (DELIVERING/DISPATCHED): 이미 발송돼 사장님 액션 불필요
- `PAYMENT_PENDING_STATUSES` — 입금대기 (PAYMENT_WAITING/PAY_WAITING): 고객 미결제, 사장님 액션 불가
- `isOrderDone(o)` = `DONE_STATUSES.has(order_status) || !!naver_dispatch_succeeded_at` — 발송처리 완료(dispatch 시각)도 완료로 봄 (polling이 status 따라오기 전 구간 false-positive 방지, code-review M-1)
- `isOrderPending(o)` = 완료(발송 포함)도, 배송중도, 입금대기도 아닌 상태 = **지금 처리할 주문**

### 배지 카운트 = `isOrderPending` (날짜 무관)
- App.jsx `smartstoreCount`: `getExternalOrders({limit:200})` → `isOrderPending` 필터. **오늘만이 아니라 옛 미처리 주문(예: 며칠 전 PAYED)도 포함** (2026-06-01 결정).
- 빼는 것: 입금대기(고객 미결제) / 배송중(이미 발송) / 종결. → 결제완료·발주확인·취소요청만 카운트.
- SmartStoreOrders.jsx 인라인 완료판정 5곳(isDone 2 + 일괄발송 eligible 3)을 `isOrderDone(o)`로 교체 → 배지/페이지 "대기"칩/일괄발송 단일 기준 (라이브 검증: 메뉴 배지 == 페이지 "대기" 칩 일치).
- 단, 페이지 기본 노출 필터(line 266)는 status-only 유지 → 배송중은 페이지엔 표시(추적용), 배지엔 제외 (의도된 차이).

### 상태별 색상 분리 (SmartStoreOrders STATUS_LABEL)
- 수명주기 단계가 한눈에 구분되도록 고유 색: 입금대기=회색 / 결제완료·매칭=시안 / 발주확인=노랑 / 내부주문전환=틸 / 발송·발송중=파랑 / 배송중=보라 / 배송완료=초록 / 구매확정=진초록 / 취소요청=주황 / 취소=빨강 / 반품=핑크 / 교환=마젠타
- 누락 상태 추가: PAY_WAITING, CANCEL_REQUEST, CANCELED, CANCELED_BY_NOPAYMENT, RETURNED, EXCHANGED, DELIVERED_COMPLETED

### 내부주문 전환 시 옵션 보존
- `convertToInternalOrder`: 스토어 주문 옵션(예: "사이즈: 63-90")을 제품명에 `(옵션)` 형태로 붙여 보존 (상세 모달이 name을 렌더하므로). `option` 필드도 별도 보존.
- memo에 `배송: 착불/선불` 마커 기록 (내부주문엔 배송정책 필드 없음 → ShippingLabel이 읽음)

### 택배 송장 — 스토어 주문 발송인=엠파츠 + 착불/선불 자동 ([src/pages/ShippingLabel.jsx](src/pages/ShippingLabel.jsx))
- 경로 A(스토어 페이지 📦 송장 버튼 → `handleCreateShippingLabel`): customEntry sender='엠파츠' + 정책 정규화 (기존)
- 경로 B(내부주문 전환된 주문이 ShippingLabel 일반 목록에): `getOrderSetting`이 memo의 `[엠파츠]`/`네이버 스마트스토어` 감지 → 발송인=엠파츠 고정 + 착불/선불은 memo `배송:` 마커에서 자동 (매장 거래처 설정보다 우선)

### naver-sync-bridge (매장 PC, 별도 repo)
- sync.js `pollChangedOrders`: 24h 윈도우 catch-up 루프 — cursor가 며칠 밀려도 한 폴링에서 현재까지 추종 (MAX_PAGES 초과 시 유실 방지, code-review C-1). `logs/heartbeat.txt` 기록 → watchdog가 15분+ stale 시 hung 판정 재시작.
- **종결 연동**: 이미 추적 중인 주문이 네이버에서 취소/반품/구매확정/배송완료되면 갱신 (신규 종결 유입만 차단).
- **발송처리 API**: 필수 `dispatchDate`(KST +09:00) 추가 — 누락 시 HTTP 400. HTTP 200 부분실패(`failProductOrderInfos`)도 파싱해 거짓 성공 방지 (confirm/dispatch 공통).
- **미해결**: `external_orders.matched_customer_id`(integer) vs `customers.id`(UUID) 타입 불일치 → 자동 고객매칭 PATCH 400 (주문 적재엔 영향 없음, /db-health로 처리 예정).

## 🆕 v2026-05-29 — 모바일 UX 전면 개편 + sync.js 상태 머신 + 인프라 보강

오늘 13 커밋 (pos-calculator-web 10 + naver-sync-bridge 5 = 총 15 변경). 인프라 사고 1건 + 데이터 정합성 버그 2건 해결.

### A. SmartStore 모바일 UX 전면 개편 (da743fc + bf3119a + 002bfb3 + 9d26f37 + bf79bc0 + f7870f9 + e6f6391)

#### A-1. 모바일 스크롤 (`da743fc`)
**문제**: SmartStoreOrders 페이지가 root에 `h-full overflow-hidden` + 카드 영역만 `flex-1 min-h-0 overflow-y-auto` 중첩 스크롤. 모바일 viewport(667px)에서 헤더+Sync위젯+KPI+네이버위젯6+날짜필터+상태필터 6블록이 460~540px 차지 → 스크롤 영역 100px 이하로 줄어 사실상 스크롤 불가.

**수정**: 헤더만 고정으로 두고 KPI/위젯/필터/카드 전체를 단일 wrapper `flex-1 min-h-0 overflow-y-auto`로 통합.

**검증**: Playwright 모바일 viewport 375x812 → `innerScroll.scrollHeight=1744px in clientHeight=499px` → scrollable: true ✅

#### A-2. 상단 위젯 폰트/사이즈 + 클릭 액션 (`da743fc`)
- `KpiCard`: `text-xl` → `text-2xl sm:text-3xl`, `p-2.5` → `p-3 sm:p-3.5`, hover 효과 + onClick prop
- `NaverStatBox`: `text-base` → `text-xl sm:text-2xl`, `text-[9px]` → `text-[11px] sm:text-xs`, `minHeight: 92`, hover/active
- 그리드: KPI 4열 → 모바일 2x2, 네이버 위젯 3열 → 모바일 2x3 / 태블릿 3x2 / 데스크탑 1x6
- 10개 카드 모두 `<button>` 으로 변경, hover `shadow-md + -translate-y-0.5`, active `scale-[0.98]`

#### A-3. 위젯 카운트↔클릭필터 1:1 일관성 (`bf3119a`)
**Codex Major fix**: 위젯 카운트와 클릭 필터가 다른 로직을 쓰던 문제.

**해결**: `widgetFilter` state 도입 (`'overdue' | 'dueDday' | 'dueD1' | 'autoPending' | 'newAfterConfirm' | 'cancel'`).
- `filtered` useMemo에 stats 카운트 로직과 1:1 동일 적용
- 토글: 같은 위젯 재클릭 = 해제
- 일반 status/provider/date filter 변경 시 widgetFilter 자동 해제
- 활성 위젯: accent 색 테두리 2px + ring shadow + bg `color-mix(in srgb, ... 12%, var(--background))`
- "필터 해제 ✕" 칩 (active 시)

#### A-4. "발주 후 신규" 카드 안 보이던 버그 (`002bfb3`)
**문제**: `newAfterConfirm` 카운트는 `converted` 상태 포함이지만 `showCompleted` 토글이 OFF면 converted 카드가 숨겨져서 위젯 클릭해도 카드 0건.

**수정**: `widgetFilter` active 시 `showCompleted` 토글 우회. M4 추가 fix: `autoPending`에 `isDone`/`dispatched` 가드 (polling latency false positive 방지).

#### A-5. 일괄 발송 multi-select UI (`9d26f37`)
- 컴팩트 모드 row 앞에 체크박스 컬럼 + 헤더 전체 선택
- 선택 시 상단 floating bar: "N건 선택 / [일괄 발송처리] / [해제]"
- 일괄 발송 모달: 택배사 공통 선택 + 주문별 송장번호 input
- 송장 입력된 건만 등록, 발주확인 미완료 건은 자동 함께 등록
- M1 부분 실패 처리: 실패 주문만 selection + tracking 보존, 모달 유지, 토스트에 buyer_name 3건 + "외 N건"

#### A-6. 주문 취소 모달 (`bf79bc0` + `e6f6391`)
- `cancelOrder` 함수: `Ban` 아이콘 버튼 → 모달 오픈
- C1 fix: `window.prompt/confirm` → 모달 UI (iOS Safari 안정성, CLAUDE.md 모달 정책 일관성)
- 5개 사유 preset 버튼 (`상품 품절 / 구매자 요청 / 배송 지연 / 가격 오류 / 기타`) + textarea + 200자 카운터
- 구매자/주문번호/금액 미리보기 + disabled 상태 처리
- DB: `order_status='cancelled'` + `needs_naver_cancel=true` + `naver_cancel_reason` PATCH

#### A-7. 채널 분류 헬퍼 (`bf79bc0`)
**Codex Major D fix**: 옛 엠파츠 단일 거래처 + 새 분산 거래처(category 태그) 둘 다 일관 처리.

**파일**: `src/lib/channelClassifier.js`
- `classifyOrderChannel(order)` → `'naver' | 'general'`
- `aggregateByChannel(orders, customers)` → 채널별 매출 집계
- `extractNaverBuyer(order)` → memo에서 구매자 이름

OrderHistory.jsx의 isNaverOrder 정규식 인라인 → channelClassifier 호출로 통합 (M2 DRY).

#### A-8. OrderHistory 네이버 카드 강조 (★ M5 핫픽스 - 가장 중요!)
**버그**: borderWidth/boxShadow를 같은 style 객체에 두 번 정의 → 뒤 값이 덮어써서 **네이버 카드 강조(2px+초록 glow)가 실효성 0**.

```jsx
// 버그 코드
borderWidth: isNaverOrder ? '2px' : undefined,  // ← 이게
boxShadow: isNaverOrder ? '0 0 0 1px rgba(3,199,90,0.35)...' : undefined,
borderWidth: isReturned ? '2px' : '1px',  // ← 이거로 덮어써짐!
boxShadow: isReturned ? '...' : isPaid ? '...' : undefined,  // 네이버 glow 사라짐
```

**수정** (`f7870f9`): 단일 조건문으로 통합, isReturned 우선 + 그 외 isNaverOrder 적용.

**Playwright 라이브 검증**: 네이버 카드 `boxShadow: rgba(3, 199, 90, 0.35) 0px 0px 0px 1px, rgba(3, 199, 90, 0.18) 0px 4px 14px 0px` ← **초록 glow 실제로 보임** ✅

### B. 거래처 카테고리 자동 태그 (`09432b0`)

**버그**: 신규 거래처만 customer_category 적용 → 기존 거래처와 매칭되면 카테고리 누락.

**수정**: App.jsx saveOrder 흐름 — `existingCustomer.category`가 비어있고 `orderData.customer_category` 있으면 `supabase.updateCustomer(id, { category })` PATCH + setCustomers 동기화.

**효과**: 네이버 주문 buyer가 기존 거래처와 매칭돼도 '엠파츠' 카테고리 필터에 잡힘.

### C. 스마트스토어 메뉴 빨간 알림 배지 (`fa82893`)

- App.jsx `smartstoreCount` state 추가
- `useEffect` 1분 polling: `supabase.getExternalOrders` 호출 → 오늘 received_at + non-DONE 카운트
- Sidebar/MobileNav badgeMap에 `'smartstore': smartstoreCount` 추가
- 빨간 배지 표시 (다른 페이지 패턴 일관)

### D. DONE_STATUSES 확장 (`057980f`)

**문제**: 처리완료 표시 토글 OFF인데도 DELIVERED/PURCHASE_DECIDED/CANCELED 카드 표시.

**수정**: DONE_STATUSES Set에 네이버 원본 종결 상태 추가.
```js
const DONE_STATUSES = new Set([
  'converted', 'shipped', 'cancelled',           // 내부
  'DELIVERED', 'PURCHASE_DECIDED',                // 네이버 종결
  'CANCELED', 'CANCEL_REQUEST',                   // 취소
]);
```

### E. sync.js 상태 머신 정정 (★ 데이터 정합성 fix)

#### E-1. STATUS_RANK 도입 - 후퇴만 방어 (`40d75fa`)
**버그**: `LOCAL_PROCESSED_STATUSES`에 `'confirmed'` 포함 → 사장님이 발주확인한 주문이 네이버에서 DISPATCHED/DELIVERED로 진행해도 polling 차단. 화면에 "어제 보냈는데 발주확인" stuck.

**수정**: STATUS_RANK 도입.
```js
const STATUS_RANK = {
  received: 1, PAYMENT_WAITING: 1,
  PAYED: 2, matched: 2,
  confirmed: 3,
  DELIVERING: 4, DISPATCHED: 4,
  shipped: 5,
  DELIVERED: 6,
  PURCHASE_DECIDED: 7,
  CANCEL_REQUEST: 90,
  CANCELED: 91, cancelled: 91,
  converted: 99,
};
```

**로직**: 새 status rank가 현재보다 높으면 **갱신**(전진 허용), 낮거나 같으면 **보존**(후퇴 방어).
- `confirmed(3) → DISPATCHED(4)`: 갱신 OK
- `confirmed(3) → PAYED(2)`: 보존
- `converted(99) → 무엇이든`: 절대 변경 안 함

#### E-2. received_at = paymentDate || orderDate (`6933e4e`)
**버그**: sync.js upsertOrderAndItem에서 `received_at` 명시 설정 안 함 → DB default(NOW) 사용 → **backfill 시 옛 주문이 backfill 실행 시각으로 표시**. 5/26 공효빈 주문이 5/29로 잘못 표시.

**수정**: `orderRow.received_at = od.paymentDate || od.orderDate || new Date().toISOString()`

**검증**: 5일치 backfill 18건 재실행 → Playwright 라이브 11건 카드 모두 주문번호 prefix와 일치하는 정확한 날짜 표시 (`202605**26**... = 5/26 16:25` 등).

### F. 인프라 사고 + 자동 보강 4건 (★ 운영 안정성)

#### F-1. 매장 PC 디스크 0GB 사고 (오전 9:47~14:30)
**증상**: 사장님이 "오늘 주문 안 들어옴" 보고. 네이버 관리자엔 주문 1건 있는데 우리 시스템엔 0건.

**원인**: C 드라이브 0GB Free (Downloads 폴더 혼자 267GB). sync.js PID 401272는 살아있지만 디스크 write 실패로 polling 결과 저장 못함. OS swap/temp도 실패해 시스템 전반 hang.

**복구**:
1. Vite/npm/Temp 캐시 정리 → 67GB Free 확보
2. sync.js kill (PID 401272) → 직접 재시작 (PID 425044)
3. 1일치 backfill → 어제 6건 동기화
4. 누락 1건 (신민철, 5/29 14:28) 5분 polling 자동 수집

#### F-2. 자동 보강 4건 등록 (`d146a7d`, `f060ca5`)
재발 방지 인프라:

| # | 항목 | 파일 | 효과 |
|---|---|---|---|
| 1 | **디스크 SessionStart 경고** | `~/.claude/hooks/session-start.sh` | Free < 5GB 빨강 / < 15GB 노랑 자동 경고 + sync.js 살아있는지 확인 |
| 2 | **sync.js watchdog** | `naver-sync-bridge/watchdog.ps1` | 5분마다 체크 → 죽었으면 자동 부활 (디스크 3GB 미만이면 skip) |
| 3 | **로그 파일 출력 + 회전** | `start.bat` 수정 | stdout→`logs/sync-YYYYMMDD.log`, stderr→`.err`, 7일 후 자동 삭제 |
| 4 | **Task Scheduler 트리거 강화** | `install-scheduler.ps1` | AtLogon → **AtStartup 추가** + RestartCount 3 (5분 간격) |

**등록 완료**:
```
MOVE-WEP-Naver-Sync-Bridge   Ready  ← AtLogon + AtStartup + RestartCount 3
MOVE-WEP-Naver-Sync-Watchdog Ready  ← 5분마다 sync.js 살아있는지 체크
```

### G. flow-check 라이브 검증 결과

오늘 마지막 단계로 Playwright MCP 직접 검증:
- ✅ sync.js LIVE 표시, 마지막 sync "방금 전", 24h 성공률 100% (288회)
- ✅ 오늘 누락 1건 (신민철 320,000원) 자동 수집됨
- ✅ 위젯 클릭 → border 2px active 강조 작동
- ✅ 컴팩트 모드 체크박스 5개 (헤더+row 4)
- ✅ 카드 모드 [주문취소] 버튼 + 모달 정상
- ✅ **OrderHistory 네이버 카드 boxShadow 초록 glow 적용** (M5 핫픽스 효과)
- ✅ 모바일 viewport 스크롤 1744px in 499px → scrollable
- ✅ Console 에러 0건
- 최종 판정: **PASS (95점)**

### H. 사장님이 발견한 의문 2건

| 의문 | 원인 | 해결 |
|---|---|---|
| "공효빈 왜 오늘 떠있어?" | received_at 미설정 → DB default(NOW) | E-2 수정 후 5/26로 정확 표시 |
| "어제 발송한 게 왜 발주확인?" | STATUS_RANK 없어 confirmed→DISPATCHED 차단 | E-1 수정 후 DELIVERED/PURCHASE_DECIDED 정확 반영 |

### I. Codex 2차 리뷰 Critical 3건 핫픽스 (저녁 추가, `f3e49c6` + `c6cea32`)

저녁에 /bkit:code-review 실행 → Critical 3건 발견 → 즉시 핫픽스:

#### I-1. C-1 watchdog 무한 재시작 가드 (`c6cea32`)
**위험**: sync.js가 syntax error/throw로 즉시 crash하는 코드 배포 시 watchdog이 5분마다 무한 재시작 → 디스크/로그 폭증 → F-1 사고 재발 트리거.

**수정**: `logs/restart-count-YYYYMMDDHH.txt` 카운터 파일. 시간당 5회 초과 시 skip + `FAIL hourly restart limit exceeded` 로그.

#### I-2. C-2 STATUS_RANK 누락 status 추가 (`c6cea32`)
**위험**: `TERMINAL_PRODUCT_ORDER_STATUSES`에는 등재됐는데 `STATUS_RANK`에 없는 status들이 polling 응답에 나타나면 → newRank=0 → `shouldKeepLocal=true` → polling 결과 통째 skip (사일런트 실패).

**수정**: 5개 추가.
- `PAY_WAITING: 1` (PAYMENT_WAITING 변형)
- `DELIVERED_COMPLETED: 6` (DELIVERED 종결 단계)
- `RETURNED: 95, EXCHANGED: 95` (반품/교환)
- `CANCELED_BY_NOPAYMENT: 91` (미입금 자동 취소)

#### I-3. C-3 CANCEL_REQUEST를 미처리로 분류 (`f3e49c6`)
**위험**: 구매자가 취소 요청한 주문이 DONE_STATUSES에 포함되어 화면에서 숨겨짐 → 사장님 응답 지연 → 클레임.

**수정**: `DONE_STATUSES`에서 `CANCEL_REQUEST` 제거. 네이버 위젯 "❌ 취소 요청"으로만 노출.

**+ 보강**: `DELIVERED_COMPLETED`, `RETURNED`, `EXCHANGED`, `CANCELED_BY_NOPAYMENT` 추가하여 종결 상태 정합성 완성.

### J. watchdog v2: 옛 코드 자동 감지 (`26db818`)

오후 사고: STATUS_RANK fix(`40d75fa`) 후 sync.js 재시작 누락 → PID 489920이 옛 코드로 polling → 신민철 status 미반영 → 사장님 "왜 그대로지" 보고.

**수정**: watchdog.ps1 강화.
```powershell
if (sync.js 파일 mtime > 프로세스 CreationDate + 2분) {
  Restart-SyncJs "stale-code"  # 옛 코드 감지 → 자동 재시작
}
```

**효과**: 코드 변경 후 최대 5분 내 자동 적용. 운영 사고 자가 복구.

### K. SessionStart 훅 sync.js 감지 수정 (저녁 추가)

오후 사고 후폭풍: SessionStart 훅의 `pgrep -f "sync.js"` 가 Windows 프로세스를 못 감지 → false alarm "sync.js 미실행" 경고가 실제로는 살아있는데 표시되던 문제.

**수정**: `wmic process where "name='node.exe'" get commandline | grep "sync.js"` 우선 시도, 실패 시 pgrep 폴백.

---



오늘 누적 27 커밋. 핵심 기능 13가지 + Codex Critical/Major fix 8건.

### 🔄 POS ↔ 네이버 양방향 자동화 (60초 폴링, 매장 PC IP 우회)

**큐 패턴 3종** (모두 매장 PC sync.js 가 처리, IP 화이트리스트 통과):
- **발주확인 큐**: `needs_naver_confirm=true` → sync.js confirmPendingNaverOrders() → POST `/external/v1/pay-order/seller/product-orders/confirm`
- **발송처리 큐**: `needs_naver_dispatch=true` + 송장정보 → sync.js dispatchPendingNaverOrders() → POST `.../dispatch`
- **취소 큐** (DB 준비 완료, UI 다음 사이클): `needs_naver_cancel` 컬럼 + `naver_cancel_reason`

**큐 처리 패턴 (Codex 권장)**:
- 원자적 claim: PATCH ?claimed_at=is.null AND needs_*=true → 동시 실행 방지
- Retry backoff: exponential (1·2·4·8·16분, max 60분) + MAX_CONFIRM_RETRIES=5
- 영구 4xx (429 제외) 2회 후 즉시 큐 제거
- "already/이미/중복" 응답은 성공으로 간주
- LOCAL_PROCESSED_STATUSES = {confirmed, shipped, converted, cancelled} 보호 — polling 으로 절대 덮어쓰지 않음
- dispatch 큐는 confirm 성공 + 2분 grace 후만 처리 (race 방지)

**네이버 → POS 반영**:
- last-changed-statuses API 60초 polling
- polling 응답 ID 는 변경 감지 시그널 → detail 강제 재조회 (7일 skip 무력화, Codex Critical fix)
- order_status 자동 갱신 + Supabase Realtime postgres_changes → 화면 자동 reload

### 🎨 SmartStoreOrders 카드 UI 전면 개편

**5블록 카드** ([src/pages/SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx)):
1. 상태 헤더 (status chip + provider chip + ✓ 발주확인/발송완료 마커 + 날짜)
2. 구매자 블록 (큰 글씨 이름 + 전화 + 주소 + 주문번호)
3. 상품/금액 블록 (매칭 chip + 매칭 변경 [변경]/[해제] 인라인 패널)
4. 발송 정보 (택배사·송장번호, dispatched_at 있을 때만)
5. 액션 버튼 (발주확인 / 내부주문 / 발송처리 / 송장) - 모바일 2x2, 데스크탑 4열

**뷰 모드 토글** (localStorage `smartstore_view_mode` 영구 저장):
- 카드 모드: lg 2열 grid + 모바일 1열
- 컴팩트 모드: 5열 grid row + 클릭 시 인라인 펼침 패널 (상품 + 매칭 변경 + 처리 마커 + 합계)
- 액션 버튼은 e.target.closest('button[title]') 가드로 펼침 트리거 분리

**처리완료 토글**: DONE_STATUSES (converted/shipped/cancelled) 기본 숨김 + "처리완료 표시" 체크박스 (건수 chip)

**모바일 햄버거 메뉴**: 다른 페이지 동일 패턴 — `md:hidden` + `window.dispatchEvent(new CustomEvent('toggle-sidebar'))`

### 📊 네이버 관리자 페이지 위젯 6개 통합

KPI 4개 (전체/오늘/대기/오늘매출) + 네이버 위젯 6개:
- ⏰ 발송기한 초과 (`dispatch_due_date < now() AND !shipped`)
- 🤖 자동처리 예정 (`needs_naver_confirm OR needs_naver_dispatch`)
- 🚚 발주 후 신규 (`confirm_succeeded_at AND !dispatch_succeeded_at`)
- ❌ 취소 요청 (raw_payload.cancelRequest 또는 status CANCEL_*)
- 📅 발송마감 D-1 / 🔥 D-day (KST 자정 경계 계산)

`stats useMemo` 는 `ordersInRange` (dateRange 적용된) 기반 — 날짜 조회와 일관 (Codex Major A fix).

### 📅 날짜 조회 필터 (네이버 관리자 페이지 스타일)

- 5 프리셋: 오늘 / 1주일(기본) / 1개월 / 3개월 / 전체
- date input 2개 (from/to) — 변경 시 자동 `custom` 모드
- KST 자정 경계 (`new Date().setHours(0,0,0,0)`)
- filtered 와 stats(ordersInRange) 모두 dateRange 적용

### 👤 거래처 정책 변경 — 구매자별 분리 + 카테고리 태깅

**이전**: 모든 네이버 주문 → "엠파츠" 단일 거래처
**현재**: 거래처 = 실제 구매자 (matchCustomer fuzzy 매칭, 재구매 시 자동 합쳐짐) + `customers.category='엠파츠'` 자동 부여

**memo 형식**:
```
[엠파츠] [네이버 스마트스토어] {provider_order_id}
구매자: 권찬수 / 010-3529-4697
주소: 경북 영천시 ...
```

**App.jsx saveOrder**: `customerData.category = orderData.customer_category` (네이버 주문이면 '엠파츠' 자동)
**OrderHistory 식별**: `/\[엠파츠\]|\[네이버/i.test(memo) || customerName==='엠파츠'` (구·신 데이터 둘 다 인식)

### 🛒 OrderHistory 네이버 카드 시각 차별화

- 배경: `color-mix(in srgb, #03c75a 16%, var(--card))`
- borderWidth: 2px + boxShadow `0 0 0 1px rgba(3,199,90,0.35), 0 4px 14px rgba(3,199,90,0.18)`
- 좌측 세로 컬러 바 (linear-gradient 180deg, #03c75a→#22c55e, w-1.5)
- 상단 accent bar (linear-gradient 90deg 3-stop, h-2, glow shadow)
- 인라인 chip "🛒 네이버" (업체명 옆, 우측 상단 absolute 제거로 겹침 방지) — gradient 배경 + 흰 글씨 + textShadow
- 옛 엠파츠 데이터 호환: memo 파싱하여 "엠파츠 → 권찬수 님" 표시
- 발송처리 인라인 [📦 발송] 버튼 + 모달 (memo 의 provider_order_id 정규식 추출 → external_orders 매칭 → 큐 PATCH)

### 🔧 매칭 직접 수정 + freeform 전환

**카드 매칭 변경**:
- 모든 매칭 상태에서 [변경] 버튼 (matched·manual·pending·no-candidate)
- 인라인 검색 패널 (products 검색 + 후보 8개 드롭다운)
- matched 상태에선 [해제] 버튼 추가 → 매칭 풀고 pending 으로

**freeform 주문 전환** (사용자 정책 — "굳이 제품 등록 안 해도"):
- 매칭 안 된 item 도 네이버 제품명·금액 그대로 내부 주문에 포함
- id = `naver-{provider_product_order_id}` 마커 (같은 주문 합산 사고 방지)
- placeholder 만 안전 차단

### 🔍 자동 제품 등록 (sync.js)

매칭 실패 시 sync.js 가 products 테이블 자동 INSERT:
- name = provider_product_name
- retail = wholesale = unit_price (네이버 소비자가만)
- category = '네이버 자동등록' (단일 카테고리)
- 같은 이름 product 이미 있으면 그것 재사용 (중복 방지)
- placeholder 가드: `name.includes('⏳')` + `detail_fetch_error === 'pending-detail-fetch'`
- partial unique index (`WHERE category='네이버 자동등록'`) — 409 conflict 시 재조회 fallback

### 📦 송장 발송인 자동화

- 네이버 주문 [📦 송장] → ShippingLabel 자동 이동 + entry.sender='엠파츠'
- ShippingLabel.jsx 의 `newCustomEntry.sender` 동적 default — `computeDefaultSender()` 가 localStorage 최신 entry sender 자동 추적
- useEffect 감지 → customEntries 변경 시 자동 동기화 (페이지 진입 직후 즉시 반영)
- 신규 entry reset 시 prev.sender 보존 (네이버=엠파츠 / 매장=무브모터스 연속 입력 시 매번 변경 부담 제거)

### 🏷 거래처 관리 카테고리 필터

[src/pages/CustomerList.jsx](src/pages/CustomerList.jsx):
- categoryOptions useMemo (등록된 카테고리 자동 발견)
- 필터 buttons: [전체] [🛒 엠파츠] [미분류] (건수 chip 동시 표시)
- categoryFilter state: 'all' | 'none' | <category name>
- "엠파츠" 카테고리만 클릭하면 모든 네이버 구매자 한눈에

### 🚨 Codex 검토 결과 적용 (Critical 1 + Major 8 + Minor 2)

| 등급 | 항목 | 적용 |
|---|---|---|
| 🔴 Critical | sync.js 7일 skip → polling 응답 ID 강제 detail | ✅ |
| 🔴 Critical | order_status 순환 덮어쓰기 → LOCAL_PROCESSED_STATUSES 보호 | ✅ |
| 🟡 Major | confirm 큐 race condition → claimNaverConfirmRow 원자적 PATCH | ✅ |
| 🟡 Major | retry backoff + MAX 5 → 영구 stuck 방지 | ✅ |
| 🟡 Major | dispatch confirm 안 됨 거부 → SELECT 에 succeeded_at NOT NULL 조건 | ✅ |
| 🟡 Major | dispatch 같은 cycle race → confirm 후 2분 grace | ✅ |
| 🟡 Major | dispatch body 필수값 누락 → trim 검증 + 에러 분기 | ✅ |
| 🟡 Major | needs_naver_confirm 조건 → succeeded_at IS NULL 기준 | ✅ |
| 🟡 Major | stats vs dateRange 충돌 → ordersInRange 통일 | ✅ |
| 🟡 Major | dispatch_due_date 컬럼 미활용 → 컬럼 우선 폴백 | ✅ |
| 🟡 Major | autoRegister race → partial unique index + 409 재조회 | ✅ |
| 🟡 Major | autoRegister placeholder 가드 → detail_fetch_error 추가 검사 | ✅ |
| 🟢 Minor | STATUS_LABEL fallback → 원본 status 표시 | ✅ |
| 🟢 Minor | isNaverOrder 공백 정규화 | ⏭️ 다음 사이클 (Task #112) |

### 📦 DB 마이그레이션 추가 (002·003·004)

- **002 `external_orders_naver_confirm_hardening`**: needs_naver_confirm + retry/claim 컬럼 + partial index
- **003 `external_orders_naver_dispatch_queue`**: needs_naver_dispatch + 송장정보 + retry 컬럼 + dispatch_due_date 컬럼 + partial index (generated column 시도 IMMUTABLE 제약으로 실패 → 일반 column + sync.js 자동 채움)
- **003 후속 `naver_cancel_queue`**: needs_naver_cancel + 취소 사유 + retry 컬럼 + partial index
- **004 `customers_category`**: customers.category 컬럼 + index (자동 태깅 활용)

### 🔧 매장 PC sync.js 자동 시작

`MOVE-WEP-Naver-Sync-Bridge` Windows 작업 스케줄러 — At Logon 트리거. PC 부팅·로그온 시 자동 시작 (사용자 별도 실행 불필요).

### 📋 신규 파일

```
src/pages/SmartStoreOrders.jsx (대폭 개편)
src/pages/OrderHistory.jsx (네이버 카드 + 발송 모달)
src/pages/CustomerList.jsx (categoryFilter)
src/pages/ShippingLabel.jsx (sender 동적 default)
src/App.jsx (saveOrder customer_category 전달)

C:\Users\MOVEAM_PC\naver-sync-bridge\
  ├── sync.js (양방향 큐 + 자동 등록 + Codex hardening)
  └── migrations/
      ├── 002_*.sql (이미 적용)
      ├── 003_naver_cancel_queue.sql (적용 완료)
      └── 004_customers_category.sql (적용 완료)
```

### 🚦 다음 사이클 후보 (Task #108~112 등록)

1. `needs_naver_cancel` 큐 활용 — 취소 액션 버튼 + sync.js cancelPendingNaverOrders()
2. 일괄 발송 multi-select UI (네이버 "엑셀 일괄 발송처리" 동등)
3. Codex Major D — memo 채널 기반 별도 매출 집계 (옛 엠파츠 + 신규 분산 합산)
4. Playwright 풀 flow-check (Claude Code 재시작 후 활성)
5. Codex Minor B — isNaverOrder 공백 정규화

---

## 🆕 v2026-05-27 — 네이버 스마트스토어 실시간 연동 + API 사용량 게이지 + MOVIS 매칭 강화

오늘 누적 23 커밋. 핵심 기능 5가지 추가 + 다수 fix.

### 🛍 네이버 스마트스토어 주문 실시간 연동 (Phase 1+2)

**아키텍처:**
- **DB**: `external_orders` + `external_order_items` (provider, raw_payload JSONB, 매칭/발주확인/발송처리/배송비/착불선불 컬럼)
- **DB 추가**: `external_oauth_tokens` (토큰 캐시), `external_sync_cursors` (cursor), `external_sync_logs` (실행 로그)
- **Edge Functions** ([Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/jubzppndcclhnvgbvrxr/functions)):
  - `naver-webhook` — Phase 1 mock 수신 (x-webhook-token 인증)
  - `naver-order-action` — 발주확인 + 발송처리 (OAuth + 실제 네이버 API 호출)
  - `naver-sync-orders` — 변경 주문 polling (DEBUG MODE)
- **매장 PC sync bridge** (`C:\Users\MOVEAM_PC\naver-sync-bridge\`):
  - 네이버 IP 화이트리스트(`115.22.7.219`) 우회용 매장 PC polling
  - Node 스크립트 + Windows 작업 스케줄러 (1분 주기)
  - bcryptjs OAuth + DB 토큰 캐시 + 401 fallback
  - 변경 주문 polling + 상세 일괄 fetch (batch query API, 7일 skip)
  - 자동 매칭: 제품 fuzzyMatch + 고객 전화번호 정확일치 우선
- **Supabase Secrets** (사장님이 Dashboard에 직접 등록):
  - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_WEBHOOK_SECRET`
- **`.env`** (매장 PC만): 위 3개 + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` + `SYNC_INTERVAL_SECONDS=60`

**UI** ([src/pages/SmartStoreOrders.jsx](src/pages/SmartStoreOrders.jsx)):
- Realtime 구독 (`supabaseClient.channel`) → 새 주문 즉시 토스트
- **SyncMonitorWidget** ([src/components/SyncMonitorWidget.jsx](src/components/SyncMonitorWidget.jsx)) — LIVE/STALE 배지, 마지막 sync, 24h 성공률, [지금 동기화] 버튼 (RPC `request_naver_sync_now()` 호출)
- 헤더 [네이버 관리자] 외부 링크 (https://sell.smartstore.naver.com/#/home/dashboard)
- 주문 카드: 🚚 착불 / 💰 선불 배지 + 배송비 표시
- 액션 버튼: [발주확인] / [내부주문 전환] / [발송처리 모달] / [📦 택배 송장]
- 택배 송장 연동: localStorage `shippingCustomEntries`에 prefill 후 ShippingLabel 페이지 자동 이동
- 매칭 시도 dropdown (수동 확정 필수)

**라우팅**: 사이드바 메뉴 `스마트스토어 주문` (Store 아이콘, AI 주문인식 다음), `case 'smartstore'` 라우팅 + `setCurrentPage` prop 전달.

### 📊 MOVIS API 사용량 실시간 게이지 (Gemini + Groq 듀얼)

- **트래커** ([src/lib/apiUsageTracker.js](src/lib/apiUsageTracker.js)): localStorage 기반 호출 기록, in-memory + 3초 flush 패턴, 모델별 가격표, 무료티어 한도 (override 가능)
- **위젯** ([src/components/analytics/ApiUsageGauge.jsx](src/components/analytics/ApiUsageGauge.jsx)): JARVIS 테마 게이지 + Portal (z-index 충돌 회피) + Popover (1초 갱신, 칩 토글)
- **계측 위치 5개**: `geminiAnalyst.postGemini` / `groqAnalyst.postGroq+askGroqChat` / `embedding.embedText` / `TextAnalyze.jsx` Gemini fetch / `AdminPage.jsx` 자연어 fetch — 모두 `usageMetadata` 또는 `data.usage` 기반 토큰 정확 측정
- **source 분류**: `movis` / `order-recog` / `admin-nl` / `embedding` — 4 카테고리 자동 분류, Popover에 BY SOURCE 섹션
- **마운트 위치**: MOVIS 페이지 + AI 주문인식 페이지 헤더 우측

### 🧠 MOVIS 주문 등록 강화 — 유사 후보 + 편집 모달

- **fuzzyMatch.js 신규** ([src/lib/fuzzyMatch.js](src/lib/fuzzyMatch.js)): matchCustomer + matchItem (Levenshtein + 초성 + 토큰 + 부분일치 점수 max). 정확 매칭만 status:'exact', 후보 0.6 임계
- **OrderConfirmEditable.jsx 신규**: saveOrder 전용 편집 모달
  - 거래처 후보 dropdown ("💡 혹시 이거?") + 검색 input + [신규 등록] 명시 버튼
  - 항목 inline 편집 (수량/단가) + [변경] dropdown (alternatives + 검색)
  - 추가 비용 (택배비 7,300원 / 퀵비 30,000원 / 수수료 + 커스텀) — `useQuickItems` preset 활용
  - 추가 지시사항 textarea
  - canConfirm 가드: 거래처 OK + 0원 없음 (surcharge 제외) + 항목 1개+
  - max-h calc(100vh - 80px) + 내부 스크롤
  - [수정] 버튼 항상 노출
- **geminiTools.js saveOrder**: matchCustomer 사용 (exact만 통과), customerCandidates + items.alternatives + zeroPrice 플래그 + needsConfirmation 첨부
- **MOVIS 시스템 프롬프트 강화**: 동의어 매핑 30+ (스텐→스덴, 직관레조→CH 등), 자판 오타(ㅡ→-), 수량 분리 vs 규격 보존, AI 학습 사례 15건 주입

### 🚀 PC 페이드인 + 구형 갤럭시 호환

- **AIAnalytics 자체 마운트 페이드인**: AppLayout wrapper의 페이드인이 PC에서 Suspense swap에 무력화되는 문제 → 자체 opacity transition 1100ms cubic-bezier 추가
- **`@vitejs/plugin-legacy`**: 구형 Samsung Internet 8+ / Android 7+ / iOS 11+ 호환 (SystemJS 폴리필 자동 주입). React.lazy 동적 import 흰 화면 fix

### 📦 매장 PC sync bridge 폴더 구조

```
C:\Users\MOVEAM_PC\naver-sync-bridge\
  ├── sync.js              # OAuth + polling + detail + 매칭 + upsert (1분 주기)
  ├── package.json         # bcryptjs + dotenv
  ├── .env                 # 4개 필수 환경변수 (Naver + Supabase)
  ├── .env.example         # 템플릿
  ├── .gitignore           # .env 보호
  ├── start.bat            # 더블클릭 실행
  ├── install-scheduler.ps1  # Windows 작업 스케줄러 자동 등록
  └── README.md            # 설치/실행 가이드
```

**작업 스케줄러**: `MOVE-WEP-Naver-Sync-Bridge` (At Logon 트리거).

**CLI 옵션**:
- `node sync.js` — 무한 루프 (60초 간격)
- `node sync.js --once` — 1회 실행
- `node sync.js --backfill 30` — 30일치 backfill (24시간 윈도우 분할 + rate limit sleep 1.2s)

### 🚦 외부 주문 매칭 점수 임계

| 점수 | 상태 | 처리 |
|------|------|------|
| 0.95+ | matched | 자동 확정 |
| 0.7~0.95 | manual | 후보 표시, 사용자 확인 필요 |
| <0.7 | missing / no-candidate | 사용자 수동 매칭 |

**Codex 경고 반영**: 토큰 매칭 너무 관대 fix — substring 매칭 4자 이상만, STOPWORDS 제외 (`타이어` `제품` `용` 등), F1 (양방향 hits / sum) 계산.

### 📋 환경변수 (전체)

**클라이언트 (.env.local 또는 vite-config) — 없음** (모든 API 키는 코드 내장 또는 Supabase Secrets).

**Supabase Edge Function Secrets** (Dashboard → Settings → Edge Functions → Secrets):
- `NAVER_CLIENT_ID` — 네이버 커머스 API Application ID
- `NAVER_CLIENT_SECRET` — 네이버 커머스 API Application Secret (`$2a$10$...` bcrypt 형식)
- `NAVER_WEBHOOK_SECRET` — 임의 secret 토큰 (매장 PC sync bridge ↔ Edge Function 인증)

**매장 PC `.env`** (`C:\Users\MOVEAM_PC\naver-sync-bridge\.env`):
- 위 3개 + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SYNC_INTERVAL_SECONDS=60`

### 🔑 Supabase RPC

- `request_naver_sync_now()` — `external_sync_cursors.last_changed_at`을 `now() - 1분`으로 갱신. anon/authenticated 호출 가능. SmartStoreOrders 페이지의 [지금 동기화] 버튼에서 사용

### 📦 DB 테이블 추가 (Supabase)

- `external_orders` — 외부 마켓플레이스 주문 마스터 (provider, provider_order_id UNIQUE, 매칭, 발주확인, 배송정책, raw_payload)
- `external_order_items` — 주문 라인 + 매칭 + 발송처리 (productOrderId UNIQUE, dispatch_status, tracking_number)
- `external_oauth_tokens` — provider별 OAuth 토큰 캐시 (RLS service_role only)
- `external_sync_cursors` — provider별 마지막 동기화 cursor (RLS SELECT anon 허용)
- `external_sync_logs` — sync 실행 로그 (RLS SELECT anon 허용, 운영 모니터링용)

### 💸 택배비 기본 금액 7,300원

- `useQuickItems.js` DEFAULT_PRESETS 변경 + 일회성 마이그레이션 (`pos_quick_items_migration_v2` 플래그) — 기존 사용자 5,000원 → 7,300원 자동 갱신
- MOVIS 주문 모달 [수정] 모드에서 택배비/퀵비/수수료 빠른 추가 + 커스텀 입력

### 🆕 신규 파일 목록

```
src/components/SyncMonitorWidget.jsx       # 스마트스토어 sync 모니터링 위젯
src/components/analytics/ApiUsageGauge.jsx # API 사용량 실시간 게이지
src/components/analytics/OrderConfirmEditable.jsx # MOVIS 주문 편집 모달
src/lib/apiUsageTracker.js                 # API 사용량 트래커 (Gemini + Groq + 임베딩)
src/lib/fuzzyMatch.js                      # 거래처/제품 공통 fuzzy 매칭
src/pages/SmartStoreOrders.jsx             # 스마트스토어 주문 페이지
```

**외부 폴더**: `C:\Users\MOVEAM_PC\naver-sync-bridge\` (Git 무관, 매장 PC 전용)

---

## 🆕 v2026-05-25 (2차) — Containing-block 함정 6건 핫픽스

CSS `transform`/`perspective`가 자식 `position: fixed`의 containing block을 viewport에서 부모로 바꾸는 spec 함정 + Tailwind transform 클래스가 animation 종료 transform에 덮어써지는 함정. Playwright 검증으로 모두 PASS (offset 0, sidebar 제외 main 영역 정확히 맞춤).

### 🐛 증상 → 원인 → 픽스
1. **모바일 MOVIS 빅뱅 인트로가 화면 아래로 밀림** — `AIAnalytics.jsx`의 `perspective: 1200px` 부모 div가 자식 BigBangIntro의 `fixed inset-0`을 가둠.
   - **최종 fix**: BigBangIntro 컴포넌트 자체를 `fixed inset-0` → `absolute inset-0`으로 변경 + AIAnalytics에서 `ai-analytics-root` (relative + perspective) 안에 다시 넣음. `absolute`는 nearest positioned ancestor 기준이라 ai-analytics-root 영역 안에 정확히 갇힘 = **데스크탑 사이드바 제외 main 영역, 모바일은 viewport 전체** ([src/pages/AIAnalytics.jsx](src/pages/AIAnalytics.jsx), [src/components/analytics/BigBangIntro.jsx](src/components/analytics/BigBangIntro.jsx))
   - 중간 시도 (Fragment로 perspective 부모 밖 hoist)는 viewport 전체 렌더라 데스크탑 사이드바를 가리는 부작용 발견 → 위 absolute 방식으로 정정
2. **MOVIS 페이지 재진입 시 검은 화면에서 안 끝남** — `BigBangIntro`의 모듈 레벨 `lastBigBangStartTime` 1000ms 가드가 페이지 재진입에 걸려서 `onComplete` 안 호출 → 부모 `introDone=false` 영원히 → 가드 100ms로 축소(StrictMode 더블 마운트는 <16ms이므로 충분) + 가드 트립 시 `completedRef=true` + `Promise.resolve().then(() => onComplete?.())` 마이크로태스크 보장 ([src/components/analytics/BigBangIntro.jsx](src/components/analytics/BigBangIntro.jsx))
3. **미확인 메모 토스트가 사이드바 빼고 main 중앙으로 밀림 (1차 원인)** — AppLayout의 `.animate-page-in` wrapper가 `transform: translateY(6px → 0)` + `fill-mode: both`로 transform이 영구 적용된 상태 → 자식 fixed 토스트가 main 영역 기준 → 키프레임을 opacity-only로 변경 ([src/index.css](src/index.css) `@keyframes page-fade-in`)
4. **MOVIS 메인화면 양자 sphere 회전이 너무 빠름** — `JarvisDotSphere` 4개 상태의 `spinSpeed`를 원본 대비 1/4로 추가 감속 (standby 0.0025 / listening 0.005 / analyzing 0.009 / responding 0.003) ([src/components/analytics/JarvisDotSphere.jsx](src/components/analytics/JarvisDotSphere.jsx))
5. **미확인 메모 토스트가 +124px 오프셋으로 밀림 (2차 원인, Playwright 검증 중 발견)** — 토스트 inline `animation: 'modal-slide-up 0.35s ... both'` 키프레임의 `to { transform: translateY(0) scale(1) }`(identity matrix)가 `animation-fill-mode: both`로 영구 적용 → Tailwind `-translate-x-1/2`를 **덮어씀** → 토스트가 left:50%에서 자기 width 절반만큼 왼쪽 이동 안 함. **토스트는 위치 보존이 필수**라 Tailwind 클래스 의존 없애고 inline `transform: translateX(-50%)` + `animation: page-fade-in`(opacity-only)로 변경 ([src/pages/OrderHistory.jsx](src/pages/OrderHistory.jsx))
6. **PC 빅뱅이 viewport 전체 렌더로 좌측 사이드바를 가림 (사용자 의도 명확화 후 발견)** — 1번 항목 중간 fix(Fragment hoist)의 부작용. 위 1번의 최종 `absolute` 방식으로 자동 해결

### 🎓 규칙 추가 (containing-block 함정)
- **자식 `position: fixed`가 viewport 기준이 되어야 하는 곳에는 부모 체인에 `transform` / `translate` / `perspective` / `filter` / `will-change: transform` 금지**. 페이지 전환/모달 진입 애니메이션은 opacity-only로 작성 (또는 fixed 자식을 `createPortal(document.body)`로 빼내기). 새로운 transform-bearing wrapper 추가 시 fixed 자식이 안에 있는지 반드시 확인.
- **반대로 자식을 특정 컨테이너(예: 사이드바 제외 main 영역) 안에 가둬야 할 때는 `fixed` 대신 `absolute` + 컨테이너에 `relative` 부여** — `absolute`는 nearest positioned ancestor 기준이라 자동으로 영역 제한됨. `perspective` 같은 transform-bearing 부모도 `absolute`의 containing block을 정상적으로 잡음.
- **Tailwind `-translate-x-1/2 left-1/2` 패턴 + inline `animation: ... both`** 조합 주의: animation 키프레임이 transform property를 정의하면 종료 transform이 Tailwind transform을 덮어쓴다. 위치 보존이 필수면 inline transform + opacity-only 키프레임 사용. 동일 패턴 사용 중인 미수정 파일: [JarvisHologramHUD.jsx:168](src/components/analytics/JarvisHologramHUD.jsx#L168), [InvoiceModal.jsx:200](src/components/InvoiceModal.jsx#L200), [InvoicesPage.jsx:772](src/pages/InvoicesPage.jsx#L772) — modal-slide-up animation 사용 여부 확인 필요.

---

## 🆕 v2026-05-25 — MOVIS 자율 분석 (대시보드 스마트 알림)

대시보드 진입 시 AI가 자동으로 매장 상태를 분석하여 이상 징후를 알림 카드로 표시. 기존에 구현된 고급 분석 함수를 실제 화면에 연결한 첫 번째 스마트 업그레이드.

### 🤖 자율 이상 징후 탐지 (Dashboard)
- **useSmartAlerts 훅** ([src/hooks/useSmartAlerts.js](src/hooks/useSmartAlerts.js)): 대시보드 데이터 로드 후 자동 실행
  - `detectAnomalies` — 매출 급감/급증, 미수 임계 초과, 품절 인기 제품, 휴면 위험 거래처, 반품률 급증, 대량 출고
  - `getStockCoverageForecast` — 14일 이내 품절 예상 제품 자동 표시
  - `getMarginLeakage` — 도매가 이하 판매/마진율 10% 미만 자동 탐지
  - **30분 TTL localStorage 캐시** (`pos_smart_alerts_v1`), dynamic import로 메인 번들 +0KB
  - paymentRecords + customerReturns는 hook 내부에서 비동기 fetch (Dashboard prop 불필요)
- **SmartAlertFeed 컴포넌트** ([src/components/dashboard/SmartAlertFeed.jsx](src/components/dashboard/SmartAlertFeed.jsx)):
  - 심각도별 배지 (긴급=빨강 glow / 주의=노랑 / 정보=파랑)
  - 접기/펼치기 + 더보기 + 새로고침 + "AI에게 자세히 물어보기" → AI Analytics 딥링크
  - 0건이면 "이상 징후 없음 — 매장 상태 정상" 초록 카드
- **detectAnomalies Gemini 도구 추가** — AI 채팅에서 "매장 상태 어때?", "이상 없어?", "경고 알려줘" 질문 가능

### 📦 localStorage 키 추가
- `pos_smart_alerts_v1` — 대시보드 스마트 알림 캐시 (30분 TTL)

---

## 🆕 v2026-05-21 — AI 분석 어시스턴트 (Phase 1+2+3)

자연어로 거래처/제품/VIP/매출 분석 + 전략 도출. Gemini Function Calling 기반 (DB 무영향).

### 💬 자연어 분석 채팅
- 사이드바 **`✨ AI 분석`** 메뉴 (관리자 위)
- "이번 달 매출 1위 누구야?" / "VIP 세그먼트 분석" / "WP튠 김해 트렌드" 자연어 질문
- Gemini 2.5-flash가 9개 분석 도구 중 적절한 것 선택 → 클라이언트 집계 → 자연어 답변 + 추천 액션
- 추천 질문 6개 + 사용 빈도 기반 자동 재정렬

### 🛠 분석 도구 9종 (`src/lib/analytics/`)
- 거래처: `getTopCustomers` / `getCustomerTrend` / `getCustomerSegments` (RFM 5세그먼트) / `getDormantCustomers`
- 제품: `getTopProducts`(제품/카테고리) / `getProductTrend` / `getRepeatPurchaseGap`
- 어피니티: `getCustomerProductAffinity` (자주 사는 제품/카테고리)
- 종합: `getCompositeSummary` (매출/AOV/활성/신규/반품률 KPI + 이전 기간 변화율)

### 🎯 RFM 5세그먼트
- **Champion** (VIP): R≥4 && F≥4 && M≥4
- **Loyal**: R≥3 && F≥3 (안정 단골)
- **At-Risk**: R≤2 && (F≥3 || M≥3) (재유도 대상)
- **New**: R≥4 && F≤2 (신규 정착 유도)
- **Lost**: R≤1 && F≤2 (휴면)
- **Regular**: 폴백
- 임계값 기본: R 14/30/60/90일, F 1/2/4/7건, M 10만/50만/150만/400만원 (자동차 튜닝 재구매 주기 보수 세팅)

### 🚦 격리 전략 (사이드 이펙트 0)
- DB 변경 없음 — 신규 테이블/컬럼 0건
- 기존 페이지 무영향 — 신규 페이지/컴포넌트만 추가, App.jsx 라우팅 1줄 + Sidebar 1줄만 수정
- Gemini API 키 공유 — 신규 키 미발급, 기존 4프로젝트 풀 사용
- AIAnalytics는 lazy import — `AIAnalytics-*.js` 41.50KB chunk 분리, 기존 index.js +0.62KB만 증가

### 🚨 환각 방지
- 시스템 프롬프트에 "도구 결과만 인용, 거래처/제품명 새로 만들지 말 것" 강제
- 도구 결과 빈 결과 → "데이터 부족" 솔직히 답변
- 단순 통계 나열 금지 → 인사이트 + 추천 액션 1~2개 의무

---

## 🆕 v2026-05-11 — code-review Critical 핫픽스 3건 (이전 변경 이력)

자동차 튜닝 부품 판매용 POS 웹 시스템. React 18 + Vite + Tailwind CSS v3 + Supabase + Sentry.

## 🆕 v2026-05-11 — code-review Critical 핫픽스 3건

### 🚨 supabase.getOrderById 신규 추가 (Critical #1)
- 이전엔 `CustomerDetailModal.jsx:161`에서 호출만 있고 정의 없는 미정의 함수 — 거래처 모달 → 미수 카드 클릭 시 캐시 미스(orders 배열에 order_id 없음) → "is not a function" 런타임 크래시 위험
- 신규: [src/lib/supabase.js](src/lib/supabase.js) `getOrderById(orderId)` — `?id=eq.${encodeURIComponent(id)}&limit=1` REST 패턴, `!orderId` 가드 + 결과 단건 반환, catch 시 null

### 🚨 OrderDetail handleReplaceProduct 할인 메타 보존 (Critical #2)
- 이전: 할인 적용된 라인을 다른 제품으로 통째 교체할 때 `{id, name, price, quantity}`만 들고 새 라인 생성 → `originalPrice/discountType/discountValue` 조용히 destruction
- 신규: 기존 라인에 할인 있으면 `confirm` 다이얼로그로 사용자 알림 + 새 라인에 메타 3필드 `null` 명시 clear ([src/pages/OrderDetail.jsx:218~261](src/pages/OrderDetail.jsx#L218))
- 호출 패턴: `handleAddProduct`는 기존 라인 quantity만 +1이라 메타 보존 (안전)

### 💵 CustomerDetailModal setPaid 4-arg 보강 (WARN)
- 이전: `setPaid(orderDetail.id, k)` 2-arg → CLAUDE.md 규칙 위반, no_customer fail-safe 미동작 가능
- 현재: `setPaid(orderDetail.id, k, orderDetail, customer ? [customer] : [])` ([CustomerDetailModal.jsx:667](src/components/CustomerDetailModal.jsx#L667))
- 효과: N+1 회피 + customers hint 명시 → syncOrderPaidRecord 거래처 매핑 정확

---

## 🆕 v2026-05-10 — 모바일 모달 안정화 + 번들 최적화 (origin 머지)

### 🪟 SavedCarts 편집 모드 하단 잘림 fix (시작점 버그)
- Status 편집 섹션을 `flex-shrink-0` 형제 → 스크롤 본문 안으로 편입 (`-mx-3 sm:-mx-6` 풀너비 breakout). 모바일 maxHeight 85vh 초과 시 저장/취소 버튼 잘림 해결

### 💬 window.confirm → ConfirmDialog 교체 (모바일 UX)
- iOS Safari native confirm 스레드 차단 + 깨짐 해결
- 적용: `PaymentEditModal.jsx` 입금 기록 삭제, `OrderDetail.jsx` 반품 취소
- stacking 안전 패턴: Fragment + `z-[110]` wrapper (PaymentEditModal), `z-[65]` wrapper (OrderDetail), SavedCarts는 detail 모달 먼저 닫고 ConfirmDialog 오픈 (clean stack)

### 📦 exceljs 940KB 프리로드 제거 (성능)
- 이전: `CustomerDetailModal.jsx` top-level `import exportExcel` → entry chain에 묶여 940KB 모바일 부팅 시 modulepreload
- 현재: `handleExport` 안에서 `await import('@/lib/exportExcel')` dynamic 호출 → 별도 13.50KB chunk 분리, exceljs는 Excel 버튼 클릭 시점까지 미로드
- `index.js` 729.68KB → 717.53KB (-12KB), TTI 추정 6-8s → 4-5s on slow 4G

### 📐 modal-scroll-area 패턴 추가 (iOS 러버밴드)
- `PaymentRegisterModal.jsx`, `PaymentEditModal.jsx`, `CustomerDetailModal.jsx` (OrderDetailPopup)
- `overscroll-contain` + `modal-scroll-area` 마커 + `touchAction: 'pan-y'` + `onTouchMove stopPropagation`

---

## 🆕 v2026-04-30 — 할인 시스템 + 완불체크 DB 동기화 + QuickItemBar + 모바일 정리

### 🏷 라인별 할인 시스템 (3가지 모드)
- **신규 유틸** ([src/lib/discount.js](src/lib/discount.js)): `calcFinalPrice(base, type, value)`, `convertDiscountValue`, `discountLabel`, `discountPlaceholder`
- **3 모드**: `percent` (할인율) / `amount` (차감 금액) / `fixed` (지정 단가)
- **데이터 모델 (items JSON 신규 필드, DB 스키마 무변경)**:
  - `originalPrice` — 정가 (할인 적용 전)
  - `discountType` — `'percent' | 'amount' | 'fixed'`
  - `discountValue` — 사용자 입력값 (그대로 보존)
  - `price/wholesale/retail` — 할인 후 최종가로 동기화 (명세서/주문 변환 흐름과 호환)
- **토글 동작**: 모드 전환 시 같은 결과 유지하며 value 자동 변환 (예: 1% = 2,191원)
- **단가 input 안전장치**: 할인 적용 중에는 `readOnly` (실수로 메타 날아가는 것 방지). 변경하려면 [해제] 후 가능
- **적용 화면**: SavedCarts 카트 상세 모달, OrderDetail 모바일/데스크탑, OrderHistory 카드 (`🏷 할인 N건 (-X원)` 인디케이터), CustomerList 주문 카드 라인, CustomerDetailModal OrderDetailPopup, InvoicesPage 명세서 (정가 strikethrough + 할인 배지)

### 💵 완불체크 → DB 자동 동기화 (Critical fix)
- **이전 문제**: `[완불 체크]` 버튼이 `localStorage`(useManualPaid)에만 저장 → 거래처 관리/명세서/미수 통계 미반영 ("결제 레코드 미생성")
- **신규 함수** ([src/lib/supabase.js](src/lib/supabase.js)):
  - `syncOrderPaidRecord(orderId, methodKey, orderHint, customersHint)` — payment_records 자동 생성 + payment_history 전액 입금 row 추가 (memo: `[자동] 완불체크 (수단)`)
  - `revokeAutoPaidHistory(orderId)` — 자동 history만 회수 + 빈 record 자동 삭제 ("결제 레코드 미생성"으로 정확히 복원)
- **호출 체인**: `OrderHistory → setPaid(id, method, order, customers) → useManualPaid → supabase.syncOrderPaidRecord` (Promise 반환, customersHint로 N+1 회피)
- **C1 fail-safe**: 거래처 매핑 실패 시 `{success:false, reason:'no_customer'}` 반환 → 호출부에서 alert로 사용자에게 명시적 알림

### 🚨 payment_records DB 제약 (필독)
- `balance` = **generated column** (`total_amount - paid_amount`). INSERT/UPDATE 페이로드에서 **반드시 제외**. 포함하면 `400 code:428C9 "balance can only be updated to DEFAULT"` 발생
- `payment_status` = **generated column** (paid_amount/total_amount 비교). 동일하게 페이로드 제외 필수
- 갱신 가능 컬럼: `paid_amount`만 변경. 두 generated columns는 DB가 자동 계산

### 📦 QuickItemBar — 부가 항목(택배비/퀵비/수수료) 즉석 추가
- **신규 컴포넌트** ([src/components/ui/QuickItemBar.jsx](src/components/ui/QuickItemBar.jsx)) + 훅 ([src/hooks/useQuickItems.js](src/hooks/useQuickItems.js))
- **기본 프리셋**: 택배비 5,000 / 퀵비 30,000 / 수수료 0 (`builtin: true`로 보호)
- **사용자 프리셋**: 추가/삭제/이름·금액 인라인 편집 가능
- **localStorage 키**: `pos_quick_items_v1`
- **라인 추가 시 마커**: `isCustom: true`, `presetId: 'shipping' | 'quick' | ...`
- **ID 충돌 방지**: `${preset.id}_${Date.now()}_${random5}` (빠른 클릭 race 방지)
- **UX**: 커스텀 펼침 ↔ 프리셋 관리 펼침 mutex (한쪽 열면 반대쪽 자동 닫힘), 커스텀 닫을 때 input 자동 reset
- **적용 위치**: SavedCarts 카트 상세 편집 모드, OrderDetail 편집 모드 (모바일/데스크탑)

### 🪟 CustomerDetailModal OrderDetailPopup 재설계
- **이전**: max-w-lg 작은 모달, 품목 10개 잘림, 할인 표시 없음
- **현재**: max-w-3xl + max-h-[90vh] flex column, 합계 배너 (총금액/공급가액/부가세 3개 박스), 품목 전체 노출 + 정가 strikethrough + `🏷 할인` 배지
- 헤더는 success 그린, 푸터에 [닫기] 버튼

### 🎬 OrderHistory 통계 카드 폰트↑ + 카운트업
- **신규 훅** ([src/hooks/useCountUp.js](src/hooks/useCountUp.js)): cubic ease-out 700ms, 직전값 → 새 값 보간
- 통계 카드 6개 (조회 주문 / 매출 / 공급가액 / 부가세 / 반품 / 메모) 폰트 `text-base/lg` → `text-2xl sm:text-3xl font-black` (16 → 30px)
- gradient bg + 색상별 glow `textShadow` + `tabular-nums` + `hover:-translate-y-0.5`

### 🪟 SavedCarts 카트 상세 — 모바일 정리 + 인라인 편집
- 편집 모드 카드 세로 적층: 1행 제품명 input → 2행 단가 input + 합계 → 2.5행 할인 토글/펼침 → 3행 수량 컨트롤 + 삭제
- 헤더 `px-4 py-4` → `px-3 sm:px-6 py-3 sm:py-4` 모바일 패딩 축소
- 주문 상태 5개 → `grid-cols-5` 균등, 우선순위 4개 → `grid-cols-4`, 배송예정일 ↔ 우선순위 모바일 1열/sm 2열

### 🔧 코드 정리
- **공용 추출**: `src/lib/discount.js`, `src/hooks/useCountUp.js`, `src/hooks/useQuickItems.js`, `src/components/ui/QuickItemBar.jsx`
- **잔여 후순위 (P3)**: DiscountControlRow 컴포넌트 추출 (모바일/데스크탑 ~120줄 중복), CustomerDetailModal `fmt` 함수 중복 제거, useQuickItems 멀티디바이스 동기화

## 🆕 v2026-04-28 — 명세서 0원 버그 fix + 부가세 표시 통일 + UI 일관성 강화

### 🚨 명세서 0원 버그 (Critical fix)
- **원인**: `App.jsx onOrder` 핸들러(저장 카트 → "주문확인" 흐름)가 `cartData.items`를 그대로 saveOrder에 전달 → DB에 `price` 필드 누락 저장 → 명세서가 `item.price` 직접 읽으니 0원 표시
- **fix** (`App.jsx:1023-1046`): `items.map`으로 폴백 체인(`price → wholesale → retail → 0`) + `Number()` 강제 + `> 0` 가드. saveOrder에서 한 번 더 검증으로 이중 안전망
- **DB 일괄 보정**: 동일 패턴으로 손상된 기존 10건(진주 소울 스포츠 외 9건)을 Supabase MCP로 `price` 필드 보강 완료. 잔여 3건(자바라 무료 라인 등)은 products 마스터 가격 0이라 의도된 0원으로 판단, 미보정

### 📊 부가세 표시 통일 (`<SubPrice />` 헬퍼 컴포넌트)
- **신규 컴포넌트** (`src/components/ui/SubPrice.jsx`): `total`, `layout='inline|stacked|supply-only'`, `size='sm|xs'`, `showWon` props
- 4개 화면에 일괄 적용: OrderHistory, CustomerList, SavedCarts, SaveCartModal — 18줄 반복 JSX → 1줄 컴포넌트
- `calcExVat()` 1회 계산 후 ex/vat 재사용 (성능 ↑), 라벨 "공급가/부가세" 통일, 폰트 토큰 sm=11px/xs=10px 표준화
- NaN-safe: `Number.isFinite() && t > 0` 가드

### 🤖 AI 주문 인식 → OrderPage 자동 오픈
- **이전**: AI 인식 → 담기 → SaveCartModal(장바구니 저장) 자동 오픈
- **현재**: AI 인식 → 담기 → **OrderPage(주문서)** 자동 오픈 (App.jsx `autoOpenOrderConfirm` state + MainPOS useEffect 신호)
- TextAnalyze 버튼 라벨: "장바구니 담기" → **"주문하기"**

### 🔍 OrderPage 거래처 검색 안전화 + SaveCartModal 검색 추가
- OrderPage 부모 onClick 외부 클릭 닫기 로직에 `data-customer-search-area` 마커 + closest 매칭 시 skip
- input/dropdown 컨테이너에 `onClick` + `onMouseDown` stopPropagation 이중 안전망
- **SaveCartModal에 거래처 검색 드롭다운 신규 추가** (이전엔 완전일치 시에만 자동 채움) — OrderPage 패턴 일관

### 📄 명세서 안내 문구 인라인 편집
- `TraditionalInvoice` 푸터에 ✏️ 수정 버튼 → 인라인 textarea + 라디오 (이 업체만 / 전체 기본)
- localStorage 키:
  - `pos_invoice_footer_default_v1` — 사용자 기본값 (모든 업체 자동 적용)
  - `pos_invoice_footer_overrides_v1` — `{ [customerId]: customNotice }` 개별
- 표시 우선순위: 개별 오버라이드 > 사용자 기본 > `settings.invoice_footer` > 없음
- 명세서 업체명 "🏢 N 귀하" 빨간색 → **검정/다크그레이**(`#1f2937`)로 톤다운. 잔액 빨간색은 강조 유지

### 🚚 택배 송장 페이지 — 저장 카트 합치기
- ShippingLabel에 `savedCarts` prop 추가, `delivery_date === todayKST`인 카트만 필터해 주문 형식으로 변환(`CART-XXXXXX` 주문번호, `__fromSavedCart: true`)
- 시각 구분: amber 배경 + 좌측 3px 액센트 바 + `📦 출고예약` 알약 배지

### 🪟 SavedCarts 상세 모달 OrderDetail과 통일
- `useModalFullscreen` → **`useDraggableResizable('pos-web.savedCartDetailModal', { w: 1200, h: 820 })`** 교체 (드래그/리사이즈/더블클릭 전체화면)
- 사이즈 통일: `min(72rem, ...)`, `calc(100vh - 2rem)`
- 합계 영역 접기/펼치기 (`isBottomExpanded` + ChevronDown/Up)
- 하단 버튼 반응형 (`flex-wrap`, `min-w-[7rem]`, 작은 화면 padding/font 축소)

### 🎬 모달 fullscreen 애니메이션 복구 (`useDraggableResizable.jsx`)
- 원인: 데스크탑 모드에서 inline `width/height/left/top`으로 사이즈 제어하는데 CSS `.modal-fs-transition`은 `max-width/max-height`에만 transition → 토글 즉시 점프
- fix: `transitioning` state + setTimeout 480ms — 토글 시점에만 inline transition spring 적용. 드래그/리사이즈 중엔 OFF로 잔상 방지
- 영향 범위: OrderDetail, AdminPage, BurnwayStock, CustomerList, MainPOS, NotificationSettings, SaveCartModal, ShippingLabel, **SavedCarts 등** 전 모달 일괄 복구

### 📐 OrderDetail 그리드 정렬 재조정
- 컬럼 비율: `1+3+3+2+3` (제품명/단가/수량/금액)
- **모든 숫자 셀 `text-center`** — 각 칸 정 가운데 정렬 + `tabular-nums` 자릿수 통일
- 데스크탑 단가/금액 폰트: `text-base/lg` → `text-lg/xl` (보조 라인 13px)
- 모바일 카드: 단가/금액 셀에 `공급 N원` 인라인 추가

### 🛒 MainPOS 카트 정리
- 제품 카드 우측 ⊕ 아이콘 모두 제거 (사용자 요청 — 시각 군더더기 제거)
- 카트 품목 라인 우측에 `공급 N` 작은 회색 추가

### 📦 재고현황 통계 카드 폰트 ↑ (`StockOverview.jsx:181-201`)
- 숫자: `text-base font-bold` → **`text-2xl sm:text-3xl font-black`** (16px → 30px)
- 라벨: `text-[10px]` → `text-xs sm:text-sm font-medium`
- 카드 padding `p-2` → `p-3 sm:p-4`, gap `1.5` → `2 sm:3`, border-radius `lg` → `xl`

### 📋 plan 문서 신규
- `docs/01-plan/features/invoice-amount-override.plan.md` — 명세서 금액 임의 수정 발행 시스템 (% / 원 단위 할인·할증, 적용 범위 3단계, localStorage 우선) — 미래 구현 대기

## 🆕 v2026-04-27 — 주문 카드 가독성 개선 + 배포 누락 복구

- **🚨 배포 누락 복구**: 4/21 이후 6일치 변경(스피너 강제, AI 주문 자동 모달, 명세서/결제 UX 대개편 등)이 `pos-calculator-web` 라이브에 누락된 상태였음. 재배포로 복구. **다음부터 두 사이트(pos-calculator/web) 동시 배포 시 반드시 둘 다 `gh-pages` 실행 확인**
- **공급가 인라인 표시** (`OrderHistory.jsx:798-805`): 주문 카드 합계 옆에 `(공급가 N원)` 작은 회색 괄호 인라인. `whitespace-nowrap`로 줄바꿈 방지. 부가세 포함/미포함 혼동 방지
- **확대/닫기 버튼 그룹화** (`CustomerList.jsx:904-919`): `justify-between` + 자식 3개 → 확대 버튼 가운데 밀림. `flex gap-1` 컨테이너로 묶어 우상단 정렬. OrderDetail 모달과 일관
- **반품 카드 amber 톤 강조** (`OrderHistory.jsx:664-708`): 카드 전체 주황 배경 + 2px 테두리 + 그림자 + 상단 그라데이션 액센트 바 + 우상단 흰 "반품" 알약 배지. 우선순위: 선택됨 > **반품** > 완불 > 블랙리스트
- **반품 "기간 내 처리" 배지 문구 동적화** (`OrderHistory.jsx:884-893`): `⚡ 기간 내 처리` → 필터에 따라 `오늘 반품 처리` / `어제 반품 처리` / `M/D 반품 처리` (커스텀 날짜). 옛날 주문이 반품일 매칭으로 단일 일자 필터에 끼어들 때 "왜 보이는지" 설명 시그널

## 🆕 v2026-04-23 (2차) — Phase 9 Cross-navigation + 입금 모달 리디자인 + 데이터 품질 가드

- **명세서 Phase 9 Cross-navigation** (`InvoicesContainer.jsx` 신규): 명세서 페이지의 각 업체 섹션에 `💵 입금 받기` / `💰 일괄 입금` / `👁 업체 상세` 액션 바. 거래처 관리의 `CustomerDetailModal`에는 `📄 명세서 발행하기` 버튼 → 해당 업체 자동 선택된 명세서로 점프. 페이지 이동 없이 양방향 통합
- **명세서 UX**: 업체 선택 시 그 업체 이월 날짜가 **체크박스 옆에 인라인 펼침**, Sticky 헤더 + ▲/▼ 접기 토글, 레이아웃 `max-w-[1600px]` + 폰트/패딩 확대, 테이블 행 **✏️ 수정 / ✕ 제외** 버튼 (localStorage 오버라이드, 원본 DB 무영향), 단가 0원 행 자동 빨간 하이라이트
- **입금 모달 리디자인** (`PaymentRegisterModal.jsx`): `max-w-md` → `max-w-2xl`, **1/2/3 단계 숫자 뱃지**, 전액/절반/+10만/+50만/+100만 빠른 금액 버튼, 대형 결제 방법 버튼, **과세/비과세 토글 + 택배비/퀵비/수수료 동적 부가 항목 + 💹 실시간 합계 모니터링 카드**. 저장 시 memo에 `[비과세][택배비 5,000원]...` 태그 prepend (DB 스키마 무변경)
- **CustomerDetailModal**: StatBox 라벨 `받을 돈(미수)/전체 주문/받은 횟수` + 힌트 1줄, 숫자+단위 인라인 한 줄, 일괄 입금은 `▶ 고급: 월말 정산용` details 접힘으로 강등
- **데이터 품질 가드 (1단계)**: `MainPOS.addToCart`에서 wholesale·retail 둘 다 0원이면 카트 담기 거부. `App.saveOrder`에서 price 누락/0원 item 발견 시 confirm 경고. `formatPrice` NaN-safe. `CustomerList` 주문 상세 모달에 `item.price ?? wholesale ?? retail ?? 0` 폴백 + "⚠️ 단가 누락" 배지
- **기타 UI**: `OrderDetail` 확대/X 버튼 그룹화(딱 붙음), `SavedCarts` 도매/소비자 배지 타이틀 옆 정렬

## 🆕 v2026-04-23 (1차) — 명세서·결제 UX 대개편

- **거래명세서 모던 양식**: 전통 격자 → 공급자/공급받는자 2단 + 대형 합계 배너 + 줄무늬 품목 테이블. `규격` 컬럼 제거
- **미수 업체 원클릭 리스트**: 좌측 사이드바에 76개 미수 업체 내림차순 표시, 클릭 한 번으로 해당 업체 명세서 즉시 전환
- **이월 날짜 드로어**: 기본 접힘, 체크된 날짜만 본문/PNG/인쇄에 포함 (69일 중 선택)
- **페이먼트 → 거래처 관리 통합**: 사이드바 `페이먼트` 메뉴 제거, 거래처 관리 페이지 상단 탭으로 흡수
- **주문 카드에 결제 임베드**: 업체 상세의 각 주문 카드에 [미수/부분/완납] 배지 + 잔금 + 입금 이력 + [💵 입금 등록] 버튼

## 🗂️ v2026-04-20 이전 변경

- **OrderDetail 모달**: 드래그 이동 + 8방향 리사이즈 + 더블클릭 전체화면 (데스크톱 전용, 모바일은 기존 중앙 유지)
- **OrderHistory/OrderDetail**: 수동 완불 체크 기능 (카드/현금/계좌이체/기타) — **pos-payments와 localStorage 공유**
- **4개 모달 드래그/리사이즈 적용**: SaveCartModal, QuickCalculator, NotificationSettings, ShippingLabel 부속 모달
- **접근성**: `prefers-reduced-motion` 대응 + `focus-visible` 포커스 링 통일
- 신규 훅: `src/hooks/useDraggableResizable.jsx`, `src/hooks/useManualPaid.js`

## 빌드/배포

```bash
npm run dev              # 개발 서버
npx vite build           # 빌드 (--base 플래그 절대 금지!)
npx gh-pages -d dist     # GitHub Pages 배포
```

> `vite.config.js`에 `base: '/pos-calculator-web/'` 설정됨. `--base` 사용 시 빈 페이지 발생.

> **v2026-05-27 추가**: `@vitejs/plugin-legacy` 도입 → 빌드 시 `*-legacy-*.js` chunk 자동 생성 (구형 Samsung Internet 8+ / Android 7+ 호환). 빌드 시간 ~1분으로 증가했지만 호환성 ↑

### 매장 PC sync bridge (별도 폴더, GitHub 미포함)

```bash
cd C:\Users\MOVEAM_PC\naver-sync-bridge
npm install                  # 최초 1회
node sync.js --once          # 1회 테스트
node sync.js                 # 무한 루프 (60초 간격)
node sync.js --backfill 30   # 30일 backfill
start.bat                    # 더블클릭 실행
powershell -ExecutionPolicy Bypass -File install-scheduler.ps1  # 작업 스케줄러 자동 등록
```

## 핵심 규칙

- **호스팅 = GitHub Pages(정적), Vercel 아님**: 이 프로젝트는 정적 호스팅이라 **서버/함수 없음 → Vercel 일일 할당량·대역폭 개념 자체가 없음**. (Vercel 할당량 걱정은 빅스모터스/auto-shop-manager(Next.js+Vercel) 얘기. 혼동 금지.) 실시간은 브라우저↔Supabase 직접 연결이라 Vercel 무관.
- **실시간 = Supabase Realtime(WebSocket)**: App.jsx가 `wss://…supabase.co/realtime/v1/websocket`로 **orders·products·customers·saved_carts·ai_learning** 5개 테이블 구독(`broadcast.self:false`). DB INSERT/UPDATE/DELETE 시 변경분 푸시 → 즉시 state 갱신(폴링 아님). 다른 기기/매장PC/sync.js 변경도 새로고침 없이 반영. external_orders는 StoreOrderAlerts가 별도 실시간 구독.
- **⚠️ 비용 한도는 Vercel이 아니라 Supabase**: Free 플랜 대략 Realtime 동시연결 ~200·메시지 200만/월(매장 규모론 한참 여유) / **Egress 월 5GB가 진짜 병목**. **과거 옛 Supabase(`icqxomltplewrhopafpq`)가 egress 초과로 차단된 이력** 있어 새 프로젝트(`jubzppndcclhnvgbvrxr`)로 이전함. egress 주범은 Realtime 메시지(작음)가 아니라 **큰 목록 fetch·제품 이미지 반복 로딩** → 대용량 조회/이미지 최적화로 관리. Realtime 자체는 egress 영향 미미.
- **스토어 내부주문 전환 = 네이버 발주확인 선택(자동 금지)** (2026-06-15): `convertToInternalOrder(order, { sendConfirm })`에서 `sendConfirm` true일 때만 `needs_naver_confirm` 큐 등록. 전환 버튼은 `requestConvert`로 네이버 미확인 주문이면 선택 모달 노출. **다시 무조건 자동 발주확인으로 되돌리지 말 것** (사장님이 직접 선택 원함)
- **스토어 자동메모 = 카드 표시만 숨김, DB 삭제 금지** (2026-06-15): 전환 메모(`[엠파츠] [네이버 스마트스토어]…`)는 OrderHistory `isStoreAutoMemo()`/`hasUserMemo()`로 주문 카드 메모박스·미확인메모 알림/집계/필터에서만 제외. **memo 컬럼 자체는 절대 비우지 말 것** — 송장 발송인=엠파츠·착불/선불 자동, 네이버 초록카드 강조, 구매자명 파싱, channelClassifier가 raw memo 마커에 의존
- **명세서 PNG/카톡 캡처**: `toPng`/`toBlob`에 `filter: exportFilter`(`.no-print` 제외) 필수 — 입금/수정 버튼 없는 깔끔한 명세서로 저장. `.no-print`는 화면엔 보이고 캡처/print에서만 빠짐
- **텍스트 표시**: `truncate` 금지. 제품명/메모는 `break-words leading-snug`, 한국어 주소/이름은 `break-keep leading-snug` 사용. flex 자식에는 `min-w-0`, 아이콘/버튼은 `flex-shrink-0` 필수
- **날짜 계산**: `+09:00` + `toISOString()` 조합 금지, `offsetDateKST()` 사용
- **새 제품 추가**: `supabase.addProduct(POST)` 사용. `saveProduct`은 id 있으면 PATCH
- **주문 저장**: 같은 고객 당일 주문 자동 병합. WebSocket 실시간 반영
- **가격 0원 방어**: 카트 담기는 **경고만**(자바라 무료 라인 등 의도된 0원 허용). 주문 저장은 confirm 게이트로 사용자 확인 후 진행. `formatPrice`는 NaN-safe (모든 비유한수 → '0'). 명세서 등 소비자 표시에서는 `price ?? wholesale ?? retail ?? 0` 폴백 체인 사용. **카트 차단 금지** — 2026-04-23 (1단계) 도입 후 운영에서 정상 0원 라인까지 막혀 차단 정책은 철회 (2026-05-15)
- **명세서 수동 수정**: 원본 `orders.items`는 절대 건드리지 않음. 명세서 한정 조정은 localStorage 키 `pos_invoice_line_overrides_v1`에 `{ [recordId:itemIndex]: {name, qty, unitWithVat, deleted} }` 형태로 저장
- **명세서 안내 문구**: localStorage 키 — 사용자 기본 `pos_invoice_footer_default_v1` (string), 업체별 개별 `pos_invoice_footer_overrides_v1` (`{ [customerId]: text }`). 표시 우선순위: 개별 > 기본 > `settings.invoice_footer`
- **공급가/부가세 표시**: 모든 화면은 `<SubPrice total={X} layout="stacked|inline|supply-only" size="sm|xs" />` 헬퍼 사용 ([src/components/ui/SubPrice.jsx](src/components/ui/SubPrice.jsx)). 라벨/폰트 일관성 + calcExVat 1회 계산. NaN-safe 내장
- **입금 확장 필드**: `payment_history`에 컬럼 추가 대신 `memo` 앞에 `[과세/비과세][택배비 N원][퀵비 N원]` 태그 prepend. 집계 필요 시 DB 컬럼(`is_vat_exempt`, `extra_fees JSONB`)으로 승격 예정
- **저장 카트 → 주문 변환**: `App.jsx onOrder` 핸들러에서 `items.map`으로 `price` 폴백 체인(`price → wholesale → retail → 0`) + `Number()` 강제 필수. 누락 시 명세서 0원 버그 재발
- **AI 학습**: 주문인식 수동 교정 시 자동 학습 → 다음 인식에 반영 (3중: DB → Gemini 프롬프트 → 패턴 매칭)
- **할인 메타 보존**: 라인에 `originalPrice/discountType/discountValue` 필드 있으면 절대 삭제하지 말 것. 단가 직접 수정은 할인 메타를 명시적 해제 후만 허용 (현재 단가 input은 할인 적용 중 readOnly). 명세서/주문 변환은 `price` 필드만 사용하므로 메타가 있어도 무영향. 자세한 계산은 [src/lib/discount.js](src/lib/discount.js) `calcFinalPrice` 사용. **제품 교체(handleReplaceProduct) 시**: 기존 라인에 할인 있으면 confirm 다이얼로그 필수 + 새 라인에 3필드 `null` 명시 clear (2026-05-11 Critical #2 fix). 새 라인 추가/quantity 증가 패턴은 자동 보존됨
- **payment_records 갱신**: `balance`, `payment_status`는 **generated columns**. INSERT/UPDATE 페이로드에 절대 포함 금지 (400 code:428C9). `paid_amount`만 갱신하면 DB가 자동 계산
- **완불체크 동기화**: `useManualPaid.setPaid(orderId, method, order, customers)` — 4번째 인자 customers 필수 (N+1 회피). **모든 호출부 4-arg 강제** (2026-05-11 WARN fix). `CustomerDetailModal`은 단일 거래처 컨텍스트라 `[customer]` 배열로 전달. 동기화 실패 시 호출부에서 `res.syncResult.reason === 'no_customer'` 검사하여 alert. 자동 history 식별자: `memo` prefix `[자동] 완불체크`
- **단건 주문 조회**: `supabase.getOrderById(id)` — payment_record.order_id가 orders 캐시에 없을 때 안전한 단건 조회. 신규 함수 (2026-05-11 Critical #1 fix). encodeURIComponent + null 가드 내장
- **부가 항목 (QuickItemBar)**: 택배비/퀵비/수수료 등은 `items` 배열에 `{ name, price, quantity:1, isCustom:true, presetId? }`로 저장. 프리셋은 localStorage `pos_quick_items_v1`에 보관. 빌트인 3개는 `builtin:true`로 보호되어 삭제 불가. **v2026-05-27 변경**: 택배비 기본 5,000 → 7,300원 + 일회성 마이그레이션 (`pos_quick_items_migration_v2` 플래그)
- **MOVIS 주문 등록 (v2026-05-27)**: `saveOrder` 전용 모달 `OrderConfirmEditable`. 거래처/제품 fuzzy 매칭 후보 dropdown + 명시 등록 클릭 (자동 신규 등록 금지) + 인자 직접 편집 + 추가 비용 (택배비 등 surcharge isSurcharge:true 플래그) + 추가 지시사항 textarea. `id: surcharge-{timestamp}` 접두사라 `deductStock` 자동 skip
- **MOVIS API 호출 계측 (v2026-05-27)**: 모든 Gemini/Groq fetch에 `recordApiCall({ source: 'movis'|'order-recog'|'admin-nl'|'embedding' })` 호출 필수. usageMetadata/data.usage 기반 토큰 정확 측정. `setContextTokens(promptTokens)` — 다음 호출 컨텍스트 추정용
- **네이버 스마트스토어 연동 (v2026-05-27)**: 매장 PC `naver-sync-bridge`가 1분마다 polling. **IP 화이트리스트(115.22.7.219)는 사장님 매장 KT IP**. 모뎀 재부팅 시 IP 바뀌면 재등록 필요. cursor를 7일 전으로 강제 갱신하면 옛 주문 다시 fetch (의도된 동작)
- **외부 주문 매칭 임계 (v2026-05-27)**: 0.95+ matched / 0.7~0.95 manual (사용자 확인 필수, top1 자동 선택 금지) / <0.7 missing. 토큰 매칭은 STOPWORDS (`타이어` `제품` `용` 등) 제외 + F1 양방향 계산

## Supabase

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 테이블: orders, products, customers, customer_returns, saved_carts, ai_learning, **payment_records**, **payment_history**, **manual_paid_orders**, **external_orders**, **external_order_items**, **external_oauth_tokens**, **external_sync_cursors**, **external_sync_logs**, **external_products**(v6/10 네이버 카탈로그), **order_audit_log**(v2026-06-23 마이그007 주문 변경 감사)
- **order_audit_log 주의** (v2026-06-23 마이그007): 주문 변경 감사 로그. RLS **append-only**(anon insert/select만, update/delete 정책 없음=위변조/삭제 불가). `supabase.updateOrder/deleteOrder/saveOrder`이 자동 기록(actor=localStorage 기기ID). 테이블 없어도 주문 흐름 무영향(조용히 무시). 화면 뷰어 미구현
- **products 신규 컬럼** (v2026-06-10 마이그006): `note`, `flag_color`, `initial_wholesale`, `initial_retail`, `initial_set_at`, `price_history JSONB`. `updateProduct`이 단가 변경 시 price_history 자동 append. PATCH 시 미존재 환경 대비 PGRST204 폴백 내장
- **external_products 주의** (v2026-06-10 마이그005): 네이버 채널상품 캐시(읽기전용, 네이버=ground truth). `channel_product_no` PK, `options JSONB`(옵션조합), RLS SELECT anon 허용. sync.js `--catalog`가 채움. `external_sync_cursors`에 `force_sync` 컬럼 + provider='naver-catalog' 행 추가
- 관리자 비밀번호: `4321`
- **orders 주의**: `updated_at`, `status` 컬럼 없음. PATCH 시 미존재 컬럼 포함하면 PGRST204로 전체 실패
- **customer_returns 주의**: PK는 `id`(bigint auto), 삭제 시 `return_id`(text) 사용
- **payment_records 주의** (v2026-04-30): `balance`, `payment_status`는 **generated columns** (DB 자동 계산). UPDATE 페이로드에 포함하면 `400 code:428C9 "can only be updated to DEFAULT"`. `paid_amount`만 갱신
- **payment_history**: `payment_record_id`(FK), `amount`, `method`, `paid_at`, `memo`. 자동 생성된 row는 `memo` prefix `[자동] 완불체크 (수단)`로 식별
- **manual_paid_orders**: 수동 완불 체크의 시각 마커 (UPSERT key: `order_id`). useManualPaid 훅이 멀티 디바이스 Realtime 동기화
- **external_orders 주의** (v2026-05-27): `provider` + `provider_order_id` UNIQUE. REPLICA IDENTITY FULL (Realtime UPDATE 알림). `delivery_policy_type` (착불/선불), `delivery_fee_amount`, `detail_fetched_at` (7일 skip 키)
- **external_order_items 주의**: `provider_product_order_id` UNIQUE. `match_status` (pending/matched/manual/no-candidate), `dispatch_status` (pending/sending/success/failed), `tracking_number`. `provider_product_name` NOT NULL — detail 없으면 placeholder
- **external_oauth_tokens 주의**: provider별 1개 row (PK = provider). RLS 차단 (service_role only). 만료 5분 전 자동 갱신
- **external_sync_cursors 주의**: provider별 마지막 sync 시점. SELECT는 anon 허용 (위젯 read용), UPDATE는 service_role + RPC `request_naver_sync_now()`만
- **external_sync_logs 주의**: 5분 cron + 매장 PC 1분 polling 모두 기록. SELECT anon 허용 (SyncMonitorWidget 24h 성공률 계산)
- **Edge Functions**: `naver-webhook` (Phase 1 mock 수신), `naver-order-action` (발주확인+발송처리, OAuth+401 fallback), `naver-sync-orders` (polling DEBUG MODE)
- **RPC**: `request_naver_sync_now()` — cursor 1분 전으로 갱신 (수동 동기화 트리거). `request_naver_catalog_sync_now()` — 상품 카탈로그 force_sync=true (v2026-06-10, sync.js가 5분 내 전 상품·옵션 재동기화)

### localStorage 키 일람
- `pos_invoice_line_overrides_v1` — 명세서 라인 수동 수정 (원본 무영향)
- `pos_invoice_footer_default_v1` — 명세서 안내 문구 사용자 기본
- `pos_invoice_footer_overrides_v1` — 명세서 안내 문구 업체별
- `pos-payments.manual-paid-orders.v1` — 완불체크 캐시 (Supabase ground truth와 동기화)
- `pos-payments.audit-log.v1` — 완불체크 감사 로그 (FIFO 500건)
- `pos_quick_items_v1` — QuickItemBar 부가 항목 프리셋 (택배비/퀵비/수수료 + 사용자 추가)
- `pos_ai_analytics_history_v1` — AI 분석 채팅 히스토리 (FIFO 50건)
- `pos_ai_cache_v1` — AI 분석 도구 결과 캐시 (5분 TTL, FIFO 100건)
- `pos_ai_quick_prompts_usage_v1` — AI 추천 질문 사용 빈도 (정렬용)
- `pos_ai_rfm_thresholds_v1` — RFM 점수 임계값 (사용자 조정 가능)
- `pos_ai_insights_v1` — AI 분석 인사이트 저장 (Phase 5 예정, 키만 예약)
- `pos_quick_items_migration_v2` — v2026-05-27 택배비 5,000 → 7,300 일회성 마이그레이션 플래그
- `movis_api_usage_v1` — API 사용량 트래커 (Gemini + Groq + 임베딩 호출 기록, 1일 보관, in-memory + 3초 flush)
- `movis_api_limits_override` — 무료티어 한도 override (`{ gemini: {rpd, rpm}, groq: {rpd, rpm} }` JSON, 옵셔널)
- `movis_ctx_tokens` — 현재 대화 prompt token 추정치 (sessionStorage)
- `shippingCustomEntries` — 택배 송장 사용자 정의 항목 (스마트스토어 주문에서 prefill 추가됨)
- `pos_morning_briefing_ai_v1` — AI 아침 브리핑 한 줄 요약 캐시 (30분 TTL, factsSig 키)
- `smartstore_widgets_collapsed` — 스토어 주문 상단 요약 위젯 접힘 상태 ('1'/'0')
- `pos_store_alert_sound` — 전역 스토어 주문 알림음 on/off ('1'/'0', StoreOrderAlerts)
- `pos_ai_product_search` — 제품 주문(MainPOS) AI 검색 토글 on/off ('1'/'0', 기본 ON=미설정도 ON). v2026-06-26

## 상세 문서

| 문서 | 내용 |
|------|------|
| [프로젝트 구조](docs/ARCHITECTURE.md) | 파일 구조, 아키텍처 패턴, Props 연결 |
| [데이터베이스](docs/DATABASE.md) | Supabase 연결, 테이블 스키마, API 래퍼 |
| [변경 이력](docs/CHANGELOG.md) | 날짜별 구현/수정 사항 |
| [스타일 가이드](docs/STYLE-GUIDE.md) | CSS 변수, 반응형, z-index 계층 |
| [테스트/이슈](docs/TESTING.md) | 검증 체크리스트, 알려진 이슈 |
| [보안 설정](docs/SECURITY-SETUP.md) | API 키 referrer 제한, Vite 포트 가이드 |

## 원본 프로젝트

- 기존 앱: `C:\Users\MOVEAM_PC\pos-calculator` (같은 Supabase DB)
- GitHub Pages: `https://aijunny0604-alt.github.io/pos-calculator/`
