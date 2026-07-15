// JSR 제품견적서(발주서) 사진 → 발주 데이터 자동 판독
// 무료 gemini-2.5-flash(이미지 입력 무과금) + 키/모델 로테이션 — certVision.js와 동일 패턴 재사용.
// ⚠️ 브라우저 전용: 임베드 키가 referrer 제한이라 node에서 직접 호출하면 403.
//
// 이 파일은 "판독"만 한다. DB 저장은 PurchaseOrders.jsx의 확인 모달을 거친다.
// 매입 증빙이라 절대 자동 저장하지 않는다 — 사장님이 눈으로 확인하고 [등록] 눌러야 들어간다.

import { getGeminiKeys, GEMINI_VISION_MODELS } from './geminiAnalyst';

// 실제 JSR 견적서 21장을 판독해본 결과를 프롬프트에 반영:
//  · 첫 줄에 "자동차_부품 / 자동차_부품 / 0 / 1 / 0" 더미행이 거의 항상 있다
//  · 단가 0원 + 비고 "미출고품 출고" = 과거 미입고분 무상 보전 (신규 발주 아님)
//  · 수량 음수 = 취소분 차감
//  · 한 견적서에 날짜가 2개 섞이기도 한다(01/19 + 01/20)
const QUOTE_PROMPT = `이 이미지는 자동차 부품 매입처의 "제품견적서"(발주서)다. 표를 정확히 판독해 JSON으로만 답하라.

추출 항목:
- quote_no: 상단 "관리 번호" (예: "20260512-14")
- order_date: 상단 "작성 일자"를 YYYY-MM-DD로 (예: "2026-05-12")
- supplier: 하단 회사명 (예: "JSR"). 모르면 "JSR"
- stated_total: 표 하단 "합 계" 칸의 숫자
- items: 표의 각 행 (위에서 아래 순서 그대로, 빈 행은 제외)
    - name: 품목명 칸
    - spec: 규격명 칸
    - unit_price: 단가 (숫자만)
    - qty: 수량 (숫자만, 음수면 음수로)
    - supply: 공급가액 칸에 실제 인쇄된 숫자
    - note: 비고 칸 (없으면 null)

엄격한 규칙:
1. 숫자는 쉼표를 빼고 정수로. 빈 칸은 0.
2. "자동차_부품 / 자동차_부품 / 0 / 1 / 0" 같은 더미행도 **그대로 포함**하라.
3. 규격명의 언더바(_), 슬래시(/), 대소문자를 인쇄된 그대로. 추측해서 고치지 마라.
   (예: "TVB64Y_L_C", "N100R_200L_64", "SPEAKER_A/S_100", "57h89" — h는 소문자)
4. 비고 문구도 그대로 (예: "5/12주문건 미출고품 출고", "10월 주문 취소건", "김해 대리출고").
5. 글자가 흐려서 확신이 안 서면 그 행의 uncertain을 true로. 절대 지어내지 마라.
6. supply는 계산하지 말고 **인쇄된 값을 읽어라**. 단가×수량과 달라도 그대로 읽어라.

JSON만 출력:
{"quote_no":"...","order_date":"YYYY-MM-DD","supplier":"JSR","stated_total":0,
 "items":[{"name":"...","spec":"...","unit_price":0,"qty":0,"supply":0,"note":null,"uncertain":false}]}`;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function stripFence(t) {
  return String(t || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * 발주서 사진 판독. 판독만 하고 저장은 안 한다.
 * @returns {{ok:boolean, data?:object, error?:string}}
 *   data: { quote_no, order_date, supplier, stated_total, items[], checks{} }
 */
export async function extractPurchaseQuote(base64, mimeType = 'image/jpeg') {
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
              contents: [{ role: 'user', parts: [{ text: QUOTE_PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
              // temperature 0 — 증빙 판독이라 창의성이 있으면 안 된다
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

        return { ok: true, data: normalizeQuote(parsed) };
      } catch (e) {
        lastErr = e.message;
      }
    }
  }
  return { ok: false, error: lastErr || '판독 실패' };
}

/**
 * 판독 결과 정규화 + 자기검산.
 * 판독을 그대로 믿지 않고 산술로 교차검증한다 — 실제 견적서에서 원본 오류(5원 차이)도 나왔다.
 */
export function normalizeQuote(raw) {
  const items = (raw.items || []).map((it) => ({
    name: String(it.name ?? '').trim(),
    spec: String(it.spec ?? '').trim(),
    unit_price: num(it.unit_price),
    qty: num(it.qty),
    supply: num(it.supply),
    note: it.note ? String(it.note).trim() : null,
    uncertain: !!it.uncertain,
  }));

  // 더미행 = 품목명·규격명이 둘 다 "자동차_부품"이고 금액이 0 → 장부에 넣을 의미 없음
  const isDummy = (it) => /자동차[_\s]*부품/.test(it.name) && /자동차[_\s]*부품/.test(it.spec) && num(it.supply) === 0;
  // 무상 보전 = 단가 0 + 수량 양수 → 과거 미입고분을 채워준 것 (신규 발주 아님)
  const isFreeFill = (it) => num(it.unit_price) === 0 && num(it.qty) > 0 && num(it.supply) === 0;

  const real = items.filter((it) => !isDummy(it));
  const calcTotal = real.reduce((s, it) => s + num(it.unit_price) * num(it.qty), 0);
  const printedTotal = real.reduce((s, it) => s + num(it.supply), 0);
  const stated = num(raw.stated_total);

  // 행별 단가×수량 vs 인쇄된 공급가액
  const rowMismatch = real
    .filter((it) => num(it.unit_price) * num(it.qty) !== num(it.supply))
    .map((it) => ({ spec: it.spec, calc: num(it.unit_price) * num(it.qty), printed: num(it.supply) }));

  return {
    quote_no: String(raw.quote_no ?? '').trim(),
    order_date: String(raw.order_date ?? '').trim(),
    supplier: String(raw.supplier ?? 'JSR').trim() || 'JSR',
    stated_total: stated,
    items: real.map((it) => ({ ...it, freeFill: isFreeFill(it) })),
    dummyCount: items.length - real.length,
    checks: {
      calcTotal,              // 단가×수량 합 — 우리가 정답으로 쓰는 값
      printedTotal,           // 공급가액 칸 합
      statedTotal: stated,    // 하단 "합 계" 칸
      totalOk: calcTotal === stated,
      rowMismatch,            // 원본 오류 후보 (JSR 견적서에 실제로 있었음)
      uncertainCount: real.filter((it) => it.uncertain).length,
      freeFillCount: real.filter(isFreeFill).length,
    },
  };
}

/**
 * 무상 보전 행(0원)이 어느 발주의 미입고를 채우는지 후보 찾기.
 * JSR이 물건을 늦게 보내서 나중에 0원으로 채워주는 패턴이 반복된다 — 이걸 수동으로 추적하면 헷갈린다.
 * @param item 보전 행 { spec, qty }
 * @param pos  기존 발주 목록
 * @returns 후보 [{ po, item, remaining }] — 오래 묵은 순
 */
export function findFillTargets(item, pos) {
  const norm = (s) => String(s || '').replace(/[_\s()]/g, '').toUpperCase();
  const out = [];
  for (const po of pos || []) {
    for (const it of po.items || []) {
      if (it.status_override) continue;
      const remaining = num(it.qty) - num(it.received_qty);
      if (remaining <= 0) continue;
      if (norm(it.spec) !== norm(item.spec)) continue;
      out.push({ po, item: it, remaining });
    }
  }
  return out.sort((a, b) => String(a.po.order_date).localeCompare(String(b.po.order_date)));
}
