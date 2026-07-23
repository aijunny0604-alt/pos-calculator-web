import { useState, useEffect, useMemo, useCallback } from 'react';
import { PackagePlus, Plus, Search, ArrowLeft, Trash2, X, AlertTriangle, PackageCheck, Database, Printer, FileSpreadsheet, FileDown, Copy, Check, FileImage, Clock, TruckIcon, Camera, Loader2 } from 'lucide-react';
import { formatPrice, getTodayKST, matchesSearchQuery } from '@/lib/utils';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { extractPurchaseQuote } from '@/lib/quoteVision';
import { fileToScaledBase64 } from '@/lib/certVision';
import QuoteScanModal from '@/components/purchase/QuoteScanModal';
import {
  itemStatus, itemSupply, itemRemaining, poTotal, poOpenItems, poStatus,
  poSpecialItems, poSpecialLabel,
  buildPurchaseCSV, buildPendingCSV, downloadCSV,
  buildPendingKakaoText, copyText,
  printPurchaseOrders, printPendingItems, exportPurchaseExcel,
  daysSince, ageLevel,
} from '@/lib/purchaseExport';

// 매입 발주 — 매입처(JSR 등)에 발주한 건과 입고 진행 현황.
// ⚠️ "스마트스토어 주문"의 "발주확인"은 네이버 판매 주문상태로 전혀 다른 개념이다. 혼동 주의.
// 1단계 범위(시트 대체): 품명/규격 자유입력, products 연결·재고 자동증가 없음.
// 상태/금액 계산은 lib/purchaseExport.js에 단일 소스로 두고 화면·CSV·엑셀·프린트가 전부 공유한다.

const STATUS_STYLE = {
  '완료':      { bg: 'var(--success)',     fg: '#fff' },
  '부분 입고': { bg: 'var(--warning)',     fg: '#fff' },
  '미입고':    { bg: 'var(--destructive)', fg: '#fff' },
  '차감':      { bg: 'var(--muted)',       fg: 'var(--muted-foreground)' },
};
const overrideStyle = { bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isAutoStatus = (s) => Object.prototype.hasOwnProperty.call(STATUS_STYLE, s) || s === '-';
// 규격 표기가 제각각이라(TVB64Y L / TVB64Y_L_C / 100 200 64) 매칭은 정규화해서 비교.
// ⚠️ 이건 "단가 제안"에만 쓴다 — 데이터 정정에 이름 매칭 쓰다가 금액 2배 될 뻔한 적 있음(단가+수량으로 매칭할 것)
const normSpec = (s) => String(s || '').replace(/[_\s()]/g, '').toUpperCase();

function StatusBadge({ status, size = 'sm' }) {
  const st = STATUS_STYLE[status] || overrideStyle;
  const cls = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-block rounded-full font-bold whitespace-nowrap ${cls}`} style={{ background: st.bg, color: st.fg }}>
      {status}
    </span>
  );
}

const emptyItem = () => ({ name: '', spec: '', unit_price: 0, qty: 0, received_qty: 0, note: '' });

const AGE_STYLE = {
  critical: { bg: 'var(--destructive)', fg: '#fff' },
  warn:     { bg: 'var(--warning)',     fg: '#fff' },
  ok:       { bg: 'var(--muted)',       fg: 'var(--muted-foreground)' },
};

// 발주 후 며칠 묵었는지 — JSR이 물건을 늦게 보내는 게 반복돼서 이게 제일 중요한 신호다
function AgeBadge({ date, size = 'sm' }) {
  const d = daysSince(date);
  const st = AGE_STYLE[ageLevel(d)];
  const cls = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-black whitespace-nowrap ${cls}`} style={{ background: st.bg, color: st.fg }}>
      <Clock className={size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} />{d}일
    </span>
  );
}

// 툴바 버튼 — 아이콘+라벨 공통
function ToolBtn({ onClick, icon: Icon, children, tone = 'default', disabled }) {
  const tones = {
    default: { background: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' },
    kakao:   { background: '#FEE500', color: '#3C1E1E', borderColor: '#FEE500' },
    done:    { background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
      style={tones[tone]}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

export default function PurchaseOrders({ showToast, setCurrentPage }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // 마이그008 미적용과 빈 목록을 구분
  const [tab, setTab] = useState('orders'); // 'orders' | 'pending'
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all'); // 'all' | '미입고' | '부분 입고' | '완료'
  const [dateFrom, setDateFrom] = useState(''); // 발주일 조회 시작 (YYYY-MM-DD)
  const [dateTo, setDateTo] = useState('');     // 발주일 조회 끝
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [copied, setCopied] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [receiving, setReceiving] = useState(null); // { po, item, qty } — 미입고 탭에서 바로 입고 처리
  const [viewQuote, setViewQuote] = useState(null); // 발주서 원본 이미지 열람
  const [scanning, setScanning] = useState(false);  // 발주서 사진 판독 중
  const [scan, setScan] = useState(null);           // { data, file, imgUrl } — 판독 결과 확인 대기
  const [prices, setPrices] = useState([]);         // 단가표 — 규격 입력 시 단가 자동채움용

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await supabase.getPurchaseOrders();
    if (rows === null) { setLoadFailed(true); setPos([]); }
    else { setLoadFailed(false); setPos(rows); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 단가표 — 규격만 치면 최근 단가가 자동으로 들어오게. 없어도 발주 기능은 그대로 동작(선택적 보조).
  useEffect(() => {
    (async () => {
      const rows = await supabase.getSupplierPrices();
      if (Array.isArray(rows)) setPrices(rows);
    })();
  }, []);

  // 규격 → 최신 단가. 같은 규격이 여러 발주일에 있으면 quoted_at 최신 것.
  const priceBySpec = useMemo(() => {
    const m = new Map();
    for (const r of prices) {
      const k = normSpec(r.spec);
      const prev = m.get(k);
      if (!prev || String(r.quoted_at) > String(prev.quoted_at)) {
        m.set(k, { name: r.item_name, price: num(r.unit_price), quoted_at: r.quoted_at, spec: r.spec });
      }
    }
    return m;
  }, [prices]);

  const specOptions = useMemo(() => [...priceBySpec.values()].map((v) => v.spec).sort(), [priceBySpec]);

  // ESC로 모달 닫기 (저장 중에는 무시)
  useEffect(() => {
    if (!editing && !confirmDelete && !receiving && !viewQuote) return;
    // 위에 뜬 것부터 닫는다 (발주서 열람 > 삭제확인/입고 > 편집모달)
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (viewQuote) { setViewQuote(null); return; }
      if (confirmDelete) { setConfirmDelete(null); return; }
      if (receiving) { if (!saving) setReceiving(null); return; }
      if (!saving) setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, confirmDelete, receiving, viewQuote, saving]);

  const searched = useMemo(() => {
    let base = pos;
    // 발주일 범위 필터 — order_date는 YYYY-MM-DD 문자열이라 사전식 비교가 곧 날짜 비교
    if (dateFrom) base = base.filter((po) => (po.order_date || '') >= dateFrom);
    if (dateTo) base = base.filter((po) => (po.order_date || '') <= dateTo);
    if (!q.trim()) return base;
    // 제품 주문 검색과 동일 로직 — 띄어쓰기/하이픈 무시, 순서 일치, 다단어 AND
    return base.filter((po) =>
      matchesSearchQuery(po.po_number || '', q)
      || matchesSearchQuery(po.supplier_name || '', q)
      || matchesSearchQuery(po.title || '', q)
      || (po.items || []).some((it) => matchesSearchQuery(`${it.name || ''} ${it.spec || ''}`, q))
    );
  }, [pos, q, dateFrom, dateTo]);

  // 상태별 건수 — 부분 입고나 취소건이 몇 건 걸려 있는지 칩에서 바로 보이게.
  // 특이사항은 입고 상태와 별개 축이라(완료된 발주에도 취소 품목이 있을 수 있음) 따로 센다.
  const statusCounts = useMemo(() => {
    const c = { all: searched.length, '미입고': 0, '부분 입고': 0, '완료': 0, '특이사항': 0 };
    for (const po of searched) {
      const s = poStatus(po);
      if (c[s] !== undefined) c[s]++;
      if (poSpecialItems(po).length > 0) c['특이사항']++;
    }
    return c;
  }, [searched]);

  const filtered = useMemo(() => {
    if (status === 'all') return searched;
    if (status === '특이사항') return searched.filter((po) => poSpecialItems(po).length > 0);
    return searched.filter((po) => poStatus(po) === status);
  }, [searched, status]);

  // 미입고 현황 — 발주를 가로질러 아직 안 들어온 품목만 평탄화 (시트 "미입고 현황"의 목적)
  // 상태 칩은 발주 목록 전용이라 여기선 검색 결과만 반영한다
  const pendingItems = useMemo(() => {
    const out = [];
    for (const po of searched) for (const it of poOpenItems(po)) out.push({ po, item: it });
    return out.sort((a, b) => String(a.po.order_date).localeCompare(String(b.po.order_date)));
  }, [searched]);

  const summary = useMemo(() => {
    const open = pos.filter((po) => poOpenItems(po).length > 0);
    // 가장 오래 묵은 미입고 — JSR이 몇 달째 안 보낸 게 있으면 이걸로 바로 드러난다
    const oldest = open.reduce((a, po) => (!a || String(po.order_date) < String(a.order_date) ? po : a), null);
    return {
      count: pos.length,
      total: pos.reduce((s, po) => s + poTotal(po), 0),
      openCount: open.length,
      openAmount: pos.reduce((s, po) => s + poOpenItems(po).reduce((t, it) => t + num(it.unit_price) * itemRemaining(it), 0), 0),
      oldestDays: oldest ? daysSince(oldest.order_date) : 0,
      oldest,
    };
  }, [pos]);

  // 같은 날 두 건 발주(시트의 05/12·05/13 케이스)도 충돌 없게 번호 뒤에 -2, -3 부여
  const makePoNumber = useCallback((dateStr) => {
    const base = `PO-${String(dateStr || getTodayKST()).slice(2).replace(/-/g, '')}`;
    const used = new Set(pos.map((p) => p.po_number));
    if (!used.has(base)) return base;
    for (let i = 2; i < 100; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
    return `${base}-${Date.now()}`;
  }, [pos]);

  const openNew = () => {
    const today = getTodayKST();
    setEditing({ po_number: makePoNumber(today), supplier_name: 'JSR', order_date: today, title: '', memo: '', items: [emptyItem()] });
  };

  const handleSave = async () => {
    if (!editing) return;
    const items = (editing.items || []).filter((it) => (it.name || '').trim() || (it.spec || '').trim());
    if (items.length === 0) { showToast?.('품목을 최소 1개 입력해주세요', 'error'); return; }
    if (!editing.order_date) { showToast?.('발주일을 입력해주세요', 'error'); return; }

    setSaving(true);
    const payload = {
      po_number: editing.po_number,
      supplier_name: (editing.supplier_name || '').trim() || 'JSR',
      order_date: editing.order_date,
      title: (editing.title || '').trim() || null,
      memo: (editing.memo || '').trim() || null,
      items: items.map((it) => ({
        name: (it.name || '').trim(),
        spec: (it.spec || '').trim(),
        unit_price: num(it.unit_price),
        qty: num(it.qty),
        received_qty: num(it.received_qty),
        ...(it.note ? { note: it.note } : {}),
        ...(it.status_override ? { status_override: it.status_override } : {}),
      })),
    };

    const res = editing.id
      ? await supabase.updatePurchaseOrder(editing.id, payload)
      : await supabase.addPurchaseOrder(payload);

    setSaving(false);
    if (!res) { showToast?.('저장 실패 — 마이그레이션 008 적용 여부를 확인해주세요', 'error'); return; }
    showToast?.(editing.id ? '발주를 수정했습니다' : '발주를 등록했습니다', 'success');
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const ok = await supabase.deletePurchaseOrder(confirmDelete.id);
    setConfirmDelete(null);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    showToast?.('발주를 삭제했습니다', 'success');
    setEditing(null);
    load();
  };

  const patchItem = (idx, patch) => {
    setEditing((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };

  // 미입고 탭에서 바로 입고 처리 — 물건 왔을 때 모달 열고 품목 찾아 들어가는 수고를 없앤다.
  // 금액(단가·수량)은 절대 안 건드리고 입고수량만 올린다.
  const handleReceive = async () => {
    if (!receiving) return;
    const { po, item } = receiving;
    const add = num(receiving.qty);
    const rem = itemRemaining(item);
    if (add <= 0) { showToast?.('입고 수량을 입력해주세요', 'error'); return; }
    if (add > rem) { showToast?.(`남은 수량(${rem}개)보다 많이 입력했습니다`, 'error'); return; }

    const items = (po.items || []).map((it) =>
      it.spec === item.spec && num(it.qty) === num(item.qty) && num(it.unit_price) === num(item.unit_price)
        ? { ...it, received_qty: num(it.received_qty) + add }
        : it
    );
    setSaving(true);
    const res = await supabase.updatePurchaseOrder(po.id, { items });
    setSaving(false);
    if (!res) { showToast?.('입고 처리 실패', 'error'); return; }
    const done = add === rem;
    showToast?.(done ? `${item.spec} 전량 입고 완료 ✅` : `${item.spec} ${add}개 입고 (잔여 ${rem - add}개)`, 'success');
    setReceiving(null);
    load();
  };

  const quoteUrls = (po) => String(po?.quote_url || '').split(',').map((s) => s.trim()).filter(Boolean);

  // ── 발주서 사진 → 자동 판독 ──
  // 무료 gemini flash vision. 판독만 하고 저장은 확인 모달을 거친다(매입 증빙이라 자동 저장 금지).
  // 진입 3경로 공유: 파일선택 / 드래그드롭 / 붙여넣기(Ctrl+V). file 하나만 받으면 됨.
  const scanQuoteFile = useCallback(async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { showToast?.('이미지 파일만 등록할 수 있어요', 'error'); return; }
    setScanning(true);
    try {
      // vision 전 1600px 리사이즈 — 요청크기/메모리 폭증 방지 (certVision과 동일 정책)
      const { base64, mimeType } = await fileToScaledBase64(file, 1600);
      const res = await extractPurchaseQuote(base64, mimeType);
      if (!res.ok) { showToast?.(`판독 실패: ${res.error}`, 'error'); return; }
      if (!res.data.items.length) { showToast?.('발주서에서 품목을 찾지 못했습니다', 'error'); return; }
      setScan({ data: res.data, file, imgUrl: URL.createObjectURL(file) });
    } catch (err) {
      console.error('scanQuoteFile:', err);
      showToast?.('사진을 읽지 못했습니다', 'error');
    } finally { setScanning(false); }
  }, [showToast]);

  const onPickQuote = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능하게
    scanQuoteFile(file);
  };

  // 붙여넣기(Ctrl+V) — 캡처한 발주서를 페이지 어디서든 붙이면 바로 판독.
  // 판독 중이거나 다른 모달이 열려 있으면 무시(오작동 방지).
  useEffect(() => {
    const onPaste = (e) => {
      if (scanning || scan || editing || receiving || viewQuote) return;
      for (const it of e.clipboardData?.items || []) {
        if (it.type?.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); scanQuoteFile(f); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [scanning, scan, editing, receiving, viewQuote, scanQuoteFile]);

  // 드래그드롭 — 페이지에 이미지를 끌어다 놓으면 판독.
  const [dragOver, setDragOver] = useState(false);
  const onDropQuote = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (scanning || scan || editing || receiving) return;
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) scanQuoteFile(f);
    else showToast?.('이미지 파일을 놓아주세요', 'error');
  };

  // 확인 모달에서 [발주 등록] — 이미지 업로드 → 발주 생성 → 무상보전 연결분 입고 처리
  const onConfirmScan = async (q, fills) => {
    setSaving(true);
    try {
      const items = (q.items || []).filter((it) => (it.name || '').trim() || (it.spec || '').trim());
      if (!items.length) { showToast?.('품목이 없습니다', 'error'); return; }
      if (!q.order_date) { showToast?.('발주일을 입력해주세요', 'error'); return; }

      // 1) 증빙 원본을 Storage에 — 실패해도 발주 등록은 진행(증빙은 나중에 붙일 수 있음)
      let url = null, path = null;
      try {
        const ext = (scan.file.name.match(/\.(jpe?g|png|webp)$/i) || [, 'png'])[1];
        path = `purchase-quotes/${(q.quote_no || `scan-${Date.now()}`).replace(/[^\w.-]/g, '_')}.${ext}`;
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': scan.file.type || 'image/png', 'x-upsert': 'true' },
          body: scan.file,
        });
        if (r.ok) url = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
        else { console.warn('quote upload:', r.status); path = null; }
      } catch (e) { console.warn('quote upload:', e); path = null; }

      // 2) 발주 생성. 무상보전(0원) 행은 이미 받은 물건이라 입고 완료로.
      const poNo = makePoNumber(q.order_date);
      const payload = {
        po_number: poNo,
        supplier_name: (q.supplier || 'JSR').trim(),
        order_date: q.order_date,
        title: q.quote_no ? `${q.supplier || 'JSR'} 제품견적서 ${q.quote_no}` : null,
        memo: '발주서 사진 자동 판독으로 등록',
        quote_no: q.quote_no || null,
        quote_url: url,
        quote_path: path,
        items: items.map((it) => ({
          name: (it.name || '').trim(),
          spec: (it.spec || '').trim(),
          unit_price: num(it.unit_price),
          qty: num(it.qty),
          received_qty: it.freeFill ? num(it.qty) : 0,
          ...(it.note ? { note: it.note } : {}),
        })),
      };
      const created = await supabase.addPurchaseOrder(payload);
      if (!created) { showToast?.('발주 등록 실패', 'error'); return; }

      // 3) 무상보전 연결 — 예전 발주의 미입고를 채운다. 금액은 안 건드리고 입고수량만 올림.
      let filled = 0;
      for (const [idx, val] of Object.entries(fills || {})) {
        if (!val) continue;
        const it = q.items[Number(idx)];
        if (!it) continue;
        const [poId, spec] = String(val).split('|');
        const target = pos.find((p) => String(p.id) === String(poId));
        if (!target) continue;
        let done = false;
        const newItems = (target.items || []).map((ti) => {
          if (done || ti.spec !== spec || ti.status_override) return ti;
          const rem = num(ti.qty) - num(ti.received_qty);
          if (rem <= 0) return ti;
          done = true;
          const add = Math.min(rem, num(it.qty));
          return {
            ...ti,
            received_qty: num(ti.received_qty) + add,
            note: `${ti.note ? ti.note + ' · ' : ''}${q.order_date} 발주서(${q.quote_no || '사진'})로 ${add}개 무상 보전 수령`,
          };
        });
        if (!done) continue;
        const ok = await supabase.updatePurchaseOrder(target.id, { items: newItems });
        if (ok) filled++;
      }

      showToast?.(filled > 0 ? `${poNo} 등록 + 예전 미입고 ${filled}건 입고 처리 ✅` : `${poNo} 등록 완료 ✅`, 'success');
      setScan(null);
      load();
    } finally { setSaving(false); }
  };

  // ── 내보내기 ──
  const onCopyKakao = async () => {
    if (!pendingItems.length) { showToast?.('복사할 미입고 품목이 없습니다', 'error'); return; }
    const suppliers = [...new Set(pendingItems.map(({ po }) => po.supplier_name))];
    const text = buildPendingKakaoText(pendingItems, { supplier: suppliers.length === 1 ? suppliers[0] : '' });
    const ok = await copyText(text);
    if (!ok) { showToast?.('복사 실패 — 길게 눌러 직접 복사해주세요', 'error'); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast?.('미입고 현황을 복사했습니다 📋', 'success');
  };

  const onCSV = () => {
    const isPending = tab === 'pending';
    if (isPending && !pendingItems.length) { showToast?.('내보낼 미입고 품목이 없습니다', 'error'); return; }
    if (!isPending && !filtered.length) { showToast?.('내보낼 발주가 없습니다', 'error'); return; }
    const today = getTodayKST();
    downloadCSV(
      isPending ? buildPendingCSV(pendingItems) : buildPurchaseCSV(filtered),
      isPending ? `미입고현황_${today}.csv` : `매입발주_${today}.csv`
    );
    showToast?.('CSV를 저장했습니다', 'success');
  };

  const onExcel = async () => {
    if (!filtered.length) { showToast?.('내보낼 발주가 없습니다', 'error'); return; }
    setExcelBusy(true);
    try {
      await exportPurchaseExcel(filtered);
      showToast?.('엑셀을 저장했습니다 (발주 + 미입고 2시트)', 'success');
    } catch (e) {
      console.error('exportPurchaseExcel:', e);
      showToast?.('엑셀 저장 실패', 'error');
    } finally { setExcelBusy(false); }
  };

  const onPrint = () => {
    const isPending = tab === 'pending';
    if (isPending && !pendingItems.length) { showToast?.('출력할 미입고 품목이 없습니다', 'error'); return; }
    if (!isPending && !filtered.length) { showToast?.('출력할 발주가 없습니다', 'error'); return; }
    const ok = isPending ? printPendingItems(pendingItems) : printPurchaseOrders(filtered);
    if (!ok) showToast?.('팝업이 차단됐습니다 — 브라우저에서 팝업을 허용해주세요', 'error');
  };

  const openPo = (po) => setEditing({ ...po, items: (po.items || []).map((it) => ({ ...it })) });

  return (
    <div className="h-full flex flex-col relative"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!scan && !scanning) setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={onDropQuote}>
      {/* 드래그드롭 오버레이 — 이미지를 페이지에 끌어오면 표시 */}
      {dragOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, rgba(0,0,0,0.35))', backdropFilter: 'blur(2px)' }}>
          <div className="px-8 py-6 rounded-2xl border-2 border-dashed text-center"
            style={{ borderColor: 'var(--primary)', background: 'var(--card)' }}>
            <Camera className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--primary)' }} />
            <div className="text-base font-bold" style={{ color: 'var(--foreground)' }}>여기에 발주서 이미지를 놓으세요</div>
            <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>놓으면 자동으로 판독합니다</div>
          </div>
        </div>
      )}
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setCurrentPage?.('dashboard')} className="p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <PackagePlus className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>매입 발주</h1>
          {/* 발주서 사진만 올리면 자동 판독 → 확인 → 등록. 손으로 안 쳐도 됨.
              클릭 업로드 외에 드래그드롭 / Ctrl+V(캡처 붙여넣기)도 됨 — 세 방법을 버튼에 명시 */}
          <label className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white cursor-pointer border-2 border-dashed border-white/45"
            title="클릭 업로드 · 이미지 드래그드롭 · Ctrl+V 붙여넣기 모두 됩니다"
            style={{ background: scanning ? 'var(--muted-foreground)' : 'var(--success)' }}>
            {scanning
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 판독 중...</>
              : <><Camera className="w-4 h-4" /> 발주서 등록 <span className="text-[10px] font-semibold opacity-90 whitespace-nowrap">클릭·드래그·Ctrl+V</span></>}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickQuote} disabled={scanning} />
          </label>
          <button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" /> 직접 입력
          </button>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: '발주 건수', value: `${summary.count}건` },
            { label: '총 발주액', value: `₩${formatPrice(summary.total)}` },
            { label: '미입고 금액', value: `₩${formatPrice(summary.openAmount)}`, alert: summary.openAmount > 0 },
            {
              label: '가장 오래 묵은 미입고',
              value: summary.oldest ? `${summary.oldestDays}일` : '없음',
              sub: summary.oldest ? `${summary.oldest.order_date} 발주` : null,
              alert: summary.oldestDays >= 30,
            },
          ].map((c) => (
            <div key={c.label} className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: c.alert ? 'var(--destructive)' : 'var(--border)' }}>
              <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{c.label}</div>
              <div className="text-lg font-black" style={{ color: c.alert ? 'var(--destructive)' : 'var(--foreground)' }}>{c.value}</div>
              {c.sub && <div className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* 탭 + 검색 */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {[
            { id: 'orders', label: '발주 목록', count: filtered.length },
            { id: 'pending', label: '미입고 현황', count: pendingItems.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5"
              style={tab === t.id
                ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
                : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
            >
              {t.label}
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}>{t.count}</span>
            </button>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="품명, 규격, 매입처, 발주번호..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>

        {/* 필터 한 줄 — 좌: 상태칩(발주목록 전용) / 우: 발주일. 3층이던 걸 2층으로 정리 (2026-07-23) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          {tab === 'orders' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: '전체' },
                { id: '미입고', label: '미입고' },
                { id: '부분 입고', label: '부분 입고' },
                { id: '완료', label: '완료' },
                { id: '특이사항', label: '특이사항' },
              ].map((s) => {
                const on = status === s.id;
                // 특이사항은 입고 상태가 아니라 별개 축이라 상태색과 겹치지 않는 진한 중립색을 쓴다
                const tone = s.id === '특이사항' ? 'var(--foreground)' : (STATUS_STYLE[s.id]?.bg || 'var(--primary)');
                return (
                  <button
                    key={s.id}
                    onClick={() => setStatus(s.id)}
                    aria-pressed={on}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5"
                    style={on
                      ? { background: tone, color: s.id === '특이사항' ? 'var(--background)' : '#fff', borderColor: tone }
                      : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
                  >
                    {s.label}
                    <span
                      className="px-1.5 rounded-full font-bold tabular-nums"
                      style={{ background: on ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}
                    >
                      {statusCounts[s.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* 발주일 — 오른쪽 정렬 */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <span className="text-[11px] font-bold tracking-wider" style={{ color: 'var(--muted-foreground)' }}>발주일</span>
            {[
              { id: 'all', label: '전체' },
              { id: 'thisMonth', label: '이번 달' },
              { id: 'lastMonth', label: '지난 달' },
              { id: 'thisYear', label: '올해' },
            ].map((p) => {
              const now = getTodayKST();
              const ym = now.slice(0, 7);
              const [yy, mm] = ym.split('-').map(Number);
              const lastYm = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
              const ranges = {
                all: ['', ''],
                thisMonth: [`${ym}-01`, `${ym}-31`],
                lastMonth: [`${lastYm}-01`, `${lastYm}-31`],
                thisYear: [`${yy}-01-01`, `${yy}-12-31`],
              };
              const [f, t] = ranges[p.id];
              const on = dateFrom === f && dateTo === t;
              return (
                <button key={p.id} onClick={() => { setDateFrom(f); setDateTo(t); }}
                  aria-pressed={on}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                  style={on
                    ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }
                    : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}>
                  {p.label}
                </button>
              );
            })}
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="px-2 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }} title="발주일 필터 초기화">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 내보내기 툴바 — 현재 탭 기준으로 동작 */}
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'pending' && (
            <ToolBtn onClick={onCopyKakao} icon={copied ? Check : Copy} tone={copied ? 'done' : 'kakao'}>
              {copied ? '복사됨!' : '카톡용 복사'}
            </ToolBtn>
          )}
          <ToolBtn onClick={onCSV} icon={FileDown}>CSV</ToolBtn>
          <ToolBtn onClick={onExcel} icon={FileSpreadsheet} disabled={excelBusy}>{excelBusy ? '만드는 중...' : '엑셀'}</ToolBtn>
          <ToolBtn onClick={onPrint} icon={Printer}>프린트</ToolBtn>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {tab === 'pending' ? '미입고 현황' : '발주 목록'} 기준
            {tab === 'orders' && status !== 'all' ? ` (${status}만)` : ''}{q ? ' (검색 결과만)' : ''}
          </span>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loadFailed && (
          <div className="mb-4 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
            <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
            <div className="text-sm" style={{ color: 'var(--foreground)' }}>
              <div className="font-bold mb-1">발주 테이블을 찾을 수 없습니다</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                Supabase 대시보드 &gt; SQL Editor 에서 <b>migrations/008_purchase_orders.sql</b> 을 실행해주세요.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
        ) : tab === 'orders' ? (
          filtered.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {status === '특이사항' ? '취소·차감 같은 특이사항이 있는 발주가 없습니다'
                : status !== 'all' ? `${status} 상태인 발주가 없습니다`
                : q ? '검색 결과가 없습니다' : '등록된 발주가 없습니다'}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((po) => {
                const st = poStatus(po);
                const open = poOpenItems(po);
                const sp = poSpecialLabel(po);
                return (
                  <button key={po.id} onClick={() => openPo(po)}
                    className="text-left rounded-xl border overflow-hidden hover:shadow-md transition-shadow"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex">
                      <div className="w-1.5 flex-shrink-0" style={{ background: (STATUS_STYLE[st] || overrideStyle).bg }} />
                      <div className="flex-1 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold font-mono" style={{ color: 'var(--muted-foreground)' }}>{po.po_number}</span>
                          <StatusBadge status={st} />
                          {/* 미완료 발주만 묵은 기간 노출 — 완료된 건 며칠 됐는지 알 필요 없다 */}
                          {open.length > 0 && <AgeBadge date={po.order_date} />}
                          {/* 취소·차감처럼 직접 적어둔 사유 — 상태 계산에서 빠지는 항목이라 여기서라도 보여준다 */}
                          {sp && (
                            <span
                              title={sp.title}
                              className="px-2 py-0.5 rounded-full text-[11px] font-bold border max-w-[140px] truncate"
                              style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)', background: 'var(--muted)' }}
                            >
                              {sp.label}
                            </span>
                          )}
                          <span className="ml-auto text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>{po.supplier_name}</span>
                        </div>
                        <div className="text-sm font-bold mb-2 truncate flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                          {po.order_date} 발주
                          {po.quote_url && <FileImage className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} title="발주서 있음" />}
                        </div>
                        <div className="space-y-0.5 mb-2">
                          {(po.items || []).slice(0, 3).map((it, i) => (
                            <div key={i} className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                              {it.name} {it.spec && <span className="opacity-70">/ {it.spec}</span>} · {num(it.qty)}개
                            </div>
                          ))}
                          {(po.items || []).length > 3 && (
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>외 {(po.items || []).length - 3}건</div>
                          )}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>₩{formatPrice(poTotal(po))}</div>
                          {open.length > 0 && (
                            <div className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--destructive)' }}>
                              <AlertTriangle className="w-3.5 h-3.5" /> 미입고 {open.length}품목
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : pendingItems.length === 0 ? (
          <div className="py-16 text-center" style={{ color: 'var(--muted-foreground)' }}>
            <PackageCheck className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <div className="text-sm font-bold">미입고 품목이 없습니다</div>
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm" style={{ minWidth: 940 }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['발주', '묵은 기간', '품명', '규격명', '단가', '수량', '입고', '남은', '미입고 금액', '상태', '처리'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingItems.map(({ po, item }, i) => {
                  const lv = ageLevel(daysSince(po.order_date));
                  return (
                    <tr key={`${po.id}-${i}`} className="border-t" style={{ borderColor: 'var(--border)', background: lv === 'critical' ? 'color-mix(in srgb, var(--destructive) 7%, transparent)' : undefined }}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button onClick={() => openPo(po)} className="font-mono text-xs font-bold underline" style={{ color: 'var(--primary)' }}>{po.po_number}</button>
                        <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{po.order_date}</div>
                      </td>
                      <td className="px-3 py-2.5"><AgeBadge date={po.order_date} /></td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--foreground)' }}>{item.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.spec}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ color: 'var(--muted-foreground)' }}>₩{formatPrice(item.unit_price)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{num(item.qty)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{num(item.received_qty)}</td>
                      <td className="px-3 py-2.5 text-lg font-black tabular-nums" style={{ color: 'var(--destructive)' }}>{itemRemaining(item)}</td>
                      <td className="px-3 py-2.5 font-black whitespace-nowrap tabular-nums" style={{ color: 'var(--destructive)' }}>₩{formatPrice(num(item.unit_price) * itemRemaining(item))}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={itemStatus(item)} /></td>
                      <td className="px-3 py-2.5">
                        {/* 물건 오면 여기서 바로 — 모달 열고 찾아 들어갈 필요 없이 */}
                        <button
                          onClick={() => setReceiving({ po, item, qty: itemRemaining(item) })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white whitespace-nowrap"
                          style={{ background: 'var(--success)' }}
                        >
                          <TruckIcon className="w-3.5 h-3.5" /> 입고
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 발주 등록/수정 모달 — 넓게(7xl) + 폰트 크게 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => !saving && setEditing(null)}>
          <div
            className="w-full max-w-[92rem] max-h-[94vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex-shrink-0 px-6 py-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              <PackagePlus className="w-7 h-7" style={{ color: 'var(--primary)' }} />
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
                {editing.id ? '발주 수정' : '발주 등록'}
              </h2>
              <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--card)', color: 'var(--muted-foreground)' }}>{editing.po_number}</span>
              {editing.id && <StatusBadge status={poStatus(editing)} size="lg" />}
              {editing.id && <AgeBadge date={editing.order_date} size="lg" />}
              {/* 증빙 원본 — 숫자가 의심되면 바로 발주서를 펴서 대조 */}
              {quoteUrls(editing).length > 0 && (
                <button
                  onClick={() => setViewQuote({ urls: quoteUrls(editing), po: editing, idx: 0 })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border"
                  style={{ background: 'var(--card)', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                >
                  <FileImage className="w-4 h-4" /> 발주서 보기
                  {editing.quote_no && <span className="font-mono text-xs opacity-70">{editing.quote_no}</span>}
                </button>
              )}
              <button onClick={() => setEditing(null)} className="ml-auto p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}>
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* 발주 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {[
                  { key: 'supplier_name', label: '매입처', type: 'text' },
                  { key: 'order_date', label: '발주일', type: 'date' },
                  { key: 'memo', label: '메모', type: 'text' },
                ].map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>{f.label}</span>
                    <input
                      type={f.type}
                      value={editing[f.key] || ''}
                      onChange={(e) => setEditing({
                        ...editing,
                        [f.key]: e.target.value,
                        ...(f.key === 'order_date' && !editing.id ? { po_number: makePoNumber(e.target.value) } : {}),
                      })}
                      className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-base border outline-none focus:ring-2"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    />
                  </label>
                ))}
              </div>

              {/* 품목 표 */}
              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full" style={{ minWidth: 1040 }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)' }}>
                      {['품명', '규격명', '단가', '수량', '입고 수량', '남은', '공급가액', '비고', '상태', ''].map((h) => (
                        <th key={h} className="px-2.5 py-3 text-left text-sm font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(editing.items || []).map((it, idx) => {
                      const st = itemStatus(it);
                      const inputStyle = { background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' };
                      const rem = itemRemaining(it);
                      return (
                        <tr key={idx} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-2.5 py-2">
                            <input value={it.name || ''} onChange={(e) => patchItem(idx, { name: e.target.value })}
                              className="w-48 px-3 py-2 rounded-lg text-base border outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2.5 py-2">
                            {/* 규격만 치면 단가표에서 최근 단가·품명이 따라온다.
                                이미 입력된 단가는 덮지 않는다 — 사장님이 고친 값을 뺏으면 안 되니까 */}
                            <input
                              value={it.spec || ''}
                              list="po-spec-options"
                              onChange={(e) => {
                                const spec = e.target.value;
                                const hit = priceBySpec.get(normSpec(spec));
                                const p = { spec };
                                if (hit) {
                                  if (num(it.unit_price) === 0) p.unit_price = hit.price;
                                  if (!(it.name || '').trim()) p.name = hit.name;
                                }
                                patchItem(idx, p);
                              }}
                              className="w-40 px-3 py-2 rounded-lg text-base border outline-none font-mono text-sm" style={inputStyle}
                              placeholder="규격명"
                            />
                            {(() => {
                              const hit = priceBySpec.get(normSpec(it.spec));
                              if (!hit) return null;
                              const diff = num(it.unit_price) - hit.price;
                              return (
                                <div className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: diff === 0 ? 'var(--muted-foreground)' : 'var(--warning)' }}>
                                  최근 ₩{formatPrice(hit.price)} ({String(hit.quoted_at).slice(2)})
                                  {diff !== 0 && num(it.unit_price) > 0 && ` · ${diff > 0 ? '+' : ''}${formatPrice(diff)}`}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-2.5 py-2">
                            <input type="number" value={it.unit_price ?? 0} onChange={(e) => patchItem(idx, { unit_price: e.target.value })}
                              className="w-28 px-3 py-2 rounded-lg text-base border outline-none text-right tabular-nums" style={inputStyle} />
                          </td>
                          <td className="px-2.5 py-2">
                            <input type="number" value={it.qty ?? 0} onChange={(e) => patchItem(idx, { qty: e.target.value })}
                              className="w-20 px-3 py-2 rounded-lg text-base border outline-none text-right tabular-nums" style={inputStyle} />
                          </td>
                          <td className="px-2.5 py-2">
                            <input type="number" value={it.received_qty ?? 0} onChange={(e) => patchItem(idx, { received_qty: e.target.value })}
                              className="w-20 px-3 py-2 rounded-lg text-base border-2 outline-none text-right font-bold tabular-nums"
                              style={{ ...inputStyle, borderColor: rem > 0 && !it.status_override ? 'var(--destructive)' : 'var(--border)' }} />
                          </td>
                          <td className="px-2.5 py-2 text-right text-lg font-black tabular-nums" style={{ color: rem > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                            {rem}
                          </td>
                          <td className="px-2.5 py-2 text-right whitespace-nowrap text-lg font-black tabular-nums" style={{ color: 'var(--foreground)' }}>
                            ₩{formatPrice(itemSupply(it))}
                          </td>
                          <td className="px-2.5 py-2">
                            <input value={it.note || ''} onChange={(e) => patchItem(idx, { note: e.target.value })}
                              className="w-32 px-3 py-2 rounded-lg text-base border outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2.5 py-2">
                            {/* 자동 상태는 배지로, 손으로 쓴 상태(주문 취소 등)는 그대로 수정 가능하게 */}
                            {isAutoStatus(st) ? (
                              <div className="flex items-center gap-1.5">
                                <StatusBadge status={st} />
                                <button onClick={() => patchItem(idx, { status_override: st === '-' ? '메모' : st })}
                                  className="text-[11px] underline" style={{ color: 'var(--muted-foreground)' }} title="상태를 직접 입력하려면 클릭">직접</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input value={it.status_override || ''} onChange={(e) => patchItem(idx, { status_override: e.target.value })}
                                  className="w-32 px-3 py-2 rounded-lg text-sm border outline-none" style={inputStyle} />
                                <button onClick={() => patchItem(idx, { status_override: '' })}
                                  className="text-[11px] underline" style={{ color: 'var(--muted-foreground)' }} title="자동 계산으로 되돌리기">자동</button>
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2">
                            <button onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) })}
                              className="p-2 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--destructive)' }}>
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                      <td colSpan={6} className="px-2.5 py-3 text-right text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>합계</td>
                      <td className="px-2.5 py-3 text-right text-2xl font-black whitespace-nowrap tabular-nums" style={{ color: 'var(--foreground)' }}>
                        ₩{formatPrice(poTotal(editing))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <button onClick={() => setEditing({ ...editing, items: [...(editing.items || []), emptyItem()] })}
                className="mt-4 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-base font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                <Plus className="w-5 h-5" /> 품목 추가
              </button>

              {/* 규격 자동완성 후보 — 단가표에 있는 규격들 */}
              <datalist id="po-spec-options">
                {specOptions.map((s) => <option key={s} value={s} />)}
              </datalist>

              <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                공급가액은 시트와 동일하게 <b>발주수량</b> 기준입니다(입고수량 아님). 취소분 차감은 수량을 음수로 입력하세요.
                {specOptions.length > 0 && <> · 규격명을 입력하면 <b>단가표({specOptions.length}종)</b>에서 최근 단가가 자동으로 들어옵니다.</>}
              </p>
            </div>

            {/* 모달 푸터 */}
            <div className="flex-shrink-0 px-6 py-4 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              {editing.id && (
                <button onClick={() => setConfirmDelete(editing)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-base font-bold border"
                  style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}>
                  <Trash2 className="w-5 h-5" /> 삭제
                </button>
              )}
              <button onClick={() => setEditing(null)} className="ml-auto px-5 py-2.5 rounded-xl text-base font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-7 py-2.5 rounded-xl text-base font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--primary)' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 발주서 사진 판독 결과 확인 — 매입 증빙이라 반드시 사람이 보고 등록 */}
      {scan && (
        <QuoteScanModal
          scan={scan.data}
          imgUrl={scan.imgUrl}
          pos={pos}
          saving={saving}
          onClose={() => { if (!saving) { URL.revokeObjectURL(scan.imgUrl); setScan(null); } }}
          onConfirm={onConfirmScan}
        />
      )}

      {/* 빠른 입고 처리 — 물건 오면 미입고 탭에서 바로 */}
      {receiving && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !saving && setReceiving(null)}>
          <div className="w-full max-w-lg rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <TruckIcon className="w-6 h-6" style={{ color: 'var(--success)' }} />
              <h3 className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>입고 처리</h3>
              <AgeBadge date={receiving.po.order_date} size="lg" />
            </div>

            <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
              <div className="text-xl font-black mb-1" style={{ color: 'var(--foreground)' }}>{receiving.item.name}</div>
              <div className="font-mono text-sm mb-3" style={{ color: 'var(--muted-foreground)' }}>{receiving.item.spec}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { l: '발주', v: num(receiving.item.qty) },
                  { l: '기존 입고', v: num(receiving.item.received_qty) },
                  { l: '남은', v: itemRemaining(receiving.item), alert: true },
                ].map((c) => (
                  <div key={c.l} className="py-2 rounded-lg" style={{ background: 'var(--muted)' }}>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{c.l}</div>
                    <div className="text-xl font-black tabular-nums" style={{ color: c.alert ? 'var(--destructive)' : 'var(--foreground)' }}>{c.v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {receiving.po.order_date} 발주 ({receiving.po.quote_no || receiving.po.po_number})
              </div>
            </div>

            <label className="block mb-4">
              <span className="text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>이번에 몇 개 들어왔나요?</span>
              <input
                type="number" autoFocus
                value={receiving.qty}
                onChange={(e) => setReceiving({ ...receiving, qty: e.target.value })}
                className="mt-1.5 w-full px-4 py-3 rounded-xl text-2xl font-black border-2 outline-none text-right tabular-nums"
                style={{ background: 'var(--background)', borderColor: 'var(--success)', color: 'var(--foreground)' }}
              />
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>남은 {itemRemaining(receiving.item)}개까지 입력할 수 있습니다</span>
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => setReceiving(null)} className="px-5 py-2.5 rounded-xl text-base font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={handleReceive} disabled={saving}
                className="px-6 py-2.5 rounded-xl text-base font-bold text-white disabled:opacity-60" style={{ background: 'var(--success)' }}>
                {saving ? '처리 중...' : '입고 확정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 발주서 원본 열람 — 증빙 */}
      {viewQuote && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setViewQuote(null)}>
          <div className="flex items-center gap-3 mb-3 text-white" onClick={(e) => e.stopPropagation()}>
            <FileImage className="w-5 h-5" />
            <span className="font-bold">{viewQuote.po.po_number} 발주서</span>
            <span className="font-mono text-sm opacity-70">{viewQuote.po.quote_no}</span>
            {viewQuote.urls.length > 1 && (
              <div className="flex gap-1">
                {viewQuote.urls.map((_, i) => (
                  <button key={i} onClick={() => setViewQuote({ ...viewQuote, idx: i })}
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={{ background: i === viewQuote.idx ? '#fff' : 'rgba(255,255,255,0.25)', color: i === viewQuote.idx ? '#000' : '#fff' }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <a href={viewQuote.urls[viewQuote.idx]} target="_blank" rel="noreferrer" className="px-2 py-1 rounded text-xs font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>원본</a>
            <button onClick={() => setViewQuote(null)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.2)' }}><X className="w-5 h-5" /></button>
          </div>
          <img
            src={viewQuote.urls[viewQuote.idx]}
            alt="발주서"
            className="max-w-full max-h-[85vh] object-contain rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 삭제 확인 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-6 h-6" style={{ color: 'var(--destructive)' }} />
              <h3 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>발주 삭제</h3>
            </div>
            <div className="text-base mb-1" style={{ color: 'var(--foreground)' }}>
              <b>{confirmDelete.po_number}</b> ({confirmDelete.supplier_name} · {confirmDelete.order_date})
            </div>
            <div className="text-base mb-5" style={{ color: 'var(--muted-foreground)' }}>
              품목 {(confirmDelete.items || []).length}건 · ₩{formatPrice(poTotal(confirmDelete))}
              <br /><span style={{ color: 'var(--destructive)' }}>삭제하면 되돌릴 수 없습니다.</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-5 py-2.5 rounded-xl text-base font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl text-base font-bold text-white" style={{ background: 'var(--destructive)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
