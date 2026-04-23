import { useState, useEffect, lazy, Suspense } from 'react';
import {
  ArrowLeft, Menu, Building, Search, Phone, MapPin, ChevronDown, ChevronRight,
  Receipt, Copy, RotateCcw, X, Minus, Plus, Maximize2, Minimize2
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import CustomerDetailModal from '@/components/CustomerDetailModal';
import PaymentRegisterModal from '@/components/PaymentRegisterModal';
import PaymentEditModal from '@/components/PaymentEditModal';
import BulkPaymentModal from '@/components/BulkPaymentModal';
import { formatPrice, formatDate, calcExVat, handleSearchFocus } from '@/lib/utils';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import { supabase } from '@/lib/supabase';
import { CircleDollarSign } from 'lucide-react';

const PaymentsContainer = lazy(() => import('@/pages/PaymentsContainer'));

export default function CustomerList({
  customers,
  orders = [],
  onBack,
  onAddCustomer,
  onSaveCustomerReturn,
  onRefreshOrders,
  onUpdateOrder,
  showToast
}) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'payments'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => window.innerWidth < 768);
  const [detailOrder, setDetailOrder] = useState(null);
  const [blacklistFilter, setBlacklistFilter] = useState('all');
  const [outstandingFilter, setOutstandingFilter] = useState(false); // 미수 있는 업체만
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'outstanding'
  const [isReturning, setIsReturning] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', memo: '' });
  const { isFullscreen: isDetailFullscreen, toggleFullscreen: toggleDetailFullscreen } = useModalFullscreen();

  // ===== 업체별 미수 (pos-payments 통합) =====
  const [outstandingByCustomer, setOutstandingByCustomer] = useState({});
  const [paymentDetailCustomer, setPaymentDetailCustomer] = useState(null);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regPrefill, setRegPrefill] = useState({ customerId: null, recordId: null });
  const [editHistory, setEditHistory] = useState(null);
  const [bulkPay, setBulkPay] = useState(null);

  // ===== 선택 업체 주문별 결제 정보 =====
  const [paymentsByOrder, setPaymentsByOrder] = useState({}); // { orderId: { record, history[] } }
  const reloadCustomerPayments = (customerId) => {
    if (!customerId) { setPaymentsByOrder({}); return; }
    Promise.all([
      supabase.getPaymentRecords({ customerId }),
      supabase.getPaymentHistory({}),
    ]).then(([records, history]) => {
      const byOrderId = {};
      const recordIdToOrderId = {};
      for (const r of records || []) {
        if (!r.order_id) continue;
        byOrderId[String(r.order_id)] = { record: r, history: [] };
        recordIdToOrderId[String(r.id)] = String(r.order_id);
      }
      for (const h of history || []) {
        const orderId = recordIdToOrderId[String(h.payment_record_id)];
        if (orderId && byOrderId[orderId]) byOrderId[orderId].history.push(h);
      }
      setPaymentsByOrder(byOrderId);
    }).catch(() => setPaymentsByOrder({}));
  };
  useEffect(() => {
    reloadCustomerPayments(selectedCustomer?.id);
  }, [selectedCustomer?.id]);

  const reloadOutstanding = () => {
    supabase.getPaymentRecords({ hasBalance: true }).then((records) => {
      const map = {};
      for (const r of records || []) {
        if (!r.customer_id) continue;
        map[String(r.customer_id)] = (map[String(r.customer_id)] || 0) + Number(r.balance || 0);
      }
      setOutstandingByCustomer(map);
    }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    supabase.getPaymentRecords({ hasBalance: true }).then((records) => {
      if (cancelled) return;
      const map = {};
      for (const r of records || []) {
        if (!r.customer_id) continue;
        map[String(r.customer_id)] = (map[String(r.customer_id)] || 0) + Number(r.balance || 0);
      }
      setOutstandingByCustomer(map);
    }).catch(() => {/* 실패 시 미수 표시만 생략 */});
    return () => { cancelled = true; };
  }, []);

  const blacklistStats = {
    total: (customers || []).length,
    blacklist: (customers || []).filter(c => c.is_blacklist).length,
    normal: (customers || []).filter(c => !c.is_blacklist).length
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (detailOrder) {
          setDetailOrder(null);
        } else if (selectedCustomer) {
          setSelectedCustomer(null);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, selectedCustomer, detailOrder]);

  // -- Filters --

  const filteredCustomers = (customers || []).filter(c => {
    if (blacklistFilter === 'blacklist' && !c.is_blacklist) return false;
    if (blacklistFilter === 'normal' && c.is_blacklist) return false;
    if (outstandingFilter && !(outstandingByCustomer[String(c.id)] > 0)) return false;
    const search = searchTerm.toLowerCase().replace(/\s/g, '');
    const name = c.name.toLowerCase().replace(/\s/g, '');
    const address = (c.address || '').toLowerCase().replace(/\s/g, '');
    const phone = (c.phone || '').replace(/\s/g, '');
    return name.includes(search) || address.includes(search) || phone.includes(search);
  }).sort((a, b) => {
    if (sortBy === 'outstanding') {
      const ba = outstandingByCustomer[String(a.id)] || 0;
      const bb = outstandingByCustomer[String(b.id)] || 0;
      if (ba !== bb) return bb - ba; // 미수 많은 순
    }
    return (a.name || '').localeCompare(b.name || '', 'ko-KR');
  });

  // -- Order helpers --

  const getCustomerOrders = (customerName) => {
    return (orders || []).filter(order =>
      order.customerName &&
      order.customerName.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, '')
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const getCustomerTotalAmount = (customerName) => {
    const customerOrders = getCustomerOrders(customerName);
    return customerOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  };

  // -- Return handling --

  const startReturn = () => {
    if (!detailOrder) return;
    setReturnItems((detailOrder.items || []).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      returnQty: 0
    })));
    setIsReturning(true);
  };

  const saveReturn = async () => {
    if (!detailOrder || !onSaveCustomerReturn) return;
    const returnedItems = returnItems.filter(item => item.returnQty > 0);
    if (returnedItems.length === 0) {
      alert('반품할 제품을 선택하세요.');
      return;
    }

    const returnId = `RET-${Date.now()}`;
    const returnData = returnedItems.map(item => ({
      order_number: detailOrder.orderNumber,
      return_id: returnId,
      item_id: item.id,
      item_name: item.name,
      quantity: item.returnQty,
      price: item.price,
      total: item.price * item.returnQty,
      returned_at: new Date().toISOString()
    }));

    for (const data of returnData) {
      await onSaveCustomerReturn(data);
    }

    const newReturns = [
      ...(detailOrder.returns || []),
      ...returnedItems.filter(ri => ri.returnQty > 0).map(item => ({
        returnId: returnId,
        itemId: item.id,
        itemName: item.name,
        quantity: item.returnQty,
        price: item.price,
        total: item.price * item.returnQty,
        returnedAt: new Date().toISOString()
      }))
    ];
    const totalReturned = newReturns.reduce((sum, r) => sum + (r.total || r.price * r.quantity), 0);

    const updatedOrder = {
      ...detailOrder,
      returns: newReturns,
      totalReturned: totalReturned,
      updatedAt: new Date().toISOString()
    };

    setDetailOrder(updatedOrder);

    if (onUpdateOrder) {
      await onUpdateOrder(detailOrder.id || detailOrder.orderNumber, {
        returns: newReturns,
        total_returned: totalReturned
      });
    }

    setIsReturning(false);
    setReturnItems([]);

    if (showToast) showToast(`반품 처리 완료 (${returnedItems.length}건)`);
  };

  // -- Copy helpers --

  const copyOrderText = (order) => {
    const lines = [
      formatDate(order.createdAt),
      ...(order.items || []).map(item => `${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
      `총 금액: ${formatPrice(order.totalAmount)}`,
      order.memo ? `메모: ${order.memo}` : ''
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
  };

  const copyAllOrders = () => {
    const customerOrders = getCustomerOrders(selectedCustomer.name);
    const totalAmount = customerOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const allText = [
      `[ ${selectedCustomer.name} 주문 이력 ]`,
      `총 ${customerOrders.length}건 / 총 금액: ${formatPrice(totalAmount)}`,
      '',
      ...customerOrders.map((order, idx) => [
        `━━━ ${idx + 1}. ${formatDate(order.createdAt)} ━━━`,
        ...(order.items || []).map(item => `  ${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
        `  → 소계: ${formatPrice(order.totalAmount)}`,
        order.memo ? `  메모: ${order.memo}` : ''
      ].filter(Boolean)).flat()
    ].join('\n');
    navigator.clipboard.writeText(allText);
  };

  return (
    <div className="h-full bg-[var(--background)] flex flex-col">
      {/* ═══ 상단 뷰 전환 탭 ═══ */}
      <div className="px-2 sm:px-4 pt-2 flex items-center gap-1 bg-[var(--card)] border-b border-[var(--border)]">
        <button
          onClick={() => setViewMode('list')}
          className="px-3 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: viewMode === 'list' ? 'var(--primary)' : 'var(--muted-foreground)',
            borderBottom: viewMode === 'list' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          <Building className="w-4 h-4" />업체 목록
        </button>
        <button
          onClick={() => setViewMode('payments')}
          className="px-3 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: viewMode === 'payments' ? 'var(--primary)' : 'var(--muted-foreground)',
            borderBottom: viewMode === 'payments' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          <CircleDollarSign className="w-4 h-4" />페이먼트
        </button>
      </div>

      {/* 페이먼트 탭 */}
      {viewMode === 'payments' && (
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>페이먼트 로드 중...</div>}>
            <PaymentsContainer customers={customers} />
          </Suspense>
        </div>
      )}

      {/* 업체 목록 탭 (기존) */}
      {viewMode === 'list' && (
      <>
      {/* Header */}
      <header className="bg-[var(--card)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="w-full px-2 sm:px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mobile: menu button (only at list level) or back arrow (when customer selected) */}
              {selectedCustomer ? (
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                    className="md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--accent)]"
                  >
                    <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                  <button
                    onClick={onBack}
                    className="hidden md:block p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                </>
              )}
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5" style={{ color: 'var(--success)' }} />
                <div>
                  <h1 className="text-lg font-bold">
                    {selectedCustomer ? selectedCustomer.name : '거래처 목록'}
                  </h1>
                  <p className="text-[var(--muted-foreground)] text-xs">
                    {selectedCustomer
                      ? `주문 ${getCustomerOrders(selectedCustomer.name).length}건 / 총 ${formatPrice(getCustomerTotalAmount(selectedCustomer.name))}`
                      : `전체 ${customers?.length || 0}개 · 검색 ${filteredCustomers.length}개`
                    }
                  </p>
                </div>
              </div>
            </div>
            {!selectedCustomer && (
              <div className="flex items-center gap-2">
                {onAddCustomer && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-white"
                    style={{ background: 'var(--success)' }}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">거래처 등록</span>
                  </button>
                )}
                <button
                  onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                  className="p-2 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isHeaderCollapsed ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* Collapsed summary */}
          {!selectedCustomer && isHeaderCollapsed && (
            <div className="mt-2 flex items-center justify-between text-xs bg-[var(--secondary)] rounded-lg px-3 py-2">
              <span className="text-[var(--muted-foreground)]">
                거래처 <span className="font-semibold text-[var(--foreground)]">{filteredCustomers.length}개</span>
              </span>
              {searchTerm && <span className="text-[var(--primary)]">검색: {searchTerm}</span>}
            </div>
          )}
        </div>

        {/* Expandable search / filter */}
        {!selectedCustomer && (
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isHeaderCollapsed ? 'max-h-0 opacity-0' : 'max-h-[400px] opacity-100'}`}>
            <div className="px-2 sm:px-4 pt-1 pb-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={handleSearchFocus}
                  placeholder="업체명, 주소, 전화번호로 검색..."
                  className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
                />
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--muted-foreground)]">현황:</span>
                <span className="px-2 py-1 bg-[var(--secondary)] border border-[var(--border)] rounded-lg">전체 {blacklistStats.total}</span>
                <span
                  className="px-2 py-1 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--success)'
                  }}
                >정상 {blacklistStats.normal}</span>
                <span
                  className="px-2 py-1 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--destructive)'
                  }}
                >블랙리스트 {blacklistStats.blacklist}</span>
              </div>

              {/* Blacklist filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: 'all', label: '전체' },
                  { key: 'normal', label: '정상' },
                  { key: 'blacklist', label: '블랙리스트' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setBlacklistFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      blacklistFilter === key
                        ? key === 'all'
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-white'
                        : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
                    style={
                      blacklistFilter === key && key === 'blacklist'
                        ? { background: 'var(--destructive)', color: 'white' }
                        : blacklistFilter === key && key === 'normal'
                          ? { background: 'var(--success)', color: 'white' }
                          : undefined
                    }
                  >
                    {label}
                  </button>
                ))}

                {/* 미수 필터 */}
                <button
                  onClick={() => setOutstandingFilter((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    outstandingFilter
                      ? 'text-white'
                      : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                  }`}
                  style={outstandingFilter ? { background: 'var(--warning)', color: 'white', borderColor: 'var(--warning)' } : undefined}
                  title="이월 미수가 있는 업체만"
                >
                  💲 미수만
                </button>

                {/* 정렬 토글 */}
                <button
                  onClick={() => setSortBy((v) => v === 'name' ? 'outstanding' : 'name')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]"
                  title="정렬 기준 변경"
                >
                  정렬: {sortBy === 'outstanding' ? '미수 많은 순' : '이름순'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full px-2 sm:px-4 py-4">
          {selectedCustomer ? (
            /* Customer detail view */
            <>
              {/* Customer info card */}
              <div className="bg-[var(--card)] rounded-xl p-4 mb-4 border border-[var(--border)]">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 text-sm">
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                      <span className="min-w-0">{selectedCustomer.phone}</span>
                      <button onClick={() => { navigator.clipboard.writeText(selectedCustomer.phone); showToast?.('전화번호 복사됨', 'success'); }} className="p-1 rounded hover:bg-[var(--accent)] transition-colors flex-shrink-0" title="전화번호 복사">
                        <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                      <span className="text-[var(--muted-foreground)] break-keep leading-snug flex-1 min-w-0">{selectedCustomer.address}</span>
                      <button onClick={() => { navigator.clipboard.writeText(selectedCustomer.address); showToast?.('주소 복사됨', 'success'); }} className="p-1 rounded hover:bg-[var(--accent)] transition-colors flex-shrink-0" title="주소 복사">
                        <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    </div>
                  )}
                  {(selectedCustomer.phone || selectedCustomer.address) && (
                    <button
                      onClick={() => {
                        const parts = [];
                          if (selectedCustomer.name) parts.push(`업체명 : ${selectedCustomer.name}`);
                          if (selectedCustomer.phone) parts.push(`연락처 : ${selectedCustomer.phone}`);
                          if (selectedCustomer.address) parts.push(`주소지 : ${selectedCustomer.address}`);
                          const info = parts.join('\n');
                        navigator.clipboard.writeText(info);
                        showToast?.('배송 정보 복사됨', 'success');
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--accent)] flex-shrink-0"
                      style={{ color: 'var(--primary)', border: '1px solid var(--border)' }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      배송 정보 복사
                    </button>
                  )}
                </div>
                {selectedCustomer.memo && (
                  <p className="text-[var(--muted-foreground)] text-sm mt-2 pt-2 border-t border-[var(--border)]">
                    메모: {selectedCustomer.memo}
                  </p>
                )}
                {selectedCustomer.is_blacklist && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)]">
                    <StatusBadge status="blacklist" />
                    {selectedCustomer.blacklist_reason && (
                      <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>사유: {selectedCustomer.blacklist_reason}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Order stats summary */}
              {getCustomerOrders(selectedCustomer.name).length > 0 && (() => {
                const customerOrders = getCustomerOrders(selectedCustomer.name);
                const totalAmount = customerOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
                const totalReturned = customerOrders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
                const netAmount = totalAmount - totalReturned;
                const supplyAmount = calcExVat(netAmount);
                const vatAmount = netAmount - supplyAmount;
                const returnCount = customerOrders.filter(o => o.returns && o.returns.length > 0).length;
                return (
                  <div
                    className="rounded-xl p-4 mb-4 border"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                      background: 'color-mix(in srgb, var(--success) 12%, transparent)'
                    }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)' }}>
                          <Receipt className="w-5 h-5" style={{ color: 'var(--success)' }} />
                        </div>
                        <div>
                          <p className="text-[var(--muted-foreground)] text-xs">총 주문 금액</p>
                          {totalReturned > 0 ? (
                            <>
                              <p className="text-[var(--muted-foreground)] text-sm line-through">{formatPrice(totalAmount)}</p>
                              <p className="font-bold text-lg sm:text-xl" style={{ color: 'var(--success)' }}>{formatPrice(netAmount)}</p>
                            </>
                          ) : (
                            <p className="font-bold text-lg sm:text-xl" style={{ color: 'var(--success)' }}>{formatPrice(totalAmount)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">공급가액</p>
                          <p className="font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(supplyAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">부가세</p>
                          <p className="font-bold" style={{ color: 'var(--purple)' }}>{formatPrice(vatAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">주문 건수</p>
                          <p className="font-bold">{customerOrders.length}건</p>
                        </div>
                        {totalReturned > 0 && (
                          <div className="text-right">
                            <p className="text-xs" style={{ color: 'var(--warning)' }}>반품 ({returnCount}건)</p>
                            <p className="font-bold" style={{ color: 'var(--warning)' }}>-{formatPrice(totalReturned)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Order history header */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-[var(--muted-foreground)] text-sm font-medium">주문 이력</p>
                {getCustomerOrders(selectedCustomer.name).length > 0 && (
                  <button
                    onClick={copyAllOrders}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: 'var(--success)'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--success) 20%, transparent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--success) 12%, transparent)'; }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    전체 복사
                  </button>
                )}
              </div>

              {/* Order list */}
              {getCustomerOrders(selectedCustomer.name).length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="주문 이력이 없습니다"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {getCustomerOrders(selectedCustomer.name).map(order => (
                    <div
                      key={order.orderNumber}
                      onClick={() => setDetailOrder(order)}
                      className="card-interactive bg-[var(--card)] rounded-xl p-4 border cursor-pointer"
                      style={
                        order.totalReturned > 0
                          ? { borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }
                          : { borderColor: 'var(--border)' }
                      }
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = order.totalReturned > 0
                          ? 'color-mix(in srgb, var(--warning) 70%, var(--border))'
                          : 'color-mix(in srgb, var(--success) 70%, var(--border))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = order.totalReturned > 0
                          ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                          : 'var(--border)';
                      }}
                    >
                      {/* Card top: date + amount */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-sm font-medium">{formatDate(order.createdAt)}</span>
                          {order.totalReturned > 0 && (
                            <span
                              className="ml-2 px-1.5 py-0.5 text-xs rounded font-medium"
                              style={{
                                background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                                color: 'var(--warning)'
                              }}
                            >반품</span>
                          )}
                        </div>
                        <div className="text-right">
                          {order.totalReturned > 0 ? (
                            <>
                              <p className="text-[var(--muted-foreground)] text-xs line-through">{formatPrice(order.totalAmount)}</p>
                              <p className="font-bold" style={{ color: 'var(--success)' }}>{formatPrice(order.totalAmount - order.totalReturned)}</p>
                            </>
                          ) : (
                            <p className="font-bold" style={{ color: 'var(--success)' }}>{formatPrice(order.totalAmount)}</p>
                          )}
                        </div>
                      </div>

                      {/* Card middle: items */}
                      <div className="bg-[var(--secondary)] rounded-lg p-2 mb-3">
                        <div className="space-y-1">
                          {(order.items || []).slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-[var(--foreground)] flex-1 min-w-0 break-words mr-2">{item.name} x{item.quantity}</span>
                              <span className="text-[var(--muted-foreground)] flex-shrink-0">{formatPrice(item.price * item.quantity)}</span>
                            </div>
                          ))}
                          {(order.items || []).length > 3 && (
                            <p className="text-[var(--muted-foreground)] text-xs">외 {order.items.length - 3}개 상품</p>
                          )}
                        </div>
                        {/* Returns summary */}
                        {order.returns && order.returns.length > 0 && (
                          <div className="mt-2 pt-2" style={{ borderTop: '1px solid color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
                            <p className="text-xs font-medium mb-1" style={{ color: 'var(--warning)' }}>반품:</p>
                            {order.returns.slice(0, 2).map((r, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="flex-1 min-w-0 break-words mr-2" style={{ color: 'var(--warning)' }}>{r.itemName} x{r.quantity}</span>
                                <span className="flex-shrink-0" style={{ color: 'var(--warning)' }}>-{formatPrice(r.total)}</span>
                              </div>
                            ))}
                            {order.returns.length > 2 && (
                              <p className="text-xs" style={{ color: 'var(--warning)' }}>외 {order.returns.length - 2}건</p>
                            )}
                          </div>
                        )}
                        {order.memo && (
                          <p className="text-xs mt-2 pt-2 border-t border-[var(--border)] break-words leading-snug" style={{ color: 'var(--primary)' }}>{order.memo}</p>
                        )}
                      </div>

                      {/* Card: 결제 섹션 */}
                      <OrderPaymentInline
                        payment={paymentsByOrder[String(order.id)]}
                        onRegister={(e) => {
                          e.stopPropagation();
                          const pay = paymentsByOrder[String(order.id)];
                          setRegPrefill({
                            customerId: selectedCustomer.id,
                            recordId: pay?.record?.id || null,
                          });
                          setRegModalOpen(true);
                        }}
                      />

                      {/* Card bottom: copy button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyOrderText(order); }}
                        className="w-full py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        주문 복사
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Customer list */
            <>
              {filteredCustomers.length === 0 ? (
                <EmptyState
                  icon={Building}
                  title="등록된 거래처가 없습니다"
                  description="관리자 페이지에서 거래처를 추가하세요"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCustomers.map(customer => {
                    const orderCount = getCustomerOrders(customer.name).length;
                    const totalAmount = getCustomerTotalAmount(customer.name);
                    const isBlacklist = customer.is_blacklist;

                    return (
                      <div
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="card-interactive rounded-xl p-4 border cursor-pointer relative overflow-hidden"
                        style={
                          isBlacklist
                            ? {
                                background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                                borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                                borderLeftWidth: '4px',
                                borderLeftColor: 'var(--destructive)'
                              }
                            : {
                                background: 'var(--card)',
                                borderColor: 'var(--border)',
                                borderLeftWidth: '4px',
                                borderLeftColor: 'transparent'
                              }
                        }
                        onMouseEnter={(e) => {
                          if (isBlacklist) {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--destructive) 70%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'var(--destructive)';
                          } else {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--success) 70%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'color-mix(in srgb, var(--success) 70%, var(--border))';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isBlacklist) {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--destructive) 40%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'var(--destructive)';
                          } else {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.borderLeftColor = 'transparent';
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {isBlacklist && <span className="flex-shrink-0" style={{ color: 'var(--destructive)' }}>🚫</span>}
                              <h3 className="font-semibold truncate" style={isBlacklist ? { color: 'var(--destructive)' } : undefined}>
                                {customer.name}
                              </h3>
                              {isBlacklist && (
                                <StatusBadge status="blacklist" className="flex-shrink-0" />
                              )}
                              {orderCount > 0 && (
                                <span
                                  className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                                  style={{
                                    background: 'color-mix(in srgb, var(--success) 20%, transparent)',
                                    color: 'var(--success)'
                                  }}
                                >
                                  {orderCount}건
                                </span>
                              )}
                            </div>

                            {isBlacklist && customer.blacklist_reason && (
                              <p className="text-xs mb-1 break-words leading-snug" style={{ color: 'var(--destructive)' }}>{customer.blacklist_reason}</p>
                            )}

                            <div className="flex items-center gap-1.5 mt-1">
                              <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                              <span className={`text-sm ${customer.phone ? '' : 'text-[var(--muted-foreground)]'}`}>
                                {customer.phone || '전화번호 미등록'}
                              </span>
                            </div>

                            <div className="flex items-start gap-1.5 mt-1 min-w-0">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                              <span className="text-sm text-[var(--muted-foreground)] break-keep leading-snug flex-1 min-w-0">
                                {customer.address || '주소 미등록'}
                              </span>
                            </div>

                            {totalAmount > 0 && (
                              <p className="text-xs mt-2 font-medium" style={{ color: 'var(--primary)' }}>
                                총 거래: {formatPrice(totalAmount)}
                              </p>
                            )}
                            {outstandingByCustomer[String(customer.id)] > 0 && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
                                  이월 미수: {formatPrice(outstandingByCustomer[String(customer.id)])}원
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPaymentDetailCustomer(customer); }}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border"
                                  style={{
                                    background: 'color-mix(in srgb, var(--warning) 10%, var(--card))',
                                    borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                                    color: 'var(--warning)',
                                  }}
                                  title="결제 상세 보기"
                                >
                                  <CircleDollarSign className="w-3 h-3" /> 결제 상세
                                </button>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Order detail modal */}
      {detailOrder && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 animate-modal-backdrop modal-backdrop-fs-transition"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isDetailFullscreen ? '0' : '1rem' }}
          onClick={() => { if (!isReturning) { setDetailOrder(null); setIsReturning(false); setReturnItems([]); } }}
        >
          <div
            className="bg-[var(--card)] w-full h-full border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col animate-modal-up modal-fs-transition"
            style={{ maxWidth: isDetailFullscreen ? '100vw' : '42rem', maxHeight: isDetailFullscreen ? '100vh' : '90vh', borderRadius: isDetailFullscreen ? '0' : '0.75rem', boxShadow: isDetailFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="px-5 py-4 flex-shrink-0"
              style={{ background: detailOrder.totalReturned > 0 ? 'var(--warning)' : 'var(--success)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">주문 상세</h2>
                      {detailOrder.totalReturned > 0 && (
                        <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white font-medium flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> 반품
                        </span>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: detailOrder.totalReturned > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.8)' }}>
                      {formatDate(detailOrder.createdAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleDetailFullscreen}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title={isDetailFullscreen ? '원래 크기' : '전체화면'}
                >
                  {isDetailFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
                </button>
                <button
                  onClick={() => { setDetailOrder(null); setIsReturning(false); setReturnItems([]); }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Modal content */}
            <div className="p-5 overflow-y-auto flex-1">
              {/* Amount summary */}
              <div className="bg-[var(--secondary)] rounded-lg p-4 mb-4">
                <div className={`grid gap-4 text-center ${detailOrder.totalReturned > 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <div>
                    <p className="text-[var(--muted-foreground)] text-xs mb-1">총 금액</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--success)' }}>{formatPrice(detailOrder.totalAmount)}</p>
                  </div>
                  {detailOrder.totalReturned > 0 ? (
                    <div>
                      <p className="text-[var(--muted-foreground)] text-xs mb-1">반품 금액</p>
                      <p className="font-bold text-lg" style={{ color: 'var(--warning)' }}>-{formatPrice(detailOrder.totalReturned)}</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-[var(--muted-foreground)] text-xs mb-1">공급가액</p>
                        <p className="font-bold text-lg" style={{ color: 'var(--primary)' }}>{formatPrice(calcExVat(detailOrder.totalAmount))}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)] text-xs mb-1">부가세</p>
                        <p className="font-bold text-lg" style={{ color: 'var(--purple)' }}>{formatPrice(detailOrder.totalAmount - calcExVat(detailOrder.totalAmount))}</p>
                      </div>
                    </>
                  )}
                </div>
                {detailOrder.totalReturned > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--muted-foreground)] text-sm">실결제액</span>
                      <span className="text-[var(--primary)] font-bold text-xl">{formatPrice(detailOrder.totalAmount - detailOrder.totalReturned)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="mb-4">
                <p className="text-[var(--muted-foreground)] text-xs mb-2 font-medium">상품 목록 ({(detailOrder.items || []).length}종)</p>
                <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                  {(detailOrder.items || []).map((item, idx) => {
                    const returnedQty = (detailOrder.returns || []).reduce((sum, ret) => {
                      if (ret.itemId === item.id || ret.itemName === item.name) {
                        return sum + (ret.quantity || 0);
                      }
                      return sum;
                    }, 0);
                    return (
                      <div
                        key={idx}
                        className="flex justify-between items-center p-3"
                        style={returnedQty > 0 ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)' } : undefined}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{item.name}</p>
                            {returnedQty > 0 && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                                style={{
                                  background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                                  color: 'var(--warning)'
                                }}
                              >
                                반품 {returnedQty}개
                              </span>
                            )}
                          </div>
                          <p className="text-[var(--muted-foreground)] text-xs">수량: {item.quantity}개 × {formatPrice(item.price)}</p>
                        </div>
                        <p
                          className={`font-semibold ${returnedQty > 0 ? 'line-through' : ''}`}
                          style={{ color: returnedQty > 0 ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return history */}
              {detailOrder.returns && detailOrder.returns.length > 0 && (() => {
                const groupedReturns = (detailOrder.returns || []).reduce((acc, ret) => {
                  const key = ret.returnId || 'unknown';
                  if (!acc[key]) {
                    acc[key] = { returnId: key, returnedAt: ret.returnedAt, items: [], totalAmount: 0 };
                  }
                  acc[key].items.push(ret);
                  acc[key].totalAmount += ret.total || (ret.price * ret.quantity);
                  return acc;
                }, {});
                const returnGroups = Object.values(groupedReturns);

                return (
                  <div className="mb-4">
                    <p className="text-xs mb-2 font-medium flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                      <RotateCcw className="w-3 h-3" /> 반품 내역 ({returnGroups.length}건)
                    </p>
                    <div
                      className="rounded-lg divide-y"
                      style={{
                        background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        '--tw-divide-color': 'color-mix(in srgb, var(--warning) 20%, transparent)'
                      }}
                    >
                      {returnGroups.map((group, idx) => (
                        <div key={idx} className="p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs" style={{ color: 'var(--warning)' }}>{formatDate(group.returnedAt)}</span>
                            <span className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>-{formatPrice(group.totalAmount)}</span>
                          </div>
                          <div className="space-y-1">
                            {group.items.map((item, itemIdx) => (
                              <div key={itemIdx} className="flex justify-between items-center text-xs">
                                <span className="text-[var(--muted-foreground)]">{item.itemName || item.name} x{item.quantity || item.returnQuantity}</span>
                                <span style={{ color: 'var(--warning)' }}>-{formatPrice(item.total || (item.price * (item.quantity || item.returnQuantity)))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Memo */}
              {detailOrder.memo && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--primary) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--primary)' }}>메모</p>
                  <p className="text-sm">{detailOrder.memo}</p>
                </div>
              )}
            </div>

            {/* Return form */}
            {isReturning && (
              <div className="px-4 pb-3">
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <p className="text-xs font-bold mb-3 flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                    <RotateCcw className="w-3.5 h-3.5" /> 반품 수량 선택
                  </p>
                  <div className="space-y-2">
                    {returnItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-words leading-snug">{item.name}</p>
                          <p className="text-[var(--muted-foreground)] text-xs">{formatPrice(item.price)} × 주문 {item.quantity}개</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, returnQty: Math.max(0, ri.returnQty - 1) } : ri))}
                            className="w-7 h-7 border border-[var(--border)] hover:bg-[var(--accent)] rounded flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold" style={{ color: item.returnQty > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            {item.returnQty}
                          </span>
                          <button
                            onClick={() => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, returnQty: Math.min(ri.quantity, ri.returnQty + 1) } : ri))}
                            className="w-7 h-7 border border-[var(--border)] hover:bg-[var(--accent)] rounded flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {returnItems.some(ri => ri.returnQty > 0) && (
                    <div className="mt-3 pt-3 text-right" style={{ borderTop: '1px solid color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
                      <span className="font-bold text-sm" style={{ color: 'var(--warning)' }}>
                        반품 금액: -{formatPrice(returnItems.reduce((sum, ri) => sum + ri.price * ri.returnQty, 0))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal footer buttons */}
            <div className="p-4 border-t border-[var(--border)] flex-shrink-0">
              {isReturning ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsReturning(false); setReturnItems([]); }}
                    className="flex-1 py-2.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg font-medium transition-colors text-sm"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveReturn}
                    className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--warning)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    반품 확정
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const lines = [
                        `[${selectedCustomer?.name || '업체명'}]`,
                        formatDate(detailOrder.createdAt),
                        '',
                        ...(detailOrder.items || []).map(item => `${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
                        '',
                        `총 금액: ${formatPrice(detailOrder.totalAmount)}`,
                      ];
                      if (detailOrder.totalReturned > 0) {
                        lines.push(`반품: -${formatPrice(detailOrder.totalReturned)}`);
                        lines.push(`실결제액: ${formatPrice(detailOrder.totalAmount - detailOrder.totalReturned)}`);
                      } else {
                        lines.push(`공급가액: ${formatPrice(calcExVat(detailOrder.totalAmount))}`);
                      }
                      if (detailOrder.memo) lines.push(`메모: ${detailOrder.memo}`);
                      navigator.clipboard.writeText(lines.join('\n'));
                      if (showToast) showToast('복사되었습니다');
                    }}
                    className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--success)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <Copy className="w-4 h-4" />
                    주문 복사
                  </button>
                  {onSaveCustomerReturn && (
                    <button
                      onClick={startReturn}
                      className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                      style={{ background: 'var(--warning)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                    >
                      <RotateCcw className="w-4 h-4" />
                      반품 처리
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 거래처 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-modal-up" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>거래처 등록</h2>
              <button onClick={() => { setShowAddModal(false); setNewCustomer({ name: '', phone: '', address: '', memo: '' }); }} className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>업체명 <span style={{ color: 'var(--destructive)' }}>*</span></label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="업체명 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>연락처</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="연락처 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>주소</label>
                <input
                  type="text"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  placeholder="주소 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>메모</label>
                <input
                  type="text"
                  value={newCustomer.memo}
                  onChange={(e) => setNewCustomer({ ...newCustomer, memo: e.target.value })}
                  placeholder="메모 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={async () => {
                  if (!newCustomer.name.trim()) { showToast?.('업체명을 입력하세요', 'error'); return; }
                  const result = await onAddCustomer(newCustomer);
                  if (result) {
                    setShowAddModal(false);
                    setNewCustomer({ name: '', phone: '', address: '', memo: '' });
                  }
                }}
                disabled={!newCustomer.name.trim()}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--success)' }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Phase 4: 결제 상세 모달 (CustomerDetailModal + 결제 등록/수정) */}
      <CustomerDetailModal
        open={!!paymentDetailCustomer}
        customer={paymentDetailCustomer}
        onClose={() => setPaymentDetailCustomer(null)}
        onAddPayment={(cid, rid) => {
          setPaymentDetailCustomer(null);
          setRegPrefill({ customerId: cid, recordId: rid });
          setRegModalOpen(true);
        }}
        onEditHistory={(h) => {
          setPaymentDetailCustomer(null);
          setEditHistory(h);
        }}
        onBulkPay={(cust, records) => {
          setPaymentDetailCustomer(null);
          setBulkPay({ customer: cust, records });
        }}
      />

      <BulkPaymentModal
        open={!!bulkPay}
        customer={bulkPay?.customer}
        records={bulkPay?.records}
        onClose={() => setBulkPay(null)}
        onSaved={() => { setBulkPay(null); reloadOutstanding(); }}
      />

      <PaymentRegisterModal
        open={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        onSaved={() => {
          setRegModalOpen(false);
          reloadOutstanding();
          reloadCustomerPayments(selectedCustomer?.id);
        }}
        initialCustomerId={regPrefill.customerId}
        initialRecordId={regPrefill.recordId}
      />

      <PaymentEditModal
        open={!!editHistory}
        history={editHistory}
        onClose={() => setEditHistory(null)}
        onSaved={() => {
          setEditHistory(null);
          reloadOutstanding();
          reloadCustomerPayments(selectedCustomer?.id);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 주문 카드 내부 결제 섹션 (상태 + 잔금 + 최근 입금 + 버튼)
// ─────────────────────────────────────────────
function OrderPaymentInline({ payment, onRegister }) {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  const STATUS = {
    paid:    { label: '완납', bg: '#dcfce7', fg: '#15803d' },
    partial: { label: '부분', bg: '#ffedd5', fg: '#c2410c' },
    unpaid:  { label: '미수', bg: '#fee2e2', fg: '#b91c1c' },
  };

  if (!payment) {
    // 결제 레코드 없음 — 입금 등록 유도 (가벼운 미등록 배지)
    return (
      <div className="mb-2 p-2 rounded-lg flex items-center justify-between gap-2"
           style={{ background: 'var(--muted)', border: '1px dashed var(--border)' }}>
        <span className="text-[10px] text-[var(--muted-foreground)]">결제 레코드 미생성</span>
        <button
          onClick={onRegister}
          className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--primary)] text-white hover:brightness-110"
        >
          💵 입금 등록
        </button>
      </div>
    );
  }

  const { record, history } = payment;
  const s = STATUS[record.payment_status] || STATUS.unpaid;
  const balance = Number(record.balance || 0);
  const paidAmount = Number(record.paid_amount || 0);
  const recent = (history || [])[0];

  return (
    <div
      className="mb-2 p-2 rounded-lg"
      style={{ background: `${s.bg}50`, border: `1px solid ${s.bg}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: s.bg, color: s.fg }}
        >
          {s.label}
        </span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: s.fg }}>
          잔금 {fmt(balance)}원
        </span>
      </div>

      {paidAmount > 0 && (
        <div className="text-[10px] text-gray-600 flex justify-between">
          <span>입금 {history.length}건</span>
          {recent && (
            <span className="tabular-nums">
              최근 {(recent.paid_at || '').slice(5, 10)}: {fmt(recent.amount)}원
            </span>
          )}
        </div>
      )}

      <button
        onClick={onRegister}
        className="mt-1.5 w-full py-1 rounded-md text-[10px] font-bold transition-colors"
        style={{
          background: balance > 0 ? 'var(--primary)' : 'var(--secondary)',
          color: balance > 0 ? 'white' : 'var(--foreground)',
        }}
      >
        💵 {balance > 0 ? '입금 등록' : '추가 입금'}
      </button>
    </div>
  );
}
