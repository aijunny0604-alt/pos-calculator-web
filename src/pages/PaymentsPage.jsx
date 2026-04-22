import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { exportFilteredExcel } from '@/lib/exportExcel';
import { DEFAULT_CATEGORIES, getCategoryInfo } from '@/lib/vatHelper';
import { Search, Plus, Edit2, FileSpreadsheet, ChevronRight, FileCheck, FileX } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const dateKST = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function PaymentsPage({ customers, onOpenPayment, onEditHistory, onOpenCustomer }) {
  const [tab, setTab] = useState('records'); // records | history
  const [records, setRecords] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // 필터
  const [statusFilter, setStatusFilter] = useState('all');
  const [issuedFilter, setIssuedFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => { supabase.getSettings().then((s) => { if (s?.expense_categories) setCategories(s.expense_categories); }); }, []);

  const reload = () => {
    setLoading(true);
    Promise.all([
      supabase.getPaymentRecords({}),
      supabase.getPaymentHistory({ limit: 200 }),
    ]).then(([r, h]) => { setRecords(r); setHistory(h); }).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const toggleIssued = async (record, e) => {
    e.stopPropagation();
    const newVal = !record.invoice_issued;
    const updated = await supabase.updatePaymentRecord(record.id, {
      invoice_issued: newVal,
      invoice_issued_at: newVal ? new Date().toISOString() : null,
    });
    if (updated) {
      setRecords((prev) => prev.map((r) => r.id === record.id ? { ...r, ...updated } : r));
    }
  };

  const customerName = (id) => customers.find((c) => c.id === id)?.name || `#${id}`;

  const filteredRecords = useMemo(() => {
    let list = records;
    if (statusFilter !== 'all') list = list.filter((r) => r.payment_status === statusFilter);
    if (issuedFilter === 'issued') list = list.filter((r) => r.invoice_issued === true);
    if (issuedFilter === 'notIssued') list = list.filter((r) => r.invoice_issued !== true);
    if (categoryFilter !== 'all') list = list.filter((r) => (r.category || 'sales') === categoryFilter);
    if (customerFilter !== 'all') list = list.filter((r) => String(r.customer_id) === String(customerFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.order_id || '').toString().includes(q) ||
        customerName(r.customer_id).toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, statusFilter, issuedFilter, categoryFilter, customerFilter, search, customers]);

  const filteredHistory = useMemo(() => {
    let list = history;
    if (customerFilter !== 'all') {
      const recordIds = records.filter((r) => String(r.customer_id) === String(customerFilter)).map((r) => r.id);
      list = list.filter((h) => recordIds.includes(h.payment_record_id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((h) =>
        (h.method || '').toLowerCase().includes(q) ||
        (h.memo || '').toLowerCase().includes(q) ||
        String(h.amount).includes(q)
      );
    }
    return list;
  }, [history, records, customerFilter, search]);

  const summary = useMemo(() => {
    const total = filteredRecords.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const paid = filteredRecords.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const balance = filteredRecords.reduce((s, r) => s + Number(r.balance || 0), 0);
    return { total, paid, balance, count: filteredRecords.length };
  }, [filteredRecords]);

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{tab === 'records' ? '결제 레코드' : '입금 이력'}</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              console.log('[PaymentsExcel] start', tab);
              try {
                await exportFilteredExcel({
                  records: tab === 'records' ? filteredRecords : records,
                  history: tab === 'history' ? filteredHistory : history,
                  customers,
                  label: `입출금_${tab === 'records' ? '결제레코드' : '입금이력'}_${statusFilter}`,
                });
                console.log('[PaymentsExcel] saved');
              } catch (e) {
                console.error('[PaymentsExcel] failed:', e);
                alert('Excel 실패: ' + (e?.message || e));
              }
            }}
            className="flex items-center gap-1 h-9 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold"
            title="필터 결과 Excel"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={onOpenPayment}
            className="flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--primary)] text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> 입금 등록
          </button>
        </div>
      </div>

      {/* 탭 전환 */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        <TabButton active={tab === 'records'} onClick={() => setTab('records')}>
          📋 결제 레코드 ({records.length})
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          💵 입금 이력 ({history.length})
        </TabButton>
      </div>

      {/* 필터 (records 탭만) */}
      {tab === 'records' && (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {[
              ['all', '전체', 'gray'],
              ['unpaid', '미수', 'red'],
              ['partial', '부분', 'orange'],
              ['paid', '완납', 'green'],
            ].map(([k, l, c]) => (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors ${
                  statusFilter === k
                    ? `bg-${c === 'gray' ? '[var(--primary)]' : c + '-500/20'} border-${c === 'gray' ? '[var(--primary)]' : c + '-500/40'} text-${c === 'gray' ? 'white' : c + '-300'}`
                    : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* 세금계산서 발행 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip active={issuedFilter === 'all'} onClick={() => setIssuedFilter('all')} color="gray" icon={null}>📄 발행 전체</FilterChip>
            <FilterChip active={issuedFilter === 'issued'} onClick={() => setIssuedFilter('issued')} color="green" icon={FileCheck}>발행 완료</FilterChip>
            <FilterChip active={issuedFilter === 'notIssued'} onClick={() => setIssuedFilter('notIssued')} color="orange" icon={FileX}>미발행</FilterChip>
          </div>

          {/* 카테고리 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-md border font-semibold ${
                categoryFilter === 'all' ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
              }`}
            >전체</button>
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategoryFilter(c.key)}
                className={`px-2.5 py-1 text-[11px] rounded-md border font-semibold flex items-center gap-1 ${
                  categoryFilter === c.key ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* 요약 */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <SummaryStat label="필터 결과" value={`${summary.count}건`} />
            <SummaryStat label="총액" value={`${fmt(summary.total)}원`} />
            <SummaryStat label="잔금 합계" value={`${fmt(summary.balance)}원`} color="red" />
          </div>
        </>
      )}

      {/* 검색 + 업체 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'records' ? '세금계산서/주문번호/업체 검색' : '방법/메모/금액 검색'}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm"
            style={{ fontSize: '16px' }}
          />
        </div>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm"
          style={{ fontSize: '16px' }}
        >
          <option value="all">전체 업체</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name || `#${c.id}`}</option>)}
        </select>
      </div>

      {/* 리스트 */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-center text-[var(--muted-foreground)] py-8">로딩 중...</p>
        ) : tab === 'records' ? (
          filteredRecords.length === 0 ? (
            <p className="text-sm text-center text-[var(--muted-foreground)] py-8">조건에 맞는 결제 레코드 없음</p>
          ) : filteredRecords.map((r) => {
            const cust = customers.find((c) => String(c.id) === String(r.customer_id));
            return (
              <button
                key={r.id}
                onClick={() => cust && onOpenCustomer && onOpenCustomer(cust)}
                className="w-full text-left p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold break-keep">{customerName(r.customer_id)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)]">
                        #{r.invoice_number || r.id}
                      </span>
                      <span
                        onClick={(e) => toggleIssued(r, e)}
                        role="button"
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                          r.invoice_issued
                            ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                            : 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
                        }`}
                        title={r.invoice_issued ? '발행 완료 (해제하려면 클릭)' : '미발행 (체크하려면 클릭)'}
                      >
                        {r.invoice_issued ? '✅ 발행' : '⏳ 미발행'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 flex items-center gap-1 flex-wrap">
                      {r.invoice_date && <span>발행 {r.invoice_date}</span>}
                      {r.due_date && <span>· 납기 {r.due_date}</span>}
                      {r.order_id && (
                        String(r.order_id).startsWith('CART-') ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-bold">🛒 장바구니</span>
                        ) : (
                          <span>· 주문 #{r.order_id}</span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <StatusBadge status={r.payment_status} />
                    <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2 pt-1.5 border-t border-[var(--border)]">
                  <div className="text-[11px] text-[var(--muted-foreground)] flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)]">
                        {getCategoryInfo(categories, r.category).icon} {getCategoryInfo(categories, r.category).label}
                      </span>
                      {r.is_vat_exempt ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">비과세</span>
                      ) : Number(r.vat_amount) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300">+VAT {fmt(r.vat_amount)}</span>
                      )}
                    </div>
                    <span>총 {fmt(r.total_amount)} / 입금 {fmt(r.paid_amount)}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--muted-foreground)]">잔금</div>
                    <div className={`text-base font-bold ${Number(r.balance) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {fmt(r.balance)}원
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          filteredHistory.length === 0 ? (
            <p className="text-sm text-center text-[var(--muted-foreground)] py-8">조건에 맞는 입금 이력 없음</p>
          ) : filteredHistory.map((h) => {
            const rec = records.find((r) => r.id === h.payment_record_id);
            const cust = rec && customers.find((c) => String(c.id) === String(rec.customer_id));
            return (
              <div key={h.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => cust && onOpenCustomer && onOpenCustomer(cust)}
                    className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                    disabled={!cust}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-bold text-base ${h.type === 'expense' ? 'text-red-400' : 'text-green-400'}`}>
                        {h.type === 'expense' ? '-' : '+'}{fmt(h.amount)}원
                      </span>
                      {h.method && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--secondary)] text-[var(--muted-foreground)]">{h.method}</span>}
                      {h.type === 'expense' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">출금</span>}
                    </div>
                    {rec && (
                      <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 flex items-center gap-1">
                        <span className="font-semibold text-[var(--foreground)]">{customerName(rec.customer_id)}</span>
                        <span>· #{rec.invoice_number || rec.id}</span>
                        {cust && <ChevronRight className="w-3 h-3" />}
                      </div>
                    )}
                    {h.memo && (
                      <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 break-words">📝 {h.memo}</div>
                    )}
                  </button>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="text-[10px] text-[var(--muted-foreground)]">{dateKST(h.paid_at)}</div>
                    {onEditHistory && (
                      <button
                        onClick={() => onEditHistory(h)}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
                      >
                        <Edit2 className="w-2.5 h-2.5" /> 수정
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
        active ? 'border-[var(--primary)] text-[var(--foreground)]' : 'border-transparent text-[var(--muted-foreground)]'
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, children, color, icon: Icon }) {
  const colorMap = {
    gray: active ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : '',
    green: active ? 'bg-green-500/20 border-green-500/40 text-green-300' : '',
    orange: active ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : '',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors ${
        active ? colorMap[color] : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid: 'bg-green-500/20 text-green-300',
    partial: 'bg-orange-500/20 text-orange-300',
    unpaid: 'bg-red-500/20 text-red-300',
  };
  const label = { paid: '완납', partial: '부분', unpaid: '미수' }[status] || status;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${map[status] || 'bg-gray-500/20'}`}>{label}</span>;
}

function SummaryStat({ label, value, color }) {
  return (
    <div className="p-2 rounded-lg bg-[var(--secondary)]">
      <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
      <div className={`font-bold text-sm break-all leading-tight ${color === 'red' ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  );
}
