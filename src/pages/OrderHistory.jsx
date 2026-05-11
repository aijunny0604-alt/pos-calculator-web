import { useState, useEffect } from 'react';
import {
  ChevronLeft, Menu, Search, List, RefreshCw, Trash2, Eye, ShoppingCart,
  Calendar, FileText, Calculator, Receipt, RotateCcw, AlertTriangle,
  ChevronDown, CheckCircle2, CircleDollarSign
} from 'lucide-react';
import { formatPrice, calcExVat, formatDateTime, getTodayKST, toDateKST, offsetDateKST, offsetMonthKST } from '@/lib/utils';
import SubPrice from '@/components/ui/SubPrice';
import useManualPaid, { PAYMENT_METHODS, METHOD_MAP } from '@/hooks/useManualPaid';
import useCountUp from '@/hooks/useCountUp';

// 카운트업 숫자 표시 (toLocaleString) — 명세서 통계와 동일 톤
function CountNumber({ value, duration = 700 }) {
  const n = useCountUp(Number(value) || 0, duration);
  return <>{Number(n).toLocaleString('ko-KR')}</>;
}

export default function OrderHistory({
  orders,
  onBack,
  onDeleteOrder,
  onDeleteMultiple,
  onViewOrder,
  onRefresh,
  isLoading,
  onSaveToCart,
  isDetailModalOpen = false,
  customers = [],
  onUpdateOrder,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showFilterDeleteConfirm, setShowFilterDeleteConfirm] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => window.innerWidth < 768);
  const [showReturnsOnly, setShowReturnsOnly] = useState(false);
  // 메모 필터: 'off' | 'unchecked' | 'all'
  const [memoFilter, setMemoFilter] = useState('off');
  const [memoAlert, setMemoAlert] = useState(false);

  // 수동 완불 (pos-payments와 localStorage 공유)
  const { getInfo: getPaidInfo, setPaid, clearPaid } = useManualPaid();
  const [methodPickerId, setMethodPickerId] = useState(null);

  // 진입 시 미확인 메모 알림 (페이지 진입할 때마다)
  useEffect(() => {
    const unchecked = orders.filter(o => !!o.memo && !o.memoChecked).length;
    if (unchecked > 0) {
      setMemoAlert(unchecked);
      const timer = setTimeout(() => setMemoAlert(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get blacklist info for customer
  const getBlacklistInfo = (customerName) => {
    if (!customerName || !customers || customers.length === 0) return null;
    const customer = customers.find(
      c => c?.name?.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, '')
    );
    if (customer?.is_blacklist) {
      return { isBlacklist: true, reason: customer.blacklist_reason || '' };
    }
    return null;
  };

  // ESC key handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isDetailModalOpen) return;
      if (e.key === 'Escape') {
        if (deleteConfirm) {
          setDeleteConfirm(null);
        } else if (showBulkDeleteConfirm) {
          setShowBulkDeleteConfirm(false);
        } else if (showFilterDeleteConfirm) {
          setShowFilterDeleteConfirm(false);
        } else if (selectedOrders.length > 0) {
          setSelectedOrders([]);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, deleteConfirm, showBulkDeleteConfirm, showFilterDeleteConfirm, selectedOrders, isDetailModalOpen]);

  // 반품 처리 일자 추출 (orders.returns[i].returnedAt → KST 날짜 배열)
  const getReturnDatesKST = (order) =>
    (Array.isArray(order.returns) ? order.returns : [])
      .map((r) => r?.returnedAt && toDateKST(r.returnedAt))
      .filter(Boolean);

  // Date filter — 주문일 OR 반품 처리일이 매칭되면 표시
  // (지난 주문이 오늘 반품 처리되면 오늘 목록에 등장)
  const filterByDate = (order) => {
    if (dateFilter === 'all') return true;
    const orderDateKST = toDateKST(order.createdAt);
    const todayKST = getTodayKST();
    const returnDatesKST = getReturnDatesKST(order);

    const matchDate = (target) =>
      orderDateKST === target || returnDatesKST.includes(target);
    const matchRange = (from, to) =>
      (orderDateKST >= from && orderDateKST <= to) ||
      returnDatesKST.some((d) => d >= from && d <= to);

    if (dateFilter === 'today') return matchDate(todayKST);
    if (dateFilter === 'yesterday') return matchDate(offsetDateKST(todayKST, -1));
    if (dateFilter === 'week') return matchRange(offsetDateKST(todayKST, -7), todayKST);
    if (dateFilter === 'month') return matchRange(offsetMonthKST(todayKST, -1), todayKST);
    if (dateFilter === 'custom' && customDate) return matchDate(customDate);
    return true;
  };

  // 현재 필터의 "기준일자(들)" — 반품 표시/집계용
  const filterTargetDates = (() => {
    const todayKST = getTodayKST();
    if (dateFilter === 'today') return [todayKST];
    if (dateFilter === 'yesterday') return [offsetDateKST(todayKST, -1)];
    if (dateFilter === 'custom' && customDate) return [customDate];
    return null; // 범위 또는 all — 단일 일자 비교 무의미
  })();
  // 주문이 "기간 내 반품 처리됨"으로 잡혔는지 (시각적 배지용)
  const isReturnedInFilter = (order) => {
    const dates = getReturnDatesKST(order);
    if (filterTargetDates) {
      return dates.some((d) => filterTargetDates.includes(d));
    }
    // 범위/all일 땐 보조 정보 미제공
    return false;
  };
  // 기간 내 반품 처리된 항목들의 합/건수 (returnedAt 기준)
  const filterReturnStats = (() => {
    const todayKST = getTodayKST();
    const inRange = (dKst) => {
      if (dateFilter === 'today') return dKst === todayKST;
      if (dateFilter === 'yesterday') return dKst === offsetDateKST(todayKST, -1);
      if (dateFilter === 'week') return dKst >= offsetDateKST(todayKST, -7) && dKst <= todayKST;
      if (dateFilter === 'month') return dKst >= offsetMonthKST(todayKST, -1) && dKst <= todayKST;
      if (dateFilter === 'custom' && customDate) return dKst === customDate;
      return true; // all
    };
    let count = 0;
    let total = 0;
    for (const o of orders) {
      const list = Array.isArray(o.returns) ? o.returns : [];
      let hadHit = false;
      for (const r of list) {
        if (!r?.returnedAt) continue;
        const dKst = toDateKST(r.returnedAt);
        if (!inRange(dKst)) continue;
        const amt = Number(r.total || (r.price || 0) * (r.quantity || 0) || 0);
        total += amt;
        hadHit = true;
      }
      if (hadHit) count += 1;
    }
    return { count, total };
  })();

  const filteredOrders = orders
    .filter(filterByDate)
    .filter(order => {
      const search = searchTerm.toLowerCase().replace(/\s/g, '');
      if (!search) return true;
      const orderNum = String(order.orderNumber || '').toLowerCase().replace(/\s/g, '');
      const customerName = (order.customerName || '').toLowerCase().replace(/\s/g, '');
      const customerPhone = (order.customerPhone || '').replace(/\s/g, '');
      const memo = (order.memo || '').toLowerCase().replace(/\s/g, '');
      return orderNum.includes(search) || customerName.includes(search) || customerPhone.includes(search) || memo.includes(search);
    })
    .filter(order => !showReturnsOnly || (order.totalReturned || 0) > 0)
    .filter(order => {
      if (memoFilter === 'off') return true;
      if (memoFilter === 'unchecked') return !!order.memo && !order.memoChecked;
      if (memoFilter === 'all') return !!order.memo;
      return true;
    });

  // Stats
  const filteredTotalSales = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const filteredTotalReturned = filteredOrders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
  const filteredReturnCount = filteredOrders.filter(o => (o.totalReturned || 0) > 0).length;
  const filteredMemoCount = filteredOrders.filter(o => !!o.memo).length;
  const filteredMemoUnchecked = filteredOrders.filter(o => !!o.memo && !o.memoChecked).length;
  const totalMemoCount = orders.filter(o => !!o.memo).length;
  const totalMemoUnchecked = orders.filter(o => !!o.memo && !o.memoChecked).length;
  const totalSales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalReturned = orders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
  const totalReturnCount = orders.filter(o => (o.totalReturned || 0) > 0).length;

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const handleSelect = (id) => {
    setSelectedOrders(prev =>
      prev.includes(id)
        ? prev.filter(o => o !== id)
        : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (onDeleteMultiple) {
      await onDeleteMultiple(selectedOrders);
    } else {
      await Promise.allSettled(selectedOrders.map(orderNumber => onDeleteOrder(orderNumber)));
    }
    setSelectedOrders([]);
    setShowBulkDeleteConfirm(false);
  };

  const handleFilterDelete = async () => {
    const orderNumbersToDelete = filteredOrders.map(o => o.id);
    if (onDeleteMultiple) {
      await onDeleteMultiple(orderNumbersToDelete);
    } else {
      await Promise.allSettled(orderNumbersToDelete.map(orderNumber => onDeleteOrder(orderNumber)));
    }
    setSelectedOrders([]);
    setShowFilterDeleteConfirm(false);
  };

  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return '오늘';
      case 'yesterday': return '어제';
      case 'week': return '최근 7일';
      case 'month': return '최근 1개월';
      case 'custom': return customDate || '날짜 선택';
      default: return '전체';
    }
  };

  const dateFilterOptions = [
    { key: 'today', label: '오늘' },
    { key: 'yesterday', label: '어제' },
    { key: 'week', label: '이번 주' },
    { key: 'month', label: '이번 달' },
    { key: 'custom', label: '날짜 선택' },
    { key: 'all', label: '전체' },
  ];

  return (
    <div style={{ background: 'var(--background)' }}>
      {/* 미확인 메모 알림 토스트 */}
      {memoAlert && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer whitespace-nowrap"
          style={{ background: 'var(--destructive)', color: 'white', animation: 'modal-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          onClick={() => {
            setMemoAlert(false);
            setMemoFilter('unchecked');
            setDateFilter('all');
          }}
        >
          <FileText className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium text-sm">미확인 메모 {memoAlert}건</span>
          <span className="text-xs opacity-70">| 터치하여 보기</span>
        </div>
      )}
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="px-2 sm:px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile: menu button */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                className="md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--accent)]"
              >
                <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
              {/* Desktop: back button */}
              <button
                onClick={onBack}
                className="hidden md:block p-2 rounded-lg transition-colors hover:bg-[var(--accent)]"
              >
                <ChevronLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
              </button>
              <div className="flex items-center gap-2">
                <List className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                <div>
                  <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>주문 내역</h1>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {orders.length}건 · 필터 {filteredOrders.length}건
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedOrders.length > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="text-sm px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
                  style={{ background: 'var(--destructive)', color: 'white' }}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">삭제</span>
                  ({selectedOrders.length})
                </button>
              )}
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
                  style={{ color: 'var(--foreground)' }}
                />
              </button>
              <button
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="px-3 py-2 rounded-lg transition-colors hover:bg-[var(--accent)] flex items-center gap-1.5 text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <span className="hidden sm:inline">{isHeaderCollapsed ? '펼치기' : '접기'}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-300 ${isHeaderCollapsed ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Collapsed summary */}
          {isHeaderCollapsed && (
            <div
              className="mt-2 flex items-center justify-between text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--muted)' }}
            >
              <span style={{ color: 'var(--muted-foreground)' }}>
                {getFilterLabel()} · {filteredOrders.length}건 ·{' '}
                <span className="font-semibold" style={{ color: 'var(--primary)' }}>
                  {formatPrice(filteredTotalSales)}원
                </span>
              </span>
              {searchTerm && (
                <span style={{ color: 'var(--primary)' }}>검색: {searchTerm}</span>
              )}
            </div>
          )}

          {/* Date filter buttons - always visible */}
          {isHeaderCollapsed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dateFilterOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setDateFilter(key); setSelectedOrders([]); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: dateFilter === key ? 'var(--primary)' : 'var(--muted)',
                    color: dateFilter === key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              ))}
              {dateFilter === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border text-xs focus:outline-none"
                  style={{
                    background: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Expandable section */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isHeaderCollapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
          }`}
        >
          <div className="px-2 sm:px-4 pb-4 space-y-3">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 overflow-hidden">
              <div
                className="rounded-xl p-3 sm:p-4 border transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--foreground) 6%, var(--card)), var(--card))',
                  borderColor: 'var(--border)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                }}
              >
                <p className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold" style={{ color: 'var(--muted-foreground)' }}>
                  <FileText className="w-3.5 h-3.5" />
                  {dateFilter === 'all' ? '총 주문' : '조회 주문'}
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1"
                  style={{ color: 'var(--foreground)' }}
                >
                  <CountNumber value={filteredOrders.length} />
                  <span className="text-sm sm:text-base font-bold opacity-70">건</span>
                </p>
                {dateFilter !== 'all' && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {orders.length}건
                  </p>
                )}
              </div>

              <div
                className="rounded-xl p-3 sm:p-4 border transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--success) 12%, var(--card)), color-mix(in srgb, var(--success) 4%, var(--card)))',
                  borderColor: 'color-mix(in srgb, var(--success) 30%, var(--border))',
                  boxShadow: '0 4px 20px color-mix(in srgb, var(--success) 12%, transparent)',
                }}
              >
                <p className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold" style={{ color: 'var(--muted-foreground)' }}>
                  <Calculator className="w-3.5 h-3.5" />
                  {dateFilter === 'all' ? '총 매출' : '조회 매출'}
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1 truncate"
                  style={{ color: 'var(--success)', textShadow: '0 0 24px color-mix(in srgb, var(--success) 30%, transparent)' }}
                >
                  <CountNumber value={filteredTotalSales - filteredTotalReturned} />
                  <span className="text-sm sm:text-base font-bold opacity-80">원</span>
                </p>
                {filteredTotalReturned > 0 && (
                  <p className="text-[11px] line-through mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {formatPrice(filteredTotalSales)}원
                  </p>
                )}
                {dateFilter !== 'all' && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {formatPrice(totalSales - totalReturned)}원
                  </p>
                )}
              </div>

              <div
                className="rounded-xl p-3 sm:p-4 border transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--card)), color-mix(in srgb, var(--primary) 4%, var(--card)))',
                  borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))',
                  boxShadow: '0 4px 20px color-mix(in srgb, var(--primary) 12%, transparent)',
                }}
              >
                <p className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold" style={{ color: 'var(--muted-foreground)' }}>
                  <Receipt className="w-3.5 h-3.5" />
                  공급가액
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1 truncate"
                  style={{ color: 'var(--primary)', textShadow: '0 0 24px color-mix(in srgb, var(--primary) 30%, transparent)' }}
                >
                  <CountNumber value={calcExVat(filteredTotalSales - filteredTotalReturned)} />
                  <span className="text-sm sm:text-base font-bold opacity-80">원</span>
                </p>
              </div>

              <div
                className="rounded-xl p-3 sm:p-4 border transition-all hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--purple) 14%, var(--card)), color-mix(in srgb, var(--purple) 4%, var(--card)))',
                  borderColor: 'color-mix(in srgb, var(--purple) 32%, var(--border))',
                  boxShadow: '0 4px 20px color-mix(in srgb, var(--purple) 14%, transparent)',
                }}
              >
                <p className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold" style={{ color: 'var(--muted-foreground)' }}>
                  <Receipt className="w-3.5 h-3.5" />
                  부가세
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1 truncate"
                  style={{ color: 'var(--purple)', textShadow: '0 0 24px color-mix(in srgb, var(--purple) 30%, transparent)' }}
                >
                  <CountNumber
                    value={(filteredTotalSales - filteredTotalReturned) - calcExVat(filteredTotalSales - filteredTotalReturned)}
                  />
                  <span className="text-sm sm:text-base font-bold opacity-80">원</span>
                </p>
              </div>

              <button
                onClick={() => setShowReturnsOnly(prev => !prev)}
                className="rounded-xl p-3 sm:p-4 border text-left transition-all hover:-translate-y-0.5"
                style={{
                  background: showReturnsOnly
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 28%, var(--card)), color-mix(in srgb, var(--warning) 12%, var(--card)))'
                    : filteredTotalReturned > 0
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 14%, var(--card)), color-mix(in srgb, var(--warning) 4%, var(--card)))'
                      : 'linear-gradient(135deg, color-mix(in srgb, var(--foreground) 6%, var(--card)), var(--card))',
                  borderColor: showReturnsOnly
                    ? 'var(--warning)'
                    : filteredTotalReturned > 0
                      ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                      : 'var(--border)',
                  boxShadow: showReturnsOnly
                    ? '0 0 0 1px var(--warning), 0 4px 24px color-mix(in srgb, var(--warning) 25%, transparent)'
                    : filteredTotalReturned > 0
                      ? '0 4px 18px color-mix(in srgb, var(--warning) 12%, transparent)'
                      : '0 4px 16px rgba(0,0,0,0.04)',
                }}
              >
                <p
                  className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold"
                  style={{ color: filterReturnStats.total > 0 || showReturnsOnly ? 'var(--warning)' : 'var(--muted-foreground)' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  반품 처리 ({filterReturnStats.count}건)
                  {showReturnsOnly && <span className="ml-1 text-[10px] font-bold">필터 ON</span>}
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1 truncate"
                  style={{
                    color: filterReturnStats.total > 0 || showReturnsOnly ? 'var(--warning)' : 'var(--muted-foreground)',
                    textShadow: filterReturnStats.total > 0 || showReturnsOnly ? '0 0 24px color-mix(in srgb, var(--warning) 30%, transparent)' : 'none',
                  }}
                >
                  {filterReturnStats.total > 0 ? (
                    <>
                      <span>-</span>
                      <CountNumber value={filterReturnStats.total} />
                      <span className="text-sm sm:text-base font-bold opacity-80">원</span>
                    </>
                  ) : (
                    <>
                      <span>0</span>
                      <span className="text-sm sm:text-base font-bold opacity-80">원</span>
                    </>
                  )}
                </p>
                {dateFilter !== 'all' && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {totalReturned > 0 ? `-${formatPrice(totalReturned)}원` : '0원'} ({totalReturnCount}건)
                  </p>
                )}
              </button>

              <button
                onClick={() => setMemoFilter(prev => {
                  const next = prev === 'off' ? 'unchecked' : prev === 'unchecked' ? 'all' : 'off';
                  if (next === 'unchecked') setDateFilter('all');
                  return next;
                })}
                className="rounded-xl p-3 sm:p-4 border text-left transition-all hover:-translate-y-0.5"
                style={{
                  background: memoFilter === 'unchecked'
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--destructive) 18%, var(--card)), color-mix(in srgb, var(--destructive) 6%, var(--card)))'
                    : memoFilter === 'all'
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--card)), color-mix(in srgb, var(--primary) 6%, var(--card)))'
                      : filteredMemoUnchecked > 0
                        ? 'linear-gradient(135deg, color-mix(in srgb, var(--destructive) 8%, var(--card)), var(--card))'
                        : 'linear-gradient(135deg, color-mix(in srgb, var(--foreground) 6%, var(--card)), var(--card))',
                  borderColor: memoFilter === 'unchecked'
                    ? 'var(--destructive)'
                    : memoFilter === 'all'
                      ? 'var(--primary)'
                      : filteredMemoUnchecked > 0
                        ? 'color-mix(in srgb, var(--destructive) 30%, var(--border))'
                        : 'var(--border)',
                  boxShadow: memoFilter !== 'off'
                    ? `0 0 0 1px ${memoFilter === 'unchecked' ? 'var(--destructive)' : 'var(--primary)'}, 0 4px 24px color-mix(in srgb, ${memoFilter === 'unchecked' ? 'var(--destructive)' : 'var(--primary)'} 22%, transparent)`
                    : '0 4px 16px rgba(0,0,0,0.04)',
                }}
              >
                <p
                  className="text-xs sm:text-sm flex items-center gap-1.5 mb-1.5 font-bold"
                  style={{ color: memoFilter === 'unchecked' ? 'var(--destructive)' : filteredMemoCount > 0 || memoFilter === 'all' ? 'var(--primary)' : 'var(--muted-foreground)' }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {memoFilter === 'unchecked' ? `미확인 (${filteredMemoUnchecked}건)` : `메모 (${filteredMemoCount}건)`}
                  {memoFilter !== 'off' && <span className="ml-1 text-[10px] font-bold">{memoFilter === 'unchecked' ? '미확인' : '전체'}</span>}
                </p>
                <p
                  className="font-black text-2xl sm:text-3xl leading-tight tabular-nums flex items-baseline gap-1"
                  style={{
                    color: memoFilter === 'unchecked' ? 'var(--destructive)' : filteredMemoCount > 0 || memoFilter === 'all' ? 'var(--primary)' : 'var(--muted-foreground)',
                    textShadow: memoFilter !== 'off' ? `0 0 24px color-mix(in srgb, ${memoFilter === 'unchecked' ? 'var(--destructive)' : 'var(--primary)'} 30%, transparent)` : 'none',
                  }}
                >
                  <CountNumber
                    value={memoFilter === 'unchecked' ? filteredMemoUnchecked : filteredMemoCount}
                  />
                  <span className="text-sm sm:text-base font-bold opacity-80">건</span>
                </p>
                {dateFilter !== 'all' && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    전체 미확인 {totalMemoUnchecked}건 / {totalMemoCount}건
                  </p>
                )}
              </button>
            </div>

            {/* Date filter buttons */}
            <div className="flex flex-wrap gap-2">
              {dateFilterOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setDateFilter(key); setSelectedOrders([]); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: dateFilter === key ? 'var(--primary)' : 'var(--muted)',
                    color: dateFilter === key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              ))}
              {dateFilter === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none"
                  style={{
                    background: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
              )}
              <button
                onClick={() => setShowFilterDeleteConfirm(true)}
                disabled={filteredOrders.length === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: filteredOrders.length > 0
                    ? 'color-mix(in srgb, var(--destructive) 10%, transparent)'
                    : 'var(--muted)',
                  borderColor: filteredOrders.length > 0 ? 'var(--destructive)' : 'var(--border)',
                  color: filteredOrders.length > 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {getFilterLabel()} 삭제 ({filteredOrders.length})
              </button>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--muted-foreground)' }}
              />
              <input
                type="text"
                placeholder="주문번호, 고객명, 연락처, 메모 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            {/* Select all row */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredOrders.length > 0 && selectedOrders.length === filteredOrders.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--primary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  전체 선택
                </span>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  검색 결과:{' '}
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    {filteredOrders.length}건
                  </span>
                  {selectedOrders.length > 0 && (
                    <span className="ml-1" style={{ color: 'var(--primary)' }}>
                      ({selectedOrders.length}개 선택)
                    </span>
                  )}
                </span>
              </label>
              <span className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                {formatPrice(filteredTotalSales)}원
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Order list */}
      <div className="px-2 sm:px-4 py-4">
        {isLoading && (
          <div className="flex flex-col items-center py-8">
            <RefreshCw className="w-8 h-8 animate-spin mb-2" style={{ color: 'var(--primary)' }} />
            <p style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</p>
          </div>
        )}

        {!isLoading && filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <List className="w-16 h-16 mb-4" style={{ color: 'var(--muted-foreground)', opacity: 0.3 }} />
            <p style={{ color: 'var(--muted-foreground)' }}>
              {orders.length === 0 ? '저장된 주문 내역이 없습니다' : '검색 결과가 없습니다'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredOrders.map((order) => {
              const blacklistInfo = getBlacklistInfo(order.customerName);
              const isBlacklist = blacklistInfo?.isBlacklist;
              const isSelected = selectedOrders.includes(order.orderNumber);
              const paidInfo = getPaidInfo(order.id || order.orderNumber);
              const isPaid = !!paidInfo;
              const paidMethod = isPaid ? METHOD_MAP[paidInfo.method] : null;
              const isPickerOpen = methodPickerId === (order.id || order.orderNumber);
              const isReturned = (order.totalReturned || 0) > 0;

              return (
                <div
                  key={order.orderNumber}
                  onClick={() => onViewOrder(order)}
                  className="card-interactive rounded-xl p-4 border cursor-pointer select-none relative overflow-hidden"
                  style={{
                    background: isSelected
                      ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                      : isReturned
                        ? 'color-mix(in srgb, #f59e0b 14%, var(--card))'
                        : isPaid
                          ? 'color-mix(in srgb, #10b981 10%, var(--card))'
                          : isBlacklist
                            ? 'color-mix(in srgb, var(--destructive) 6%, var(--card))'
                            : 'var(--card)',
                    borderColor: isSelected
                      ? 'var(--primary)'
                      : isReturned
                        ? '#f59e0b'
                        : isPaid
                          ? '#10b981'
                          : isBlacklist
                            ? 'var(--destructive)'
                            : 'var(--border)',
                    borderWidth: isReturned ? '2px' : '1px',
                    outline: isSelected ? '2px solid var(--primary)' : isReturned ? '1px solid rgba(245,158,11,0.5)' : isPaid ? '1px solid rgba(16,185,129,0.4)' : 'none',
                    outlineOffset: '-1px',
                    boxShadow: isReturned
                      ? '0 0 0 1px rgba(245, 158, 11, 0.35), 0 4px 14px rgba(245, 158, 11, 0.18)'
                      : isPaid
                        ? '0 0 0 1px rgba(16, 185, 129, 0.25), 0 4px 14px rgba(16, 185, 129, 0.12)'
                        : undefined,
                  }}
                >
                  {/* Top accent bar */}
                  {isReturned ? (
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }}
                    />
                  ) : isPaid ? (
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ background: 'linear-gradient(90deg,#10b981,#34d399)' }}
                    />
                  ) : isBlacklist ? (
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ background: 'var(--destructive)' }}
                    />
                  ) : null}

                  {/* Returned badge (top-right corner ribbon) */}
                  {isReturned && (
                    <div
                      className="absolute top-2 right-2 z-10 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm"
                      style={{ background: '#f59e0b', color: 'white' }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      반품
                    </div>
                  )}

                  {/* Top row: checkbox + customer name (big) + order number + price type + amount */}
                  <div className="flex items-start gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelect(order.orderNumber)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 w-5 h-5 rounded cursor-pointer flex-shrink-0"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <div className="flex-1 min-w-0">
                      {/* 업체명 (크게, 맨 위) + 도매/소비자 배지 + 블랙리스트 */}
                      {order.customerName ? (
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="flex-shrink-0 text-base">{isBlacklist ? '🚫' : '👤'}</span>
                          <span
                            className="font-bold text-base sm:text-lg break-keep leading-snug min-w-0"
                            style={{ color: isBlacklist ? 'var(--destructive)' : 'var(--foreground)' }}
                          >
                            {order.customerName}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium flex-shrink-0"
                            style={{
                              background: order.priceType === 'wholesale'
                                ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                                : 'color-mix(in srgb, var(--purple) 15%, transparent)',
                              color: order.priceType === 'wholesale' ? 'var(--primary)' : 'var(--purple)',
                            }}
                          >
                            {order.priceType === 'wholesale' ? '도매' : '소비자'}
                          </span>
                          {isBlacklist && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 font-semibold"
                              style={{
                                background: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                                color: 'var(--destructive)',
                              }}
                            >
                              블랙리스트
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            고객 미지정
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium flex-shrink-0"
                            style={{
                              background: order.priceType === 'wholesale'
                                ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                                : 'color-mix(in srgb, var(--purple) 15%, transparent)',
                              color: order.priceType === 'wholesale' ? 'var(--primary)' : 'var(--purple)',
                            }}
                          >
                            {order.priceType === 'wholesale' ? '도매' : '소비자'}
                          </span>
                        </div>
                      )}

                      {/* 완불 인라인 칩 (간섭 없음, 자동 줄바꿈) */}
                      {isPaid && (
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                          <span
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: '#10b981', color: 'white' }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            완불 {paidMethod?.emoji} {paidMethod?.label}
                          </span>
                        </div>
                      )}

                      {/* 주문번호 + 날짜 (작게) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                          {order.orderNumber}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(order.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-xl sm:text-2xl leading-tight whitespace-nowrap" style={{ color: 'var(--success)' }}>
                        {formatPrice((order.totalAmount || 0))}원
                      </p>
                      <SubPrice total={order.totalAmount || 0} layout="stacked" size="sm" className="mt-0.5" />
                    </div>
                  </div>

                  {/* Product info */}
                  <div
                    className="rounded-lg p-2 mb-3"
                    style={{ background: 'var(--muted)' }}
                  >
                    <div className="text-xs mb-1" style={{ color: 'var(--foreground)' }}>
                      {order.items.slice(0, 3).map((item, i) => (
                        <span key={i}>
                          {item.name}({item.quantity}){i < Math.min(order.items.length - 1, 2) ? ', ' : ''}
                        </span>
                      ))}
                      {order.items.length > 3 && (
                        <span style={{ color: 'var(--muted-foreground)' }}> 외 {order.items.length - 3}건</span>
                      )}
                    </div>
                    <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: 'var(--muted-foreground)' }}>
                      <span>{order.items.length}종 / {order.items.reduce((sum, item) => sum + item.quantity, 0)}개</span>
                      {(() => {
                        const discounted = order.items.filter(it => it && it.discountType && Number(it.discountValue) > 0);
                        if (discounted.length === 0) return null;
                        const totalSaved = discounted.reduce((s, it) => {
                          const base = Number(it.originalPrice) || Number(it.price) || 0;
                          const cur = Number(it.price) || 0;
                          return s + Math.max(0, (base - cur)) * (it.quantity || 1);
                        }, 0);
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}
                          >
                            🏷 할인 {discounted.length}건 (-{formatPrice(totalSaved)}원)
                          </span>
                        );
                      })()}
                    </div>
                    {/* 블랙리스트 사유만 표시 (고객명은 상단으로 이동) */}
                    {isBlacklist && blacklistInfo?.reason && (
                      <div
                        className="border-t pt-2 mt-2 text-[10px] break-words leading-snug"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                          color: 'color-mix(in srgb, var(--destructive) 70%, transparent)',
                        }}
                      >
                        ⚠️ {blacklistInfo.reason}
                      </div>
                    )}
                  </div>

                  {/* Return badge + 이력 (returnedAt 기준) */}
                  {(order.totalReturned || 0) > 0 && (() => {
                    const returnList = Array.isArray(order.returns) ? order.returns : [];
                    const returnedInFilter = isReturnedInFilter(order);
                    return (
                      <div
                        className="text-xs px-2 py-1 rounded mb-2"
                        style={{
                          background: returnedInFilter
                            ? 'color-mix(in srgb, var(--warning) 25%, transparent)'
                            : 'color-mix(in srgb, var(--warning) 15%, transparent)',
                          color: 'var(--warning)',
                          borderLeft: returnedInFilter ? '3px solid var(--warning)' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-1 font-semibold">
                          <RotateCcw className="w-3 h-3" />
                          반품 -{formatPrice((order.totalReturned || 0))}원
                          {returnedInFilter && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'var(--warning)', color: 'white' }}>
                              {dateFilter === 'today'
                                ? '오늘 반품 처리'
                                : dateFilter === 'yesterday'
                                  ? '어제 반품 처리'
                                  : dateFilter === 'custom' && customDate
                                    ? `${Number(customDate.slice(5, 7))}/${Number(customDate.slice(8, 10))} 반품 처리`
                                    : '기간 내 반품 처리'}
                            </span>
                          )}
                        </div>
                        {/* 반품 이력 (각 항목 returnedAt + 상품 + 금액) */}
                        {returnList.length > 0 && (
                          <ul className="mt-1 ml-4 space-y-0.5 text-[10px] font-normal opacity-90">
                            {returnList.map((r, i) => {
                              const rDate = r?.returnedAt ? toDateKST(r.returnedAt) : '';
                              const inFilter = filterTargetDates ? filterTargetDates.includes(rDate) : false;
                              const amt = Number(r?.total || (r?.price || 0) * (r?.quantity || 0) || 0);
                              return (
                                <li key={r?.returnId || i} className="flex items-start gap-1.5">
                                  <span className={inFilter ? 'font-bold' : ''}>
                                    {rDate || '?'}
                                  </span>
                                  <span className="flex-1 break-words leading-snug">
                                    {r?.itemName || '품목'} ×{r?.quantity || 1}
                                  </span>
                                  <span className="whitespace-nowrap tabular-nums">-{formatPrice(amt)}원</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })()}

                  {/* Memo preview with check toggle */}
                  {order.memo && (
                    <div
                      className="text-xs px-2 py-1 rounded mb-2 flex items-center gap-1"
                      style={{
                        background: order.memoChecked
                          ? 'color-mix(in srgb, var(--success, #22c55e) 10%, transparent)'
                          : 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                        color: order.memoChecked ? 'var(--success, #22c55e)' : 'var(--destructive)',
                        opacity: order.memoChecked ? 0.7 : 1,
                      }}
                    >
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      <span className={`break-words leading-snug line-clamp-2 flex-1 ${order.memoChecked ? 'line-through' : ''}`}>{order.memo}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onUpdateOrder) onUpdateOrder(order.id || order.orderNumber, { memo_checked: !order.memoChecked });
                        }}
                        className="flex-shrink-0 p-2 -m-1 rounded-lg hover:bg-black/10 active:bg-black/20 transition-colors"
                        title={order.memoChecked ? '미확인으로 변경' : '확인 완료'}
                      >
                        <CheckCircle2 className="w-5 h-5" style={{ color: order.memoChecked ? 'var(--success, #22c55e)' : 'var(--muted-foreground)' }} />
                      </button>
                    </div>
                  )}

                  {/* 완불 상세 배너 */}
                  {isPaid && (
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 mb-2 border text-[11px]"
                      style={{
                        background: 'color-mix(in srgb, #10b981 14%, transparent)',
                        borderColor: 'color-mix(in srgb, #10b981 40%, var(--border))',
                      }}
                    >
                      <span className="font-semibold flex items-center gap-1" style={{ color: '#059669' }}>
                        {paidMethod?.emoji} {paidMethod?.label} 결제
                      </span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        {formatDateTime(paidInfo.paidAt)}
                      </span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onViewOrder(order)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                      style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      상세보기
                    </button>

                    {/* 완불 체크 / 해제 */}
                    {isPaid ? (
                      <>
                        <button
                          onClick={() => setMethodPickerId(isPickerOpen ? null : (order.id || order.orderNumber))}
                          className="py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border"
                          style={{
                            borderColor: 'color-mix(in srgb, #10b981 40%, var(--border))',
                            color: '#059669',
                            background: 'color-mix(in srgb, #10b981 8%, transparent)',
                          }}
                        >
                          수단 변경
                        </button>
                        <button
                          onClick={() => clearPaid(order.id || order.orderNumber)}
                          className="py-2 px-2 rounded-lg text-xs font-medium border hover:bg-[var(--accent)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                          title="완불 해제"
                        >
                          해제
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setMethodPickerId(isPickerOpen ? null : (order.id || order.orderNumber))}
                        className="py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border transition-colors hover:bg-emerald-500/10"
                        style={{ borderColor: '#10b981', color: '#10b981' }}
                      >
                        <CircleDollarSign className="w-3.5 h-3.5" />
                        완불 체크
                      </button>
                    )}

                    {onSaveToCart && (
                      <button
                        onClick={() => onSaveToCart(order)}
                        className="py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        장바구니
                      </button>
                    )}

                    {deleteConfirm !== order.orderNumber && (
                      <button
                        onClick={() => setDeleteConfirm(order.orderNumber)}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs transition-colors"
                        style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 결제수단 선택 인라인 패널 */}
                  {isPickerOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 p-2 rounded-lg border"
                      style={{
                        background: 'color-mix(in srgb, #10b981 6%, var(--card))',
                        borderColor: 'color-mix(in srgb, #10b981 35%, var(--border))',
                      }}
                    >
                      <p className="text-[10px] mb-1.5" style={{ color: 'var(--muted-foreground)' }}>결제 수단 선택</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PAYMENT_METHODS.map((m) => {
                          const selected = paidInfo?.method === m.key;
                          return (
                            <button
                              key={m.key}
                              onClick={async () => {
                                setMethodPickerId(null);
                                const res = await setPaid(order.id || order.orderNumber, m.key, order, customers);
                                // C1: 동기화 실패 시 사용자에게 알림 (거래처 미등록 등)
                                if (res?.syncResult && res.syncResult.success === false) {
                                  const r = res.syncResult.reason;
                                  if (r === 'no_customer') {
                                    alert('완불 표시는 적용됐지만 거래처 관리/명세서에는 반영되지 않았습니다.\n해당 주문의 거래처를 먼저 [거래처 관리]에 등록해주세요.\n\n주문 고객명: ' + (res.syncResult.customerName || '(없음)'));
                                  } else if (r === 'zero_total') {
                                    // 0원 주문은 무시 — 알림 생략
                                  } else if (r === 'no_order') {
                                    alert('주문 정보를 찾을 수 없어 거래처 관리에 반영되지 않았습니다.');
                                  } else {
                                    console.warn('[완불체크] 동기화 실패:', res.syncResult);
                                  }
                                }
                              }}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors"
                              style={{
                                background: selected ? m.color : 'var(--card)',
                                color: selected ? 'white' : m.color,
                                borderColor: selected ? m.color : `color-mix(in srgb, ${m.color} 30%, var(--border))`,
                              }}
                            >
                              <span>{m.emoji}</span>
                              {m.label}
                              {selected && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Inline delete confirm */}
                  {deleteConfirm === order.orderNumber && (
                    <div className="mt-2 p-2.5 border rounded-lg" onClick={(e) => e.stopPropagation()} style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
                      <p className="text-xs mb-2" style={{ color: 'var(--destructive)' }}>정말 삭제하시겠습니까?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { onDeleteOrder(order.orderNumber); setDeleteConfirm(null); }}
                          className="flex-1 py-1.5 hover:opacity-90 text-white rounded text-xs font-medium transition-opacity"
                          style={{ background: 'var(--destructive)' }}
                        >
                          삭제
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 py-1.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded text-xs transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk delete confirm modal */}
      {showBulkDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded-2xl w-full max-w-md p-6 border shadow-2xl"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="p-3 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--destructive) 15%, transparent)' }}
              >
                <AlertTriangle className="w-6 h-6" style={{ color: 'var(--destructive)' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>선택 삭제</h3>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  {selectedOrders.length}개 주문 삭제
                </p>
              </div>
            </div>
            <p className="mb-6 text-sm" style={{ color: 'var(--foreground)' }}>
              선택한 {selectedOrders.length}개의 주문을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl font-medium transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                취소
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex-1 py-3 rounded-xl font-medium transition-colors"
                style={{ background: 'var(--destructive)', color: 'white' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter delete confirm modal */}
      {showFilterDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="rounded-2xl w-full max-w-lg p-6 border shadow-2xl"
            style={{
              background: 'var(--card)',
              borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="p-3 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--destructive) 20%, transparent)' }}
              >
                <AlertTriangle className="w-8 h-8" style={{ color: 'var(--destructive)' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>주문 일괄 삭제</h3>
                <p className="text-sm font-medium" style={{ color: 'var(--destructive)' }}>
                  {getFilterLabel()} 주문 {filteredOrders.length}건
                </p>
              </div>
            </div>
            <div
              className="rounded-xl p-4 mb-6 border"
              style={{
                background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))',
              }}
            >
              <p className="font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                다음 주문이 모두 삭제됩니다:
              </p>
              <ul className="text-sm space-y-1" style={{ color: 'var(--muted-foreground)' }}>
                <li>• 필터: <span style={{ color: 'var(--foreground)' }}>{getFilterLabel()}</span></li>
                <li>• 삭제 대상: <span className="font-bold" style={{ color: 'var(--destructive)' }}>{filteredOrders.length}건</span></li>
                <li>• 총 금액: <span style={{ color: 'var(--foreground)' }}>{formatPrice(filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0))}원</span></li>
              </ul>
              <p className="text-xs mt-3" style={{ color: 'var(--destructive)' }}>
                이 작업은 되돌릴 수 없습니다!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFilterDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl font-medium transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                취소
              </button>
              <button
                onClick={handleFilterDelete}
                className="flex-1 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                style={{ background: 'var(--destructive)', color: 'white' }}
              >
                <Trash2 className="w-5 h-5" />
                삭제 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
