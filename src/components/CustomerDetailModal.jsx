import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { FileSpreadsheet, Printer, ChevronDown, ChevronUp } from 'lucide-react';
// 주문 상세 경량 뷰 — 큰 모달 + 정가/할인 표시
const OrderDetailPopup = ({ order, onClose }) => {
  if (!order) return null;
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(order.total || 0);
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-[var(--card)] text-[var(--foreground)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--success)', color: 'white' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">📋</span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold leading-tight">주문 상세</h3>
              <p className="text-[11px] sm:text-xs opacity-90 truncate">
                {order.id || order.order_id || '-'} · {(order.created_at || '').slice(0, 10)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl opacity-90 hover:opacity-100 px-2 leading-none flex-shrink-0">×</button>
        </div>

        {/* 합계 배너 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-3 gap-3 flex-shrink-0 border-b" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
          <div>
            <div className="text-[10px] sm:text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>총 금액</div>
            <div className="text-lg sm:text-2xl font-black tabular-nums" style={{ color: 'var(--success)' }}>{fmt(total)}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>공급가액</div>
            <div className="text-lg sm:text-2xl font-black tabular-nums" style={{ color: 'var(--primary)' }}>{fmt(supply)}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>부가세</div>
            <div className="text-lg sm:text-2xl font-black tabular-nums" style={{ color: 'var(--purple, #a855f7)' }}>{fmt(vat)}</div>
          </div>
        </div>

        {/* 고객 + 메모 */}
        <div className="px-4 sm:px-6 py-3 text-sm space-y-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="break-words"><span className="opacity-60">고객:</span> <b>{order.customer_name || order.customerName || '-'}</b></p>
          {(order.customer_phone || order.customerPhone) && (
            <p><span className="opacity-60">전화:</span> {order.customer_phone || order.customerPhone}</p>
          )}
          {order.memo && <p className="break-words"><span className="opacity-60">메모:</span> {order.memo}</p>}
        </div>

        {/* 품목 — 스크롤 영역 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain modal-scroll-area" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          {items.length > 0 ? (
            <div>
              <div className="sticky top-0 z-10 px-4 sm:px-6 py-2 text-[11px] sm:text-xs font-bold border-b flex items-center justify-between" style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
                <span>상품 목록 ({items.length}종)</span>
                <span className="opacity-70">총 {items.reduce((s, it) => s + (it.quantity || 0), 0)}개</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {items.map((it, i) => {
                  const qty = it.quantity || 1;
                  const unit = Number(it.price ?? it.wholesale ?? it.retail ?? 0) || 0;
                  const lineTotal = unit * qty;
                  const lineSupply = Math.round(lineTotal / 1.1);
                  const isDiscounted = !!it.discountType && Number(it.discountValue) > 0;
                  const baseUnit = isDiscounted ? (Number(it.originalPrice) || unit) : unit;
                  const dLabel = isDiscounted
                    ? (it.discountType === 'percent' ? `${it.discountValue}%` : it.discountType === 'amount' ? `${fmt(it.discountValue)}원` : '특가')
                    : '';
                  return (
                    <div key={i} className="px-4 sm:px-6 py-3 flex items-start justify-between gap-3 hover:bg-[var(--accent)]/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm sm:text-base break-words leading-snug">{it.name || it.product_name || '품목'}</span>
                          {isDiscounted && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}
                            >
                              🏷 {dLabel} 할인
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] sm:text-xs flex items-center gap-2 flex-wrap" style={{ color: 'var(--muted-foreground)' }}>
                          {isDiscounted ? (
                            <>
                              <span>수량 {qty}개</span>
                              <span>×</span>
                              <span className="line-through opacity-70">{fmt(baseUnit)}원</span>
                              <span className="font-bold" style={{ color: 'var(--warning)' }}>→ {fmt(unit)}원</span>
                            </>
                          ) : (
                            <span>수량 {qty}개 × {fmt(unit)}원</span>
                          )}
                          <span>(공급 {fmt(Math.round(unit / 1.1))}원)</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {isDiscounted && (
                          <div className="text-[11px] line-through tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                            {fmt(baseUnit * qty)}원
                          </div>
                        )}
                        <div className="font-bold text-base sm:text-lg tabular-nums" style={{ color: 'var(--success)' }}>{fmt(lineTotal)}원</div>
                        <div className="text-[10px] sm:text-[11px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>공급 {fmt(lineSupply)}원</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>품목이 없습니다</p>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex-shrink-0 border-t px-4 sm:px-6 py-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[11px] text-center mb-2" style={{ color: 'var(--muted-foreground)' }}>
            상세 편집/반품은 <b>주문 내역</b> 페이지에서 이용하세요
          </p>
          <button onClick={onClose} className="w-full px-4 py-2.5 bg-[var(--primary)] text-white rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity">닫기</button>
        </div>
      </div>
    </div>
  );
};
import useManualPaid from '@/hooks/useManualPaid';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const dateKST = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function CustomerDetailModal({ open, customer, onClose, onBulkPay, onAddPayment, onEditHistory, onQuickPay, onViewInvoice }) {
  const [tab, setTab] = useState('outstanding');
  const [records, setRecords] = useState([]);
  const [history, setHistory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [exporting, setExporting] = useState(false);

  // 주문 상세 팝업 + 수동 완불 (공용 훅 사용)
  const [orderDetail, setOrderDetail] = useState(null);
  const { map: manualPaid, setPaid, clearPaid } = useManualPaid();

  const openOrderDetail = async (orderId) => {
    if (!orderId) return;
    const existing = orders.find((o) => String(o.id) === String(orderId));
    if (existing) { setOrderDetail(existing); return; }
    const o = await supabase.getOrderById(orderId);
    if (o) setOrderDetail(o);
  };

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !orderDetail) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, orderDetail]);

  useEffect(() => {
    if (!open || !customer) return;
    setLoading(true);
    setTab('outstanding');
    (async () => {
      try {
        const [r, allHistory, allOrders] = await Promise.all([
          supabase.getPaymentRecords({ customerId: customer.id }),
          supabase.getPaymentHistory({}),
          supabase.getOrders(),
        ]);
        const recordIds = new Set(r.map((x) => x.id));
        const myHistory = allHistory.filter((h) => recordIds.has(h.payment_record_id));

        // 주문 매칭: 1) record.order_id 우선  2) name/phone 백업
        const orderIdSet = new Set(r.map((x) => x.order_id).filter(Boolean));
        const targetName = (customer.name || '').trim();
        const targetPhone = (customer.phone || '').trim();
        const myOrders = allOrders.filter((o) => {
          if (orderIdSet.has(o.id)) return true;
          if (targetName && (o.customer_name || '').trim() === targetName) return true;
          if (targetPhone && (o.customer_phone || '').trim() === targetPhone) return true;
          return false;
        });

        setRecords(r);
        setHistory(myHistory);
        setOrders(myOrders);
      } finally { setLoading(false); }
    })();
  }, [open, customer]);

  const outstandingRecords = useMemo(() => records.filter((r) => Number(r.balance) > 0), [records]);
  const outstandingTotal = useMemo(() => outstandingRecords.reduce((s, r) => s + Number(r.balance || 0), 0), [outstandingRecords]);
  const totalOrders = useMemo(() => orders.length, [orders]);

  const handleExport = async () => {
    console.log('[Excel] export start for', customer?.name);
    setExporting(true);
    try {
      const [allRecords, allHistory, settings] = await Promise.all([
        supabase.getPaymentRecords({}),
        supabase.getPaymentHistory({}),
        supabase.getSettings(),
      ]);
      console.log('[Excel] data loaded', { records: allRecords?.length, history: allHistory?.length });
      const { exportCustomerReport } = await import('@/lib/exportExcel');
      await exportCustomerReport({
        customer,
        records: allRecords,
        history: allHistory,
        settings,
        orders,
      });
      console.log('[Excel] saved');
    } catch (e) {
      console.error('[Excel] failed:', e);
      alert('Excel 실패: ' + (e?.message || e) + '\n\n상세: ' + (e?.stack?.split('\n')[0] || '알 수 없음'));
    } finally { setExporting(false); }
  };

  const handlePrint = () => {
    console.log('[Print] start');
    document.body.classList.add('print-customer-mode');
    // 레이아웃/폰트 로드 대기 시간 여유 확보 (300ms)
    setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.error('[Print] failed:', e);
        alert('인쇄 실패: ' + e.message);
      } finally {
        document.body.classList.remove('print-customer-mode');
      }
    }, 300);
  };

  if (!open || !customer) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 customer-detail-modal animate-modal-backdrop"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <style>{`
        @media print {
          body.print-customer-mode * { visibility: hidden !important; }
          body.print-customer-mode .customer-detail-modal,
          body.print-customer-mode .customer-detail-modal * { visibility: visible !important; }
          body.print-customer-mode .customer-detail-modal {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; height: auto !important;
            background: white !important; backdrop-filter: none !important;
            padding: 0 !important; display: block !important;
            z-index: 999999 !important;
          }
          body.print-customer-mode .customer-detail-modal > div {
            position: static !important;
            box-shadow: none !important;
            border: none !important;
            max-height: none !important;
            max-width: 100% !important;
            height: auto !important;
            background: white !important;
            color: black !important;
            border-radius: 0 !important;
            animation: none !important;
          }
          body.print-customer-mode .no-print,
          body.print-customer-mode .no-print * { visibility: hidden !important; display: none !important; }
          body.print-customer-mode .customer-detail-modal * { color: black !important; }
          body.print-customer-mode .customer-detail-modal table { color: black !important; }
          /* 모달 내부의 그라데이션 바/고급 효과는 인쇄 시 제거 */
          body.print-customer-mode .animate-pulse-ring-red,
          body.print-customer-mode .animate-modal-up,
          body.print-customer-mode .animate-modal-backdrop { animation: none !important; }
        }
      `}</style>
      <div
        className="relative w-full sm:max-w-3xl lg:max-w-6xl max-h-[94vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)] animate-modal-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 고급 상단 그라데이션 바 */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)' }}
        />

        {/* 헤더 */}
        <div className="p-5 sm:p-6 border-b border-[var(--border)]" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--card)) 0%, var(--card) 100%)' }}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
              >
                <span className="text-2xl">🏢</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold break-keep leading-tight">
                  {customer.name || `#${customer.id}`}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] break-keep mt-1 flex items-center gap-3 flex-wrap">
                  {customer.phone && <span className="flex items-center gap-1">📞 {customer.phone}</span>}
                  {customer.address && <span className="flex items-center gap-1">📍 {customer.address}</span>}
                  {!customer.phone && !customer.address && '-'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors text-lg"
              title="닫기"
            >
              ✕
            </button>
          </div>
          {/* 액션 버튼 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold disabled:opacity-50 no-print hover:bg-[var(--secondary)] hover:border-[var(--primary)]/40 hover:shadow-md transition-all"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? '생성중...' : '엑셀 다운로드'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold no-print hover:bg-[var(--secondary)] hover:border-[var(--primary)]/40 hover:shadow-md transition-all"
            >
              <Printer className="w-4 h-4" />
              인쇄
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="px-5 sm:px-6 pt-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <StatBox label="받을 돈 (미수)" value={outstandingTotal} unit="원" color="red" hint="아직 못 받은 총액" />
            <StatBox label="전체 주문" value={totalOrders} unit="건" color="blue" hint="이 업체 총 거래 건수" />
            <StatBox label="받은 횟수" value={history.length} unit="번" color="green" hint={history.length === 0 ? '아직 입금 없음' : '지금까지 입금한 횟수'} />
          </div>
          {/* 메인 CTA: 바로 입금 (큼직) + 명세서 보기 */}
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            {onAddPayment && (
              <button
                onClick={() => onAddPayment(customer, null)}
                className="py-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-2 border-[var(--primary)]/50 text-[var(--primary)] text-sm font-black hover:from-blue-500/30 hover:to-purple-500/30 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
              >
                💵 {customer.name || '업체'}에서 입금 받기
              </button>
            )}
            {onViewInvoice && (
              <button
                onClick={() => onViewInvoice(customer.id)}
                className="py-3 rounded-xl bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border-2 border-amber-500/40 text-amber-600 text-sm font-black hover:from-amber-500/25 hover:to-yellow-500/25 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                title="이 업체의 거래명세서 페이지로 이동"
              >
                📄 명세서 발행
              </button>
            )}
          </div>
          {/* 고급: 일괄 입금 (접힘) — 월말 정산처럼 한 번에 여러 건 처리할 때만 */}
          {outstandingTotal > 0 && onBulkPay && (
            <details className="mt-2 group">
              <summary className="text-[11px] text-[var(--muted-foreground)] cursor-pointer hover:text-[var(--foreground)] flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-[var(--secondary)] select-none">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                <span>고급: 월말 정산용 일괄 입금</span>
              </summary>
              <button
                onClick={() => onBulkPay(customer, outstandingRecords)}
                className="mt-1.5 w-full py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] font-bold hover:bg-red-500/15 transition-all"
                title="오래된 미수부터 자동으로 배분해서 입금 처리 (한 업체가 잔금 전액 지불 시 유용)"
              >
                💳 일괄 입금 · {fmt(outstandingTotal)}원 자동 배분
              </button>
            </details>
          )}
        </div>

        {/* 탭 — Pill 스타일 */}
        <div className="px-5 sm:px-6 pt-4 flex gap-2 text-sm">
          {[
            ['outstanding', '미수', outstandingRecords.length, '#ef4444'],
            ['payments', '입금', history.length, '#22c55e'],
            ['orders', '주문', orders.length, '#3b82f6'],
          ].map(([key, label, count, color]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative px-4 py-2 font-semibold rounded-lg transition-all"
              style={{
                background: tab === key ? `color-mix(in srgb, ${color} 18%, var(--card))` : 'transparent',
                color: tab === key ? color : 'var(--muted-foreground)',
                boxShadow: tab === key ? `0 0 0 1px ${color}40, 0 4px 12px ${color}30` : 'none',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: tab === key ? color : 'var(--secondary)',
                    color: tab === key ? 'white' : 'var(--muted-foreground)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 min-h-0 modal-body-scroll" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading && <p className="text-sm text-center text-[var(--muted-foreground)] py-6">로딩...</p>}
          <div key={tab} className="animate-tab-in">

          {!loading && tab === 'outstanding' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {outstandingRecords.length === 0 ? (
                <p className="col-span-full text-sm text-center text-[var(--muted-foreground)] py-12">미수 없음 👍</p>
              ) : outstandingRecords.map((r, idx) => {
                const matchedOrder = r.order_id ? orders.find((o) => String(o.id) === String(r.order_id)) : null;
                const titleDate = matchedOrder?.created_at ? dateKST(matchedOrder.created_at) : null;
                return (
                <div
                  key={r.id}
                  className={`p-4 rounded-xl border bg-gradient-to-br from-[var(--secondary)] to-[var(--card)] text-sm space-y-2 animate-modal-up ${idx === 0 && outstandingRecords.length >= 3 ? 'md:col-span-2' : ''} ${r.order_id ? 'cursor-pointer hover:border-[var(--primary)] hover:shadow-lg hover:-translate-y-0.5 transition-all' : 'border-[var(--border)]'}`}
                  style={{
                    borderColor: r.order_id ? 'color-mix(in srgb, var(--primary) 20%, var(--border))' : 'var(--border)',
                    animationDelay: `${Math.min(idx * 40, 400)}ms`,
                  }}
                  onClick={() => r.order_id && openOrderDetail(r.order_id)}
                  title={r.order_id ? '클릭하여 주문 상세 보기' : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold break-words flex items-center gap-1.5">
                        {titleDate ? (
                          <>📅 {titleDate} 주문</>
                        ) : r.invoice_number ? (
                          `#${r.invoice_number}`
                        ) : (
                          `레코드 #${r.id}`
                        )}
                        {r.order_id && <span className="text-[10px] opacity-70">🔍</span>}
                      </div>
                      <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                        {r.invoice_date && <>발행: {r.invoice_date} · </>}
                        {r.due_date && <>납기: {r.due_date} · </>}
                        {r.order_id && <>주문 #{r.order_id}</>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        r.payment_status === 'partial' ? 'bg-orange-500/20 text-orange-300' : 'bg-red-500/20 text-red-300'
                      }`}>
                        {r.payment_status === 'partial' ? '부분' : '미수'}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const newVal = !r.invoice_issued;
                          await supabase.updatePaymentRecord(r.id, {
                            invoice_issued: newVal,
                            invoice_issued_at: newVal ? new Date().toISOString() : null,
                          });
                          setRecords((prev) => prev.map((x) => x.id === r.id ? { ...x, invoice_issued: newVal } : x));
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          r.invoice_issued ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/15 text-orange-300'
                        }`}
                        title="세금계산서 발행 토글"
                      >
                        {r.invoice_issued ? '✅ 발행' : '⏳ 미발행'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2 pt-1 border-t border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      총 {fmt(r.total_amount)} / 입금 {fmt(r.paid_amount)}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--muted-foreground)]">잔금</div>
                      <div className="text-base font-bold text-red-400">{fmt(r.balance)}원</div>
                    </div>
                  </div>
                  {/* 빠른 입금 버튼 */}
                  {onQuickPay && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onQuickPay(r, Number(r.balance)); }}
                        className="py-1.5 rounded-md bg-green-500/15 border border-green-500/40 text-green-400 text-[10px] font-bold"
                      >
                        ⚡ 잔액 전액 {fmt(r.balance)}
                      </button>
                      {onAddPayment && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onAddPayment(customer, r); }}
                          className="py-1.5 rounded-md bg-[var(--secondary)] border border-[var(--border)] text-[var(--muted-foreground)] text-[10px] font-bold"
                        >
                          ✏️ 직접 입력
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {!loading && tab === 'payments' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {history.length === 0 ? (
                <p className="col-span-full text-sm text-center text-[var(--muted-foreground)] py-12">입금 내역 없음</p>
              ) : history.map((h, idx) => (
                <div
                  key={h.id}
                  className="p-4 rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-[var(--card)] text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all animate-modal-up"
                  style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-green-400">{fmt(h.amount)}원</div>
                      <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 flex flex-wrap gap-1.5">
                        <span>{h.method || '-'}</span>
                        {h.memo && <span className="break-words">· {h.memo}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="text-[10px] text-[var(--muted-foreground)] whitespace-nowrap">{dateKST(h.paid_at)}</div>
                      {onEditHistory && (
                        <button
                          onClick={() => onEditHistory(h)}
                          className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
                        >
                          ✏️ 수정
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'orders' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {orders.length === 0 ? (
                <p className="col-span-full text-sm text-center text-[var(--muted-foreground)] py-12">주문 내역 없음</p>
              ) : orders.slice(0, 50).map((o, idx) => {
                const items = Array.isArray(o.items) ? o.items : [];
                const expanded = expandedOrder === o.id;
                return (
                  <div
                    key={o.id}
                    className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-[var(--card)] text-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all animate-modal-up"
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  >
                    <button
                      onClick={() => setExpandedOrder(expanded ? null : o.id)}
                      className="w-full p-3 text-left hover:bg-[var(--accent)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold flex items-center gap-1.5">
                            #{o.id}
                            {items.length > 0 && (
                              expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            {dateKST(o.created_at)} · {items.length}품목
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-sm">{fmt(o.total)}원</div>
                          {Number(o.total_returned) > 0 && (
                            <div className="text-[10px] text-orange-400">환불 {fmt(o.total_returned)}</div>
                          )}
                        </div>
                      </div>
                      {!expanded && items.length > 0 && (
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-1 break-words leading-snug">
                          {items.slice(0, 3).map((it) => it.name || it.product_name).filter(Boolean).join(', ')}
                          {items.length > 3 && ` 외 ${items.length - 3}건`}
                        </p>
                      )}
                    </button>
                    {expanded && items.length > 0 && (
                      <div className="px-3 pb-3 pt-1 border-t border-[var(--border)]">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-[var(--muted-foreground)] border-b border-[var(--border)]">
                              <th className="text-left py-1 font-normal">품목</th>
                              <th className="text-right py-1 font-normal w-10">수량</th>
                              <th className="text-right py-1 font-normal w-16">단가</th>
                              <th className="text-right py-1 font-normal w-20">소계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, i) => {
                              const qty = Number(it.quantity || 1);
                              const price = Number(it.price || 0);
                              return (
                                <tr key={i} className="border-b border-[var(--border)]/30 last:border-b-0">
                                  <td className="py-1.5 break-words leading-snug">{it.name || it.product_name || '-'}</td>
                                  <td className="text-right py-1.5">{qty}</td>
                                  <td className="text-right py-1.5">{fmt(price)}</td>
                                  <td className="text-right py-1.5 font-semibold">{fmt(qty * price)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-[var(--border)] font-bold">
                              <td colSpan="3" className="py-1.5 text-right">합계</td>
                              <td className="text-right py-1.5 text-[var(--primary)]">{fmt(o.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {o.memo && (
                          <p className="mt-2 p-2 rounded bg-[var(--background)] text-[10px] text-[var(--muted-foreground)] break-words">
                            📝 {o.memo}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {orders.length > 50 && (
                <p className="text-[11px] text-center text-[var(--muted-foreground)] pt-2">
                  최근 50건만 표시 (전체 {orders.length}건)
                </p>
              )}
            </div>
          )}
          </div>{/* animate-tab-in end */}
        </div>
      </div>

      {/* 주문 상세 팝업 (레코드 클릭 시) */}
      {orderDetail && (
        <OrderDetailPopup
          order={orderDetail}
          payment={records.find((r) => String(r.order_id) === String(orderDetail.id)) || null}
          customer={customer}
          manualInfo={manualPaid[orderDetail.id] || null}
          onSelectMethod={(k) => setPaid(orderDetail.id, k)}
          onClearPaid={() => clearPaid(orderDetail.id)}
          onClose={() => setOrderDetail(null)}
        />
      )}
    </div>
  );
}

function useCountUp(target, duration = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = Number(target || 0);
    if (!isFinite(t) || t === 0) { setN(t); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(t * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function StatBox({ label, value, unit, color, hint }) {
  const n = useCountUp(Number(value) || 0);
  const colorMap = {
    red: {
      bg: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(251,146,60,0.06))',
      border: 'rgba(239,68,68,0.3)',
      text: '#f87171',
      glow: '0 4px 20px rgba(239,68,68,0.15)',
    },
    blue: {
      bg: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.06))',
      border: 'rgba(59,130,246,0.3)',
      text: '#60a5fa',
      glow: '0 4px 20px rgba(59,130,246,0.15)',
    },
    green: {
      bg: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(20,184,166,0.06))',
      border: 'rgba(34,197,94,0.3)',
      text: '#4ade80',
      glow: '0 4px 20px rgba(34,197,94,0.15)',
    },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div
      className="p-3 rounded-xl border transition-all hover:-translate-y-0.5"
      style={{ background: c.bg, borderColor: c.border, boxShadow: c.glow }}
    >
      {/* 상단: 라벨 + 힌트 (같은 줄, 작게) */}
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[12px] sm:text-[13px] text-[var(--muted-foreground)] font-bold break-keep">{label}</span>
        {hint && (
          <span className="text-[10px] text-[var(--muted-foreground)]/70 italic break-keep">{hint}</span>
        )}
      </div>
      {/* 숫자 + 단위를 한 줄에 붙여서 */}
      <div
        className="font-black text-xl sm:text-2xl lg:text-3xl leading-tight tabular-nums flex items-baseline gap-1"
        style={{ color: c.text, textShadow: `0 0 20px ${c.text}40` }}
      >
        <span>{Number(n).toLocaleString('ko-KR')}</span>
        <span className="text-sm sm:text-base font-bold opacity-80">{unit}</span>
      </div>
    </div>
  );
}
