import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Menu, Save, Search, ShoppingCart, Trash2, Check, RefreshCw,
  ChevronDown, Package, Clock, Download, FileText, Edit3, X, Plus,
  Minus, ShoppingBag, Calculator, AlertTriangle, Receipt, Maximize2, Minimize2
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatPrice, matchesSearchQuery, handleSearchFocus } from '@/lib/utils';
import QuickCalculator from './QuickCalculator';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';

export default function SavedCarts({
  savedCarts,
  onLoad,
  onDelete,
  onDeleteAll,
  onUpdate,
  onOrder,
  products = [],
  customers = [],
  onBack,
  onRefresh,
  isLoading,
  showToast
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showFilterDeleteConfirm, setShowFilterDeleteConfirm] = useState(false);
  const [detailCart, setDetailCart] = useState(null);
  const [detailIndex, setDetailIndex] = useState(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editedDetailCart, setEditedDetailCart] = useState(null);
  const [showProductSearchDetail, setShowProductSearchDetail] = useState(false);
  const [productSearchTermDetail, setProductSearchTermDetail] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calculatorInitialValue, setCalculatorInitialValue] = useState(null);
  const { isFullscreen: isDetailFullscreen, toggleFullscreen: toggleDetailFullscreen } = useModalFullscreen();

  // Keyboard nav for product search in detail modal (must be in component body, not inside renderDetailModal)
  const scFilteredProducts = products.length > 0 ? products.filter(product => {
    if (!productSearchTermDetail) return false;
    return matchesSearchQuery(product.name, productSearchTermDetail);
  }).slice(0, 8) : [];

  const scSelectProduct = useCallback((product) => {
    const cart = isEditingDetail ? (editedDetailCart || detailCart) : detailCart;
    if (!cart) return;
    const price = (cart.priceType === 'wholesale' || cart.price_type === 'wholesale') ? product.wholesale : (product.retail || product.wholesale);
    if (!cart.items.some(item => item.id === product.id)) {
      const newItems = [...cart.items, { ...product, quantity: 1, price }];
      setEditedDetailCart({ ...(editedDetailCart || detailCart), items: newItems });
    }
    setProductSearchTermDetail('');
  }, [isEditingDetail, editedDetailCart, detailCart, products]);

  const { highlightIndex: scProdHi, handleKeyDown: scProdKeyDown } = useKeyboardNav(
    scFilteredProducts, scSelectProduct, showProductSearchDetail && scFilteredProducts.length > 0
  );

  useEffect(() => {
    if (isEditingDetail && !editedDetailCart && detailCart) {
      setEditedDetailCart({ ...detailCart });
    }
  }, [isEditingDetail, editedDetailCart, detailCart]);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCalculatorModal) {
          setShowCalculatorModal(false);
          setCalculatorInitialValue(null);
        } else if (showFilterDeleteConfirm) {
          setShowFilterDeleteConfirm(false);
        } else if (showDeleteAllConfirm) {
          setShowDeleteAllConfirm(false);
        } else if (isEditingDetail) {
          setIsEditingDetail(false);
          setEditedDetailCart(null);
        } else if (detailCart) {
          setDetailCart(null);
          setDetailIndex(null);
        } else if (selectMode) {
          setSelectMode(false);
          setSelectedItems([]);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, selectMode, detailCart, showDeleteAllConfirm, showFilterDeleteConfirm, showCalculatorModal, isEditingDetail]);

  // -- Helpers --

  const isReservationCart = (cart) => {
    if (cart.status === 'reservation') return true;
    if (cart.items?.some(item => item.stock_status === 'incoming' || (item.stock === 0 && item.stock_status !== 'normal'))) {
      return true;
    }
    return false;
  };

  const getBlacklistInfo = (cartName) => {
    if (!cartName || !customers || customers.length === 0) return null;
    const customer = customers.find(c =>
      c?.name?.toLowerCase().replace(/\s/g, '') === cartName.toLowerCase().replace(/\s/g, '')
    );
    if (customer?.is_blacklist) {
      return { isBlacklist: true, reason: customer.blacklist_reason || '' };
    }
    return null;
  };

  const getDeliveryDateLabel = (deliveryDate) => {
    if (!deliveryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(deliveryDate);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((delivery - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { label: '오늘 발송', colorStyle: { color: 'var(--destructive)', fontWeight: 'bold' }, urgent: true };
    if (diffDays === 1) return { label: '내일 발송', colorStyle: { color: 'var(--warning)', fontWeight: 600 }, urgent: true };
    if (diffDays < 0) return { label: `${Math.abs(diffDays)}일 지연`, colorStyle: { color: 'var(--destructive)', fontWeight: 'bold' }, urgent: true };
    if (diffDays <= 3) return { label: `${diffDays}일 후`, colorStyle: { color: 'var(--warning)' }, urgent: false };
    return { label: new Date(deliveryDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }), colorStyle: { color: 'var(--muted-foreground)' }, urgent: false };
  };

  const getStatusStyle = (status, priority) => {
    if (priority === 'urgent' || priority === 'high') {
      return { borderColor: 'var(--destructive)', bgColor: 'color-mix(in srgb, var(--destructive) 12%, transparent)', label: '긴급' };
    }
    switch (status) {
      case 'reservation': return { borderColor: 'var(--warning)', bgColor: 'color-mix(in srgb, var(--warning) 12%, transparent)', label: '입고예약' };
      case 'scheduled': return { borderColor: 'var(--warning)', bgColor: 'color-mix(in srgb, var(--warning) 12%, transparent)', label: '예약' };
      case 'ready': return { borderColor: 'var(--primary)', bgColor: 'color-mix(in srgb, var(--primary) 12%, transparent)', label: '준비' };
      case 'hold': return { borderColor: 'var(--muted-foreground)', bgColor: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)', label: '보류' };
      case 'draft': return { borderColor: 'var(--purple)', bgColor: 'color-mix(in srgb, var(--purple) 12%, transparent)', label: '작성중' };
      default: return { borderColor: 'var(--success)', bgColor: null, label: '대기' };
    }
  };

  const filterByDate = (cart) => {
    if (isReservationCart(cart)) return true;
    if (cart.status === 'scheduled') return true;
    if (dateFilter === 'all') return true;
    if (!cart.date && !cart.created_at) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let cartDate;
    if (cart.created_at) {
      cartDate = new Date(cart.created_at);
    } else {
      const dateStr = cart.date.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, '');
      const parts = dateStr.split('-').filter(p => p);
      if (parts.length === 3) {
        cartDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
        return false;
      }
    }
    cartDate.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') return cartDate.getTime() === today.getTime();
    if (dateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return cartDate.getTime() === yesterday.getTime();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return cartDate >= weekAgo;
    }
    if (dateFilter === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return cartDate >= monthAgo;
    }
    return true;
  };

  const filterBySearch = (cart) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().replace(/\s/g, '');
    if (cart.name?.toLowerCase().replace(/\s/g, '').includes(term)) return true;
    if (cart.items?.some(item => item.name?.toLowerCase().replace(/\s/g, '').includes(term))) return true;
    if (cart.date?.includes(searchTerm)) return true;
    return false;
  };

  const filterByDelivery = (cart) => {
    if (deliveryFilter === 'all') return true;
    if (deliveryFilter === 'reservation') return isReservationCart(cart);
    if (!cart.delivery_date) return deliveryFilter === 'no_date';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delivery = new Date(cart.delivery_date);
    delivery.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((delivery - today) / (1000 * 60 * 60 * 24));

    if (deliveryFilter === 'today') return diffDays === 0;
    if (deliveryFilter === 'tomorrow') return diffDays === 1;
    if (deliveryFilter === 'this_week') return diffDays >= 0 && diffDays <= 7;
    if (deliveryFilter === 'overdue') return diffDays < 0;
    if (deliveryFilter === 'no_date') return false;
    return true;
  };

  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'today': return '오늘';
      case 'yesterday': return '어제';
      case 'week': return '이번 주';
      case 'month': return '이번 달';
      default: return '전체';
    }
  };

  // Centralized delete handler with loading state and logging
  const handleDeleteCart = async (cartId) => {
    if (!cartId) {
      console.error('[SavedCarts] handleDeleteCart called with falsy id:', cartId);
      showToast?.('삭제 실패: ID가 없습니다', 'error');
      return;
    }
    console.log('[SavedCarts] handleDeleteCart called with id:', cartId, 'type:', typeof cartId);
    setDeletingId(cartId);
    try {
      await onDelete(cartId);
      console.log('[SavedCarts] onDelete completed for id:', cartId);
    } catch (err) {
      console.error('[SavedCarts] onDelete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFilterDelete = async () => {
    for (const { cart } of filteredCartsWithIndex) {
      if (cart.id) await handleDeleteCart(cart.id);
    }
    setShowFilterDeleteConfirm(false);
  };

  const filteredCartsWithIndex = savedCarts
    .map((cart, index) => ({ cart, originalIndex: index }))
    .filter(({ cart }) => filterByDate(cart) && filterBySearch(cart) && filterByDelivery(cart))
    .sort((a, b) => {
      const aIsReservation = isReservationCart(a.cart);
      const bIsReservation = isReservationCart(b.cart);
      if (aIsReservation && !bIsReservation) return -1;
      if (!aIsReservation && bIsReservation) return 1;
      if (!a.cart.delivery_date && b.cart.delivery_date) return 1;
      if (a.cart.delivery_date && !b.cart.delivery_date) return -1;
      if (!a.cart.delivery_date && !b.cart.delivery_date) return 0;
      return new Date(a.cart.delivery_date) - new Date(b.cart.delivery_date);
    });

  const filteredCarts = filteredCartsWithIndex.map(({ cart }) => cart);
  const totalAmount = filteredCarts.reduce((sum, cart) => sum + (cart.total || 0), 0);

  const toggleSelect = (cartId) => {
    setSelectedItems(prev =>
      prev.includes(cartId) ? prev.filter(i => i !== cartId) : [...prev, cartId]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredCartsWithIndex.map(({ cart }) => cart.id);
    if (selectedItems.length === filteredIds.length && filteredIds.every(id => selectedItems.includes(id))) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredIds);
    }
  };

  const deleteSelected = async () => {
    for (const id of selectedItems) {
      await handleDeleteCart(id);
    }
    setSelectedItems([]);
    setSelectMode(false);
  };

  const handleCardClick = (cart, index, e) => {
    if (selectMode) {
      toggleSelect(cart.id);
    } else {
      if (!e.target.closest('button')) {
        setDetailCart(cart);
        setDetailIndex(index);
      }
    }
  };

  const saveEditedDetail = async () => {
    if (detailIndex !== null && editedDetailCart) {
      const newTotal = editedDetailCart.items.reduce((sum, item) => {
        let price = 0;
        if (editedDetailCart.priceType === 'wholesale' || editedDetailCart.price_type === 'wholesale') {
          price = item.wholesale || item.price || item.unitPrice || 0;
        } else {
          price = item.retail || item.wholesale || item.price || item.unitPrice || 0;
        }
        return sum + (price * item.quantity);
      }, 0);
      const updatedCart = { ...editedDetailCart, total: newTotal };
      await onUpdate(detailCart.id, updatedCart);
      setDetailCart(updatedCart);
      setIsEditingDetail(false);
      setEditedDetailCart(null);
    }
  };

  // -- Render detail modal cart --
  const renderDetailModal = () => {
    if (!detailCart) return null;
    const currentCart = isEditingDetail ? (editedDetailCart || detailCart) : detailCart;

    const currentTotal = currentCart.items.reduce((sum, item) => {
      let price = 0;
      if (currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') {
        price = item.wholesale || item.price || item.unitPrice || 0;
      } else {
        price = item.retail || item.wholesale || item.price || item.unitPrice || 0;
      }
      return sum + (price * item.quantity);
    }, 0) || currentCart.total || 0;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center animate-modal-backdrop modal-backdrop-fs-transition"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isDetailFullscreen ? '0' : '1rem' }}
        onClick={() => {
          if (!isEditingDetail) {
            setDetailCart(null);
            setDetailIndex(null);
          }
        }}
      >
        <div
          className="relative bg-[var(--card)] w-full h-full overflow-hidden border border-[var(--border)] shadow-2xl flex flex-col animate-modal-up modal-fs-transition"
          style={{ maxWidth: isDetailFullscreen ? '100vw' : '48rem', maxHeight: isDetailFullscreen ? '100vh' : '92vh', borderRadius: isDetailFullscreen ? '0' : '0.75rem', boxShadow: isDetailFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="bg-[var(--primary)] px-4 sm:px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {isEditingDetail ? (
                    <input
                      type="text"
                      value={currentCart.name}
                      onChange={(e) => setEditedDetailCart({ ...editedDetailCart, name: e.target.value })}
                      className="text-base sm:text-lg font-bold text-white bg-white/20 px-2 py-1 rounded border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                      placeholder="업체명/이름"
                    />
                  ) : (
                    <h2 className="text-base sm:text-xl font-bold text-white truncate">{currentCart.name}</h2>
                  )}
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                    style={{
                      background: (currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') ? 'var(--primary)' : 'var(--purple)',
                      color: 'white'
                    }}
                  >
                    {(currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') ? '도매' : '소비자'}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{currentCart.date} {currentCart.time}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isEditingDetail ? (
                <button
                  onClick={() => { setIsEditingDetail(true); setEditedDetailCart({ ...detailCart }); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">수정</span>
                </button>
              ) : (
                <button
                  onClick={saveEditedDetail}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors bg-white"
                  style={{ color: 'var(--primary)' }}
                >
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">저장</span>
                </button>
              )}
              <button
                onClick={toggleDetailFullscreen}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title={isDetailFullscreen ? '원래 크기' : '전체화면'}
              >
                {isDetailFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
              </button>
              <button
                onClick={() => {
                  setDetailCart(null);
                  setDetailIndex(null);
                  setIsEditingDetail(false);
                  setEditedDetailCart(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--primary)]" />
                상품 목록 ({currentCart.items.length}종 / {currentCart.items.reduce((sum, item) => sum + item.quantity, 0)}개)
              </h3>
              {isEditingDetail && (
                <button
                  onClick={() => setShowProductSearchDetail(!showProductSearchDetail)}
                  className="px-3 py-1.5 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  제품 추가
                </button>
              )}
            </div>

            {/* Product search */}
            {isEditingDetail && showProductSearchDetail && (
              <div className="mb-4 relative">
                <input
                  type="text"
                  value={productSearchTermDetail}
                  onChange={(e) => setProductSearchTermDetail(e.target.value)}
                  onFocus={handleSearchFocus}
                  onKeyDown={scProdKeyDown}
                  placeholder="제품명 검색..."
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                />
                {productSearchTermDetail && scFilteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                    {scFilteredProducts.map((product, idx) => {
                      const price = (currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') ? product.wholesale : (product.retail || product.wholesale);
                      const alreadyAdded = currentCart.items.some(item => item.id === product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => scSelectProduct(product)}
                          className="w-full px-3 py-2.5 text-left hover:bg-[var(--accent)] transition-colors border-b border-[var(--border)] last:border-0"
                          style={{ background: idx === scProdHi ? 'var(--accent)' : 'transparent' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="text-sm font-medium">{product.name}</div>
                              <div className="text-xs text-[var(--muted-foreground)]">{product.category}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm" style={{ color: 'var(--success)' }}>{formatPrice(price)}</span>
                              {alreadyAdded && <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>추가됨</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Items list */}
            <div className="space-y-3">
              {currentCart.items.map((item, idx) => {
                let itemPrice = 0;
                if (currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') {
                  itemPrice = item.wholesale || item.price || item.unitPrice || 0;
                } else {
                  itemPrice = item.retail || item.wholesale || item.price || item.unitPrice || 0;
                }
                if (itemPrice === 0 && currentCart.total && currentCart.items.length === 1) {
                  itemPrice = currentCart.total / item.quantity;
                }
                const itemTotal = itemPrice * item.quantity;
                const itemSupply = Math.round(itemPrice / 1.1);
                const itemTotalSupply = Math.round(itemTotal / 1.1);

                return (
                  <div key={idx} className="rounded-lg p-3 sm:p-4 border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--accent)] transition-all">
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{item.name}</p>
                        {itemPrice > 0 && (
                          <div className="mt-1">
                            <p className="text-sm" style={{ color: 'var(--primary)' }}>{formatPrice(itemPrice)}</p>
                            <p className="text-[var(--muted-foreground)] text-xs">(VAT제외 {formatPrice(itemSupply)})</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {isEditingDetail ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                const newItems = [...currentCart.items];
                                if (newItems[idx].quantity > 1) {
                                  newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity - 1 };
                                  setEditedDetailCart({ ...editedDetailCart, items: newItems });
                                }
                              }}
                              className="w-7 h-7 border border-[var(--border)] hover:bg-[var(--accent)] rounded flex items-center justify-center transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-semibold text-sm min-w-[2.5rem] text-center">×{item.quantity}</span>
                            <button
                              onClick={() => {
                                const newItems = [...currentCart.items];
                                newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity + 1 };
                                setEditedDetailCart({ ...editedDetailCart, items: newItems });
                              }}
                              className="w-7 h-7 bg-[var(--primary)] hover:opacity-90 text-white rounded flex items-center justify-center transition-opacity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                const newItems = currentCart.items.filter((_, i) => i !== idx);
                                setEditedDetailCart({ ...editedDetailCart, items: newItems });
                              }}
                              className="w-7 h-7 border rounded flex items-center justify-center transition-colors ml-1"
                              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-[var(--muted-foreground)] text-sm">×{item.quantity}개</p>
                        )}
                        {itemPrice > 0 ? (
                          <div className="text-right">
                            <p className="font-bold text-base" style={{ color: 'var(--success)' }}>{formatPrice(itemTotal)}</p>
                            <p className="text-[var(--muted-foreground)] text-xs">(VAT제외 {formatPrice(itemTotalSupply)})</p>
                          </div>
                        ) : (
                          <p className="text-[var(--muted-foreground)] text-xs">가격 정보 없음</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Memo display */}
            {currentCart.memo && !isEditingDetail && (
              <div className="mt-4 p-3 border rounded-lg" style={{ background: 'color-mix(in srgb, var(--info) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--info)' }}>메모</p>
                <p className="text-sm" style={{ color: 'var(--foreground)' }}>{currentCart.memo}</p>
              </div>
            )}
          </div>

          {/* Status edit section */}
          {isEditingDetail && (
            <div className="border-t border-[var(--border)] px-4 sm:px-6 py-3 flex-shrink-0 bg-[var(--secondary)]">
              <div className="space-y-3">
                <div>
                  <p className="text-[var(--muted-foreground)] text-xs mb-2">주문 상태</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'pending', label: '대기' },
                      { key: 'reservation', label: '입고예약' },
                      { key: 'scheduled', label: '예약' },
                      { key: 'ready', label: '준비' },
                      { key: 'hold', label: '보류' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setEditedDetailCart({ ...editedDetailCart, status: key })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                          (editedDetailCart?.status || currentCart.status || 'pending') === key
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--accent)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[var(--muted-foreground)] text-xs mb-1 block">배송 예정일</label>
                    <input
                      type="date"
                      value={editedDetailCart?.delivery_date || ''}
                      onChange={(e) => setEditedDetailCart({ ...editedDetailCart, delivery_date: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--muted-foreground)] text-xs mb-1 block">우선순위</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'low', label: '낮음' },
                        { key: 'normal', label: '보통' },
                        { key: 'high', label: '높음' },
                        { key: 'urgent', label: '긴급' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setEditedDetailCart({ ...editedDetailCart, priority: key })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                            (editedDetailCart?.priority || currentCart.priority || 'normal') === key
                              ? key === 'urgent' || key === 'high'
                                ? 'text-white border-[var(--destructive)]'
                                : 'bg-[var(--primary)] text-white border-[var(--primary)]'
                              : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--accent)]'
                          }`}
                          style={(editedDetailCart?.priority || currentCart.priority || 'normal') === key && (key === 'urgent' || key === 'high')
                            ? { background: 'var(--destructive)' }
                            : undefined
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[var(--muted-foreground)] text-xs mb-1 block">메모</label>
                  <input
                    type="text"
                    value={editedDetailCart?.memo || ''}
                    onChange={(e) => setEditedDetailCart({ ...editedDetailCart, memo: e.target.value })}
                    placeholder="메모 입력..."
                    className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Total + action buttons */}
          <div className="border-t border-[var(--border)] px-4 sm:px-6 py-4 flex-shrink-0 bg-[var(--card)]">
            <div
              className="bg-[var(--secondary)] rounded-lg p-4 mb-4 cursor-pointer hover:bg-[var(--accent)] transition-colors"
              onClick={() => { setCalculatorInitialValue(currentTotal); setShowCalculatorModal(true); }}
              title="계산기 열기"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[var(--muted-foreground)] text-sm">공급가액</span>
                <span className="text-sm font-medium">{formatPrice(Math.round(currentTotal / 1.1))}</span>
              </div>
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
                <span className="text-[var(--muted-foreground)] text-sm">부가세</span>
                <span className="text-sm font-medium">{formatPrice(currentTotal - Math.round(currentTotal / 1.1))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">총 금액</span>
                <span className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatPrice(currentTotal)}</span>
              </div>
            </div>

            {isEditingDetail ? (
              <div className="flex gap-3">
                <button
                  onClick={saveEditedDetail}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={() => {
                    setIsEditingDetail(false);
                    setEditedDetailCart(null);
                    setShowProductSearchDetail(false);
                    setProductSearchTermDetail('');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg font-medium transition-colors"
                >
                  <X className="w-4 h-4" />
                  취소
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => { onLoad(currentCart); onBack(); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 hover:opacity-90 text-white rounded-lg font-semibold transition-opacity"
                  style={{ background: 'var(--success)' }}
                >
                  <Download className="w-4 h-4" />
                  불러오기
                </button>
                {onOrder && (
                  <button
                    onClick={() => { onOrder(currentCart); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg font-semibold transition-opacity"
                  >
                    <FileText className="w-4 h-4" />
                    주문확인
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (detailCart?.id) {
                      const cartId = detailCart.id;
                      setDetailCart(null);
                      setDetailIndex(null);
                      await handleDeleteCart(cartId);
                    }
                  }}
                  disabled={deletingId != null}
                  className="px-4 py-2.5 border rounded-lg transition-colors disabled:opacity-50"
                  style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[var(--background)]">
      {/* Page header */}
      <header className="bg-[var(--card)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="w-full px-4 py-3">
          {/* Top row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mobile: menu button */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
                className="md:hidden p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
              {/* Desktop: back button */}
              <button
                onClick={onBack}
                className="hidden md:block p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Save className="w-5 h-5 text-[var(--primary)]" />
              <div>
                <h1 className="text-base font-bold">저장된 장바구니</h1>
                <p className="text-[var(--muted-foreground)] text-xs">전체 {savedCarts.length}개 · 필터 {filteredCarts.length}개</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {savedCarts.length > 0 && !selectMode && (
                <>
                  <button
                    onClick={() => setSelectMode(true)}
                    className="p-2 sm:px-3 sm:py-2 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors"
                    title="선택"
                  >
                    <Check className="w-4 h-4" />
                    <span className="hidden sm:inline">선택</span>
                  </button>
                  {dateFilter !== 'all' && (
                    <button
                      onClick={() => setShowFilterDeleteConfirm(true)}
                      disabled={filteredCarts.length === 0}
                      className={`p-2 sm:px-3 sm:py-2 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors border ${
                        filteredCarts.length > 0
                          ? ''
                          : 'cursor-not-allowed'
                      }`}
                      style={filteredCarts.length > 0
                        ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)', color: 'var(--warning)' }
                        : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
                      }
                      title={`${getFilterLabel()} 삭제`}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">{getFilterLabel()}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowDeleteAllConfirm(true)}
                    className="p-2 sm:px-3 sm:py-2 border rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors"
                    style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                    title="전체삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">전체삭제</span>
                  </button>
                </>
              )}

              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="p-2 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors disabled:opacity-50"
                  title="새로고침"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              )}

              <button
                onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                className="p-2 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                title={isHeaderCollapsed ? '펼치기' : '접기'}
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isHeaderCollapsed ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Select mode bar */}
          {selectMode && (
            <div className="mt-3 flex items-center justify-between border rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs px-2.5 py-1 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  {selectedItems.length === filteredCartsWithIndex.length && filteredCartsWithIndex.length > 0 ? '전체 해제' : '전체 선택'}
                </button>
                <span className="text-[var(--primary)] text-xs font-medium">{selectedItems.length}개 선택됨</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={deleteSelected}
                  disabled={selectedItems.length === 0}
                  className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium transition-colors ${
                    selectedItems.length > 0
                      ? 'hover:opacity-90'
                      : 'border cursor-not-allowed'
                  }`}
                  style={selectedItems.length > 0
                    ? { background: 'var(--destructive)', color: 'white' }
                    : { borderColor: 'var(--border)', color: 'var(--muted-foreground)' }
                  }
                >
                  <Trash2 className="w-3 h-3" />
                  삭제
                </button>
                <button
                  onClick={() => { setSelectMode(false); setSelectedItems([]); }}
                  className="text-xs px-2.5 py-1.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Collapsed summary */}
          {isHeaderCollapsed && (
            <div className="mt-2 flex items-center justify-between text-xs bg-[var(--secondary)] rounded-lg px-3 py-2">
              <span className="text-[var(--muted-foreground)]">
                {getFilterLabel()} · {filteredCarts.length}건 · <span className="font-semibold" style={{ color: 'var(--success)' }}>{formatPrice(totalAmount)}</span>
              </span>
              {searchTerm && <span className="text-[var(--primary)]">검색: {searchTerm}</span>}
            </div>
          )}
        </div>

        {/* Expandable filter + search area */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isHeaderCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
          <div className="px-4 pb-4 space-y-3">
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--secondary)] rounded-lg p-3 border border-[var(--border)]">
                <p className="text-[var(--muted-foreground)] text-xs flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" /> 총 건수
                </p>
                <p className="font-bold text-lg">{filteredCarts.length}건</p>
              </div>
              <div className="bg-[var(--secondary)] rounded-lg p-3 border border-[var(--border)]">
                <p className="text-[var(--muted-foreground)] text-xs flex items-center gap-1">
                  <Receipt className="w-3 h-3" /> 총 금액
                </p>
                <p className="font-bold text-lg" style={{ color: 'var(--success)' }}>{formatPrice(totalAmount)}</p>
              </div>
            </div>

            {/* Date filter */}
            <div>
              <p className="text-[var(--muted-foreground)] text-xs mb-2">저장 날짜</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'today', label: '오늘' },
                  { key: 'yesterday', label: '어제' },
                  { key: 'week', label: '이번 주' },
                  { key: 'month', label: '이번 달' },
                  { key: 'all', label: '전체' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setDateFilter(key); setSelectedItems([]); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      dateFilter === key
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery filter */}
            <div>
              <p className="text-[var(--muted-foreground)] text-xs mb-2">배송 예정일</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: '전체' },
                  { key: 'reservation', label: '입고예약' },
                  { key: 'overdue', label: '지연' },
                  { key: 'today', label: '오늘' },
                  { key: 'tomorrow', label: '내일' },
                  { key: 'this_week', label: '이번주' },
                  { key: 'no_date', label: '미지정' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setDeliveryFilter(key); setSelectedItems([]); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      deliveryFilter === key
                        ? ''
                        : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
                    style={deliveryFilter === key ? { background: 'var(--warning)', color: 'white' } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="이름, 상품명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={handleSearchFocus}
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="w-full px-4 py-4">
        {savedCarts.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="저장된 장바구니가 없습니다"
            description="장바구니를 저장하면 여기에 표시됩니다"
          />
        ) : filteredCartsWithIndex.length === 0 ? (
          <EmptyState
            icon={Search}
            title="검색 결과가 없습니다"
            description="다른 날짜나 검색어를 시도해보세요"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCartsWithIndex.map(({ cart, originalIndex }) => {
              const index = originalIndex;
              const cartItemsDisplay = cart.items.map(item => `${item.name}(${item.quantity})`).join(', ');
              const isReservation = cart.status === 'reservation' || isReservationCart(cart);
              const isScheduled = cart.status === 'scheduled';
              const blacklistInfo = getBlacklistInfo(cart.name);
              const isBlacklist = blacklistInfo?.isBlacklist;
              const statusStyle = getStatusStyle(cart.status, cart.priority);

              return (
                <div
                  key={cart.id || index}
                  onClick={(e) => handleCardClick(cart, index, e)}
                  className="card-interactive rounded-xl border cursor-pointer overflow-hidden border-l-4"
                  style={
                    selectMode && selectedItems.includes(cart.id)
                      ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', boxShadow: '0 0 0 2px var(--primary)' }
                      : isBlacklist
                        ? { borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)', borderLeftColor: 'var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 12%, transparent)' }
                        : isReservation
                          ? { borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)', borderLeftColor: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)' }
                          : isScheduled
                            ? { borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)', borderLeftColor: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 12%, transparent)' }
                            : { borderColor: 'var(--border)', borderLeftColor: statusStyle.borderColor, background: statusStyle.bgColor || 'var(--card)' }
                  }
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon / Checkbox */}
                      {!selectMode && isReservation && (
                        <div className="mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                          <Package className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                        </div>
                      )}
                      {!selectMode && isScheduled && !isReservation && (
                        <div className="mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                          <Clock className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                        </div>
                      )}
                      {selectMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(cart.id); }}
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                            selectedItems.includes(cart.id)
                              ? 'bg-[var(--primary)] border-[var(--primary)]'
                              : 'border-[var(--border)] hover:border-[var(--primary)]'
                          }`}
                        >
                          {selectedItems.includes(cart.id) && <Check className="w-3 h-3 text-white" />}
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        {/* Name row */}
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              {isBlacklist && <span className="flex-shrink-0" style={{ color: 'var(--destructive)' }}>🚫</span>}
                              <h3 className="font-semibold truncate" style={isBlacklist ? { color: 'var(--destructive)' } : undefined}>
                                {cart.name}
                              </h3>
                              {isBlacklist && (
                                <StatusBadge status="blacklist" className="flex-shrink-0" />
                              )}
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                                style={{
                                  background: (cart.priceType === 'wholesale' || cart.price_type === 'wholesale')
                                    ? 'color-mix(in srgb, var(--primary) 20%, transparent)'
                                    : 'color-mix(in srgb, var(--purple) 20%, transparent)',
                                  color: (cart.priceType === 'wholesale' || cart.price_type === 'wholesale')
                                    ? 'var(--primary)'
                                    : 'var(--purple)'
                                }}
                              >
                                {(cart.priceType === 'wholesale' || cart.price_type === 'wholesale') ? '도매' : '소비자'}
                              </span>
                            </div>
                            {isBlacklist && blacklistInfo?.reason && (
                              <p className="text-[10px] mb-1" style={{ color: 'var(--destructive)' }}>사유: {blacklistInfo.reason}</p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge
                                status={cart.priority === 'urgent' || cart.priority === 'high' ? 'urgent' : (cart.status || 'pending')}
                              />
                              {cart.delivery_date && (() => {
                                const dateInfo = getDeliveryDateLabel(cart.delivery_date);
                                return dateInfo && (
                                  <span className="text-[10px] font-medium" style={dateInfo.colorStyle}>
                                    {dateInfo.label}
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-[var(--muted-foreground)] text-xs mt-1">{cart.date} {cart.time}</p>
                          </div>
                          <p className="font-bold text-sm ml-2 flex-shrink-0" style={{ color: 'var(--success)' }}>{formatPrice(cart.total)}</p>
                        </div>

                        {/* Items summary */}
                        <div className="bg-[var(--secondary)] rounded-lg p-2 mb-3">
                          <p className="text-[var(--muted-foreground)] text-xs truncate">{cartItemsDisplay}</p>
                          <p className="text-[var(--muted-foreground)] text-xs mt-0.5">
                            {cart.items.length}종 / {cart.items.reduce((sum, item) => sum + item.quantity, 0)}개
                          </p>
                          {cart.memo && (
                            <p className="text-xs mt-1.5 border-t border-[var(--border)] pt-1.5 truncate" style={{ color: 'var(--info)' }}>
                              {cart.memo}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!selectMode && (
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); onLoad(cart); onBack(); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 hover:opacity-90 text-white rounded-lg text-xs font-medium transition-opacity"
                              style={{ background: 'var(--success)' }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              불러오기
                            </button>
                            {onOrder && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onOrder(cart); }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg text-xs font-medium transition-opacity"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                주문확인
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(index); }}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs transition-colors"
                              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Inline delete confirm */}
                        {deleteConfirm === index && !selectMode && (
                          <div className="mt-2 p-2.5 border rounded-lg" style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
                            <p className="text-xs mb-2" style={{ color: 'var(--destructive)' }}>정말 삭제하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={async (e) => { e.stopPropagation(); setDeleteConfirm(null); await handleDeleteCart(cart.id); }}
                                disabled={deletingId === cart.id}
                                className="flex-1 py-1.5 hover:opacity-90 text-white rounded text-xs font-medium transition-opacity disabled:opacity-50"
                                style={{ background: 'var(--destructive)' }}
                              >
                                {deletingId === cart.id ? '삭제중...' : '삭제'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                className="flex-1 py-1.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded text-xs transition-colors"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating calculator button */}
      {!detailCart && (
        <button
          onClick={() => { setCalculatorInitialValue(null); setShowCalculatorModal(true); }}
          className="fixed bottom-6 right-4 z-40 w-12 h-12 hover:opacity-90 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-all"
          style={{ background: 'var(--warning)' }}
          title="계산기"
        >
          <Calculator className="w-5 h-5" />
        </button>
      )}

      {/* Detail modal */}
      {renderDetailModal()}

      {/* Delete all confirm */}
      <ConfirmDialog
        isOpen={showDeleteAllConfirm}
        title="전체 삭제"
        message={`모든 저장된 장바구니(${savedCarts.length}개)를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="전체 삭제"
        onConfirm={() => { onDeleteAll(); setShowDeleteAllConfirm(false); }}
        onCancel={() => setShowDeleteAllConfirm(false)}
        destructive
      />

      {/* Quick Calculator */}
      {showCalculatorModal && (
        <QuickCalculator
          onClose={() => { setShowCalculatorModal(false); setCalculatorInitialValue(null); }}
          initialValue={calculatorInitialValue}
        />
      )}

      {/* Filter delete confirm */}
      {showFilterDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-modal-backdrop" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-[var(--card)] rounded-xl w-full max-w-md border border-[var(--border)] shadow-xl overflow-hidden animate-modal-up">
            <div className="px-5 py-4" style={{ background: 'var(--warning)' }}>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-white flex-shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-white">장바구니 일괄 삭제</h2>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{getFilterLabel()} 장바구니 {filteredCarts.length}개</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="border rounded-lg p-3 mb-4 text-sm" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                <p className="font-medium mb-1">다음 장바구니가 모두 삭제됩니다:</p>
                <ul className="text-[var(--muted-foreground)] space-y-0.5 text-xs">
                  <li>필터: <span className="font-medium text-[var(--foreground)]">{getFilterLabel()}</span></li>
                  <li>삭제 대상: <span className="font-bold" style={{ color: 'var(--warning)' }}>{filteredCarts.length}개</span></li>
                  <li>총 금액: <span className="font-medium">{formatPrice(filteredCarts.reduce((sum, c) => sum + (c.total || 0), 0))}</span></li>
                </ul>
                <p className="text-xs mt-2" style={{ color: 'var(--warning)' }}>이 작업은 되돌릴 수 없습니다.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilterDeleteConfirm(false)}
                  className="flex-1 py-2.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg text-sm font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleFilterDelete}
                  className="flex-1 py-2.5 hover:opacity-90 text-white rounded-lg text-sm font-medium transition-opacity flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--warning)' }}
                >
                  <Trash2 className="w-4 h-4" />
                  삭제 실행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
