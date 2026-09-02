// 거래명세서(판매) 사진 → 거래처/발행일/품목 자동 판독
// 무료 gemini-2.5-flash(이미지 무과금) + 키/모델 로테이션 — quoteVision.js와 동일 패턴.
// ⚠️ 브라우저 전용(임베드 키 referrer 제한). 판독만 하고 저장 안 함 — 주문내역 대조용.

import { getGeminiKeys, GEMINI_VISION_MODELS } from './geminiAnalyst';

// 무브 오토 모티브가 각 거래처에 발행하는 "거래명세서(공급받는자 보관용)":
//  · 상단 좌: 발행일 / 거래처명(=우리가 판 거래처) / 합계금액
//  · 표: 월일 | 품목코드 | 품목 | 규격 | 수량 | 단가 | 공급가액 | 세액 | 비고
//  · 단가 0인데 공급가액이 있는 라인도 있다(묶음/보정) → 인쇄된 값 그대로
const STATEMENT_PROMPT = `너는 자동차 부품점 "무브 오토 모티브"의 거래명세서 판독 전문가다.
이 이미지는 무브 오토 모티브가 거래처에 발행한 "거래명세서(공급받는자 보관용)"다. 표를 정확히 판독해 JSON으로만 답하라.

═══ 문서 레이아웃 (이 양식은 항상 동일하다) ═══
· 좌상단 세로 3칸: "발행일"(날짜) → "거래처명"(우리가 판 거래처 상호) → "합계금액"(부가세 포함 총액, 큰 글씨).
· 우상단 블록: "등록번호 607-13-96419", "상호: 무브 오토 모티브", "성명: 진태욱", "주소: 부산광역시 기장군...", "업태: 도소매", "전화 051-501-3100". → 이건 전부 **우리(공급자) 정보**다.
· 중앙 표 헤더: 월일 | 품목코드 | 품목 | 규격 | 수량 | 단가 | 공급가액 | 세액 | 비고
· 하단: "전잔금 | (개수) | 합계 | (공급가합) | (세액합)", "총합계 | 입금 | 총잔액", "안내문구: 신한은행 010-5858-6046 진태욱 무브모터스".

═══ 🚫 절대 하지 마라 (가장 흔한 오판) ═══
1. **customer에 "무브 오토 모티브"/"진태욱"을 넣지 마라.** 그건 우리(발행자)다. customer는 반드시 좌상단 "거래처명" 칸의 값이다.
   (실제 거래처 예: "스핀휠 진주", "명성", "스페셜웍스(원퍼포먼스)", "진주 스핀휠")
2. 하단의 "전잔금 / 합계 / 총합계 / 입금 / 총잔액 / 안내문구" 줄은 **품목이 아니다.** items에 넣지 마라.
3. 우상단 등록번호·주소·전화("051-...")를 품목이나 금액으로 오인하지 마라.

═══ 필드 추출 ═══
- customer: 좌상단 "거래처명"(또는 "거래 처명"으로 두 줄에 걸쳐 인쇄됨) 칸의 상호.
- issue_date: 좌상단 "발행일"을 YYYY-MM-DD로. (예: "2026.09.01" → "2026-09-01", "2026.08.28" → "2026-08-28")
- stated_total: 좌측 "합계금액" 큰 숫자. (예: 624600, 473880, 352440)
- items: 표의 품목 행만 (위→아래 순서, 빈 행 제외)
    - name: "품목" 칸 전체 문자열 그대로.
    - spec: "규격" 칸 (대개 비어있음 → null).
    - qty: "수량" (정수).
    - unit_price: "단가" (숫자만).
    - supply: "공급가액" 칸에 인쇄된 숫자.
    - tax: "세액" 칸에 인쇄된 숫자.
    - note: "비고" (없으면 null).

═══ 품목명 표기 (이 가게 용어 — 그대로 읽어라) ═══
· 용접류: "용접 TVB54H 좌우", "용접 TVB54Y 좌우"  (TVB+숫자+영문, "좌우"는 붙여서)
· 스텐 파이류: "스텐 60파이 45-4 90-4", "스텐 63파이 90도", "스텐 76파이 45-1 90-2"  (파이·각도·치수 하이픈 그대로)
· 코드류: "NPK100D T", "CH 250 64"  (영문+숫자+공백 그대로)
· 부속: "플랜지 61", "플랜지 FL 61"
→ 파이/좌우/90도/45-4 같은 표기, 공백, 대소문자, 하이픈을 **인쇄된 그대로**. 추측해서 정규화하지 마라.

═══ 숫자·계산 규칙 ═══
1. 숫자는 쉼표 빼고 정수로. 빈 칸은 0.
2. supply·tax는 **계산하지 말고 인쇄된 값을 읽어라**. (세액은 대략 공급가액의 10%지만, 절사/반올림이 있으니 인쇄값 우선)
3. 단가가 0인데 공급가액이 있으면 그대로 둬라. (실제 예: "NPK100D T" 수량2 단가0 공급171818 세17182 — 묶음/보정 라인)
4. 글자가 흐려 확신이 안 서면 그 행 uncertain=true. 절대 지어내지 마라.

═══ 정답 예시 (실제 명세서) ═══
예시A) 발행일 2026.09.01, 거래처명 "스핀휠 진주", 합계금액 624,600:
{"customer":"스핀휠 진주","issue_date":"2026-09-01","stated_total":624600,"items":[
 {"name":"용접 TVB54H 좌우","spec":null,"qty":1,"unit_price":396000,"supply":396000,"tax":39600,"note":null,"uncertain":false},
 {"name":"NPK100D T","spec":null,"qty":2,"unit_price":0,"supply":171818,"tax":17182,"note":null,"uncertain":false}]}

예시B) 발행일 2026.08.28, 거래처명 "스페셜웍스(원퍼포먼스)", 합계금액 352,440:
{"customer":"스페셜웍스(원퍼포먼스)","issue_date":"2026-08-28","stated_total":352440,"items":[
 {"name":"스텐 60파이 45-4 90-4","spec":null,"qty":8,"unit_price":13200,"supply":105600,"tax":10560,"note":null,"uncertain":false},
 {"name":"스텐 63파이 90도","spec":null,"qty":4,"unit_price":14400,"supply":57600,"tax":5760,"note":null,"uncertain":false},
 {"name":"스텐 76파이 45-1 90-2","spec":null,"qty":3,"unit_price":20400,"supply":61200,"tax":6120,"note":null,"uncertain":false},
 {"name":"플랜지 61","spec":null,"qty":20,"unit_price":4800,"supply":96000,"tax":9600,"note":null,"uncertain":false}]}

이제 주어진 이미지를 위 규칙대로 판독해 **JSON만** 출력하라 (설명·코드펜스 금지):
{"customer":"...","issue_date":"YYYY-MM-DD","stated_total":0,"items":[{"name":"...","spec":null,"qty":0,"unit_price":0,"supply":0,"tax":0,"note":null,"uncertain":false}]}`;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const stripFence = (t) => String(t || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

function normalize(p) {
  const items = (Array.isArray(p.items) ? p.items : []).map((it) => ({
    name: String(it.name || '').trim(),
    spec: it.spec ? String(it.spec).trim() : null,
    qty: num(it.qty),
    unit_price: num(it.unit_price),
    supply: num(it.supply),
    tax: num(it.tax),
    note: it.note ? String(it.note).trim() : null,
    uncertain: !!it.uncertain,
  })).filter((it) => it.name || it.supply || it.qty);
  return {
    customer: String(p.customer || '').trim(),
    issue_date: String(p.issue_date || '').trim() || null,
    stated_total: num(p.stated_total),
    items,
  };
}

/**
 * 거래명세서 사진 판독(저장 안 함).
 * @returns {{ok:boolean, data?:{customer,issue_date,stated_total,items[]}, error?:string}}
 */
export async function extractStatement(base64, mimeType = 'image/jpeg') {
  if (!base64) return { ok: false, error: '이미지가 없습니다' };
  const keys = getGeminiKeys();
  if (!keys.length) return { ok: false, error: 'Gemini API 키가 없습니다' };

  let lastErr = '';
  for (const model of GEMINI_VISION_MODELS) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: STATEMENT_PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
          }
        );
        if (!res.ok) { lastErr = `${model}: ${res.status}`; continue; }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastErr = `${model}: 빈 응답`; continue; }
        let parsed;
        try { parsed = JSON.parse(stripFence(text)); }
        catch { lastErr = `${model}: JSON 파싱 실패`; continue; }
        if (!parsed || !Array.isArray(parsed.items)) { lastErr = `${model}: items 없음`; continue; }
        return { ok: true, data: normalize(parsed) };
      } catch (e) { lastErr = e.message; }
    }
  }
  return { ok: false, error: lastErr || '판독 실패' };
}
