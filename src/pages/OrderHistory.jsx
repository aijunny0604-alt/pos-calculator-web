import { useState, useEffect } from 'react';
import {
  ChevronLeft, Search, List, RefreshCw, Trash2, Eye, ShoppingCart,
  Calendar, FileText, Calculator, Receipt, RotateCcw, AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { formatPrice, calcExVat, formatDateTime } from '@/lib/utils';

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
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showFilterDeleteConfirm, setShowFilterDeleteConfirm] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

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

  // Date filter function
  const filterByDate = (order) => {
    if (dateFilter === 'all') return true;
    const orderDate = new Date(order.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') {
      const orderDay = new Date(orderDate);
      orderDay.setHours(0, 0, 0, 0);
      return orderDay.getTime() === today.getTime();
    }
    if (dateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const orderDay = new Date(orderDate);
      orderDay.setHours(0, 0, 0, 0);
      return orderDay.getTime() === yesterday.getTime();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return orderDate >= weekAgo;
    }
    if (dateFilter === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return orderDate >= monthAgo;
    }
    if (dateFilter === 'custom' && customDate) {
      const selectedDate = new Date(customDate);
      const orderDay = new Date(orderDate);
      return (
        orderDay.getFullYear() === selectedDate.getFullYear() &&
        orderDay.getMonth() === selectedDate.getMonth() &&
        orderDay.getDate() === selectedDate.getDate()
      );
    }
    return true;
  };

  const filteredOrders = orders
    .filter(filterByDate)
    .filter(order => {
      const search = searchTerm.toLowerCase().replace(/\s/g, '');
      if (!search) return true;
      const orderNum = order.orderNumber.toLowerCase().replace(/\s/g, '');
      const customerName = (order.customerName || '').toLowerCase().replace(/\s/g, '');
      const customerPhone = (order.customerPhone || '').replace(/\s/g, '');
      return orderNum.includes(search) || customerName.includes(search) || customerPhone.includes(search);
    });

  // Stats
  const filteredTotalSales = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const filteredTotalReturned = filteredOrders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
  const filteredReturnCount = filteredOrders.filter(o => o.totalReturned > 0).length;
  const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalReturned = orders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
  const totalReturnCount = orders.filter(o => o.totalReturned > 0).length;

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.orderNumber));
    }
  };

  const handleSelect = (orderNumber) => {
    setSelectedOrders(prev =>
      prev.includes(orderNumber)
        ? prev.filter(o => o !== orderNumber)
        : [...prev, orderNumber]
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
    const orderNumbersToDelete = filteredOrders.map(o => o.orderNumber);
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
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--accent)]"
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
        </div>

        {/* Expandable section */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isHeaderCollapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
          }`}
        >
          <div className="px-4 pb-4 space-y-3">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <div
                className="rounded-lg p-3 border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  <FileText className="w-3 h-3" />
                  {dateFilter === 'all' ? '총 주문' : '조회 주문'}
                </p>
                <p className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
                  {filteredOrders.length}건
                </p>
                {dateFilter !== 'all' && (
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {orders.length}건
                  </p>
                )}
              </div>

              <div
                className="rounded-lg p-3 border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  <Calculator className="w-3 h-3" />
                  {dateFilter === 'all' ? '총 매출' : '조회 매출'}
                </p>
                <p className="font-bold text-lg" style={{ color: 'var(--success)' }}>
                  {formatPrice(filteredTotalSales - filteredTotalReturned)}원
                </p>
                {filteredTotalReturned > 0 && (
                  <p className="text-[10px] line-through" style={{ color: 'var(--muted-foreground)' }}>
                    {formatPrice(filteredTotalSales)}원
                  </p>
                )}
                {dateFilter !== 'all' && (
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {formatPrice(totalSales - totalReturned)}원
                  </p>
                )}
              </div>

              <div
                className="rounded-lg p-3 border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  <Receipt className="w-3 h-3" />
                  공급가액
                </p>
                <p className="font-bold text-lg" style={{ color: 'var(--primary)' }}>
                  {formatPrice(calcExVat(filteredTotalSales - filteredTotalReturned))}원
                </p>
              </div>

              <div
                className="rounded-lg p-3 border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs flex items-center gap-1 mb-1" style={{ color: 'var(--muted-foreground)' }}>
                  <Receipt className="w-3 h-3" />
                  부가세
                </p>
                <p className="font-bold text-lg" style={{ color: '#a855f7' }}>
                  {formatPrice(
                    (filteredTotalSales - filteredTotalReturned) -
                    calcExVat(filteredTotalSales - filteredTotalReturned)
                  )}원
                </p>
              </div>

              <div
                className="rounded-lg p-3 border"
                style={{
                  background: filteredTotalReturned > 0
                    ? 'color-mix(in srgb, var(--warning) 10%, var(--card))'
                    : 'var(--card)',
                  borderColor: filteredTotalReturned > 0
                    ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                    : 'var(--border)',
                }}
              >
                <p
                  className="text-xs flex items-center gap-1 mb-1"
                  style={{ color: filteredTotalReturned > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}
                >
                  <RotateCcw className="w-3 h-3" />
                  반품 ({filteredReturnCount}건)
                </p>
                <p
                  className="font-bold text-lg"
                  style={{ color: filteredTotalReturned > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}
                >
                  {filteredTotalReturned > 0 ? `-${formatPrice(filteredTotalReturned)}원` : '0원'}
                </p>
                {dateFilter !== 'all' && (
                  <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {totalReturned > 0 ? `-${formatPrice(totalReturned)}원` : '0원'} ({totalReturnCount}건)
                  </p>
                )}
              </div>
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
                placeholder="주문번호, 고객명, 연락처 검색..."
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
      <div className="px-4 py-4">
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

              return (
                <div
                  key={order.orderNumber}
                  onClick={() => onViewOrder(order)}
                  className="rounded-xl p-4 border transition-all duration-200 cursor-pointer select-none relative overflow-hidden hover:shadow-md"
                  style={{
                    background: isSelected
                      ? 'color-mix(in srgb, var(--primary) 8%, var(--card))'
                      : isBlacklist
                        ? 'color-mix(in srgb, var(--destructive) 6%, var(--card))'
                        : 'var(--card)',
                    borderColor: isSelected
                      ? 'var(--primary)'
                      : isBlacklist
                        ? 'var(--destructive)'
                        : 'var(--border)',
                    outline: isSelected ? '2px solid var(--primary)' : 'none',
                    outlineOffset: '-1px',
                  }}
                >
                  {/* Blacklist top accent bar */}
                  {isBlacklist && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ background: 'var(--destructive)' }}
                    />
                  )}

                  {/* Top row: checkbox + order number + price type + amount */}
                  <div className="flex items-start gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelect(order.orderNumber)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-5 h-5 rounded cursor-pointer flex-shrink-0"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                          {order.orderNumber}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium flex-shrink-0"
                          style={{
                            background: order.priceType === 'wholesale'
                              ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                              : 'color-mix(in srgb, #a855f7 15%, transparent)',
                            color: order.priceType === 'wholesale' ? 'var(--primary)' : '#a855f7',
                          }}
                        >
                          {order.priceType === 'wholesale' ? '도매' : '소비자'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        <Calendar className="w-3 h-3" />
                        {formatDateTime(order.createdAt)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm" style={{ color: 'var(--success)' }}>
                        {formatPrice(order.totalAmount)}원
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        공급가 {formatPrice(calcExVat(order.totalAmount))}원
                      </p>
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
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {order.items.length}종 / {order.items.reduce((sum, item) => sum + item.quantity, 0)}개
                    </div>
                    {order.customerName && (
                      <div
                        className="border-t pt-2 mt-2"
                        style={{ borderColor: isBlacklist ? 'color-mix(in srgb, var(--destructive) 40%, var(--border))' : 'var(--border)' }}
                      >
                        <div
                          className="flex items-center gap-1.5 text-sm font-semibold"
                          style={{ color: isBlacklist ? 'var(--destructive)' : 'var(--primary)' }}
                        >
                          {isBlacklist ? '🚫' : '👤'} {order.customerName}
                          {isBlacklist && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] ml-1"
                              style={{
                                background: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                                color: 'var(--destructive)',
                              }}
                            >
                              블랙리스트
                            </span>
                          )}
                        </div>
                        {isBlacklist && blacklistInfo?.reason && (
                          <div className="text-[10px] mt-1 pl-4" style={{ color: 'color-mix(in srgb, var(--destructive) 70%, transparent)' }}>
                            {blacklistInfo.reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Return badge if applicable */}
                  {order.totalReturned > 0 && (
                    <div
                      className="text-xs px-2 py-1 rounded mb-2 flex items-center gap-1"
                      style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      반품 -{formatPrice(order.totalReturned)}원
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onViewOrder(order)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                      style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      상세보기
                    </button>

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

                    {deleteConfirm === order.orderNumber ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            onDeleteOrder(order.orderNumber);
                            setDeleteConfirm(null);
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'var(--destructive)', color: 'white' }}
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--accent)] border"
                          style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(order.orderNumber)}
                        className="px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors border"
                        style={{
                          background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                          color: 'var(--destructive)',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        삭제
                      </button>
                    )}
                  </div>
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
            className="rounded-2xl w-full max-w-sm p-6 border shadow-2xl"
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
            className="rounded-2xl w-full max-w-md p-6 border shadow-2xl"
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
                <li>• 총 금액: <span style={{ color: 'var(--foreground)' }}>{formatPrice(filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0))}원</span></li>
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
