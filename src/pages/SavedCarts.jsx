import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Menu, Save, Search, ShoppingCart, Trash2, Check, RefreshCw,
  ChevronDown, ChevronUp, Package, Clock, Download, FileText, Edit3, X, Plus,
  Minus, ShoppingBag, Calculator, AlertTriangle, Receipt, Maximize2, Minimize2, Copy, Percent, Tag, Share2
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import SubPrice from '@/components/ui/SubPrice';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import QuickItemBar from '@/components/ui/QuickItemBar';
import { formatPrice, matchesSearchQuery, handleSearchFocus, getTodayKST, toDateKST, offsetDateKST, offsetMonthKST, calcExVat, calcOrderVat, formatDate } from '@/lib/utils';
import { calcFinalPrice, convertDiscountValue, discountLabel as fmtDiscountLabel, discountPlaceholder } from '@/lib/discount';
import QuickCalculator from './QuickCalculator';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import useDraggableResizable from '@/hooks/useDraggableResizable';

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
  const [copied, setCopied] = useState(false);
  const [pendingDetailDelete, setPendingDetailDelete] = useState(null);

  const generateCartOrderText = (cart) => {
    if (!cart) return '';
    const priceType = cart.priceType || cart.price_type || 'wholesale';
    const total = cart.total || cart.items?.reduce((sum, item) => {
      // 저장 카트 item은 wholesale/retail 없이 price만 있는 경우가 많음(주문이력 복사 등) → price 폴백 필수 (0원 버그 방지)
      const price = priceType === 'wholesale' ? (item.wholesale || item.price || item.retail || 0) : (item.retail || item.price || item.wholesale || 0);
      return sum + price * (item.quantity || 1);
    }, 0) || 0;
    // 비과세(택배비/퀵비 등)는 전액이 공급가액 — 품목 단위로 계산 (2026-07-15)
    const _vb = calcOrderVat(cart.items || [], {
      priceOf: (item) => {
        const price = priceType === 'wholesale' ? (item.wholesale || item.price || item.retail || 0) : (item.retail || item.price || item.wholesale || 0);
        return price * (item.quantity || 1);
      },
    });
    const exVat = _vb.supply;
    const vat = _vb.vat;
    const totalQty = cart.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;

    let text = `[ 주문서 ]\n\n`;
    if (cart.name) text += `고객명: ${cart.name}\n`;
    text += `단가기준: ${priceType === 'wholesale' ? '도매가 (부가세 포함)' : '소비자가 (부가세 포함)'}\n\n`;
    text += `[ 상품 목록 ]\n\n`;
    (cart.items || []).forEach((item, index) => {
      // 저장 카트 item은 wholesale/retail 없이 price만 있는 경우가 많음(주문이력 복사 등) → price 폴백 필수 (0원 버그 방지)
      const price = priceType === 'wholesale' ? (item.wholesale || item.price || item.retail || 0) : (item.retail || item.price || item.wholesale || 0);
      text += `${index + 1}. ${item.name}\n`;
      text += `   ${formatPrice(price)}원 × ${item.quantity || 1}개 = ${formatPrice(price * (item.quantity || 1))}원\n\n`;
    });
    text += `[ 결제 정보 ]\n\n`;
    text += `총 수량: ${totalQty}개\n`;
    text += `공급가액: ${formatPrice(exVat)}원\n`;
    text += `부가세: ${formatPrice(vat)}원\n`;
    text += `총 금액: ${formatPrice(total)}원\n\n`;
    if (cart.memo) text += `메모: ${cart.memo}\n\n`;
    text += `입금 계좌: 신한은행 010-5858-6046 무브모터스\n\n`;
    text += `※ 입금 확인 후 빠른 출고로 보답하겠습니다.\n`;
    return text;
  };

  const handleCopyCart = async (cart) => {
    try {
      const target = cart || editedDetailCart || detailCart;
      await navigator.clipboard.writeText(generateCartOrderText(target));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (showToast) showToast('견적서가 복사되었습니다', 'success');
    } catch (err) {
      if (showToast) showToast('복사 실패', 'error');
    }
  };

  const handleShareCart = async (cart) => {
    const target = cart || editedDetailCart || detailCart;
    const text = generateCartOrderText(target);
    if (navigator.share) {
      try {
        await navigator.share({ title: `주문서 — ${target?.name || '주문'}`, text });
      } catch (e) {
        if (e.name !== 'AbortError') handleCopyCart(cart);
      }
    } else {
      handleCopyCart(cart);
    }
  };
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editedDetailCart, setEditedDetailCart] = useState(null);
  const [showProductSearchDetail, setShowProductSearchDetail] = useState(false);
  const [productSearchTermDetail, setProductSearchTermDetail] = useState('');
  const detailSearchRef = useRef(null); // [제품 추가] 누르면 바로 타이핑되게 포커스
  // 라인별 제품 교체 (잘못 주문한 제품 바로잡기) — 펼친 라인 idx + 검색어
  const [replaceLineIdx, setReplaceLineIdx] = useState(null);
  const [replaceSearchTerm, setReplaceSearchTerm] = useState('');
  // 카드별 할인 영역 펼침 상태 (idx Set) — 카트 전환/모달 닫힘 시 useEffect로 자동 리셋
  const [openDiscountIdxs, setOpenDiscountIdxs] = useState(() => new Set());
  const toggleDiscountOpen = (idx) => {
    setOpenDiscountIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customDate, setCustomDate] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => window.innerWidth < 768);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calculatorInitialValue, setCalculatorInitialValue] = useState(null);
  const {
    maximized: isDetailFullscreen,
    toggleMaximized: toggleDetailFullscreen,
    isDesktop: isDetailDraggable,
    containerStyle: detailDragStyle,
    dragHandleProps: detailDragHandle,
    handles: detailResizeHandles,
    reset: resetDetailModalPos,
  // ⚠️ 크기가 localStorage에 저장되므로 기본값만 바꾸면 기존 저장값(1200×820)이 그대로 남는다.
  //    더 크게 열리게 하려면 키를 올려서 새 기본값을 태워야 함. (2026-07-15 v2: 1200×820 → 1520×940)
  } = useDraggableResizable('pos-web.savedCartDetailModal.v2', { w: 1520, h: 940 });
  const [isBottomExpanded, setIsBottomExpanded] = useState(false); // 기본 접힘 (총금액·액션버튼은 항상 노출, 공급가/부가세만 접힘) — 사장님 요청 2026-06-09

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

  // 라인 제품 교체 — 수량은 유지하고 제품만 다른 것으로 교체 (단가/할인 메타 초기화)
  const replaceFilteredProducts = products.length > 0 && replaceSearchTerm
    ? products.filter(p => matchesSearchQuery(p.name, replaceSearchTerm)).slice(0, 8)
    : [];
  const replaceLineProduct = useCallback((idx, product) => {
    const cart = editedDetailCart || detailCart;
    if (!cart) return;
    // 다른 줄에 이미 같은 제품이 있으면 교체 차단 (중복 id 방지 — add 경로와 동일 정책)
    if (cart.items.some((it, i) => i !== idx && it.id === product.id)) {
      showToast?.('이미 다른 줄에 등록된 제품입니다. 수량을 조정하세요.', 'error');
      return;
    }
    const isWholesale = cart.priceType === 'wholesale' || cart.price_type === 'wholesale';
    const price = isWholesale ? (product.wholesale || product.price || 0) : (product.retail || product.wholesale || product.price || 0);
    const newItems = cart.items.map((it, i) => i === idx ? {
      ...product,
      quantity: it.quantity || 1,        // 수량 유지
      price,
      wholesale: product.wholesale,
      retail: product.retail,
      // 할인 메타 초기화 (다른 제품이므로)
      originalPrice: undefined,
      discountType: undefined,
      discountValue: undefined,
    } : it);
    setEditedDetailCart({ ...cart, items: newItems });
    setReplaceLineIdx(null);
    setReplaceSearchTerm('');
  }, [editedDetailCart, detailCart]);

  useEffect(() => {
    if (isEditingDetail && !editedDetailCart && detailCart) {
      setEditedDetailCart({ ...detailCart });
    }
  }, [isEditingDetail, editedDetailCart, detailCart]);

  // 카트 전환 또는 편집 모드 종료 시 할인 펼침 + 제품 교체 상태 자동 정리 (M2)
  useEffect(() => {
    setOpenDiscountIdxs(new Set());
    setReplaceLineIdx(null);
    setReplaceSearchTerm('');
  }, [detailCart?.id, isEditingDetail]);

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
    const todayKST = getTodayKST();
    const todayMs = new Date(todayKST + 'T00:00:00Z').getTime();
    const deliveryKST = toDateKST(deliveryDate);
    const deliveryMs = new Date(deliveryKST + 'T00:00:00Z').getTime();
    const diffDays = Math.floor((deliveryMs - todayMs) / (1000 * 60 * 60 * 24));

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

    const todayKST = getTodayKST();
    let cartDateKST;
    if (cart.created_at) {
      cartDateKST = toDateKST(cart.created_at);
    } else {
      const dateStr = cart.date.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, '');
      const parts = dateStr.split('-').filter(p => p);
      if (parts.length === 3) {
        cartDateKST = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
      } else {
        return false;
      }
    }

    if (dateFilter === 'today') return cartDateKST === todayKST;
    if (dateFilter === 'yesterday') {
      return cartDateKST === offsetDateKST(todayKST, -1);
    }
    if (dateFilter === 'week') {
      return cartDateKST >= offsetDateKST(todayKST, -7);
    }
    if (dateFilter === 'month') {
      return cartDateKST >= offsetMonthKST(todayKST, -1);
    }
    if (dateFilter === 'custom' && customDate) {
      return cartDateKST === customDate;
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
      case 'custom': return customDate || '날짜 선택';
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
    setDeletingId(cartId);
    try {
      await onDelete(cartId);
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
          className="relative bg-[var(--card)] w-full overflow-hidden border border-[var(--border)] shadow-2xl flex flex-col animate-modal-up modal-fs-transition"
          style={{
            maxWidth: isDetailFullscreen ? '100vw' : 'min(95rem, calc(100vw - 2rem))',
            height: isDetailFullscreen ? '100vh' : 'auto',
            maxHeight: isDetailFullscreen ? '100vh' : 'calc(100vh - 2rem)',
            borderRadius: isDetailFullscreen ? '0' : '1rem',
            boxShadow: isDetailFullscreen ? '0 0 0 1px var(--border)' : '0 32px 64px -12px rgba(0,0,0,0.45)',
            ...(isDetailDraggable ? detailDragStyle : {}),
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 리사이즈 핸들 (데스크톱 전용) */}
          {detailResizeHandles}
          {/* Modal header */}
          <div
            {...detailDragHandle}
            className="px-3 sm:px-6 py-3.5 sm:py-5 flex items-center justify-between gap-2 flex-shrink-0"
            style={{
              // 단색 대신 은은한 그라데이션 — 평평한 파란 띠보다 깊이감
              background: 'linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 78%, #6d28d9) 100%)',
              ...(detailDragHandle.style || {}),
            }}
            onDoubleClick={isDetailDraggable ? toggleDetailFullscreen : undefined}
            title={isDetailDraggable ? '드래그해서 이동 · 더블클릭 = 전체화면 · 가장자리 드래그 = 크기 변경' : undefined}
          >
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/25">
                <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                  {isEditingDetail ? (
                    <input
                      type="text"
                      value={currentCart.name}
                      onChange={(e) => setEditedDetailCart({ ...editedDetailCart, name: e.target.value })}
                      className="flex-1 min-w-0 text-base sm:text-lg font-bold text-white bg-white/20 px-2 py-1 rounded border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                      placeholder="업체명/이름"
                    />
                  ) : (
                    <h2 className="text-lg sm:text-2xl font-black text-white break-keep leading-snug min-w-0 truncate tracking-tight">{currentCart.name}</h2>
                  )}
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold flex-shrink-0 border border-white/20"
                    style={{
                      background: (currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') ? 'rgba(255,255,255,0.25)' : 'rgba(168,85,247,0.7)',
                      color: 'white'
                    }}
                  >
                    {(currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale') ? '도매' : '소비자'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs mt-0.5 break-keep" style={{ color: 'rgba(255,255,255,0.75)' }}>{currentCart.date} {currentCart.time}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isEditingDetail ? (
                <button
                  onClick={() => { setIsEditingDetail(true); setEditedDetailCart({ ...detailCart }); }}
                  className="px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                  aria-label="수정"
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">수정</span>
                </button>
              ) : (
                // 편집 중엔 헤더에 저장 버튼을 두지 않는다 — 푸터에 큰 [저장]이 이미 있어서
                // 같은 동작 버튼이 두 개면 "뭘 눌러야 하지?"가 된다 (2026-07-15 어수선함 정리)
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  편집 중
                </span>
              )}
              <button
                onClick={toggleDetailFullscreen}
                className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors"
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
                className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 modal-scroll-area"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-[var(--primary)]" />
                상품 목록
                <span className="text-sm font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {currentCart.items.length}종 / {currentCart.items.reduce((sum, item) => sum + item.quantity, 0)}개
                </span>
              </h3>
              {/* 보기 모드에서도 노출 — [수정] 먼저 누르고 다시 [제품 추가] 누르던 2단계를 1클릭으로.
                  보기 모드에서 누르면 편집 모드 진입 + 검색창 열기 + 포커스까지 한 번에. (2026-07-15) */}
              <button
                onClick={() => {
                  if (!isEditingDetail) setIsEditingDetail(true);
                  setShowProductSearchDetail(true);
                  setTimeout(() => detailSearchRef.current?.focus(), 60);
                }}
                className="px-3.5 py-2 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                제품 추가
              </button>
            </div>

            {/* QuickItemBar — 택배비/퀵비/수수료 등 즉석 추가 (편집 모드 전용) */}
            {isEditingDetail && (
              <div className="mb-4">
                <QuickItemBar
                  onAddLine={(line) => {
                    setEditedDetailCart({
                      ...editedDetailCart,
                      items: [...(editedDetailCart?.items || currentCart.items), line],
                    });
                  }}
                />
              </div>
            )}

            {/* Product search */}
            {isEditingDetail && showProductSearchDetail && (
              <div className="mb-4 relative">
                <input
                  ref={detailSearchRef}
                  type="text"
                  value={productSearchTermDetail}
                  onChange={(e) => setProductSearchTermDetail(e.target.value)}
                  onFocus={handleSearchFocus}
                  onKeyDown={scProdKeyDown}
                  placeholder="제품명 검색해서 바로 추가..."
                  className="w-full px-4 py-3 border-2 border-[var(--primary)] rounded-xl text-base font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
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
                // 비과세(택배비/퀵비 등)는 받은 금액 전액이 공급가 (2026-07-15)
                const itemSupply = item.taxFree ? itemPrice : Math.round(itemPrice / 1.1);
                const itemTotalSupply = item.taxFree ? itemTotal : Math.round(itemTotal / 1.1);

                const isWholesale = currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale';
                const priceField = isWholesale ? 'wholesale' : 'retail';
                const baseUnit = Number(item.originalPrice ?? item[priceField] ?? item.price ?? 0) || itemPrice;
                const isDiscounted = !!item.discountType && Number(item.discountValue) > 0;
                const discountOpen = openDiscountIdxs.has(idx) || isDiscounted;

                const updateItem = (patch) => {
                  const newItems = [...currentCart.items];
                  newItems[idx] = { ...newItems[idx], ...patch };
                  setEditedDetailCart({ ...editedDetailCart, items: newItems });
                };
                // 🚨 연타 stale closure 방지 (2026-07-20): updateItem은 렌더 시점 currentCart/editedDetailCart를
                //    캡처해서 빠르게 누르면 뭉개진다. 수량 증감은 함수형 setEditedDetailCart로 최신 state 기준 계산.
                const stepItemQty = (delta) => {
                  setEditedDetailCart(prev => {
                    const src = prev || detailCart;
                    const items = (src.items || []).map((it, i) =>
                      i === idx ? { ...it, quantity: Math.max(1, (Number(it.quantity) || 1) + delta) } : it
                    );
                    return { ...src, items };
                  });
                };
                // 단가 직접 수정 — 할인 메타 해제하고 그 값으로 고정 (안전장치: 할인 적용 중에는 readOnly로 잠금)
                const updatePrice = (raw) => {
                  const num = Number(String(raw).replace(/[^\d]/g, '')) || 0;
                  updateItem({
                    price: num,
                    [priceField]: num,
                    originalPrice: undefined,
                    discountType: undefined,
                    discountValue: undefined,
                  });
                };
                // 할인 적용 — originalPrice 보존, price = 할인 후 값. 3가지 모드: percent/amount/fixed
                const applyDiscount = (type, rawValue) => {
                  const v = Number(String(rawValue).replace(/[^\d.]/g, '')) || 0;
                  const base = Number(item.originalPrice ?? item[priceField] ?? item.price ?? 0) || 0;
                  if (v <= 0) {
                    // 값 0이면 할인 해제하고 메타도 정리 (단, 모드 토글 흐름은 switchDiscountType에서 별도 처리)
                    updateItem({
                      price: base,
                      [priceField]: base,
                      originalPrice: undefined,
                      discountType: undefined,
                      discountValue: undefined,
                    });
                    return;
                  }
                  const final = calcFinalPrice(base, type, v);
                  updateItem({
                    originalPrice: base,
                    discountType: type,
                    discountValue: v,
                    price: final,
                    [priceField]: final,
                  });
                };
                // 토글 = 모드 전환만. 활성 상태면 같은 결과 유지하며 value 자동 변환, 비활성이면 모드만 보관
                const switchDiscountType = (newType) => {
                  if (item.discountType === newType) return;
                  if (!isDiscounted) {
                    updateItem({ discountType: newType });
                    return;
                  }
                  const base = Number(item.originalPrice) || baseUnit;
                  const newValue = convertDiscountValue(base, itemPrice, newType);
                  if (newValue <= 0) {
                    updateItem({ discountType: newType, discountValue: 0 });
                    return;
                  }
                  applyDiscount(newType, newValue);
                };
                const clearDiscount = () => {
                  const base = Number(item.originalPrice ?? item.price ?? 0) || 0;
                  updateItem({
                    price: base,
                    [priceField]: base,
                    originalPrice: undefined,
                    discountType: undefined,
                    discountValue: undefined,
                  });
                };
                const discountAmount = isDiscounted ? Math.max(0, baseUnit - itemPrice) : 0;
                // 비활성 상태에서도 사용자가 마지막 선택한 모드 시각 표시 (default percent)
                const activeMode = item.discountType || 'percent';

                if (isEditingDetail) {
                  // 편집 모드 — 하나의 응집된 카드 (제품 / 수량·단가·합계 한 줄 연결 / 할인)
                  const isReplacing = replaceLineIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border overflow-hidden transition-colors"
                      style={{
                        borderColor: isReplacing ? 'var(--primary)' : 'var(--border)',
                        background: 'var(--card)',
                        boxShadow: isReplacing ? '0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)' : '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* 헤더: 순번 + 제품명 input + [교체] + [삭제] */}
                      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
                        <span
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums"
                          style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                        >
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.name || ''}
                          onChange={(e) => updateItem({ name: e.target.value })}
                          placeholder="제품명"
                          className="flex-1 min-w-0 px-2 py-1.5 text-[15px] sm:text-base font-bold bg-[var(--background)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceLineIdx(isReplacing ? null : idx);
                            setReplaceSearchTerm('');
                          }}
                          // 보조 동작이라 테두리 빼고 조용하게 — 눌러야 할 것(제품명/수량/단가)이 먼저 보이게.
                          // 활성일 때만 색으로 튀어나온다. (2026-07-15 어수선함 정리)
                          className="flex-shrink-0 h-9 px-2.5 rounded-lg flex items-center gap-1 text-xs font-bold transition-all hover:bg-[var(--accent)]"
                          style={{
                            background: isReplacing ? 'var(--primary)' : 'transparent',
                            color: isReplacing ? 'white' : 'var(--muted-foreground)',
                          }}
                          title="잘못 주문한 제품을 다른 제품으로 교체 (수량 유지)"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> 교체
                        </button>
                        <button
                          onClick={() => {
                            const newItems = currentCart.items.filter((_, i) => i !== idx);
                            setEditedDetailCart({ ...editedDetailCart, items: newItems });
                          }}
                          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)]"
                          style={{ color: 'var(--muted-foreground)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--destructive)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-foreground)'; }}
                          aria-label="제품 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 제품 교체 검색 (펼침 시) */}
                      {isReplacing && (
                        <div className="px-3 pb-2.5 relative">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--muted-foreground)' }} />
                            <input
                              type="text"
                              autoFocus
                              value={replaceSearchTerm}
                              onChange={(e) => setReplaceSearchTerm(e.target.value)}
                              onFocus={handleSearchFocus}
                              placeholder="바꿀 제품명 검색…"
                              className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--background)] border-2 rounded-lg focus:outline-none"
                              style={{ borderColor: 'var(--primary)' }}
                            />
                          </div>
                          {replaceSearchTerm && (
                            <div className="absolute left-3 right-3 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl max-h-56 overflow-y-auto z-50">
                              {replaceFilteredProducts.length > 0 ? replaceFilteredProducts.map((product) => {
                                const isWholesale = currentCart.priceType === 'wholesale' || currentCart.price_type === 'wholesale';
                                const rPrice = isWholesale ? (product.wholesale || product.price) : (product.retail || product.wholesale || product.price);
                                return (
                                  <button
                                    key={product.id}
                                    onClick={() => replaceLineProduct(idx, product)}
                                    className="w-full px-3 py-2.5 text-left hover:bg-[var(--accent)] transition-colors border-b border-[var(--border)] last:border-0 flex items-center justify-between gap-2"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium break-words leading-snug">{product.name}</div>
                                      {product.category && <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{product.category}</div>}
                                    </div>
                                    <span className="font-bold text-sm flex-shrink-0" style={{ color: 'var(--success)' }}>{formatPrice(rPrice)}</span>
                                  </button>
                                );
                              }) : (
                                <div className="px-3 py-3 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>검색 결과 없음</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 수량 · 단가 · 합계 — 한 줄에 연결 (구분선으로 묶음) */}
                      <div
                        className="grid grid-cols-[auto_1fr_1fr]"
                        style={{ borderTop: '1px solid var(--border)' }}
                      >
                        {/* 수량 */}
                        <div className="flex flex-col items-center justify-center gap-1 px-2.5 py-2" style={{ borderRight: '1px solid var(--border)' }}>
                          <span className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>수량</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => stepItemQty(-1)}
                              className="w-8 h-8 border border-[var(--border)] hover:bg-[var(--accent)] rounded-md flex items-center justify-center transition-colors"
                              aria-label="수량 감소"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-bold text-base min-w-[2.2rem] text-center tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => stepItemQty(1)}
                              className="w-8 h-8 bg-[var(--primary)] hover:opacity-90 text-white rounded-md flex items-center justify-center transition-opacity"
                              aria-label="수량 증가"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* 단가 */}
                        <label className="flex flex-col gap-1 px-3 py-2 text-center" style={{ borderRight: '1px solid var(--border)' }}>
                          <span className="text-[10px] font-medium" style={{ color: isDiscounted ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            {isDiscounted ? '할인단가' : '단가 (VAT포함)'}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={itemPrice > 0 ? Number(itemPrice).toLocaleString('ko-KR') : ''}
                            onChange={(e) => updatePrice(e.target.value)}
                            readOnly={isDiscounted}
                            title={isDiscounted ? '할인 적용 중 — 직접 수정하려면 아래 [해제] 버튼을 눌러주세요' : undefined}
                            placeholder="0"
                            className={`w-full px-2 py-1 text-sm font-bold tabular-nums text-center border rounded focus:outline-none ${
                              isDiscounted
                                ? 'bg-[var(--secondary)] border-[var(--border)] cursor-not-allowed opacity-80'
                                : 'bg-[var(--background)] border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]/40'
                            }`}
                            style={{ color: isDiscounted ? 'var(--warning)' : 'var(--primary)' }}
                          />
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{item.taxFree ? '비과세' : `VAT제외 ${formatPrice(itemSupply)}`}</span>
                        </label>
                        {/* 합계 */}
                        <div className="flex flex-col gap-1 px-3 py-2 text-center justify-center">
                          <span className="text-[10px] font-medium" style={{ color: 'var(--muted-foreground)' }}>합계</span>
                          <p className="text-base font-bold tabular-nums leading-tight" style={{ color: 'var(--success)' }}>
                            {formatPrice(itemTotal)}원
                          </p>
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{item.taxFree ? '비과세' : `VAT제외 ${formatPrice(itemTotalSupply)}`}</span>
                        </div>
                      </div>
                      {/* 할인 토글 + 펼침 영역 */}
                      <div
                        style={{ borderTop: '1px solid var(--border)', background: isDiscounted ? 'color-mix(in srgb, var(--warning) 8%, var(--card))' : 'transparent' }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDiscountOpen(idx)}
                          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[var(--accent)]/40 transition-colors"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: isDiscounted ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            <Tag className="w-3.5 h-3.5" />
                            {isDiscounted
                              ? `할인 적용 중 · ${item.discountType === 'percent' ? `${item.discountValue}% 할인` : item.discountType === 'amount' ? `${formatPrice(item.discountValue)}원 할인` : `특가 ${formatPrice(itemPrice)}원`}`
                              : '할인 추가'}
                          </span>
                          <span className="flex items-center gap-2">
                            {isDiscounted && (
                              <span className="text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                                정가 <span className="line-through">{formatPrice(baseUnit)}</span> → <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{formatPrice(itemPrice)}</span>
                              </span>
                            )}
                            <ChevronDown className={`w-4 h-4 transition-transform ${discountOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--muted-foreground)' }} />
                          </span>
                        </button>
                        {discountOpen && (
                          <div className="px-3 pb-2.5 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                            <div className="flex rounded-md overflow-hidden border border-[var(--border)]">
                              {[
                                { k: 'percent', label: <Percent className="w-3 h-3" />, aria: '퍼센트 할인' },
                                { k: 'amount', label: '원', aria: '원 단위 차감' },
                                { k: 'fixed', label: '지정', aria: '지정 단가' },
                              ].map((m, mi) => (
                                <button
                                  key={m.k}
                                  type="button"
                                  onClick={() => switchDiscountType(m.k)}
                                  className={`px-2 py-1.5 text-xs font-bold transition-colors flex items-center justify-center ${mi > 0 ? 'border-l border-[var(--border)]' : ''}`}
                                  style={{
                                    background: activeMode === m.k ? 'var(--primary)' : 'var(--background)',
                                    color: activeMode === m.k ? 'white' : 'var(--foreground)',
                                  }}
                                  aria-label={m.aria}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.discountValue ? Number(item.discountValue).toLocaleString('ko-KR') : ''}
                              onChange={(e) => applyDiscount(activeMode, e.target.value)}
                              placeholder={discountPlaceholder(activeMode)}
                              className="w-full px-2 py-1.5 text-sm font-semibold tabular-nums bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                            />
                            {isDiscounted ? (
                              <button
                                type="button"
                                onClick={clearDiscount}
                                className="px-2.5 py-1.5 text-xs font-bold rounded border transition-colors"
                                style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                              >
                                해제
                              </button>
                            ) : (
                              <span className="text-[10px] px-1" style={{ color: 'var(--muted-foreground)' }}>
                                정가 {formatPrice(baseUnit)}
                              </span>
                            )}
                          </div>
                        )}
                        {isDiscounted && (
                          <div className="px-3 pb-2 text-[10px] flex items-center justify-between gap-2" style={{ color: 'var(--muted-foreground)' }}>
                            <span>차감액: <span className="font-bold" style={{ color: 'var(--warning)' }}>-{formatPrice(discountAmount)}원</span> × ×{item.quantity}</span>
                            <span>총 절감 <span className="font-bold" style={{ color: 'var(--warning)' }}>-{formatPrice(discountAmount * item.quantity)}원</span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // 보기 모드 — 기존 1행 레이아웃 유지 (할인 적용 시 정가/할인 배지 노출)
                return (
                  <div key={idx} className="rounded-lg p-3 sm:p-4 border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--accent)] transition-all">
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold break-words leading-snug">{item.name}</p>
                        {isDiscounted && (
                          <span
                            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}
                          >
                            <Tag className="w-3 h-3" />
                            {item.discountType === 'percent' ? `${item.discountValue}%` : `${formatPrice(item.discountValue)}원`} 할인
                          </span>
                        )}
                        {itemPrice > 0 && (
                          <div className="mt-1">
                            {isDiscounted && (
                              <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>{formatPrice(baseUnit)}</p>
                            )}
                            <p className="text-sm" style={{ color: 'var(--primary)' }}>{formatPrice(itemPrice)}</p>
                            <p className="text-[var(--muted-foreground)] text-xs">{item.taxFree ? '(비과세)' : `(VAT제외 ${formatPrice(itemSupply)})`}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <p className="text-[var(--muted-foreground)] text-sm">×{item.quantity}개</p>
                        {itemPrice > 0 ? (
                          <div className="text-right">
                            <p className="font-bold text-base" style={{ color: 'var(--success)' }}>{formatPrice(itemTotal)}</p>
                            <p className="text-[var(--muted-foreground)] text-xs">{item.taxFree ? '(비과세)' : `(VAT제외 ${formatPrice(itemTotalSupply)})`}</p>
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

          {/* Status edit section — inside scroll body so it scrolls with items on mobile */}
          {isEditingDetail && (
            <div className="mt-4 -mx-3 sm:-mx-6 border-t border-[var(--border)] px-3 sm:px-6 py-3 sm:py-4 bg-[var(--secondary)]">
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <p className="text-[var(--muted-foreground)] text-xs font-medium mb-1.5">주문 상태</p>
                  <div className="grid grid-cols-5 gap-1.5">
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
                        className={`px-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors border break-keep ${
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[var(--muted-foreground)] text-xs font-medium mb-1.5 block">배송 예정일</label>
                    <input
                      type="date"
                      value={editedDetailCart?.delivery_date || ''}
                      onChange={(e) => setEditedDetailCart({ ...editedDetailCart, delivery_date: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--muted-foreground)] text-xs font-medium mb-1.5 block">우선순위</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { key: 'low', label: '낮음' },
                        { key: 'normal', label: '보통' },
                        { key: 'high', label: '높음' },
                        { key: 'urgent', label: '긴급' },
                      ].map(({ key, label }) => {
                        const active = (editedDetailCart?.priority || currentCart.priority || 'normal') === key;
                        const danger = key === 'urgent' || key === 'high';
                        return (
                          <button
                            key={key}
                            onClick={() => setEditedDetailCart({ ...editedDetailCart, priority: key })}
                            className={`px-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors border break-keep ${
                              active
                                ? danger
                                  ? 'text-white border-[var(--destructive)]'
                                  : 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--accent)]'
                            }`}
                            style={active && danger ? { background: 'var(--destructive)' } : undefined}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[var(--muted-foreground)] text-xs font-medium mb-1.5 block">메모</label>
                  <input
                    type="text"
                    value={editedDetailCart?.memo || ''}
                    onChange={(e) => setEditedDetailCart({ ...editedDetailCart, memo: e.target.value })}
                    placeholder="메모 입력..."
                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
                </div>
              </div>
            )}
          </div>

          {/* Total + action buttons (collapsible) */}
          <div className="border-t border-[var(--border)] px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0 bg-[var(--card)]">
            {/* Compact bar — always visible, click to toggle */}
            <button
              onClick={() => setIsBottomExpanded(!isBottomExpanded)}
              className="w-full flex items-center justify-between mb-3 px-3 py-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>총 금액</span>
                <span className="text-lg sm:text-xl font-bold" style={{ color: 'var(--success)' }}>{formatPrice(currentTotal)}원</span>
              </div>
              {isBottomExpanded ? (
                <ChevronDown className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              ) : (
                <ChevronUp className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              )}
            </button>

            {/* Expandable detail */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: isBottomExpanded ? '300px' : '0px',
                opacity: isBottomExpanded ? 1 : 0,
                marginBottom: isBottomExpanded ? '1rem' : '0',
              }}
            >
              <div
                className="bg-[var(--secondary)] rounded-lg p-3 sm:p-4 cursor-pointer hover:bg-[var(--accent)] transition-colors"
                onClick={() => { setCalculatorInitialValue(currentTotal); setShowCalculatorModal(true); }}
                title="계산기 열기"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[var(--muted-foreground)] text-sm">공급가액</span>
                  <span className="text-sm font-medium">{formatPrice(Math.round(currentTotal / 1.1))}원</span>
                </div>
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
                  <span className="text-[var(--muted-foreground)] text-sm">부가세</span>
                  <span className="text-sm font-medium">{formatPrice(currentTotal - Math.round(currentTotal / 1.1))}원</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">총 금액</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatPrice(currentTotal)}원</span>
                </div>
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
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <button
                  onClick={() => { onLoad(currentCart); onBack(); }}
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 hover:opacity-90 text-white rounded-lg text-sm sm:text-base font-semibold whitespace-nowrap transition-opacity"
                  style={{ background: 'var(--success)' }}
                >
                  <Download className="w-4 h-4 flex-shrink-0" />
                  <span>불러오기</span>
                </button>
                {onOrder && (
                  <button
                    onClick={() => {
                      onOrder(currentCart);
                      setDetailCart(null);
                      setDetailIndex(null);
                    }}
                    className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 bg-[var(--primary)] hover:opacity-90 text-white rounded-lg text-sm sm:text-base font-semibold whitespace-nowrap transition-opacity"
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span>주문확인</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopyCart(currentCart)}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold flex items-center justify-center transition-all border flex-shrink-0"
                  style={{
                    background: copied ? 'var(--success)' : 'var(--background)',
                    color: copied ? 'white' : 'var(--foreground)',
                    borderColor: copied ? 'var(--success)' : 'var(--border)',
                  }}
                  title="복사"
                  aria-label="견적서 복사"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleShareCart(currentCart)}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-semibold flex items-center justify-center transition-all border flex-shrink-0"
                  style={{
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                    borderColor: 'var(--border)',
                  }}
                  title="공유"
                  aria-label="견적서 공유"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (!detailCart?.id) return;
                    // 1) Capture target before clearing detailCart
                    const target = { id: detailCart.id, name: detailCart.name };
                    // 2) Close detail modal so ConfirmDialog renders on a clean stack
                    setDetailCart(null);
                    setDetailIndex(null);
                    // 3) Then open the confirmation
                    setPendingDetailDelete(target);
                  }}
                  disabled={deletingId != null}
                  className="ml-1 px-3 sm:px-4 py-2 sm:py-2.5 border rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                  title="삭제"
                  aria-label="장바구니 삭제"
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
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
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
                <h1 className="text-lg font-bold">저장된 장바구니</h1>
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

          {/* Date filter buttons - always visible */}
          {isHeaderCollapsed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { key: 'today', label: '오늘' },
                { key: 'yesterday', label: '어제' },
                { key: 'week', label: '이번 주' },
                { key: 'month', label: '이번 달' },
                { key: 'custom', label: '날짜 선택' },
                { key: 'all', label: '전체' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setDateFilter(key); setSelectedItems([]); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    dateFilter === key
                      ? 'bg-[var(--primary)] text-white'
                      : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                  }`}
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
                  { key: 'custom', label: '날짜 선택' },
                  { key: 'all', label: '전체' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setDateFilter(key); setSelectedItems([]); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      dateFilter === key
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
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
          // 3열 → 2열(2xl에서만 3열). 3열이면 카드가 좁아 폰트를 10~12px로 줄여야 했다.
          // 폭을 벌어야 글자를 키울 수 있다. (2026-07-16)
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
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
                              <span className="flex-shrink-0 text-base" style={isBlacklist ? { color: 'var(--destructive)' } : undefined}>{isBlacklist ? '🚫' : '👤'}</span>
                              <h3 className="text-lg sm:text-xl font-black break-words leading-snug min-w-0 tracking-tight" style={isBlacklist ? { color: 'var(--destructive)' } : undefined}>
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
                                  // 예약일은 알림과 직결되는 정보 — 10px면 안 보인다 (2026-07-16)
                                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ ...dateInfo.colorStyle, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
                                    {dateInfo.label}
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-[var(--muted-foreground)] text-xs mt-1">{cart.date} {cart.time}</p>
                          </div>
                          <div className="ml-2 flex-shrink-0 text-right">
                            <p className="font-bold text-xl sm:text-2xl leading-tight whitespace-nowrap" style={{ color: 'var(--success)' }}>
                              {formatPrice(cart.total)}<span className="text-xs font-bold ml-0.5">원</span>
                            </p>
                            <SubPrice total={cart.total || 0} layout="stacked" size="sm" className="mt-0.5" />
                          </div>
                        </div>

                        {/* Items summary */}
                        <div className="bg-[var(--secondary)] rounded-lg p-2.5 mb-3">
                          <p className="text-[var(--muted-foreground)] text-sm break-words leading-snug">{cartItemsDisplay}</p>
                          <p className="text-[var(--muted-foreground)] text-xs mt-1 font-bold">
                            {cart.items.length}종 / {cart.items.reduce((sum, item) => sum + item.quantity, 0)}개
                          </p>
                          {cart.memo && (
                            <p className="text-sm mt-2 border-t border-[var(--border)] pt-2 break-words leading-snug font-medium" style={{ color: 'var(--info)' }}>
                              {cart.memo}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        {!selectMode && (
                          // 가장 자주 누르는 버튼들 — 12px는 작다. 터치 44px 룰도 고려해 h-11로 (2026-07-16)
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); onLoad(cart); onBack(); }}
                              className="flex-1 flex items-center justify-center gap-1.5 h-11 hover:opacity-90 text-white rounded-xl text-sm font-bold whitespace-nowrap transition-opacity"
                              style={{ background: 'var(--success)' }}
                            >
                              <Download className="w-4 h-4" />
                              불러오기
                            </button>
                            {onOrder && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onOrder(cart); }}
                                className="flex-1 flex items-center justify-center gap-1.5 h-11 bg-[var(--primary)] hover:opacity-90 text-white rounded-xl text-sm font-bold whitespace-nowrap transition-opacity"
                              >
                                <FileText className="w-4 h-4" />
                                주문확인
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(index); }}
                              className="flex items-center justify-center w-11 h-11 border rounded-xl transition-colors flex-shrink-0"
                              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)', color: 'var(--destructive)' }}
                              aria-label="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* Detail modal: single-cart delete confirm */}
      <ConfirmDialog
        isOpen={pendingDetailDelete != null}
        title="장바구니 삭제"
        message={`"${pendingDetailDelete?.name || ''}" 장바구니를 삭제하시겠습니까? 되돌릴 수 없습니다.`}
        confirmText="삭제"
        cancelText="취소"
        destructive
        onConfirm={async () => {
          const target = pendingDetailDelete;
          setPendingDetailDelete(null);
          if (target?.id) {
            setDetailCart(null);
            setDetailIndex(null);
            await handleDeleteCart(target.id);
          }
        }}
        onCancel={() => setPendingDetailDelete(null)}
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
