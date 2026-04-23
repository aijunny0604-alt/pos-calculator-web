import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng, toBlob } from 'html-to-image';
import { Printer, Download, Copy, Search, X as XIcon } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const fmtMMDD = (iso) => (iso || '').slice(5).replace('-', '.');
const todayISO = () => new Date().toISOString().slice(0, 10);
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

export default function InvoicesPage({ customers }) {
  const [datePreset, setDatePreset] = useState('today');
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerBoxRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [carryover, setCarryover] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(null);
  const [selectedCarryoverDates, setSelectedCarryoverDates] = useState(() => new Set());
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

  useEffect(() => {
    setLoading(true);
    Promise.all([
      customerId !== 'all'
        ? supabase.getPaymentRecords({ customerId })
        : supabase.getPaymentRecords(),
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

        if (customerId !== 'all' && String(cust?.id || '') !== String(customerId)) continue;

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
  }, [dateRange.from, dateRange.to, customerId, customers]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase().replace(/\s/g, '');
    if (!q) return customers || [];
    return (customers || []).filter((c) => {
      const name = (c.name || '').toLowerCase().replace(/\s/g, '');
      const phone = (c.phone || '').replace(/[\s-]/g, '');
      return name.includes(q) || phone.includes(q);
    });
  }, [customers, customerSearch]);

  useEffect(() => {
    if (!customerDropdownOpen) return;
    const onDocClick = (e) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [customerDropdownOpen]);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || `#${id}`;

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

  // 이월 날짜별 그룹
  const carryoverByDate = useMemo(() => {
    const g = new Map();
    for (const r of carryover) {
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
  }, [carryover]);

  useEffect(() => { setSelectedCarryoverDates(new Set()); }, [carryover]);

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
  const recordToLines = (r) => {
    const items = Array.isArray(r.items) ? r.items : [];
    const date = r.invoice_date || '';
    return items.map((it) => {
      const qty = Number(it.quantity) || 1;
      const unitWithVat = Number(it.price) || 0;
      const lineWithVat = unitWithVat * qty;
      const supply = Math.round(lineWithVat / 1.1);
      const vat = lineWithVat - supply;
      return {
        date,
        code: it.code || it.product_id || '',
        name: it.name || it.product_name || '품목',
        spec: it.spec || it.option || '',
        qty,
        unitPrice: Math.round(unitWithVat / 1.1),
        supply,
        vat,
        memo: '',
      };
    });
  };

  // 당일 품목
  const currentLineItems = useMemo(() => {
    const lines = [];
    for (const r of records) lines.push(...recordToLines(r));
    return lines;
  }, [records]);

  // 선택된 이월 품목
  const selectedCarryoverLineItems = useMemo(() => {
    const lines = [];
    for (const r of carryover) {
      if (!selectedCarryoverDates.has(r.invoice_date)) continue;
      lines.push(...recordToLines(r));
    }
    return lines;
  }, [carryover, selectedCarryoverDates]);

  // 명세서 라인 (선택 이월 먼저, 당일 나중, 날짜 오름차순)
  const invoiceLines = useMemo(() => {
    return [...selectedCarryoverLineItems, ...currentLineItems]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [currentLineItems, selectedCarryoverLineItems]);

  // 전잔금 (체크 안 된 이월 잔금 합)
  const unselectedCarryoverBalance = useMemo(
    () => carryover.reduce((s, r) =>
      selectedCarryoverDates.has(r.invoice_date) ? s : s + Number(r.balance || 0), 0),
    [carryover, selectedCarryoverDates]
  );

  // 입금 합계 (당일 + 선택 이월)
  const totalPaid = useMemo(() => {
    const dailyPaid = records.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const selPaid = carryover.reduce((s, r) =>
      selectedCarryoverDates.has(r.invoice_date) ? s + Number(r.paid_amount || 0) : s, 0);
    return dailyPaid + selPaid;
  }, [records, carryover, selectedCarryoverDates]);

  const invoiceTotals = useMemo(() => {
    const supply = invoiceLines.reduce((s, l) => s + l.supply, 0);
    const vat = invoiceLines.reduce((s, l) => s + l.vat, 0);
    const sum = supply + vat;
    const prevBalance = unselectedCarryoverBalance;
    const totalBeforePaid = prevBalance + sum;
    const grandBalance = totalBeforePaid - totalPaid;
    return { supply, vat, sum, prevBalance, totalBeforePaid, totalPaid, grandBalance, count: invoiceLines.length };
  }, [invoiceLines, unselectedCarryoverBalance, totalPaid]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handlePng = async () => {
    if (!invoiceRef.current) { alert('명세서 요소를 찾을 수 없습니다'); return; }
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `명세서_${customerId === 'all' ? '전체' : (customerName(customerId) || '').replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${dateRange.label.replace(/[^a-zA-Z0-9가-힣~-]/g, '_')}.png`;
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
      const blob = await toBlob(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
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

  const hasData = invoiceLines.length > 0 || invoiceTotals.prevBalance > 0;

  return (
    <div className="max-w-7xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print, .invoice-print * { visibility: visible; }
          .invoice-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ─── 상단 헤더 바: 제목 + 날짜 칩 + 액션 ─── */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold flex items-center gap-1.5">📄 거래명세서</h2>
          <div className="flex flex-wrap gap-1">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setDatePreset(p.key)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border"
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
                className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--card)] text-[11px]"
                style={{ fontSize: '14px' }}
              />
            )}
          </div>
          {customerId !== 'all' && (
            <button
              onClick={() => { setCustomerId('all'); setCustomerSearch(''); }}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1"
            >
              <span>{customerName(customerId)}</span>
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={handlePng} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold bg-[var(--primary)] text-white hover:brightness-110 shadow-sm">
            <Download className="w-3.5 h-3.5" />PNG
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)]">
            <Printer className="w-3.5 h-3.5" />인쇄
          </button>
          <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold bg-green-600 text-white hover:bg-green-500 shadow-sm">
            <Copy className="w-3.5 h-3.5" />카톡
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">

      {/* ─── 좌측: 미수 업체 리스트 + 이월 선택(접힘) ─── */}
      <aside className="space-y-3 lg:sticky lg:top-4 no-print">
        {/* 미수 업체 리스트 (메인) */}
        <OutstandingCustomerList
          items={filteredOutstanding}
          total={outstandingTotal}
          allCount={outstandingCustomers.length}
          search={outstandingSearch}
          onSearchChange={setOutstandingSearch}
          selectedId={customerId}
          onSelect={(id) => { setCustomerId(id === 'all' ? 'all' : id); setCustomerSearch(''); }}
        />

        {/* 이월 미수 선택 — 접힘 드로어 */}
        <CarryoverDateDrawer
          byDate={carryoverByDate}
          selectedDates={selectedCarryoverDates}
          onToggle={toggleCarryoverDate}
          onSelectAll={selectAllCarryoverDates}
          onClearAll={clearCarryoverDates}
        />
      </aside>

      {/* ─── 우측: 전통 거래명세서 양식 ─── */}
      <section className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
        <div
          ref={invoiceRef}
          className="invoice-print bg-white text-black p-3"
          style={{ fontFamily: '"맑은 고딕", "Malgun Gothic", system-ui, sans-serif' }}
        >
          {loading ? (
            <p className="text-sm text-center py-10">로딩 중...</p>
          ) : !hasData ? (
            <div className="text-center py-10 text-gray-600 space-y-1">
              <p className="text-sm">표시할 명세서 데이터가 없습니다.</p>
              <p className="text-xs">발행일 범위를 바꾸거나 좌측에서 이월 날짜를 체크해주세요.</p>
            </div>
          ) : (
            <TraditionalInvoice
              settings={settings}
              customerLabel={customerId === 'all' ? '전체 거래처' : `${customerName(customerId)} 귀하`}
              issueDate={dateRange.label}
              lines={invoiceLines}
              totals={invoiceTotals}
            />
          )}
        </div>
      </section>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold shadow-2xl z-50 no-print">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 좌측 사이드바: 미수 업체 리스트 (한 번에 보고 클릭)
// ─────────────────────────────────────────────
function OutstandingCustomerList({ items, total, allCount, search, onSearchChange, selectedId, onSelect }) {
  if (allCount === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border)] bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">🏢 미수 업체</span>
          <span className="text-[9px] text-red-500">{allCount}개</span>
        </div>
        <span className="text-[11px] font-black tabular-nums text-red-600">{fmt(total)}원</span>
      </div>

      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="업체 빠른 찾기"
            className="w-full pl-7 pr-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs"
            style={{ fontSize: '14px' }}
          />
        </div>
      </div>

      <div className="p-1 max-h-80 overflow-y-auto space-y-0.5">
        {/* 전체 보기 옵션 */}
        <button
          onClick={() => onSelect('all')}
          className="w-full px-2 py-1.5 rounded-md text-left flex items-center gap-2 transition-colors hover:bg-[var(--secondary)]"
          style={{
            background: selectedId === 'all' ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
            borderLeft: selectedId === 'all' ? '3px solid var(--primary)' : '3px solid transparent',
          }}
        >
          <span className="text-base">🌐</span>
          <span className="flex-1 text-[11px] font-bold">전체 업체 보기</span>
          {selectedId === 'all' && <span className="text-[9px] text-[var(--primary)] font-bold">현재</span>}
        </button>

        {items.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-center text-[var(--muted-foreground)]">일치하는 업체 없음</p>
        ) : (
          items.map((c) => {
            const selected = String(selectedId) === String(c.id);
            return (
              <button
                key={c.id || c.name}
                onClick={() => c.id && onSelect(c.id)}
                disabled={!c.id}
                className="w-full px-2 py-1.5 rounded-md text-left transition-colors hover:bg-[var(--secondary)] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: selected ? 'color-mix(in srgb, #dc2626 12%, transparent)' : 'transparent',
                  borderLeft: selected ? '3px solid #dc2626' : '3px solid transparent',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold break-keep flex items-center gap-1">
                      {c.name}
                      {c.unregistered && (
                        <span className="text-[8px] px-1 rounded bg-gray-200 text-gray-600 font-normal">미등록</span>
                      )}
                    </div>
                    <div className="text-[9px] text-[var(--muted-foreground)] flex gap-2 mt-0.5">
                      <span>{c.count}건</span>
                      {c.lastDate && <span>최근 {c.lastDate.slice(5)}</span>}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-red-600 flex-shrink-0 whitespace-nowrap">
                    {fmt(c.balance)}
                  </span>
                </div>
              </button>
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
function CarryoverDateDrawer({ byDate, selectedDates, onToggle, onSelectAll, onClearAll }) {
  const [open, setOpen] = useState(false);
  if (!byDate.length) return null;
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
          <span className="text-[11px] font-bold text-red-700">이월 날짜 포함</span>
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
function TraditionalInvoice({ settings, customerLabel, issueDate, lines, totals }) {
  return (
    <div className="text-[11px] text-gray-800" style={{ fontFamily: '"맑은 고딕","Malgun Gothic",system-ui,sans-serif' }}>
      {/* ─── 상단 헤더 — 브랜드 + 제목 ─── */}
      <header className="flex items-end justify-between pb-3 mb-4" style={{ borderBottom: '3px solid #1f2937' }}>
        <div>
          <div className="text-2xl font-black tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {settings?.company_name || 'MOVE MOTORS'}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {settings?.business_item || '자동차용품 및 부속'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-widest text-gray-700">거래명세서</div>
          <div className="text-[9px] text-gray-500 mt-0.5">Transaction Statement</div>
        </div>
      </header>

      {/* ─── 공급자 / 공급받는자 카드 2단 ─── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoCard title="공급자" accent="#1f2937">
          <InfoRow label="상호" value={settings?.company_name || 'MOVE MOTORS'} />
          <InfoRow label="등록번호" value={settings?.business_number || '-'} mono />
          {settings?.representative_name && <InfoRow label="대표자" value={settings.representative_name} />}
          {settings?.company_phone && <InfoRow label="전화" value={settings.company_phone} mono />}
          {settings?.company_address && <InfoRow label="주소" value={settings.company_address} />}
          <InfoRow label="업태 / 종목" value={`${settings?.business_type || '도소매'} / ${settings?.business_item || '자동차용품 및 부속'}`} />
        </InfoCard>

        <InfoCard title="공급받는자" accent="#dc2626">
          <InfoRow label="거래처" value={customerLabel} bold />
          <InfoRow label="발행일" value={issueDate} mono />
          <InfoRow label="품목 수" value={`${totals.count}건`} mono />
        </InfoCard>
      </div>

      {/* ─── 합계금액 대형 배너 ─── */}
      <div
        className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg,#1f2937 0%,#374151 100%)',
          color: '#fff',
        }}
      >
        <span className="text-xs tracking-widest font-semibold text-gray-300">합 계 금 액</span>
        <span className="text-2xl font-black tabular-nums" style={{ letterSpacing: '-0.02em' }}>
          ₩ {fmt(totals.sum)}
        </span>
      </div>

      {/* ─── 품목 테이블 ─── */}
      <div className="rounded-lg overflow-hidden border border-gray-300 mb-4">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '44%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="px-2 py-2 text-center font-semibold">일자</th>
              <th className="px-2 py-2 text-left font-semibold">품목</th>
              <th className="px-2 py-2 text-right font-semibold">수량</th>
              <th className="px-2 py-2 text-right font-semibold">단가</th>
              <th className="px-2 py-2 text-right font-semibold">공급가</th>
              <th className="px-2 py-2 text-right font-semibold">세액</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-gray-400 italic">
                  선택된 품목이 없습니다
                </td>
              </tr>
            ) : lines.map((l, i) => (
              <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td className="px-2 py-1.5 text-center tabular-nums text-gray-600 whitespace-nowrap">{fmtMMDD(l.date)}</td>
                <td className="px-2 py-1.5 break-words leading-snug">
                  <span className="font-medium">{l.name}</span>
                  {l.code && <span className="ml-1 text-[9px] text-gray-400">#{l.code}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{fmt(l.unitPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(l.supply)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-orange-700">{fmt(l.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── 하단 집계 ─── */}
      <div className="flex justify-end mb-4">
        <div className="w-full sm:w-[55%] space-y-1">
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
            className="rounded-md px-3 py-2 mt-1 flex items-center justify-between"
            style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}
          >
            <span className="text-xs font-bold text-red-700">총 잔 액</span>
            <span className="text-xl font-black tabular-nums text-red-700">
              ₩ {fmt(totals.grandBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 푸터 — 계좌 + 안내 ─── */}
      {(settings?.bank_account || settings?.invoice_footer) && (
        <div
          className="rounded-lg px-3 py-2.5 text-[10px] text-gray-700 space-y-1"
          style={{ background: '#f9fafb', border: '1px dashed #d1d5db' }}
        >
          {settings?.bank_account && (
            <div className="flex gap-1.5 items-start">
              <span className="font-bold text-gray-900 flex-shrink-0">💳 입금계좌</span>
              <span className="break-keep">{settings.bank_account}</span>
            </div>
          )}
          {settings?.invoice_footer && (
            <div className="flex gap-1.5 items-start">
              <span className="font-bold text-gray-900 flex-shrink-0">📝 안내</span>
              <span className="break-keep">{settings.invoice_footer}</span>
            </div>
          )}
        </div>
      )}

      {/* 인수자 사인란 — 작게 */}
      <div className="mt-3 pt-2 flex justify-end gap-6 text-[10px] text-gray-500" style={{ borderTop: '1px solid #e5e7eb' }}>
        <span>인수자: ______________________</span>
      </div>
    </div>
  );
}

function InfoCard({ title, accent, children }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${accent}20` }}>
      <div
        className="px-3 py-1.5 text-[10px] font-bold tracking-wider"
        style={{ background: accent, color: '#fff' }}
      >
        {title}
      </div>
      <div className="p-2.5 space-y-1 bg-white">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, bold }) {
  return (
    <div className="flex gap-2 text-[10px] leading-snug">
      <span className="text-gray-500 flex-shrink-0 w-16">{label}</span>
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
    <div className="flex justify-between items-center text-[11px]">
      <span className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</span>
      <span
        className={`tabular-nums ${bold ? 'font-bold text-gray-900 text-sm' : ''} ${accent || ''} ${muted ? 'text-gray-500' : ''}`}
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
