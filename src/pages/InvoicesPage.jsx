import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng, toBlob } from 'html-to-image';
import { Printer, Download, Copy, Search, X as XIcon } from 'lucide-react';
import { DEFAULT_CATEGORIES, getCategoryInfo } from '@/lib/vatHelper';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const todayISO = () => new Date().toISOString().slice(0, 10);
const offsetDays = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const startOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
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
  const [date, setDate] = useState(todayISO()); // custom 모드에서 사용
  const [customerId, setCustomerId] = useState('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerBoxRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [carryover, setCarryover] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(null);
  const invoiceRef = useRef(null);
  const categories = settings?.expense_categories || DEFAULT_CATEGORIES;

  useEffect(() => {
    supabase.getSettings().then(setSettings);
  }, []);

  // datePreset → 기간 계산
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
  // 이월 기준일 (범위 from 이전을 이월로)
  const carryoverCutoff = dateRange.from || todayISO();

  useEffect(() => {
    setLoading(true);

    if (customerId !== 'all') {
      // 업체 모드: 해당 업체의 모든 레코드 로드 → 날짜 기준으로 당월/이월 분리
      supabase.getPaymentRecords({ customerId })
        .then((all) => {
          const inRange = (r) => {
            if (!dateRange.from) return true; // 전체
            if (!r.invoice_date) return true; // 발행일 미지정은 당월로
            return r.invoice_date >= dateRange.from && r.invoice_date <= dateRange.to;
          };
          const current = all.filter(inRange);
          const prev = all.filter((r) =>
            r.invoice_date && dateRange.from && r.invoice_date < dateRange.from && Number(r.balance) > 0
          );
          setRecords(current);
          setCarryover(prev);
        })
        .catch((e) => { console.error('[Invoices] load failed:', e); setRecords([]); setCarryover([]); })
        .finally(() => setLoading(false));
    } else {
      // 전체 모드: 발행일 범위 내 + 이전 이월
      const rangeFilter = {};
      if (dateRange.from && dateRange.to) {
        if (dateRange.from === dateRange.to) rangeFilter.invoiceDate = dateRange.from;
        else { rangeFilter.invoiceDateFrom = dateRange.from; rangeFilter.invoiceDateTo = dateRange.to; }
      }
      Promise.all([
        supabase.getPaymentRecords(rangeFilter),
        dateRange.from
          ? supabase.getPaymentRecords({ hasBalance: true })
              .then((all) => all.filter((r) => (r.invoice_date || '') < dateRange.from))
          : Promise.resolve([]),
      ]).then(([r, prev]) => { setRecords(r); setCarryover(prev); })
        .catch((e) => { console.error('[Invoices] load failed:', e); setRecords([]); setCarryover([]); })
        .finally(() => setLoading(false));
    }
  }, [dateRange.from, dateRange.to, customerId]);

  // 업체 검색 필터 + 외부 클릭 닫기
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

  const summary = useMemo(() => {
    const total = records.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const supply = records.reduce((s, r) => s + Number(r.supply_amount || r.total_amount || 0), 0);
    const vat = records.reduce((s, r) => s + Number(r.vat_amount || 0), 0);
    const paid = records.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const balance = records.reduce((s, r) => s + Number(r.balance || 0), 0);
    return { total, supply, vat, paid, balance, count: records.length };
  }, [records]);

  const carryoverTotal = useMemo(
    () => carryover.reduce((s, r) => s + Number(r.balance || 0), 0),
    [carryover]
  );

  const grandTotal = carryoverTotal + summary.balance;

  const grouped = useMemo(() => {
    if (customerId !== 'all') return null;
    const g = new Map();
    for (const r of records) {
      const key = r.customer_id || 0;
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(r);
    }
    return [...g.entries()].map(([id, rows]) => ({
      id, name: customerName(id), rows,
      total: rows.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      balance: rows.reduce((s, r) => s + Number(r.balance || 0), 0),
    }));
  }, [records, customerId, customers]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const handlePng = async () => {
    console.log('[InvoicePNG] start');
    if (!invoiceRef.current) { alert('명세서 요소를 찾을 수 없습니다'); return; }
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `명세서_${customerId === 'all' ? '전체' : (customerName(customerId) || '').replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${dateRange.label.replace(/[^a-zA-Z0-9가-힣~-]/g, '_')}.png`;
      a.click();
      showToast('✅ PNG 다운로드됨');
      console.log('[InvoicePNG] saved');
    } catch (e) {
      console.error('[InvoicePNG] failed:', e);
      showToast('PNG 실패: ' + (e?.message || e));
    }
  };

  const handleCopy = async () => {
    console.log('[InvoiceCopy] start');
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
      console.log('[InvoiceCopy] ok');
    } catch (e) {
      console.error('[InvoiceCopy] failed:', e);
      showToast('복사 실패: ' + (e?.message || e));
    }
  };

  const handlePrint = () => {
    console.log('[InvoicePrint] start');
    try { window.print(); } catch (e) {
      console.error('[InvoicePrint] failed:', e);
      alert('인쇄 실패: ' + e.message);
    }
  };

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

      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 no-print mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">📄 명세서 발행</h2>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            발행일 기준으로 업체별 미수/이월을 합산하여 A4 명세서로 출력합니다
          </p>
        </div>
      </div>

      {/* 2-column: 좌측 필터+액션 (sticky) / 우측 명세서 프리뷰 */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">

      {/* 좌측 — 필터 + 액션 (sticky) */}
      <aside className="space-y-4 lg:sticky lg:top-4 no-print">
      {/* 필터 */}
      <div className="space-y-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {/* 날짜 빠른 필터 */}
        <div>
          <label className="block text-[10px] font-semibold mb-1 text-[var(--muted-foreground)]">
            발행일 범위 <span className="text-[var(--primary)] font-normal">· {dateRange.label}</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setDatePreset(p.key)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={{
                  background: datePreset === p.key ? 'var(--primary)' : 'var(--card)',
                  color: datePreset === p.key ? 'var(--primary-foreground)' : 'var(--foreground)',
                  borderColor: datePreset === p.key ? 'var(--primary)' : 'var(--border)',
                  boxShadow: datePreset === p.key ? '0 2px 8px color-mix(in srgb, var(--primary) 40%, transparent)' : 'none',
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
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs"
                style={{ fontSize: '14px' }}
              />
            )}
          </div>
        </div>

        {/* 업체 검색 콤보 */}
        <div ref={customerBoxRef} className="relative">
          <label className="block text-[10px] font-semibold mb-1 text-[var(--muted-foreground)]">업체 검색</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={customerId === 'all' ? customerSearch : (customers.find((c) => c.id === customerId)?.name || '')}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId('all'); setCustomerDropdownOpen(true); }}
              onFocus={() => setCustomerDropdownOpen(true)}
              placeholder="업체명/전화 검색 (비우면 전체)"
              className="w-full pl-10 pr-9 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm"
              style={{ fontSize: '16px' }}
            />
            {customerId !== 'all' && (
              <button
                onClick={() => { setCustomerId('all'); setCustomerSearch(''); setCustomerDropdownOpen(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--secondary)]"
                title="선택 해제"
              >
                <XIcon className="w-4 h-4 text-[var(--muted-foreground)]" />
              </button>
            )}
          </div>
          {customerDropdownOpen && (
            <div
              className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl"
              style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.25)' }}
            >
              <button
                onClick={() => { setCustomerId('all'); setCustomerSearch(''); setCustomerDropdownOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm font-semibold border-b border-[var(--border)] hover:bg-[var(--secondary)]"
                style={{ color: customerId === 'all' ? 'var(--primary)' : 'var(--foreground)' }}
              >
                🌐 전체 업체 (그룹별)
              </button>
              {filteredCustomers.length === 0 ? (
                <p className="px-3 py-4 text-xs text-center text-[var(--muted-foreground)]">일치하는 업체 없음</p>
              ) : (
                filteredCustomers.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name || ''); setCustomerDropdownOpen(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--secondary)] border-b border-[var(--border)] last:border-0 flex items-center justify-between gap-2"
                  >
                    <span className="font-medium break-keep">{c.name || `#${c.id}`}</span>
                    {c.phone && <span className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0">{c.phone}</span>}
                  </button>
                ))
              )}
              {filteredCustomers.length > 50 && (
                <p className="px-3 py-1.5 text-[10px] text-center text-[var(--muted-foreground)]">검색어를 좁혀 {filteredCustomers.length - 50}건 더 보기</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 액션 */}
      <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">발행 / 출력</p>
        <ActionBtn icon={Download} onClick={handlePng} variant="primary" block>PNG 다운로드</ActionBtn>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn icon={Printer} onClick={handlePrint} variant="default">인쇄</ActionBtn>
          <ActionBtn icon={Copy} onClick={handleCopy} variant="success">카톡 복사</ActionBtn>
        </div>
      </div>

      {/* 빠른 요약 카드 (선택된 조건의 집계) */}
      <div className="p-4 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--secondary)] to-[var(--card)]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">요약</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">발행 건수</span>
            <span className="font-bold tabular-nums">{summary.count}건</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">당기 합계</span>
            <span className="font-bold tabular-nums">{fmt(summary.total)}원</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">당기 미수</span>
            <span className="font-bold tabular-nums text-red-500">{fmt(summary.balance)}원</span>
          </div>
          {carryoverTotal > 0 && (
            <div className="flex justify-between pt-1 mt-1 border-t border-[var(--border)]">
              <span className="text-[var(--muted-foreground)]">이월 미수</span>
              <span className="font-bold tabular-nums text-orange-400">{fmt(carryoverTotal)}원</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-1 border-t-2 border-[var(--primary)]/30">
            <span className="font-bold">💰 총 미수</span>
            <span className="font-black text-base tabular-nums text-red-500">{fmt(grandTotal)}원</span>
          </div>
        </div>
      </div>
      </aside>

      {/* 우측 — 명세서 미리보기 */}
      <section className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
        <div
          ref={invoiceRef}
          className="invoice-print bg-white text-black p-5"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          <header className="border-b-2 border-black pb-3 mb-3">
            <h1 className="text-xl font-bold">{settings?.company_name || 'MOVE MOTORS'}</h1>
            {settings?.business_number && <p className="text-[10px] text-gray-600">사업자: {settings.business_number}</p>}
            {settings?.company_phone && <p className="text-[10px] text-gray-600">{settings.company_phone}</p>}
            {settings?.company_address && <p className="text-[10px] text-gray-600 break-keep">{settings.company_address}</p>}
            <p className="text-xs text-gray-600 mt-2">
              {customerId === 'all' ? `${dateRange.label} 발송 내역 — 전체 업체` : `${customerName(customerId)} 귀하`}
            </p>
            <p className="text-xs text-gray-600">발행일: {dateRange.label}</p>
          </header>

          {loading ? (
            <p className="text-sm text-center py-6">로딩 중...</p>
          ) : records.length === 0 && carryover.length === 0 ? (
            <div className="text-center py-6 text-gray-600 space-y-1">
              <p className="text-sm">
                {customerId === 'all'
                  ? '해당 기간에 세금계산서 발행된 레코드가 없습니다.'
                  : '해당 업체는 아직 결제 레코드가 없습니다.'}
              </p>
              <p className="text-xs">
                {customerId === 'all'
                  ? '일자를 변경하거나 업체를 선택해 전체 미수를 확인하세요.'
                  : '운영 POS에서 주문을 등록하거나 설정 → 동기화를 실행하세요.'}
              </p>
            </div>
          ) : (
            <>
              {records.length === 0 ? (
                <p className="text-sm text-center py-4 text-gray-600 italic">
                  당월 신규 발행 없음 — 아래 이월 잔금만 표시됩니다.
                </p>
              ) : grouped ? grouped.map((g) => (
                <section key={g.id} className="mb-4">
                  <h2 className="text-sm font-bold mb-1.5 border-b border-gray-300 pb-1">🏢 {g.name}</h2>
                  <InvoiceTable rows={g.rows} categories={categories} />
                  <p className="text-xs text-right mt-1">
                    소계: 총 {fmt(g.total)}원 / 미수 <strong className="text-red-600">{fmt(g.balance)}원</strong>
                  </p>
                </section>
              )) : (
                <InvoiceTable rows={records} categories={categories} />
              )}

              {/* 전월 이월 */}
              {carryoverTotal > 0 && (
                <section className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff7ed)', border: '1px solid #fecaca' }}>
                  <div className="flex justify-between items-center font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">📅</span>
                      <span>전월 이월 미수 ({carryover.length}건)</span>
                    </span>
                    <span className="text-red-600 text-sm font-bold tabular-nums">{fmt(carryoverTotal)}원</span>
                  </div>
                </section>
              )}

              <section className="mt-3 pt-3 border-t-2 border-black space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span>발행 건수:</span><span className="font-bold">{summary.count}건</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>공급가액 합계:</span><span className="font-bold">{fmt(summary.supply)}원</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>부가세 합계:</span><span className="font-bold text-orange-700">{fmt(summary.vat)}원</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                  <span className="font-semibold">당일 합계 (공급+VAT):</span><span className="font-bold">{fmt(summary.total)}원</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>당일 입금:</span><span className="font-bold text-green-700">{fmt(summary.paid)}원</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>당일 미수:</span><span className="font-bold text-red-600">{fmt(summary.balance)}원</span>
                </div>
                {carryoverTotal > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>+ 전월 이월:</span><span className="font-bold text-red-600">{fmt(carryoverTotal)}원</span>
                  </div>
                )}
                <div className="flex justify-between text-base mt-2 pt-2 border-t-2 border-black bg-yellow-50 px-2 py-1.5 rounded">
                  <span className="font-bold">💰 총 미수 (이월 포함):</span>
                  <span className="font-bold text-red-600 text-lg">{fmt(grandTotal)}원</span>
                </div>
              </section>

              <footer className="mt-4 pt-3 border-t border-gray-300 text-xs text-gray-600 space-y-0.5">
                {settings?.bank_account && <p className="font-semibold">💳 입금 계좌: {settings.bank_account}</p>}
                {settings?.invoice_footer && <p className="break-keep">{settings.invoice_footer}</p>}
                <p>문의: {settings?.company_name || 'MOVE MOTORS'} {settings?.company_phone && `· ${settings.company_phone}`}</p>
              </footer>
            </>
          )}
        </div>
      </section>
      </div>{/* end 2-column grid */}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold shadow-2xl z-50 no-print">
          {toast}
        </div>
      )}
    </div>
  );
}

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

function InvoiceTable({ rows, categories = DEFAULT_CATEGORIES }) {
  return (
    <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr className="border-b border-gray-400 bg-gray-50">
          <th className="text-left py-1.5 px-1">세금계산서</th>
          <th className="text-left py-1.5 px-1">구분</th>
          <th className="text-right py-1.5 px-1">공급가</th>
          <th className="text-right py-1.5 px-1">부가세</th>
          <th className="text-right py-1.5 px-1 font-bold">합계</th>
          <th className="text-right py-1.5 px-1">입금</th>
          <th className="text-right py-1.5 px-1">잔금</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const cat = getCategoryInfo(categories, r.category);
          return (
            <tr key={r.id} className="border-b border-gray-200">
              <td className="py-1.5 px-1">
                <div className="font-semibold">{r.invoice_number || `#${r.id}`}</div>
                {r.order_id && <div className="text-[9px] text-gray-500">주문 #{r.order_id}</div>}
                {r.invoice_issued && <div className="text-[9px] text-green-700">✅ 발행</div>}
              </td>
              <td className="py-1.5 px-1">
                <div className="text-[10px]">{cat.icon} {cat.label}</div>
                {r.is_vat_exempt && <div className="text-[9px] text-blue-600">비과세</div>}
              </td>
              <td className="text-right py-1.5 px-1">{fmt(r.supply_amount || r.total_amount)}</td>
              <td className="text-right py-1.5 px-1 text-orange-700">
                {r.is_vat_exempt ? '-' : fmt(r.vat_amount)}
              </td>
              <td className="text-right py-1.5 px-1 font-bold">{fmt(r.total_amount)}</td>
              <td className="text-right py-1.5 px-1 text-green-700">{fmt(r.paid_amount)}</td>
              <td className="text-right py-1.5 px-1 text-red-600 font-bold">{fmt(r.balance)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
