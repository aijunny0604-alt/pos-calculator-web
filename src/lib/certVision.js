// 사업자등록증 이미지 → Gemini flash vision OCR → 구조화 추출
// 무료 gemini-2.5-flash(이미지 입력 무료) + 키 로테이션 재사용. DB 변경 없음(추출만).
import { getGeminiKeys, GEMINI_VISION_MODELS } from './geminiAnalyst';
import { recordApiCall } from './apiUsageTracker';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXTRACT_PROMPT = `이 이미지는 대한민국 "사업자등록증"(또는 사업자등록증명원)입니다.
아래 항목을 정확히 읽어 JSON으로만 답하세요. 없으면 빈 문자열 "".
설명/문장/코드블록 없이 순수 JSON 객체 하나만 출력.

{
  "isBusinessCert": true/false,   // 사업자등록증이 맞는지
  "name": "상호(법인명). 예: (주)무브모터스 → 무브모터스처럼 통용 상호",
  "bizNo": "사업자등록번호 (000-00-00000 형식)",
  "owner": "대표자 성명",
  "address": "사업장 소재지(도로명/지번 주소 전체)",
  "bizType": "업태",
  "bizItem": "종목",
  "corpNo": "법인등록번호(있으면)",
  "openDate": "개업연월일(YYYY-MM-DD, 있으면)"
}`;

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  // 코드블록 제거
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // 첫 { ~ 마지막 } 추출
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * 사업자등록증 이미지에서 정보 추출
 * @param {string} base64  - data URL 앞부분(data:...base64,) 제외한 순수 base64
 * @param {string} mimeType - 예: 'image/jpeg', 'image/png'
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
export async function extractBusinessCert(base64, mimeType = 'image/jpeg') {
  if (!base64) return { ok: false, error: '이미지가 없습니다' };
  const keys = getGeminiKeys();
  if (!keys.length) return { ok: false, error: 'API 키가 없습니다' };

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
              contents: [{
                role: 'user',
                parts: [
                  { text: EXTRACT_PROMPT },
                  { inlineData: { mimeType, data: base64 } },
                ],
              }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
          }
        );
        if (res.status === 429 || res.status === 503) { lastErr = `${res.status}`; await sleep(600); continue; }
        if (!res.ok) { lastErr = `${res.status} ${(await res.text()).slice(0, 120)}`; continue; }
        const json = await res.json();
        // 사용량 계측
        try {
          const um = json.usageMetadata || {};
          recordApiCall({ source: 'movis', model, promptTokens: um.promptTokenCount || 0, completionTokens: um.candidatesTokenCount || 0 });
        } catch {}
        const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
        const data = parseJsonLoose(text);
        if (!data) { lastErr = '추출 결과 파싱 실패'; continue; }
        // 정규화
        const clean = (v) => (typeof v === 'string' ? v.trim() : '');
        return {
          ok: true,
          data: {
            isBusinessCert: data.isBusinessCert !== false,
            name: clean(data.name),
            bizNo: clean(data.bizNo),
            owner: clean(data.owner),
            address: clean(data.address),
            bizType: clean(data.bizType),
            bizItem: clean(data.bizItem),
            corpNo: clean(data.corpNo),
            openDate: clean(data.openDate),
          },
        };
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
  }
  return { ok: false, error: lastErr || '인식 실패' };
}

// 이미지 종류 자동 판별 + 추출 (사업자등록증 | 주문 | 기타) — 한 번의 호출로 분류+추출
const ANALYZE_PROMPT = `이 이미지를 보고 아래 JSON으로만 답하세요. 설명/코드블록 없이 순수 JSON 하나만.

먼저 종류를 판별:
- "businessCert": 대한민국 사업자등록증/등록증명원
- "order": 주문 내역(손글씨 메모, 카톡/문자 주문, 견적, 제품과 수량이 적힌 목록 등)
- "other": 위 둘 다 아님

{
  "type": "businessCert" | "order" | "other",
  "cert": {   // type=businessCert일 때만 채움, 아니면 null
    "name": "상호", "bizNo": "000-00-00000", "owner": "대표자",
    "address": "주소", "bizType": "업태", "bizItem": "종목"
  },
  "order": {  // type=order일 때만 채움, 아니면 null
    "customerName": "주문한 업체/사람 이름(있으면, 없으면 \"\")",
    "items": [ { "name": "제품명(적힌 그대로)", "quantity": 수량숫자, "unitPrice": 단가숫자(있으면, 없으면 0) } ],
    "memo": "배송/기타 특이사항(있으면)"
  }
}`;

/**
 * 이미지 종류 자동 판별 + 추출
 * @returns {Promise<{ok:boolean, type?:string, cert?:object, order?:object, error?:string}>}
 */
export async function analyzeImage(base64, mimeType = 'image/jpeg') {
  if (!base64) return { ok: false, error: '이미지가 없습니다' };
  const keys = getGeminiKeys();
  if (!keys.length) return { ok: false, error: 'API 키가 없습니다' };
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
              contents: [{ role: 'user', parts: [{ text: ANALYZE_PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
          }
        );
        if (res.status === 429 || res.status === 503) { lastErr = `${res.status}`; await sleep(600); continue; }
        if (!res.ok) { lastErr = `${res.status} ${(await res.text()).slice(0, 120)}`; continue; }
        const json = await res.json();
        try {
          const um = json.usageMetadata || {};
          recordApiCall({ source: 'movis', model, promptTokens: um.promptTokenCount || 0, completionTokens: um.candidatesTokenCount || 0 });
        } catch {}
        const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
        const data = parseJsonLoose(text);
        if (!data) { lastErr = '추출 결과 파싱 실패'; continue; }
        const clean = (v) => (typeof v === 'string' ? v.trim() : '');
        const type = data.type === 'businessCert' || data.type === 'order' ? data.type : 'other';
        let cert = null, order = null;
        if (type === 'businessCert' && data.cert) {
          cert = {
            isBusinessCert: true,
            name: clean(data.cert.name), bizNo: clean(data.cert.bizNo), owner: clean(data.cert.owner),
            address: clean(data.cert.address), bizType: clean(data.cert.bizType), bizItem: clean(data.cert.bizItem),
          };
        }
        if (type === 'order' && data.order) {
          const items = Array.isArray(data.order.items) ? data.order.items
            .map((it) => ({ name: clean(it.name), quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1, unitPrice: Number(it.unitPrice) > 0 ? Number(it.unitPrice) : 0 }))
            .filter((it) => it.name) : [];
          order = { customerName: clean(data.order.customerName), items, memo: clean(data.order.memo) };
        }
        return { ok: true, type, cert, order };
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
  }
  return { ok: false, error: lastErr || '인식 실패' };
}

// File → { base64, mimeType, dataUrl } (미리보기/전송 공용)
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1] || '';
      resolve({ base64, mimeType: file.type || 'image/jpeg', dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 큰 이미지를 캔버스로 축소(max변 1600px, JPEG 0.85) 후 base64 — vision 요청크기·메모리 폭증 방지.
// PDF/실패 시 원본으로 폴백.
export function fileToScaledBase64(file, max = 1600) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('파일이 없습니다'));
    if (/pdf$/i.test(file.type || '') || /\.pdf$/i.test(file.name || '')) {
      return fileToBase64(file).then(resolve, reject);
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, max / Math.max(w, h));
        if (scale >= 1 && file.size <= 1.5 * 1024 * 1024) {
          // 충분히 작으면 원본 사용
          return fileToBase64(file).then(resolve, reject);
        }
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1] || '', mimeType: 'image/jpeg', dataUrl });
      } catch (e) {
        fileToBase64(file).then(resolve, reject);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); fileToBase64(file).then(resolve, reject); };
    img.src = url;
  });
}
