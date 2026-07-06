import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng, toBlob } from 'html-to-image';
import { Printer, Download, Copy, Search, X as XIcon } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const fmtMMDD = (iso) => (iso || '').slice(5).replace('-', '.');
// KST 기준 오늘 (UTC+9). new Date().toISOString()(UTC)는 KST 00~09시에 전날로 잡혀 명세서 날짜가 어긋남 [bug-hunt 6]
const todayISO = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const offsetDays = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const startOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + monOffset);
  return d.toISOString().slice(0, 10);
};
const startOfMonthISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const DATE_PRESETS = [
  { key: 'today', label: '오늘' },
  { key: 'yesterday', label: '어제' },
  { key: 'thisWeek', label: '이번 주' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'all', label: '전체' },
  { key: 'custom', label: '날짜 선택' },
];

export default function InvoicesPage({
  customers,
  initialCustomerId = null,
  onOpenPayment,
  onOpenBulkPay,
  onOpenCustomerDetail,
}) {
  const [datePreset, setDatePreset] = useState('today');
  const [date, setDate] = useState(todayISO());
  // 다중 선택: Set<string> (id 문자열). 빈 Set = 전체 업체
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(() => {
    if (initialCustomerId) return new Set([String(initialCustomerId)]);
    return new Set();
  });

  // initialCustomerId가 바뀌면 자동으로 해당 업체 선택 (페이먼트 → 명세서 점프 시)
  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerIds(new Set([String(initialCustomerId)]));
    }
  }, [initialCustomerId]);
  const isAllCustomers = selectedCustomerIds.size === 0;
  const [records, setRecords] = useState([]);
  const [carryover, setCarryover] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(null);
  const [selectedCarryoverDates, setSelectedCarryoverDates] = useState(() => new Set());
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // 명세서 행 수동 수정 오버라이드 (localStorage 영속)
  // key: `${record.id}:${itemIndex}`, value: { qty?: number, unitWithVat?: number, name?: string, deleted?: boolean }
  const OVERRIDE_KEY = 'pos_invoice_line_overrides_v1';
  const [lineOverrides, setLineOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(lineOverrides)); } catch {}
  }, [lineOverrides]);
  const [editingLine, setEditingLine] = useState(null); // { key, name, qty, unitWithVat }
  const invoiceRef = useRef(null);

  useEffect(() => {
    supabase.getSettings().then(setSettings);
  }, []);

  const dateRange = useMemo(() => {
    const today = todayISO();
    switch (datePreset) {
      case 'today':     return { from: today, to: today, label: today };
      case 'yesterday': { const y = offsetDays(today, -1); return { from: y, to: y, label: y }; }
      case 'thisWeek':  return { from: startOfWeekISO(), to: today, label: `${startOfWeekISO()} ~ ${today}` };
      case 'thisMonth': return { from: startOfMonthISO(), to: today, label: `${startOfMonthISO()} ~ ${today}` };
      case 'all':       return { from: null, to: null, label: '전체 기간' };
      case 'custom':    return { from: date, to: date, label: date };
      default:          return { from: today, to: today, label: today };
    }
  }, [datePreset, date]);

  // 하루씩 앞/뒤로 이동 — 기준일을 ±1일 한 뒤 단일 날짜('custom') 모드로 고정 (그날 명세서만 표시)
  const invAnchorDate = () => {
    const t = todayISO();
    if (datePreset === 'custom' && date) return date;
    if (datePreset === 'yesterday') return offsetDays(t, -1);
    return t; // today / thisWeek / thisMonth / all → 오늘 기준
  };
  const stepInvoiceDate = (delta) => {
    const next = offsetDays(invAnchorDate(), delta);
    setDate(next);
    setDatePreset('custom');
  };
  const invCanForward = invAnchorDate() < todayISO(); // 미래로는 이동 막음
  const invMmdd = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.getPaymentRecords(),
      supabase.getOrders(),
      supabase.getPaymentHistory({}),
    ]).then(([allRecords, allOrders, allHistory]) => {
      const recordedOrderIds = new Set(
        (allRecords || []).map((r) => r.order_id).filter(Boolean).map(String)
      );

      const orderMap = new Map();
      for (const o of allOrders || []) orderMap.set(String(o.id), o);

      const historyByRecord = new Map();
      for (const h of allHistory || []) {
        const key = String(h.payment_record_id);
        if (!historyByRecord.has(key)) historyByRecord.set(key, []);
        historyByRecord.get(key).push(h);
      }

      const enrichedRecords = (allRecords || []).map((r) => {
        const base = { ...r, history: historyByRecord.get(String(r.id)) || [] };
        if (!r.order_id) return base;
        const o = orderMap.get(String(r.order_id));
        return o ? { ...base, items: o.items || [], order_memo: o.memo || '' } : base;
      });

      const byName = new Map();
      const byPhone = new Map();
      for (const c of customers || []) {
        if (c.name) byName.set(c.name.trim(), c);
        if (c.phone) byPhone.set(c.phone.trim(), c);
      }

      const virtualRecords = [];
      for (const o of allOrders || []) {
        if (recordedOrderIds.has(String(o.id))) continue;

        const name = (o.customer_name || '').trim();
        const phone = (o.customer_phone || '').trim();
        let cust = null;
        if (name) cust = byName.get(name);
        if (!cust && phone) cust = byPhone.get(phone);

        const total = Number(o.total || 0) - Number(o.total_returned || 0);
        if (total <= 0) continue;

        const orderDate = (o.created_at || '').slice(0, 10);
        const supply = Math.round(total / 1.1);

        virtualRecords.push({
          id: `virt-${o.id}`,
          order_id: o.id,
          customer_id: cust?.id || null,
          total_amount: total,
          supply_amount: supply,
          vat_amount: total - supply,
          paid_amount: 0,
          balance: total,
          payment_status: 'no_record',
          invoice_date: orderDate,
          invoice_issued: false,
          category: 'sales',
          is_vat_exempt: false,
          memo: o.memo || '',
          items: o.items || [],
          order_memo: o.memo || '',
          history: [],
          _virtual: true,
        });
      }

      const mergedAll = [...enrichedRecords, ...virtualRecords];

      const inRange = (r) => {
        if (!dateRange.from) return true;
        if (!r.invoice_date) return true;
        return r.invoice_date >= dateRange.from && r.invoice_date <= dateRange.to;
      };
      const current = mergedAll.filter(inRange);

      const prev = mergedAll.filter((r) =>
        r.invoice_date && dateRange.from && r.invoice_date < dateRange.from && Number(r.balance) > 0
      );

      setRecords(current);
      setCarryover(prev);
    }).catch((e) => {
      console.error('[Invoices] load failed:', e);
      setRecords([]);
      setCarryover([]);
    }).finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to, customers]);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || `#${id}`;

  // 업체 선택 토글
  const toggleCustomer = (id) => {
    if (!id) return;
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearAllCustomers = () => setSelectedCustomerIds(new Set());

  // 업체별 필터 적용
  const filteredRecords = useMemo(() => {
    if (isAllCustomers) return records;
    return records.filter((r) => selectedCustomerIds.has(String(r.customer_id)));
  }, [records, selectedCustomerIds, isAllCustomers]);

  const filteredCarryover = useMemo(() => {
    if (isAllCustomers) return carryover;
    return carryover.filter((r) => selectedCustomerIds.has(String(r.customer_id)));
  }, [carryover, selectedCustomerIds, isAllCustomers]);

  // 미수 업체 집계 (customerId='all' 상태에서만 의미있음)
  const outstandingCustomers = useMemo(() => {
    const byCust = new Map();
    const upsert = (r) => {
      const cid = r.customer_id;
      const key = cid ? String(cid) : `unknown-${r.customer_name || ''}`;
      const cust = cid ? customers.find((c) => c.id === cid) : null;
      if (!byCust.has(key)) {
        byCust.set(key, {
          id: cid,
          name: cust?.name || r.customer_name || '(미지정 거래처)',
          phone: cust?.phone || '',
          balance: 0,
          count: 0,
          lastDate: '',
          unregistered: !cust,
        });
      }
      const e = byCust.get(key);
      e.balance += Number(r.balance || 0);
      e.count += 1;
      if (r.invoice_date && r.invoice_date > e.lastDate) e.lastDate = r.invoice_date;
    };
    for (const r of records) if (Number(r.balance) > 0) upsert(r);
    for (const r of carryover) if (Number(r.balance) > 0) upsert(r);
    return [...byCust.values()]
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [records, carryover, customers]);

  const outstandingTotal = useMemo(
    () => outstandingCustomers.reduce((s, c) => s + c.balance, 0),
    [outstandingCustomers]
  );

  const [outstandingSearch, setOutstandingSearch] = useState('');
  const filteredOutstanding = useMemo(() => {
    const q = outstandingSearch.trim().toLowerCase().replace(/\s/g, '');
    if (!q) return outstandingCustomers;
    return outstandingCustomers.filter((c) => {
      const n = (c.name || '').toLowerCase().replace(/\s/g, '');
      const p = (c.phone || '').replace(/[\s-]/g, '');
      return n.includes(q) || p.includes(q);
    });
  }, [outstandingCustomers, outstandingSearch]);

  // 이월 날짜별 그룹 — 업체 선택 시 해당 업체의 이월만 표시 (전체 모드 드로어용)
  const carryoverByDate = useMemo(() => {
    const source = isAllCustomers ? carryover : filteredCarryover;
    const g = new Map();
    for (const r of source) {
      if (!(Number(r.balance) > 0)) continue;
      const key = r.invoice_date || '(날짜 없음)';
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(r);
    }
    return [...g.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, rows]) => ({
        date,
        rows,
        count: rows.length,
        total: rows.reduce((s, r) => s + Number(r.balance || 0), 0),
      }));
  }, [carryover, filteredCarryover, isAllCustomers]);

  // 업체별 이월 날짜 맵 — 선택된 업체 밑에 인라인 표시할 용도
  const carryoverByCustomer = useMemo(() => {
    const m = new Map();
    for (const r of carryover) {
      if (!(Number(r.balance) > 0)) continue;
      const cid = String(r.customer_id ?? `unknown-${r.customer_name ?? ''}`);
      if (!m.has(cid)) m.set(cid, new Map());
      const dateMap = m.get(cid);
      const key = r.invoice_date || '(날짜 없음)';
      if (!dateMap.has(key)) dateMap.set(key, { date: key, count: 0, total: 0 });
      const e = dateMap.get(key);
      e.count += 1;
      e.total += Number(r.balance || 0);
    }
    const out = new Map();
    for (const [cid, dateMap] of m) {
      out.set(cid, [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date)));
    }
    return out;
  }, [carryover]);

  // 업체 선택이 바뀌면 선택된 이월 날짜도 리셋 (더이상 해당 업체에 없는 날짜가 남는 문제 방지)
  useEffect(() => { setSelectedCarryoverDates(new Set()); }, [carryover, selectedCustomerIds]);

  const toggleCarryoverDate = (d) =>
    setSelectedCarryoverDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  const selectAllCarryoverDates = () =>
    setSelectedCarryoverDates(new Set(carryoverByDate.map((x) => x.date)));
  const clearCarryoverDates = () => setSelectedCarryoverDates(new Set());

  // 품목 flat list 생성기 (한 레코드 → items × 1라인씩)
  // 사용자가 명세서에서 수동 수정한 값(lineOverrides)을 최우선 적용
  const recordToLines = (r) => {
    const items = Array.isArray(r.items) ? r.items : [];
    const date = r.invoice_date || '';
    const out = [];
    items.forEach((it, idx) => {
      const key = `${r.id}:${idx}`;
      const ov = lineOverrides[key] || {};
      if (ov.deleted) return; // 삭제된 행은 제외
      const qty = Number(ov.qty ?? it.quantity) || 1;
      const unitWithVat = Number(ov.unitWithVat ?? it.price) || 0;
      const lineWithVat = unitWithVat * qty;
      const supply = Math.round(lineWithVat / 1.1);
      const vat = lineWithVat - supply;
      const isDiscounted = !!it.discountType && Number(it.discountValue) > 0 && ov.unitWithVat == null;
      const baseUnit = isDiscounted ? (Number(it.originalPrice) || unitWithVat) : unitWithVat;
      out.push({
        key,
        date,
        code: it.code || it.product_id || '',
        name: ov.name ?? (it.name || it.product_name || '품목'),
        spec: it.spec || it.option || '',
        qty,
        unitPrice: Math.round(unitWithVat / 1.1),
        unitWithVat,
        supply,
        vat,
        memo: '',
        edited: !!(ov.qty != null || ov.unitWithVat != null || ov.name != null),
        isDiscounted,
        baseUnitWithVat: baseUnit,
        discountType: it.discountType,
        discountValue: it.discountValue,
      });
    });
    return out;
  };

  // 편집 동작
  const openLineEditor = (line) => {
    setEditingLine({
      key: line.key,
      name: line.name,
      qty: line.qty,
      unitWithVat: line.unitWithVat,
    });
  };
  const saveLineEdit = () => {
    if (!editingLine) return;
    const { key, name, qty, unitWithVat } = editingLine;
    setLineOverrides((prev) => ({
      ...prev,
      [key]: { name, qty: Number(qty) || 0, unitWithVat: Number(unitWithVat) || 0 },
    }));
    setEditingLine(null);
  };
  const resetLineOverride = (key) => {
    setLineOverrides((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setEditingLine(null);
  };
  const deleteLine = (key) => {
    if (!confirm('이 품목을 명세서에서 제외할까요? (원본 주문은 그대로)')) return;
    setLineOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), deleted: true } }));
  };

  // 업체별 명세서 섹션 배열 생성
  const customerInvoices = useMemo(() => {
    // 대상 업체 ID 결정
    let targetIds;
    if (isAllCustomers) {
      // 전체 업체 = filteredRecords + filteredCarryover 에 등장하는 모든 customer_id
      const ids = new Set();
      for (const r of filteredRecords) ids.add(String(r.customer_id ?? `unknown-${r.customer_name ?? ''}`));
      for (const r of filteredCarryover) ids.add(String(r.customer_id ?? `unknown-${r.customer_name ?? ''}`));
      targetIds = [...ids];
    } else {
      targetIds = [...selectedCustomerIds];
    }

    const invoices = [];
    for (const cid of targetIds) {
      const match = (r) => String(r.customer_id ?? `unknown-${r.customer_name ?? ''}`) === cid;
      const cRecords = filteredRecords.filter(match);
      const cCarryover = filteredCarryover.filter(match);

      const lines = [];
      for (const r of cRecords) lines.push(...recordToLines(r));
      for (const r of cCarryover) {
        if (selectedCarryoverDates.has(r.invoice_date)) lines.push(...recordToLines(r));
      }
      lines.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const unselectedCarryBalance = cCarryover.reduce(
        (s, r) => selectedCarryoverDates.has(r.invoice_date) ? s : s + Number(r.balance || 0), 0
      );
      const cPaid = cRecords.reduce((s, r) => s + Number(r.paid_amount || 0), 0)
        + cCarryover.reduce((s, r) => selectedCarryoverDates.has(r.invoice_date) ? s + Number(r.paid_amount || 0) : s, 0);
      const supply = lines.reduce((s, l) => s + l.supply, 0);
      const vat = lines.reduce((s, l) => s + l.vat, 0);
      const sum = supply + vat;
      const totalBeforePaid = unselectedCarryBalance + sum;
      const grandBalance = totalBeforePaid - cPaid;

      // 빈 업체 제외 (단, 선택된 업체면 유지)
      if (lines.length === 0 && unselectedCarryBalance === 0 && !selectedCustomerIds.has(cid)) continue;

      const cust = customers.find((c) => String(c.id) === cid);
      const label = cust?.name
        || cRecords[0]?.customer_name
        || cCarryover[0]?.customer_name
        || '(미지정 거래처)';

      invoices.push({
        id: cid,
        name: label,
        lines,
        totals: {
          supply, vat, sum,
          prevBalance: unselectedCarryBalance,
          totalBeforePaid, totalPaid: cPaid, grandBalance,
          count: lines.length,
        },
      });
    }

    // 총잔액 큰 순
    return invoices.sort((a, b) => b.totals.grandBalance - a.totals.grandBalance);
  }, [filteredRecords, filteredCarryover, selectedCarryoverDates, selectedCustomerIds, isAllCustomers, customers]);

  // 전체 합계 (여러 업체 선택 시 상단 요약)
  const grandTotals = useMemo(() => {
    return customerInvoices.reduce((acc, inv) => ({
      supply: acc.supply + inv.totals.supply,
      vat: acc.vat + inv.totals.vat,
      sum: acc.sum + inv.totals.sum,
      prevBalance: acc.prevBalance + inv.totals.prevBalance,
      totalPaid: acc.totalPaid + inv.totals.totalPaid,
      grandBalance: acc.grandBalance + inv.totals.grandBalance,
      count: acc.count + inv.totals.count,
      customerCount: acc.customerCount + 1,
    }), { supply: 0, vat: 0, sum: 0, prevBalance: 0, totalPaid: 0, grandBalance: 0, count: 0, customerCount: 0 });
  }, [customerInvoices]);

  // 오늘 거래 업체 일괄 추가
  const addTodayTradedCustomers = () => {
    const today = todayISO();
    const ids = new Set();
    for (const r of records) {
      const d = (r.invoice_date || '').slice(0, 10);
      if (d === today && r.customer_id) ids.add(String(r.customer_id));
    }
    if (ids.size === 0) {
      showToast('오늘 거래된 업체가 없습니다');
      return;
    }
    setSelectedCustomerIds((prev) => new Set([...prev, ...ids]));
    showToast(`오늘 거래 ${ids.size}개 업체 추가됨`);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // 캡처(PNG/카톡) 시 화면용 버튼(.no-print: 입금등록·일괄입금·업체상세·행별 수정/X·안내수정)을 제외
  // → 진짜 명세서처럼 깔끔하게 저장 (no-print는 @media print 전용이라 캡처엔 그대로 찍히던 문제)
  const exportFilter = (node) => !(node?.classList?.contains?.('no-print'));

  const handlePng = async () => {
    if (!invoiceRef.current) { alert('명세서 요소를 찾을 수 없습니다'); return; }
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', filter: exportFilter });
      const a = document.createElement('a');
      a.href = dataUrl;
      const nameTag = isAllCustomers
        ? '전체'
        : customerInvoices.length === 1
          ? customerInvoices[0].name.replace(/[^a-zA-Z0-9가-힣]/g, '_')
          : `${customerInvoices.length}개업체`;
      a.download = `명세서_${nameTag}_${dateRange.label.replace(/[^a-zA-Z0-9가-힣~-]/g, '_')}.png`;
      a.click();
      showToast('✅ PNG 다운로드됨');
    } catch (e) {
      console.error('[InvoicePNG] failed:', e);
      showToast('PNG 실패: ' + (e?.message || e));
    }
  };

  const handleCopy = async () => {
    if (!invoiceRef.current) { alert('명세서 요소를 찾을 수 없습니다'); return; }
    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast('❌ 이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다');
      return;
    }
    try {
      const blob = await toBlob(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', filter: exportFilter });
      if (!blob) throw new Error('blob 생성 실패');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('✅ 클립보드 복사됨 — 카톡에 붙여넣기');
    } catch (e) {
      console.error('[InvoiceCopy] failed:', e);
      showToast('복사 실패: ' + (e?.message || e));
    }
  };

  const handlePrint = () => {
    try { window.print(); } catch (e) { alert('인쇄 실패: ' + e.message); }
  };

  const hasData = customerInvoices.length > 0;
  const showGrandSummary = customerInvoices.length >= 2;

  return (
    <div className="max-w-[1600px] mx-auto px-2">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print, .invoice-print * { visibility: visible; }
          .invoice-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ─── 상단 헤더 바: 제목 + 날짜 칩 + 액션 (sticky + 접기/펴기) ─── */}
      <div
        className="no-print sticky top-0 z-30 -mx-2 px-2 py-3 mb-4 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]"
      >
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {/* 접기/펴기 토글 */}
            <button
              onClick={() => setHeaderCollapsed((v) => !v)}
              title={headerCollapsed ? '헤더 펼치기' : '헤더 접기'}
              aria-label={headerCollapsed ? '헤더 펼치기' : '헤더 접기'}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[var(--foreground)] shadow-sm"
            >
              <span className="text-xs font-bold">{headerCollapsed ? '▼' : '▲'}</span>
            </button>
            <h2 className="text-2xl font-bold flex items-center gap-2">📄 거래명세서</h2>

            {/* 접혔을 때: 현재 상태 요약만 표시 */}
            {headerCollapsed && (
              <div className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
                <span className="px-2.5 py-1 rounded-md bg-[var(--secondary)] font-semibold text-[var(--foreground)]">
                  {dateRange.label}
                </span>
                {!isAllCustomers && (
                  <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                    {selectedCustomerIds.size}개 업체
                  </span>
                )}
              </div>
            )}

            {/* 펼쳤을 때: 날짜 프리셋 + 업체 칩 전체 노출 */}
            {!headerCollapsed && (
              <>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {/* ◀ M/D ▶ 날짜 스테퍼 — 하루씩 이동 (그날 명세서만 표시) */}
                  <button
                    onClick={() => stepInvoiceDate(-1)}
                    title="하루 전"
                    aria-label="하루 전"
                    className="w-8 h-8 rounded-md text-base font-bold flex items-center justify-center border bg-[var(--card)] hover:bg-[var(--secondary)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >‹</button>
                  <span
                    className="px-2.5 py-1.5 rounded-md text-[13px] font-bold tabular-nums whitespace-nowrap"
                    style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
                    title="현재 기준일 (하루씩 이동)"
                  >{invMmdd(invAnchorDate())}</span>
                  <button
                    onClick={() => stepInvoiceDate(1)}
                    disabled={!invCanForward}
                    title="하루 후"
                    aria-label="하루 후"
                    className="w-8 h-8 rounded-md text-base font-bold flex items-center justify-center border bg-[var(--card)] hover:bg-[var(--secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >›</button>
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setDatePreset(p.key)}
                      className="px-2.5 py-1.5 rounded-md text-[13px] font-semibold whitespace-nowrap transition-all border"
                      style={{
                        background: datePreset === p.key ? 'var(--primary)' : 'var(--card)',
                        color: datePreset === p.key ? 'var(--primary-foreground)' : 'var(--foreground)',
                        borderColor: datePreset === p.key ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {datePreset === 'custom' && (
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)]"
                      style={{ fontSize: '14px' }}
                    />
                  )}
                </div>
                {!isAllCustomers && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...selectedCustomerIds].slice(0, 3).map((cid) => {
                      const cust = customers.find((c) => String(c.id) === cid);
                      const name = cust?.name || `#${cid}`;
                      return (
                        <button
                          key={cid}
                          onClick={() => toggleCustomer(cid)}
                          className="px-2.5 py-1.5 rounded-md text-[13px] font-medium whitespace-nowrap bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1.5"
                        >
                          <span>{name}</span>
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                    {selectedCustomerIds.size > 3 && (
                      <span className="px-3 py-1.5 rounded-md text-[13px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                        외 {selectedCustomerIds.size - 3}개
                      </span>
                    )}
                    <button
                      onClick={clearAllCustomers}
                      className="px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap text-gray-500 hover:text-red-600 underline"
                    >
                      전체 해제
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 액션 버튼은 항상 노출 (스크롤 중에도 바로 사용) */}
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handlePng} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold bg-[var(--primary)] text-white hover:brightness-110 shadow-sm">
              <Download className="w-4 h-4" />PNG
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)]">
              <Printer className="w-4 h-4" />인쇄
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold bg-green-600 text-white hover:bg-green-500 shadow-sm">
              <Copy className="w-4 h-4" />카톡
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">

      {/* ─── 좌측: 미수 업체 리스트 + 이월 선택(접힘) ─── */}
      <aside className="space-y-3 lg:sticky lg:top-[88px] no-print">
        {/* 미수 업체 리스트 (메인) — 체크한 업체 밑에 해당 업체 이월 날짜 인라인 표시 */}
        <OutstandingCustomerList
          items={filteredOutstanding}
          total={outstandingTotal}
          allCount={outstandingCustomers.length}
          search={outstandingSearch}
          onSearchChange={setOutstandingSearch}
          selectedIds={selectedCustomerIds}
          onToggle={toggleCustomer}
          onClearAll={clearAllCustomers}
          onAddToday={addTodayTradedCustomers}
          carryoverByCustomer={carryoverByCustomer}
          selectedCarryoverDates={selectedCarryoverDates}
          onToggleCarryoverDate={toggleCarryoverDate}
        />

        {/* 이월 미수 선택 — 전체 모드(업체 미선택)에서만 드로어 표시 */}
        {isAllCustomers && (
          <CarryoverDateDrawer
            byDate={carryoverByDate}
            selectedDates={selectedCarryoverDates}
            onToggle={toggleCarryoverDate}
            onSelectAll={selectAllCarryoverDates}
            onClearAll={clearCarryoverDates}
            filteredCustomerCount={0}
          />
        )}
      </aside>

      {/* ─── 우측: 전통 거래명세서 양식 ─── */}
      <section className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
        <div
          ref={invoiceRef}
          className="invoice-print bg-white text-black p-5"
          style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", system-ui, sans-serif' }}
        >
          {loading ? (
            <p className="text-base text-center py-12">로딩 중...</p>
          ) : !hasData ? (
            <div className="text-center py-12 text-gray-600 space-y-1.5">
              <p className="text-base">표시할 명세서 데이터가 없습니다.</p>
              <p className="text-sm">좌측에서 업체를 체크하거나 이월 날짜를 선택해주세요.</p>
            </div>
          ) : (
            <>
              {/* 여러 업체 선택 시 상단 총합 요약 배너 */}
              {showGrandSummary && (
                <div
                  className="rounded-lg px-5 py-4 mb-5 flex items-center justify-between"
                  style={{ background: 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)', color: '#fff' }}
                >
                  <div>
                    <div className="text-[12px] tracking-widest font-semibold text-red-100">총 거래 요약</div>
                    <div className="text-sm text-red-100 mt-1">
                      {grandTotals.customerCount}개 업체 · {grandTotals.count}건 품목
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] text-red-100">총 잔액</div>
                    <div className="text-3xl font-black tabular-nums">₩ {fmt(grandTotals.grandBalance)}</div>
                  </div>
                </div>
              )}

              {/* 업체별 명세서 섹션 반복 */}
              {customerInvoices.map((inv, idx) => {
                const hasOpenBalance = Number(inv.totals.grandBalance) > 0;
                const hasActions = onOpenPayment || onOpenBulkPay || onOpenCustomerDetail;
                return (
                  <div key={inv.id} className={idx > 0 ? 'mt-8 pt-8' : ''} style={idx > 0 ? { borderTop: '2px dashed #e5e7eb' } : {}}>
                    {/* 업체별 액션 바 — 입금 등록/일괄 입금/업체 상세 (명세서 페이지 위에서 바로 처리) */}
                    {hasActions && inv.id && !String(inv.id).startsWith('unknown') && (
                      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="text-[13px] text-gray-600">
                          <span className="font-semibold text-gray-800">{inv.name}</span>
                          {hasOpenBalance && (
                            <span className="ml-2 text-red-600 font-bold tabular-nums">잔액 {fmt(inv.totals.grandBalance)}원</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {onOpenPayment && hasOpenBalance && (
                            <button
                              onClick={() => onOpenPayment(inv.id, null)}
                              className="px-2.5 py-1.5 rounded-md text-[12px] font-bold whitespace-nowrap bg-green-600 text-white hover:bg-green-500 shadow-sm flex items-center gap-1"
                              title="이 업체에 단일 건 입금 등록"
                            >
                              💵 입금 등록
                            </button>
                          )}
                          {onOpenBulkPay && hasOpenBalance && (
                            <button
                              onClick={() => onOpenBulkPay(inv.id)}
                              className="px-2.5 py-1.5 rounded-md text-[12px] font-bold whitespace-nowrap bg-emerald-700 text-white hover:bg-emerald-600 shadow-sm flex items-center gap-1"
                              title="미수 전체에 일괄 입금 (오래된 순으로 자동 배분)"
                            >
                              💰 일괄 입금
                            </button>
                          )}
                          {onOpenCustomerDetail && (
                            <button
                              onClick={() => onOpenCustomerDetail(inv.id)}
                              className="px-2.5 py-1.5 rounded-md text-[12px] font-bold whitespace-nowrap border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] flex items-center gap-1"
                              title="업체 상세 보기 (주문·결제 이력)"
                            >
                              👁 업체 상세
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <TraditionalInvoice
                      settings={settings}
                      customerLabel={`${inv.name} 귀하`}
                      customerKey={inv.id || inv.name}
                      issueDate={dateRange.label}
                      lines={inv.lines}
                      totals={inv.totals}
                      compact={showGrandSummary}
                      onEditLine={openLineEditor}
                      onDeleteLine={deleteLine}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold shadow-2xl z-50 no-print">
          {toast}
        </div>
      )}

      {/* 명세서 행 편집 모달 — 수량/단가(VAT포함) 수동 조정 */}
      {editingLine && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 no-print"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setEditingLine(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-amber-500 bg-[var(--card)] shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black flex items-center gap-2">✏️ 품목 수정</h3>
              <button onClick={() => setEditingLine(null)} className="w-8 h-8 rounded-md hover:bg-[var(--secondary)]">✕</button>
            </div>
            <p className="text-[12px] text-[var(--muted-foreground)] mb-4 p-2 rounded bg-amber-50 border border-amber-200">
              💡 원본 주문 데이터는 그대로 두고, 이 명세서에만 적용되는 조정값을 저장합니다.
              잘못 저장된 주문(환불 반영 등) 또는 일시적 수정에 사용하세요.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-bold mb-1.5">품목명</label>
                <input
                  value={editingLine.name}
                  onChange={(e) => setEditingLine((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border-2 border-[var(--border)] bg-[var(--background)]"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1.5">수량</label>
                  <input
                    inputMode="numeric"
                    value={editingLine.qty}
                    onChange={(e) => setEditingLine((p) => ({ ...p, qty: e.target.value.replace(/[^0-9]/g, '') }))}
                    className="w-full px-3 py-2.5 rounded-lg border-2 border-[var(--border)] bg-[var(--background)] text-right font-bold"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5">단가 (VAT포함)</label>
                  <div className="relative">
                    <input
                      inputMode="numeric"
                      value={editingLine.unitWithVat ? Number(editingLine.unitWithVat).toLocaleString('ko-KR') : ''}
                      onChange={(e) => setEditingLine((p) => ({ ...p, unitWithVat: e.target.value.replace(/[^0-9]/g, '') }))}
                      className="w-full px-3 py-2.5 pr-8 rounded-lg border-2 border-[var(--border)] bg-[var(--background)] text-right font-bold"
                      placeholder="0"
                      style={{ fontSize: '16px' }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">원</span>
                  </div>
                </div>
              </div>
              {/* 자동 계산 미리보기 */}
              {Number(editingLine.qty) > 0 && Number(editingLine.unitWithVat) > 0 && (
                <div className="p-3 rounded-lg bg-[var(--secondary)] text-center">
                  <div className="text-[11px] text-[var(--muted-foreground)] mb-0.5">합계 (VAT포함)</div>
                  <div className="text-xl font-black tabular-nums">
                    {fmt(Number(editingLine.qty) * Number(editingLine.unitWithVat))}<span className="text-sm ml-1">원</span>
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)] mt-1">
                    공급가 {fmt(Math.round(Number(editingLine.qty) * Number(editingLine.unitWithVat) / 1.1))}원 · 세액 {fmt(Number(editingLine.qty) * Number(editingLine.unitWithVat) - Math.round(Number(editingLine.qty) * Number(editingLine.unitWithVat) / 1.1))}원
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => resetLineOverride(editingLine.key)}
                className="px-3 py-2.5 rounded-lg text-sm font-bold border-2 border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--background)]"
                title="원본 주문 값으로 복원"
              >
                ↺ 원본
              </button>
              <button
                onClick={() => setEditingLine(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold border-2 border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)]"
              >
                취소
              </button>
              <button
                onClick={saveLineEdit}
                className="flex-[2] py-2.5 rounded-lg text-sm font-black text-white bg-amber-600 hover:bg-amber-500 shadow-md"
              >
                💾 수정 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 좌측 사이드바: 미수 업체 리스트 (다중 선택 체크박스)
// ─────────────────────────────────────────────
function OutstandingCustomerList({
  items, total, allCount, search, onSearchChange,
  selectedIds, onToggle, onClearAll, onAddToday,
  carryoverByCustomer, selectedCarryoverDates, onToggleCarryoverDate,
}) {
  if (allCount === 0) return null;
  const isAll = selectedIds.size === 0;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border)] bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-bold uppercase tracking-wider text-red-700">🏢 미수 업체</span>
          <span className="text-[11px] text-red-500">{allCount}개</span>
        </div>
        <span className="text-[14px] font-black tabular-nums text-red-600">{fmt(total)}원</span>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="업체 빠른 찾기"
            className="w-full pl-8 pr-2 py-2 rounded-md border border-[var(--border)] bg-[var(--card)]"
            style={{ fontSize: '15px' }}
          />
        </div>
      </div>

      {/* 빠른 액션 버튼 */}
      <div className="px-3 pt-2 pb-1 flex gap-1.5">
        <button
          onClick={onAddToday}
          className="flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
        >
          📅 오늘 거래 추가
        </button>
        {!isAll && (
          <button
            onClick={onClearAll}
            className="px-2.5 py-1.5 rounded-md text-[12px] font-bold bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
          >
            전체 해제
          </button>
        )}
      </div>

      {/* 선택 상태 안내 */}
      <div className="px-3 pb-1.5 text-[12px] text-[var(--muted-foreground)]">
        {isAll
          ? '체크하지 않으면 전체 업체가 합산 표시됩니다'
          : `${selectedIds.size}개 업체 선택됨 — 체크한 업체만 명세서 발행`}
      </div>

      <div className="p-1.5 max-h-[640px] overflow-y-auto space-y-1">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-center text-[var(--muted-foreground)]">일치하는 업체 없음</p>
        ) : (
          items.map((c) => {
            const cidKey = c.id ? String(c.id) : '';
            const checked = cidKey && selectedIds.has(cidKey);
            const custCarryDates = checked && carryoverByCustomer ? (carryoverByCustomer.get(cidKey) || []) : [];
            return (
              <div key={c.id || c.name}>
                <label
                  className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-md transition-colors cursor-pointer ${c.id ? 'hover:bg-[var(--secondary)]' : 'opacity-60 cursor-not-allowed'}`}
                  style={{
                    background: checked ? 'color-mix(in srgb, #dc2626 12%, transparent)' : 'transparent',
                    borderLeft: checked ? '4px solid #dc2626' : '4px solid transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked || false}
                    onChange={() => c.id && onToggle(c.id)}
                    disabled={!c.id}
                    className="w-4 h-4 accent-red-600 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold break-keep flex items-center gap-1.5">
                        {c.name}
                        {c.unregistered && (
                          <span className="text-[10px] px-1.5 rounded bg-gray-200 text-gray-600 font-normal">미등록</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] flex gap-2 mt-0.5">
                        <span>{c.count}건</span>
                        {c.lastDate && <span>최근 {c.lastDate.slice(5)}</span>}
                      </div>
                    </div>
                    <span className="text-[14px] font-bold tabular-nums text-red-600 flex-shrink-0 whitespace-nowrap">
                      {fmt(c.balance)}
                    </span>
                  </div>
                </label>

                {/* 체크한 업체 바로 밑에 이월 날짜 인라인 리스트 */}
                {checked && custCarryDates.length > 0 && (
                  <div className="ml-7 mr-2 mb-2 mt-1 p-2 rounded-md bg-red-50/60 border border-red-100 space-y-0.5">
                    <div className="flex items-center justify-between px-1.5 py-1 border-b border-red-100">
                      <span className="text-[12px] font-bold text-red-700">
                        📅 이월 미수 {custCarryDates.length}일
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          const allOn = custCarryDates.every((d) => selectedCarryoverDates?.has(d.date));
                          custCarryDates.forEach((d) => {
                            const isOn = selectedCarryoverDates?.has(d.date);
                            if (allOn && isOn) onToggleCarryoverDate?.(d.date);
                            else if (!allOn && !isOn) onToggleCarryoverDate?.(d.date);
                          });
                        }}
                        className="text-[12px] font-bold text-red-700 hover:underline"
                      >
                        {custCarryDates.every((d) => selectedCarryoverDates?.has(d.date)) ? '전체 해제' : '전체 선택'}
                      </button>
                    </div>
                    {custCarryDates.map(({ date, count, total: dTotal }) => {
                      const dateChecked = selectedCarryoverDates?.has(date);
                      return (
                        <label
                          key={date}
                          className="flex items-center gap-2 px-1.5 py-1.5 rounded cursor-pointer hover:bg-red-100/60"
                          style={{ background: dateChecked ? 'rgba(254, 202, 202, 0.5)' : 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={dateChecked || false}
                            onChange={() => onToggleCarryoverDate?.(date)}
                            className="w-4 h-4 accent-red-600 cursor-pointer flex-shrink-0"
                          />
                          <span className="text-[13px] font-semibold tabular-nums">{date}</span>
                          <span className="text-[11px] text-gray-500">· {count}건</span>
                          <span className="ml-auto text-[13px] font-bold text-red-600 tabular-nums">{fmt(dTotal)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 이월 미수 날짜 선택 — 접힘 드로어 (기본 접혀있음)
// ─────────────────────────────────────────────
function CarryoverDateDrawer({ byDate, selectedDates, onToggle, onSelectAll, onClearAll, filteredCustomerCount = 0 }) {
  const [open, setOpen] = useState(false);
  const isFiltered = filteredCustomerCount > 0;
  if (!byDate.length) {
    if (!isFiltered) return null;
    return (
      <div className="rounded-2xl border bg-gray-50 px-3 py-2 text-center" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] text-gray-500">
          선택한 {filteredCustomerCount}개 업체는 이월 미수가 없습니다
        </span>
      </div>
    );
  }
  const allSelected = selectedDates.size === byDate.length;
  const totalBalance = byDate.reduce((s, d) => s + d.total, 0);
  const selectedBalance = byDate
    .filter((d) => selectedDates.has(d.date))
    .reduce((s, d) => s + d.total, 0);
  const highlighted = selectedDates.size > 0;

  return (
    <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: highlighted ? '#fca5a5' : 'var(--border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center justify-between bg-gradient-to-r from-red-50 to-orange-50 hover:brightness-95"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm">📅</span>
          <span className="text-[11px] font-bold text-red-700">
            이월 날짜 포함{isFiltered ? ` · 선택 업체` : ''}
          </span>
          <span className="text-[9px] text-red-500 font-medium">
            {selectedDates.size > 0 ? `${selectedDates.size}일 선택` : `${byDate.length}일 있음`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {selectedDates.size > 0 && (
            <span className="text-[10px] font-bold text-red-600 tabular-nums">+{fmt(selectedBalance)}원</span>
          )}
          <span className="text-[11px] text-red-700">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="p-2.5 bg-white border-t border-red-100">
          <div className="flex items-center justify-between text-[10px] text-gray-600 mb-2">
            <span>전체 이월 {fmt(totalBalance)}원</span>
            <button
              onClick={allSelected ? onClearAll : onSelectAll}
              className="text-red-700 font-bold hover:underline"
            >
              {allSelected ? '해제' : '전체 선택'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5 bg-red-50/40 rounded-lg p-1 border border-red-100">
            {byDate.map(({ date, count, total }) => {
              const checked = selectedDates.has(date);
              return (
                <label
                  key={date}
                  className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-red-50"
                  style={{ background: checked ? 'rgba(254, 226, 226, 0.6)' : 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(date)}
                    className="w-3.5 h-3.5 accent-red-600 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-[11px] font-semibold tabular-nums">{date}</span>
                  <span className="text-[9px] text-gray-500">· {count}건</span>
                  <span className="ml-auto text-[10px] font-bold text-red-600 tabular-nums">{fmt(total)}원</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 거래명세서 양식 — 모던/미니멀 (A4 + 카톡 친화)
// ─────────────────────────────────────────────
// localStorage keys for invoice notice
const INVOICE_FOOTER_DEFAULT_KEY = 'pos_invoice_footer_default_v1';
const INVOICE_FOOTER_OVERRIDES_KEY = 'pos_invoice_footer_overrides_v1';

function readFooterDefault() {
  try { return localStorage.getItem(INVOICE_FOOTER_DEFAULT_KEY) || ''; } catch { return ''; }
}
function readFooterOverrides() {
  try { return JSON.parse(localStorage.getItem(INVOICE_FOOTER_OVERRIDES_KEY) || '{}') || {}; } catch { return {}; }
}

function TraditionalInvoice({ settings, customerLabel, customerKey, issueDate, lines, totals, compact = false, onEditLine, onDeleteLine }) {
  // 안내 문구 우선순위: 개별 오버라이드 > 사용자 기본값 > settings.invoice_footer
  const [overridesVersion, setOverridesVersion] = useState(0);
  const overrides = readFooterOverrides();
  const userDefault = readFooterDefault();
  const customNotice = customerKey != null ? overrides[String(customerKey)] : '';
  const effectiveNotice = (customNotice ?? '') || userDefault || settings?.invoice_footer || '';

  const [editingNotice, setEditingNotice] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [scope, setScope] = useState('this'); // 'this' | 'default'

  const startEdit = () => {
    setDraftNotice(effectiveNotice);
    setScope(customNotice ? 'this' : 'default');
    setEditingNotice(true);
  };
  const cancelEdit = () => { setEditingNotice(false); setDraftNotice(''); };
  const saveNotice = () => {
    try {
      if (scope === 'this' && customerKey != null) {
        const next = { ...readFooterOverrides(), [String(customerKey)]: draftNotice };
        localStorage.setItem(INVOICE_FOOTER_OVERRIDES_KEY, JSON.stringify(next));
      } else {
        localStorage.setItem(INVOICE_FOOTER_DEFAULT_KEY, draftNotice);
        // 이 업체만 오버라이드가 있었다면 제거 (전체 기본으로 통일)
        if (customNotice && customerKey != null) {
          const next = { ...readFooterOverrides() };
          delete next[String(customerKey)];
          localStorage.setItem(INVOICE_FOOTER_OVERRIDES_KEY, JSON.stringify(next));
        }
      }
      setOverridesVersion((v) => v + 1);
      setEditingNotice(false);
    } catch (e) {
      console.warn('saveNotice failed', e);
    }
  };
  const clearOverride = () => {
    if (customerKey == null) return;
    const next = { ...readFooterOverrides() };
    delete next[String(customerKey)];
    try { localStorage.setItem(INVOICE_FOOTER_OVERRIDES_KEY, JSON.stringify(next)); } catch {}
    setOverridesVersion((v) => v + 1);
    setEditingNotice(false);
  };

  return (
    <div className="text-[13px] text-gray-800" data-overrides-v={overridesVersion} style={{ fontFamily: '"맑은 고딕","Malgun Gothic",system-ui,sans-serif' }}>
      {!compact && (
        <>
          {/* ─── 상단 헤더 — 브랜드 + 제목 ─── */}
          <header className="flex items-end justify-between pb-4 mb-5" style={{ borderBottom: '3px solid #1f2937' }}>
            <div>
              <div className="text-3xl font-black tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                {settings?.company_name || 'MOVE MOTORS'}
              </div>
              <div className="text-[12px] text-gray-500 mt-1">
                {settings?.business_item || '자동차용품 및 부속'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tracking-widest text-gray-700">거래명세서</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Transaction Statement</div>
            </div>
          </header>

          {/* ─── 공급자 / 공급받는자 카드 2단 ─── */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <InfoCard title="공급자" accent="#1f2937">
              <InfoRow label="상호" value={settings?.company_name || 'MOVE MOTORS'} />
              <InfoRow label="등록번호" value={settings?.business_number || '-'} mono />
              {settings?.representative_name && <InfoRow label="대표자" value={settings.representative_name} />}
              {settings?.company_phone && <InfoRow label="전화" value={settings.company_phone} mono />}
              {settings?.company_address && <InfoRow label="주소" value={settings.company_address} />}
              <InfoRow label="업태 / 종목" value={`${settings?.business_type || '도소매'} / ${settings?.business_item || '자동차용품 및 부속'}`} />
            </InfoCard>

            <InfoCard title="공급받는자" accent="#1f2937">
              <InfoRow label="거래처" value={customerLabel} bold />
              <InfoRow label="발행일" value={issueDate} mono />
              <InfoRow label="품목 수" value={`${totals.count}건`} mono />
            </InfoCard>
          </div>
        </>
      )}

      {/* compact 모드: 간단한 업체명 배너만 */}
      {compact && (
        <div className="mb-4 pb-3 flex items-center justify-between" style={{ borderBottom: '2px solid #1f2937' }}>
          <div>
            <div className="text-xl font-bold text-gray-900">🏢 {customerLabel}</div>
            <div className="text-[12px] text-gray-500 mt-1">{issueDate} · {totals.count}건</div>
          </div>
        </div>
      )}

      {/* ─── 합계금액 대형 배너 ─── */}
      <div
        className="rounded-lg px-5 py-4 mb-5 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg,#1f2937 0%,#374151 100%)',
          color: '#fff',
        }}
      >
        <span className="text-sm tracking-widest font-semibold text-gray-300">합 계 금 액</span>
        <span className="text-3xl font-black tabular-nums" style={{ letterSpacing: '-0.02em' }}>
          ₩ {fmt(totals.sum)}
        </span>
      </div>

      {/* ─── 품목 테이블 ─── */}
      <div className="rounded-lg overflow-hidden border border-gray-300 mb-5">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '14px' }}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '40%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '6%' }} className="no-print" />
          </colgroup>
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="px-3 py-3 text-center font-semibold">일자</th>
              <th className="px-3 py-3 text-left font-semibold">품목</th>
              <th className="px-3 py-3 text-right font-semibold">수량</th>
              <th className="px-3 py-3 text-right font-semibold">단가</th>
              <th className="px-3 py-3 text-right font-semibold">공급가</th>
              <th className="px-3 py-3 text-right font-semibold">세액</th>
              <th className="px-2 py-3 text-center font-semibold text-[11px] no-print">수정</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400 italic">
                  선택된 품목이 없습니다
                </td>
              </tr>
            ) : lines.map((l, i) => {
              const zeroLine = Number(l.unitPrice) === 0 && Number(l.qty) > 0;
              const bg = l.edited
                ? 'bg-amber-50'
                : zeroLine
                  ? 'bg-red-50/60'
                  : (i % 2 ? 'bg-gray-50' : 'bg-white');
              return (
                <tr key={l.key || i} className={bg} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td className="px-3 py-2.5 text-center tabular-nums text-gray-600 whitespace-nowrap">{fmtMMDD(l.date)}</td>
                  <td className="px-3 py-2.5 break-words leading-snug">
                    <span className="font-medium">{l.name}</span>
                    {l.code && <span className="ml-1.5 text-[11px] text-gray-400">#{l.code}</span>}
                    {l.edited && <span className="ml-1.5 text-[10px] text-amber-700 font-bold">✏️ 수정됨</span>}
                    {!l.edited && zeroLine && <span className="ml-1.5 text-[10px] text-red-600 font-bold">⚠️ 단가 0원</span>}
                    {l.isDiscounted && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 align-middle">
                        🏷 {l.discountType === 'percent' ? `${l.discountValue}% 할인` : l.discountType === 'amount' ? `${fmt(l.discountValue)}원 할인` : `특가`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                    {l.isDiscounted && l.baseUnitWithVat > l.unitWithVat && (
                      <div className="text-[10px] line-through text-gray-400">{fmt(Math.round(l.baseUnitWithVat / 1.1))}</div>
                    )}
                    {fmt(l.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(l.supply)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-orange-700">{fmt(l.vat)}</td>
                  <td className="px-1 py-1 text-center no-print">
                    {onEditLine && (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEditLine(l)}
                          className="px-1.5 py-1 rounded text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                          title="이 행의 수량/단가 수정"
                        >
                          ✏️
                        </button>
                        {onDeleteLine && (
                          <button
                            onClick={() => onDeleteLine(l.key)}
                            className="px-1.5 py-1 rounded text-[11px] font-bold bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600"
                            title="이 품목을 명세서에서 제외"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── 하단 집계 ─── */}
      <div className="flex justify-end mb-5">
        <div className="w-full sm:w-[55%] space-y-1.5">
          {totals.prevBalance > 0 && (
            <SumRow label="전잔금 (미선택 이월)" value={totals.prevBalance} muted />
          )}
          <SumRow label="공급가액 합계" value={totals.supply} />
          <SumRow label="세액 합계" value={totals.vat} accent="text-orange-700" />
          <div style={{ borderTop: '1px solid #d1d5db' }} />
          <SumRow label="당기 합계" value={totals.sum} bold />
          {totals.prevBalance > 0 && (
            <SumRow label="총합계 (전잔금 포함)" value={totals.totalBeforePaid} bold />
          )}
          <SumRow label="입금액" value={-totals.totalPaid} accent="text-green-700" showSign />
          <div
            className="rounded-md px-4 py-3 mt-2 flex items-center justify-between"
            style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}
          >
            <span className="text-sm font-bold text-red-700">총 잔 액</span>
            <span className="text-2xl font-black tabular-nums text-red-700">
              ₩ {fmt(totals.grandBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 푸터 — 계좌 + 안내 (인라인 편집 가능) ─── */}
      <div
        className="rounded-lg px-4 py-3 text-[12px] text-gray-700 space-y-1.5"
        style={{ background: '#f9fafb', border: '1px dashed #d1d5db' }}
      >
        {settings?.bank_account && (
          <div className="flex gap-2 items-start">
            <span className="font-bold text-gray-900 flex-shrink-0">💳 입금계좌</span>
            <span className="break-keep">{settings.bank_account}</span>
          </div>
        )}
        {/* 안내 영역 */}
        {!editingNotice ? (
          <div className="flex gap-2 items-start group">
            <span className="font-bold text-gray-900 flex-shrink-0">📝 안내</span>
            <span className="break-keep flex-1">
              {effectiveNotice || <span className="text-gray-400 italic">(안내 문구 없음 — ✏️ 클릭해서 작성)</span>}
            </span>
            <button
              onClick={startEdit}
              className="no-print flex-shrink-0 opacity-50 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[11px] font-bold bg-gray-200 text-gray-700 hover:bg-amber-500 hover:text-white transition-colors"
              title="안내 문구 수정"
            >
              ✏️ 수정
            </button>
            {customNotice && (
              <span className="no-print text-[10px] text-amber-700 flex-shrink-0" title="이 업체만 별도 적용 중">⚙️ 개별</span>
            )}
          </div>
        ) : (
          <div className="no-print space-y-2 py-1">
            <div className="flex gap-2 items-start">
              <span className="font-bold text-gray-900 flex-shrink-0 mt-1">📝 안내</span>
              <textarea
                className="flex-1 min-h-[60px] px-2 py-1 rounded border border-gray-300 text-[12px] focus:outline-none focus:border-amber-500"
                value={draftNotice}
                onChange={(e) => setDraftNotice(e.target.value)}
                placeholder="예: 입금 확인 부탁드립니다."
                autoFocus
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-6 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name={`scope-${customerKey}`} checked={scope === 'this'} onChange={() => setScope('this')} disabled={customerKey == null} />
                <span>이 업체만</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name={`scope-${customerKey}`} checked={scope === 'default'} onChange={() => setScope('default')} />
                <span>전체 기본 (자동 적용)</span>
              </label>
              <div className="flex-1" />
              {customNotice && (
                <button
                  onClick={clearOverride}
                  className="px-2 py-1 rounded text-[11px] whitespace-nowrap bg-gray-100 text-gray-600 hover:bg-gray-200"
                  title="이 업체의 개별 설정 제거 (전체 기본으로 복귀)"
                >
                  개별 해제
                </button>
              )}
              <button
                onClick={cancelEdit}
                className="px-2 py-1 rounded text-[11px] whitespace-nowrap border border-gray-300 text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={saveNotice}
                className="px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap bg-amber-500 text-white hover:bg-amber-600"
              >
                저장
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 인수자 사인란 */}
      <div className="mt-4 pt-3 flex justify-end gap-6 text-[12px] text-gray-500" style={{ borderTop: '1px solid #e5e7eb' }}>
        <span>인수자: ______________________</span>
      </div>
    </div>
  );
}

function InfoCard({ title, accent, children }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${accent}20` }}>
      <div
        className="px-3.5 py-2 text-[12px] font-bold tracking-wider"
        style={{ background: accent, color: '#fff' }}
      >
        {title}
      </div>
      <div className="p-3 space-y-1.5 bg-white">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, bold }) {
  return (
    <div className="flex gap-2.5 text-[13px] leading-snug">
      <span className="text-gray-500 flex-shrink-0 w-20">{label}</span>
      <span
        className={`flex-1 break-keep ${mono ? 'tabular-nums' : ''} ${bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}
      >
        {value || '-'}
      </span>
    </div>
  );
}

function SumRow({ label, value, bold, muted, accent, showSign }) {
  const display = showSign && value < 0 ? `- ${fmt(-value)}` : fmt(value);
  return (
    <div className="flex justify-between items-center text-[13px]">
      <span className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</span>
      <span
        className={`tabular-nums ${bold ? 'font-bold text-gray-900 text-base' : ''} ${accent || ''} ${muted ? 'text-gray-500' : ''}`}
      >
        {display}원
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 공용 버튼
// ─────────────────────────────────────────────
function ActionBtn({ icon: Icon, onClick, children, variant, block }) {
  const map = {
    default: 'border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--secondary)]',
    primary: 'bg-[var(--primary)] text-white hover:brightness-110 shadow-md',
    success: 'bg-green-600 text-white hover:bg-green-500 shadow-md',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${block ? 'w-full py-3 text-sm' : 'py-2.5'} ${map[variant]}`}
    >
      <Icon className={`${block ? 'w-5 h-5' : 'w-4 h-4'}`} />
      {children}
    </button>
  );
}
