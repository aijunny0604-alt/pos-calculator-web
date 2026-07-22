// 매입 발주 내보내기 — CSV / 엑셀 / 프린트 / 카톡 복사
// PurchaseOrders.jsx의 상태 계산과 동일 규칙을 써야 화면과 출력물이 어긋나지 않는다.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const won = (v) => `₩${num(v).toLocaleString('ko-KR')}`;

export const itemStatus = (it) => {
  if (it?.status_override) return it.status_override;
  const q = num(it?.qty), r = num(it?.received_qty);
  if (q < 0) return '차감';
  if (q === 0) return '-';
  if (r <= 0) return '미입고';
  if (r < q) return '부분 입고';
  return '완료';
};
export const itemSupply = (it) => num(it?.unit_price) * num(it?.qty);
export const itemRemaining = (it) => num(it?.qty) - num(it?.received_qty);

// 발주일로부터 며칠 지났나 — JSR이 물건을 늦게 보내는 게 반복돼서, 얼마나 묵었는지가 제일 중요한 정보다.
// KST 기준 날짜 문자열(YYYY-MM-DD)끼리 비교. new Date('YYYY-MM-DD')는 UTC 자정이라 양쪽 다 같은 기준으로 뺀다.
export function daysSince(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (!Number.isFinite(d)) return 0;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((todayUTC - d) / 86400000));
}
// 묵은 정도 — 30일 넘으면 주의, 90일 넘으면 심각(분기 넘게 안 온 것)
export const ageLevel = (days) => (days >= 90 ? 'critical' : days >= 30 ? 'warn' : 'ok');
export const poTotal = (po) => (po?.items || []).reduce((s, it) => s + itemSupply(it), 0);
export const poOpenItems = (po) =>
  (po?.items || []).filter((it) => !it.status_override && num(it.qty) > 0 && itemRemaining(it) > 0);
// 특이사항 품목 — 상태를 직접 적어둔 것(주문 취소 등)과 수량 음수(차감).
// poStatus/poOpenItems가 이 둘을 계산에서 빼기 때문에, 취소건만 있는 발주는 목록에서 '완료'로만 보인다.
// 그래서 따로 뽑아 보여줘야 눈에 걸린다.
export const poSpecialItems = (po) =>
  (po?.items || []).filter((it) => it.status_override || num(it.qty) < 0);
// 카드에 붙일 라벨 — 사유가 한 종류면 그 문구를, 여러 종류면 건수를 보여준다
export const poSpecialLabel = (po) => {
  const names = [...new Set(poSpecialItems(po).map((it) => it.status_override || '차감'))];
  if (names.length === 0) return null;
  return { label: names.length === 1 ? names[0] : `특이 ${poSpecialItems(po).length}`, title: names.join(', ') };
};

export const poStatus = (po) => {
  const items = (po?.items || []).filter((it) => !it.status_override && num(it.qty) > 0);
  if (items.length === 0) return '완료';
  if (items.every((it) => itemRemaining(it) <= 0)) return '완료';
  if (items.every((it) => num(it.received_qty) <= 0)) return '미입고';
  return '부분 입고';
};

// ───────── CSV ─────────
// 엑셀에서 한글 안 깨지게 BOM 필수. 값에 쉼표/따옴표/줄바꿈 있으면 큰따옴표로 감싸고 " → "" 이스케이프.
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildPurchaseCSV(pos) {
  const head = ['발주번호', '매입처', '발주일', '품명', '규격명', '단가', '수량', '입고수량', '남은수량', '공급가액', '비고', '상태'];
  const rows = [head];
  for (const po of pos) {
    for (const it of po.items || []) {
      rows.push([
        po.po_number, po.supplier_name, po.order_date,
        it.name, it.spec, num(it.unit_price), num(it.qty), num(it.received_qty),
        itemRemaining(it), itemSupply(it), it.note || '', itemStatus(it),
      ]);
    }
    rows.push(['', '', '', '', '', '', '', '', '합계', poTotal(po), '', '']);
  }
  rows.push([]);
  rows.push(['총 발주액', pos.reduce((s, p) => s + poTotal(p), 0)]);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function buildPendingCSV(pendingItems) {
  const head = ['발주번호', '발주일', '매입처', '품명', '규격명', '단가', '수량', '입고', '남은', '미입고금액', '상태'];
  const rows = [head];
  for (const { po, item } of pendingItems) {
    rows.push([
      po.po_number, po.order_date, po.supplier_name, item.name, item.spec,
      num(item.unit_price), num(item.qty), num(item.received_qty), itemRemaining(item),
      num(item.unit_price) * itemRemaining(item), itemStatus(item),
    ]);
  }
  const total = pendingItems.reduce((s, { item }) => s + num(item.unit_price) * itemRemaining(item), 0);
  rows.push([]);
  rows.push(['미입고 합계', total]);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadCSV(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ───────── 카톡 복사 ─────────
// JSR에 "이거 아직 안 왔어요" 그대로 붙여넣는 용도. 발주별로 묶어서 사람이 읽는 형태.
export function buildPendingKakaoText(pendingItems, { supplier = '' } = {}) {
  if (!pendingItems.length) return '';
  const byPo = new Map();
  for (const { po, item } of pendingItems) {
    if (!byPo.has(po.po_number)) byPo.set(po.po_number, { po, items: [] });
    byPo.get(po.po_number).items.push(item);
  }
  const lines = [];
  const title = supplier ? `[${supplier} 미입고 현황]` : '[미입고 현황]';
  lines.push(title);
  lines.push(`(${new Date().toLocaleDateString('ko-KR')} 기준)`);
  lines.push('');
  let total = 0;
  // 오래 묵은 발주부터 — 제일 급한 걸 위에
  const ordered = [...byPo.values()].sort((a, b) => String(a.po.order_date).localeCompare(String(b.po.order_date)));
  for (const { po, items } of ordered) {
    const days = daysSince(po.order_date);
    const lv = ageLevel(days);
    const mark = lv === 'critical' ? '🚨' : lv === 'warn' ? '⚠️' : '📌';
    lines.push(`${mark} ${po.order_date} 발주 — ${days}일 경과 (${po.quote_no || po.po_number})`);
    for (const it of items) {
      const rem = itemRemaining(it);
      const amt = num(it.unit_price) * rem;
      total += amt;
      const recv = num(it.received_qty);
      const detail = recv > 0 ? `${num(it.qty)}개 중 ${recv}개만 입고 → 잔여 ${rem}개` : `${num(it.qty)}개 전량 미입고`;
      lines.push(`  · ${it.name}${it.spec ? ` / ${it.spec}` : ''}`);
      lines.push(`    ${detail} (${won(amt)})`);
    }
    lines.push('');
  }
  lines.push(`합계 미입고 금액: ${won(total)}`);
  return lines.join('\n');
}

// 보안 컨텍스트(https) 아니면 clipboard API가 없어서 textarea 폴백 필요 — ShippingLabel과 동일 패턴
export async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// ───────── 프린트 ─────────
// 앱 CSS와 싸우지 않도록 별도 창에 깨끗한 HTML을 그려서 인쇄한다.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', -apple-system, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 14px; }
  .po { margin-bottom: 18px; page-break-inside: avoid; }
  .po-head { display: flex; align-items: baseline; gap: 8px; border-bottom: 2px solid #111; padding-bottom: 4px; margin-bottom: 6px; }
  .po-no { font-weight: 700; font-size: 13px; font-family: monospace; }
  .po-date { font-size: 13px; font-weight: 700; }
  .po-sup { margin-left: auto; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
  th { background: #f1f1f1; font-weight: 700; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .bad { color: #c00; font-weight: 700; }
  .sum { margin-top: 10px; border-top: 2px solid #111; padding-top: 6px; font-size: 13px; font-weight: 700; text-align: right; }
`;

function openPrintWindow(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) return false; // 팝업 차단
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  // 렌더 끝나고 인쇄 — 즉시 호출하면 빈 페이지가 찍힌다
  setTimeout(() => { w.print(); }, 300);
  return true;
}

export function printPurchaseOrders(pos, { title = '매입 발주 내역' } = {}) {
  const today = new Date().toLocaleDateString('ko-KR');
  const grand = pos.reduce((s, p) => s + poTotal(p), 0);
  const body = `
    <h1>${esc(title)}</h1>
    <div class="meta">출력일 ${esc(today)} · 발주 ${pos.length}건</div>
    ${pos.map((po) => `
      <div class="po">
        <div class="po-head">
          <span class="po-no">${esc(po.po_number)}</span>
          <span class="po-date">${esc(po.order_date)} 발주</span>
          <span class="po-sup">${esc(po.supplier_name)} · ${esc(poStatus(po))}</span>
        </div>
        <table>
          <thead><tr>
            <th>품명</th><th>규격명</th><th>단가</th><th>수량</th><th>입고</th><th>남은</th><th>공급가액</th><th>비고</th><th>상태</th>
          </tr></thead>
          <tbody>
            ${(po.items || []).map((it) => `<tr>
              <td>${esc(it.name)}</td>
              <td>${esc(it.spec)}</td>
              <td class="n">${won(it.unit_price)}</td>
              <td class="n">${num(it.qty)}</td>
              <td class="n">${num(it.received_qty)}</td>
              <td class="n${itemRemaining(it) > 0 ? ' bad' : ''}">${itemRemaining(it)}</td>
              <td class="n">${won(itemSupply(it))}</td>
              <td>${esc(it.note || '')}</td>
              <td>${esc(itemStatus(it))}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="6" class="n">합계</td><td class="n">${won(poTotal(po))}</td><td colspan="2"></td>
          </tr></tfoot>
        </table>
      </div>`).join('')}
    <div class="sum">총 발주액 ${won(grand)}</div>
  `;
  return openPrintWindow(title, body);
}

export function printPendingItems(pendingItems, { title = '미입고 현황' } = {}) {
  const today = new Date().toLocaleDateString('ko-KR');
  const total = pendingItems.reduce((s, { item }) => s + num(item.unit_price) * itemRemaining(item), 0);
  const body = `
    <h1>${esc(title)}</h1>
    <div class="meta">출력일 ${esc(today)} · 미입고 ${pendingItems.length}품목</div>
    <table>
      <thead><tr>
        <th>발주번호</th><th>발주일</th><th>품명</th><th>규격명</th><th>단가</th><th>수량</th><th>입고</th><th>남은</th><th>미입고 금액</th><th>상태</th>
      </tr></thead>
      <tbody>
        ${pendingItems.map(({ po, item }) => `<tr>
          <td>${esc(po.po_number)}</td>
          <td>${esc(po.order_date)}</td>
          <td>${esc(item.name)}</td>
          <td>${esc(item.spec)}</td>
          <td class="n">${won(item.unit_price)}</td>
          <td class="n">${num(item.qty)}</td>
          <td class="n">${num(item.received_qty)}</td>
          <td class="n bad">${itemRemaining(item)}</td>
          <td class="n bad">${won(num(item.unit_price) * itemRemaining(item))}</td>
          <td>${esc(itemStatus(item))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="sum">미입고 합계 ${won(total)}</div>
  `;
  return openPrintWindow(title, body);
}

// ───────── 엑셀 ─────────
// exceljs는 무거워서(939kB) 반드시 동적 import — 버튼 누를 때만 로드
export async function exportPurchaseExcel(pos) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MOVE MOTORS POS';

  const ws = wb.addWorksheet('매입 발주');
  ws.columns = [
    { header: '발주번호', key: 'po', width: 14 },
    { header: '매입처', key: 'sup', width: 10 },
    { header: '발주일', key: 'date', width: 12 },
    { header: '품명', key: 'name', width: 22 },
    { header: '규격명', key: 'spec', width: 18 },
    { header: '단가', key: 'price', width: 12 },
    { header: '수량', key: 'qty', width: 8 },
    { header: '입고수량', key: 'recv', width: 10 },
    { header: '남은수량', key: 'rem', width: 10 },
    { header: '공급가액', key: 'supply', width: 14 },
    { header: '비고', key: 'note', width: 20 },
    { header: '상태', key: 'status', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

  for (const po of pos) {
    for (const it of po.items || []) {
      const rem = itemRemaining(it);
      const row = ws.addRow({
        po: po.po_number, sup: po.supplier_name, date: po.order_date,
        name: it.name, spec: it.spec, price: num(it.unit_price), qty: num(it.qty),
        recv: num(it.received_qty), rem, supply: itemSupply(it),
        note: it.note || '', status: itemStatus(it),
      });
      if (rem > 0 && !it.status_override) row.getCell('rem').font = { color: { argb: 'FFCC0000' }, bold: true };
    }
  }
  ['price', 'supply'].forEach((k) => { ws.getColumn(k).numFmt = '#,##0'; });
  ws.autoFilter = { from: 'A1', to: 'L1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // 미입고만 따로 시트 하나 — JSR에 보낼 때 이 시트만 쓰면 됨
  const pending = [];
  for (const po of pos) for (const it of poOpenItems(po)) pending.push({ po, it });
  if (pending.length) {
    const ws2 = wb.addWorksheet('미입고 현황');
    ws2.columns = [
      { header: '발주번호', key: 'po', width: 14 },
      { header: '발주일', key: 'date', width: 12 },
      { header: '품명', key: 'name', width: 22 },
      { header: '규격명', key: 'spec', width: 18 },
      { header: '단가', key: 'price', width: 12 },
      { header: '수량', key: 'qty', width: 8 },
      { header: '입고', key: 'recv', width: 8 },
      { header: '남은', key: 'rem', width: 8 },
      { header: '미입고금액', key: 'amt', width: 14 },
    ];
    ws2.getRow(1).font = { bold: true };
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
    for (const { po, it } of pending) {
      ws2.addRow({
        po: po.po_number, date: po.order_date, name: it.name, spec: it.spec,
        price: num(it.unit_price), qty: num(it.qty), recv: num(it.received_qty),
        rem: itemRemaining(it), amt: num(it.unit_price) * itemRemaining(it),
      });
    }
    ['price', 'amt'].forEach((k) => { ws2.getColumn(k).numFmt = '#,##0'; });
    ws2.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `매입발주_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
