// 거래명세서(판매) 사진 → 거래처/발행일/품목 자동 판독
// 무료 gemini-2.5-flash(이미지 무과금) + 키/모델 로테이션 — quoteVision.js와 동일 패턴.
// ⚠️ 브라우저 전용(임베드 키 referrer 제한). 판독만 하고 저장 안 함 — 주문내역 대조용.

import { getGeminiKeys, GEMINI_VISION_MODELS } from './geminiAnalyst';

// 무브 오토 모티브가 각 거래처에 발행하는 "거래명세서(공급받는자 보관용)":
//  · 상단 좌: 발행일 / 거래처명(=우리가 판 거래처) / 합계금액
//  · 표: 월일 | 품목코드 | 품목 | 규격 | 수량 | 단가 | 공급가액 | 세액 | 비고
//  · 단가 0인데 공급가액이 있는 라인도 있다(묶음/보정) → 인쇄된 값 그대로
const STATEMENT_PROMPT = `이 이미지는 자동차 부품점 "무브 오토 모티브"가 거래처에 발행한 "거래명세서"다. 표를 정확히 판독해 JSON으로만 답하라.

추출 항목:
- customer: 상단 좌측 "거래처명" / "거래처처명" 칸의 상호 (예: "스핀휠 진주", "명성", "스페셜웍스(원퍼포먼스)")
- issue_date: 상단 좌측 "발행일"을 YYYY-MM-DD로 (예: "2026-09-01")
- stated_total: 좌측 "합계금액" 칸의 숫자 (부가세 포함 총액)
- items: 표의 각 품목 행 (위→아래 순서, 빈 행 제외)
    - name: "품목" 칸 (예: "용접 TVB54H 좌우", "NPK100D T", "스텐 60파이 45-4 90-4", "플랜지 61")
    - spec: "규격" 칸 (없으면 null)
    - qty: "수량" (숫자만)
    - unit_price: "단가" (숫자만)
    - supply: "공급가액" 칸에 인쇄된 숫자
    - tax: "세액" 칸에 인쇄된 숫자
    - note: "비고" (없으면 null)

엄격한 규칙:
1. 숫자는 쉼표 빼고 정수로. 빈 칸은 0.
2. 품목명·규격의 언더바/슬래시/대소문자/띄어쓰기를 인쇄된 그대로. 추측해서 고치지 마라.
3. supply·tax는 계산하지 말고 **인쇄된 값을 읽어라**. 단가×수량과 달라도 그대로.
4. 단가가 0인데 공급가액이 있으면 그대로 둬라(묶음/보정 라인).
5. 글자가 흐리면 그 행 uncertain을 true로. 절대 지어내지 마라.

JSON만 출력:
{"customer":"...","issue_date":"YYYY-MM-DD","stated_total":0,
 "items":[{"name":"...","spec":null,"qty":0,"unit_price":0,"supply":0,"tax":0,"note":null,"uncertain":false}]}`;

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
