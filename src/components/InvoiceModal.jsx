import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toPng, toBlob } from 'html-to-image';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function InvoiceModal({ open, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('all');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const invoiceRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    supabase.getCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const filters = { invoiceDate: date };
    if (customerId !== 'all') filters.customerId = customerId;
    supabase.getPaymentRecords(filters)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [open, date, customerId]);

  const customerName = (id) => customers.find((c) => c.id === id)?.name || `#${id}`;

  const summary = useMemo(() => {
    const total = records.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const paid = records.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const balance = records.reduce((s, r) => s + Number(r.balance || 0), 0);
    return { total, paid, balance, count: records.length };
  }, [records]);

  // 업체별 그룹핑 (전체 보기 시)
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const handleSavePng = async () => {
    if (!invoiceRef.current) return;
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `명세서_${customerId === 'all' ? '전체' : customerName(customerId).replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${date}.png`;
      a.click();
      showToast('PNG 다운로드됨');
    } catch (e) { showToast('PNG 생성 실패: ' + e.message); }
  };

  const handleCopy = async () => {
    if (!invoiceRef.current) return;
    try {
      const blob = await toBlob(invoiceRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) throw new Error('blob 생성 실패');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('✅ 클립보드에 복사됨 (카톡에 붙여넣기)');
    } catch (e) { showToast('복사 실패: ' + e.message); }
  };

  const handlePrint = () => window.print();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print, .invoice-print * { visibility: visible; }
          .invoice-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        className="w-full sm:max-w-2xl max-h-[95vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[var(--primary)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 (필터 + 액션) */}
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between gap-2 flex-wrap no-print">
          <h3 className="text-base font-bold flex items-center gap-2 flex-shrink-0">📄 명세서</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--secondary)] flex-shrink-0">✕</button>
        </div>
        <div className="p-3 border-b border-[var(--border)] grid grid-cols-2 gap-2 no-print">
          <div>
            <label className="block text-[10px] font-semibold mb-1 text-[var(--muted-foreground)]">세금계산서 발행일</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" style={{ fontSize: '16px' }} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold mb-1 text-[var(--muted-foreground)]">업체</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" style={{ fontSize: '16px' }}>
              <option value="all">전체 업체</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name || `#${c.id}`}</option>)}
            </select>
          </div>
        </div>

        {/* 명세서 미리보기 (인쇄/PNG 대상) */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div
            ref={invoiceRef}
            className="invoice-print bg-white text-black p-5 rounded-lg shadow-lg"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            <header className="border-b-2 border-black pb-3 mb-3">
              <h1 className="text-xl font-bold">MOVE MOTORS</h1>
              <p className="text-xs text-gray-600 mt-0.5">
                {customerId === 'all' ? `${date} 발송 내역 — 전체 업체` : `${customerName(customerId)} 귀하`}
              </p>
              <p className="text-xs text-gray-600">발행일: {date}</p>
            </header>

            {loading ? (
              <p className="text-sm text-center py-6">로딩 중...</p>
            ) : records.length === 0 ? (
              <p className="text-sm text-center py-6 text-gray-600">해당 일자의 발행 내역이 없습니다.</p>
            ) : (
              <>
                {/* 업체별 그룹 보기 (전체 선택 시) */}
                {grouped ? grouped.map((g) => (
                  <section key={g.id} className="mb-4">
                    <h2 className="text-sm font-bold mb-1.5 border-b border-gray-300 pb-1">🏢 {g.name}</h2>
                    <InvoiceTable rows={g.rows} />
                    <p className="text-xs text-right mt-1">
                      소계: 총 {fmt(g.total)}원 / 미수 <strong className="text-red-600">{fmt(g.balance)}원</strong>
                    </p>
                  </section>
                )) : (
                  <InvoiceTable rows={records} />
                )}

                {/* 전체 합계 */}
                <section className="mt-4 pt-3 border-t-2 border-black">
                  <div className="flex justify-between text-sm">
                    <span>발행 건수:</span><span className="font-bold">{summary.count}건</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>총 금액:</span><span className="font-bold">{fmt(summary.total)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>입금 합계:</span><span className="font-bold text-green-700">{fmt(summary.paid)}원</span>
                  </div>
                  <div className="flex justify-between text-base mt-1 pt-1 border-t border-gray-300">
                    <span className="font-bold">미수 합계:</span>
                    <span className="font-bold text-red-600 text-lg">{fmt(summary.balance)}원</span>
                  </div>
                </section>

                <footer className="mt-4 pt-3 border-t border-gray-300 text-xs text-gray-600 space-y-0.5">
                  <p>입금 계좌: (계좌번호를 여기에 입력)</p>
                  <p>문의: MOVE MOTORS</p>
                </footer>
              </>
            )}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="p-3 border-t border-[var(--border)] flex gap-2 no-print">
          <button onClick={handlePrint} className="flex-1 py-2.5 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--secondary)]">
            🖨️ 인쇄
          </button>
          <button onClick={handleSavePng} className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--primary)]">
            📥 PNG 저장
          </button>
          <button onClick={handleCopy} className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white bg-green-600">
            📋 복사
          </button>
        </div>

        {toast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold shadow-2xl z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceTable({ rows }) {
  return (
    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr className="border-b border-gray-400">
          <th className="text-left py-1.5 px-1">세금계산서</th>
          <th className="text-right py-1.5 px-1">총액</th>
          <th className="text-right py-1.5 px-1">입금</th>
          <th className="text-right py-1.5 px-1">잔금</th>
          <th className="text-center py-1.5 px-1 w-12">상태</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-gray-200">
            <td className="py-1.5 px-1">
              <div className="font-semibold">{r.invoice_number || `#${r.id}`}</div>
              {r.order_id && <div className="text-[10px] text-gray-500">주문 #{r.order_id}</div>}
            </td>
            <td className="text-right py-1.5 px-1">{fmt(r.total_amount)}</td>
            <td className="text-right py-1.5 px-1 text-green-700">{fmt(r.paid_amount)}</td>
            <td className="text-right py-1.5 px-1 text-red-600 font-bold">{fmt(r.balance)}</td>
            <td className="text-center py-1.5 px-1">
              <span className={`text-[10px] font-bold ${
                r.payment_status === 'paid' ? 'text-green-700' :
                r.payment_status === 'partial' ? 'text-orange-600' : 'text-red-600'
              }`}>
                {r.payment_status === 'paid' ? '완납' : r.payment_status === 'partial' ? '부분' : '미수'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
