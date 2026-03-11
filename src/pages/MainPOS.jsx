import { useState, useMemo, useEffect } from 'react';
import {
  Search, ShoppingCart, Plus, Minus, X, ChevronDown, ChevronUp,
  Package, Calculator, Maximize2, Minimize2, RotateCcw, Zap, ArrowLeft
} from 'lucide-react';
import { matchesSearchQuery, handleSearchFocus, formatPrice, calcExVat, calculateDiscount } from '@/lib/utils';
import OrderPage from './OrderPage';
import useModalFullscreen from '@/hooks/useModalFullscreen';

// Static fallback price data (478 products)
const priceData = [
  { id: 1, category: '모듈', name: '져스트 G1', wholesale: 700000, retail: 1100000 },
  { id: 2, category: '모듈', name: '져스트 G2', wholesale: 865000, retail: 1500000 },
  { id: 3, category: '모듈', name: '져스트 G1C1', wholesale: 821000, retail: 1361000 },
  { id: 4, category: '모듈', name: '져스트 G2C1', wholesale: 986000, retail: 1761000 },
  { id: 5, category: '모듈', name: '져스트 모듈', wholesale: 440000, retail: 700000 },
  { id: 6, category: '모듈', name: '블로썸', wholesale: 350000, retail: 490000 },
  { id: 7, category: '모듈', name: 'RW 모듈 낱개', wholesale: 460000, retail: 560000 },
  { id: 8, category: '모듈', name: 'RW 모듈 5-10개', wholesale: 330000, retail: 560000 },
  { id: 9, category: '모듈', name: 'RW 모듈 11-20개', wholesale: 270000, retail: 560000 },
  { id: 10, category: '모듈', name: '보펜', wholesale: 242000, retail: 350000 },
  { id: 11, category: '져스트 스피커', name: '메인 스피커', wholesale: 250000, retail: 500000 },
  { id: 12, category: '져스트 스피커', name: '고음 스피커', wholesale: 176000, retail: 361000 },
  { id: 13, category: '배선/부품', name: '모듈 메인 배선', wholesale: 33000, retail: 77000 },
  { id: 14, category: '배선/부품', name: 'OBD 배선', wholesale: 16500, retail: 33000 },
  { id: 15, category: '배선/부품', name: '모듈 케이블 휴즈 등', wholesale: 16500, retail: 33000 },
  { id: 16, category: '배선/부품', name: '스피커 배선', wholesale: 22000, retail: 33000 },
  { id: 17, category: '배선/부품', name: '스피커 콘지 교체용', wholesale: 38500, retail: 110000 },
];

export default function MainPOS({
  products: externalProducts = [],
  cart,
  setCart,
  priceType,
  setPriceType,
  onOpenOrder,
  onOpenTextAnalyze,
  onOpenQuickCalculator,
  showToast,
  saveOrder,
  customers = [],
  onSaveCartModal,
  onBack,
  loadedCustomer,
  onClearLoadedCustomer,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [orderCustomerName, setOrderCustomerName] = useState('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState('');
  const [orderMemo, setOrderMemo] = useState('');
  const [orderPaymentMethod, setOrderPaymentMethod] = useState('card');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const { isFullscreen: isCartFullscreen, toggleFullscreen: toggleCartFullscreen } = useModalFullscreen();

  const products = externalProducts.length > 0 ? externalProducts : priceData;

  const dynamicCategories = useMemo(() => {
    return [...new Set(products.map(item => item.category))];
  }, [products]);

  // Initialize all categories as expanded
  useEffect(() => {
    if (dynamicCategories.length > 0 && Object.keys(expandedCategories).length === 0) {
      const initial = {};
      dynamicCategories.forEach(cat => { initial[cat] = true; });
      setExpandedCategories(initial);
    }
  }, [dynamicCategories]);

  const cartMap = useMemo(() => new Map(cart.map(item => [item.id, item])), [cart]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = matchesSearchQuery(product.name, searchTerm);
      const matchesCategory = selectedCategory === '전체' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory, products]);

  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(product => {
      if (!groups[product.category]) groups[product.category] = [];
      groups[product.category].push(product);
    });
    return groups;
  }, [filteredProducts]);

  const cartWithDiscount = useMemo(() => {
    return cart.map(item => {
      const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
      const product = products.find(p => p.id === item.id);
      const discountInfo = calculateDiscount(product || {}, item.quantity, price);
      return {
        ...item,
        unitPrice: price,
        originalTotal: price * item.quantity,
        discountedPrice: discountInfo.discountedPrice,
        discountAmount: discountInfo.discountAmount,
        totalDiscount: discountInfo.discountAmount * item.quantity,
        finalTotal: discountInfo.discountedPrice * item.quantity,
        appliedTier: discountInfo.appliedTier,
      };
    });
  }, [cart, priceType, products]);

  const totalAmount = useMemo(() => {
    return cartWithDiscount.reduce((sum, item) => sum + item.finalTotal, 0);
  }, [cartWithDiscount]);

  const totalDiscount = useMemo(() => {
    return cartWithDiscount.reduce((sum, item) => sum + item.totalDiscount, 0);
  }, [cartWithDiscount]);

  const totalQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const addToCart = (product) => {
    const baseStock = product.stock !== undefined ? product.stock : 50;
    const existingItem = cartMap.get(product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const isIncoming = product.stock_status === 'incoming';
    const isOutOfStock = baseStock === 0 && !isIncoming;

    if (currentQty >= baseStock && baseStock > 0) {
      showToast && showToast('재고가 부족합니다', 'error');
      return;
    }
    if (isIncoming && currentQty === 0) {
      showToast && showToast('입고대기 상품입니다 (예약 주문)', 'warning');
    } else if (isOutOfStock && currentQty === 0) {
      showToast && showToast('품절 상품입니다 (예약 주문)', 'warning');
    }

    if (existingItem) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => setCart(cart.filter(item => item.id !== productId));

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) return removeFromCart(productId);
    const product = products.find(p => p.id === productId);
    const baseStock = product?.stock !== undefined ? product.stock : 50;
    const isIncoming = product?.stock_status === 'incoming';
    if (newQuantity > baseStock && baseStock > 0 && !isIncoming) {
      showToast && showToast('재고가 부족합니다', 'error');
      return;
    }
    setCart(cart.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
  };

  const replaceItem = (oldId, newProduct, qty) => {
    setCart(prev => prev.map(item => item.id === oldId ? { ...newProduct, quantity: qty } : item));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const openOrderConfirm = () => {
    if (cart.length === 0) {
      showToast && showToast('장바구니가 비어있습니다', 'error');
      return;
    }
    setOrderCustomerName('');
    setOrderCustomerPhone('');
    setOrderMemo('');
    setOrderPaymentMethod('card');
    setCustomerSuggestions([]);
    setShowOrderConfirm(true);
  };

  const handleCustomerNameChange = (value) => {
    setOrderCustomerName(value);
    if (value.trim().length > 0 && customers.length > 0) {
      const filtered = customers.filter(c =>
        c.name?.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 5);
      setCustomerSuggestions(filtered);
    } else {
      setCustomerSuggestions([]);
    }
  };

  const selectCustomerSuggestion = (customer) => {
    setOrderCustomerName(customer.name || '');
    setOrderCustomerPhone(customer.phone || '');
    setCustomerSuggestions([]);
  };

  const handleOrderSubmit = async () => {
    if (!saveOrder) return;
    const customerName = orderCustomerName.trim() || '일반고객';
    await saveOrder({
      customer_name: customerName,
      customer_phone: orderCustomerPhone.trim(),
      memo: orderMemo.trim(),
      payment_method: orderPaymentMethod,
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale),
        quantity: item.quantity,
      })),
      total_amount: totalAmount,
      price_type: priceType,
    });
    setShowOrderConfirm(false);
  };

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* LEFT: Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0 pr-0 lg:pr-[420px]">
        {/* Mobile Header with Back Button - always sticky */}
        <div
          className="lg:hidden sticky top-0 z-40 flex items-center h-12 px-3 border-b"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]"
            >
              <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
            </button>
          )}
          <h1 className="ml-2 text-lg font-bold" style={{ color: 'var(--foreground)' }}>제품 주문</h1>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {onOpenQuickCalculator && (
              <button
                onClick={onOpenQuickCalculator}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
              >
                <Calculator className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
            )}
            {cart.length > 0 && (
              <button
                onClick={() => setIsCartExpanded(true)}
                className="relative p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
              >
                <ShoppingCart className="w-4.5 h-4.5" style={{ color: 'var(--primary)' }} />
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--destructive)', color: 'white' }}
                >
                  {cart.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div
          className="sticky top-12 lg:top-0 z-30 px-4 py-3 border-b"
          style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
        >
          <div className="flex gap-2 items-center">
            {/* Price type toggle */}
            <div
              className="flex rounded-lg overflow-hidden border flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={() => setPriceType('wholesale')}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  priceType === 'wholesale'
                    ? 'text-white'
                    : 'text-[var(--muted-foreground)]'
                }`}
                style={priceType === 'wholesale' ? { background: 'var(--primary)' } : { background: 'var(--muted)' }}
              >
                도매
              </button>
              <button
                onClick={() => setPriceType('retail')}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  priceType === 'retail'
                    ? 'text-white'
                    : 'text-[var(--muted-foreground)]'
                }`}
                style={priceType === 'retail' ? { background: 'var(--primary)' } : { background: 'var(--muted)' }}
              >
                소매
              </button>
            </div>

            {/* Search input - compact */}
            <div
              className="relative flex-1 min-w-0 rounded-lg border transition-all focus-within:border-[var(--primary)] focus-within:shadow-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            >
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--muted-foreground)' }}
              />
              <input
                type="text"
                placeholder="검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={handleSearchFocus}
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs focus:outline-none"
                style={{ background: 'transparent', color: 'var(--foreground)' }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--muted)]"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-2 flex-shrink-0 max-w-[100px] sm:max-w-none"
              style={{
                background: selectedCategory !== '전체' ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                borderColor: selectedCategory !== '전체' ? 'var(--primary)' : 'var(--border)',
                color: selectedCategory !== '전체' ? 'var(--primary)' : 'var(--foreground)',
              }}
            >
              <option value="전체">전체</option>
              {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {/* AI recognize button */}
            {onOpenTextAnalyze && (
              <button
                onClick={onOpenTextAnalyze}
                className="p-1.5 rounded-lg border flex-shrink-0 transition-colors hover:bg-[var(--accent)]"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                title="AI 주문 인식"
              >
                <Zap className="w-4 h-4" style={{ color: 'var(--warning)' }} />
              </button>
            )}
          </div>

          <div className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {filteredProducts.length}개 제품
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
          {Object.keys(groupedProducts).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="w-12 h-12 mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p style={{ color: 'var(--muted-foreground)' }}>검색 결과가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(groupedProducts).map(([category, categoryProducts]) => {
                const isExpanded = expandedCategories[category] !== false;
                return (
                  <div
                    key={category}
                    className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:bg-[var(--accent)]"
                      style={{ borderBottom: isExpanded ? `1px solid var(--border)` : 'none' }}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          style={{ color: 'var(--muted-foreground)' }}
                        />
                        <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                          {category}
                        </span>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                      >
                        {categoryProducts.length}개
                      </span>
                    </button>

                    {/* Category Products */}
                    {isExpanded && (
                      <div className="p-2 grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                        {categoryProducts.map(product => {
                          const cartItem = cartMap.get(product.id);
                          const cartQty = cartItem ? cartItem.quantity : 0;
                          const displayPrice = priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale);
                          const exVatPrice = Math.round(displayPrice / 1.1);
                          const baseStock = product.stock !== undefined ? product.stock : 50;
                          const availableStock = baseStock - cartQty;
                          const isIncoming = product.stock_status === 'incoming';
                          const isOutOfStock = availableStock <= 0 && !isIncoming;
                          const isLowStock = availableStock > 0 && availableStock <= (product.min_stock || 5);
                          const inCart = !!cartItem;

                          return (
                            <div
                              key={product.id}
                              onClick={() => !cartItem && addToCart(product)}
                              className={`card-interactive px-2 py-2 rounded-lg cursor-pointer select-none border ${
                                inCart
                                  ? 'ring-2'
                                  : ''
                              }`}
                              style={{
                                background: inCart
                                  ? 'color-mix(in srgb, var(--primary) 10%, var(--card))'
                                  : isIncoming
                                    ? 'color-mix(in srgb, var(--warning) 8%, var(--card))'
                                    : isOutOfStock
                                      ? 'color-mix(in srgb, var(--destructive) 8%, var(--card))'
                                      : 'var(--card)',
                                borderColor: inCart
                                  ? 'var(--primary)'
                                  : isIncoming
                                    ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                                    : isOutOfStock
                                      ? 'color-mix(in srgb, var(--destructive) 40%, var(--border))'
                                      : 'var(--border)',
                                '--tw-ring-color': 'var(--primary)',
                              }}
                            >
                              {/* Product name & stock badge */}
                              <div className="flex items-center justify-between mb-1 gap-1">
                                <p
                                  className="text-xs font-medium truncate flex-1"
                                  style={{ color: 'var(--foreground)' }}
                                >
                                  {product.name}
                                </p>
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-0.5"
                                  style={{
                                    background: isIncoming
                                      ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                                      : isOutOfStock
                                        ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                                        : isLowStock
                                          ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                                          : 'color-mix(in srgb, var(--success) 20%, transparent)',
                                    color: isIncoming
                                      ? 'var(--warning)'
                                      : isOutOfStock
                                        ? 'var(--destructive)'
                                        : isLowStock
                                          ? 'var(--warning)'
                                          : 'var(--success)',
                                  }}
                                >
                                  {isIncoming ? (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
                                      입고대기
                                    </>
                                  ) : isOutOfStock ? '품절' : `${availableStock}개`}
                                </span>
                              </div>

                              {/* Price / Cart controls */}
                              {inCart ? (
                                <div className="flex items-center justify-between gap-1">
                                  <p
                                    className="text-sm font-bold whitespace-nowrap"
                                    style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}
                                  >
                                    {formatPrice(displayPrice)}원
                                  </p>
                                  <div
                                    className="flex items-center gap-0.5 rounded flex-shrink-0 border"
                                    style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                                  >
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, cartItem.quantity - 1); }}
                                      className="w-6 h-6 flex items-center justify-center hover:bg-[var(--accent)] rounded-l transition-colors"
                                    >
                                      <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                                    </button>
                                    <input
                                      type="number"
                                      value={cartItem.quantity}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        if (val >= 0) updateQuantity(product.id, val);
                                      }}
                                      onFocus={(e) => { e.stopPropagation(); e.target.select(); }}
                                      className="w-8 h-6 text-center text-xs font-bold bg-transparent border-none focus:outline-none"
                                      style={{ color: 'var(--foreground)' }}
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, cartItem.quantity + 1); }}
                                      className="w-6 h-6 flex items-center justify-center hover:bg-[var(--accent)] rounded-r transition-colors"
                                    >
                                      <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <p
                                      className="text-sm font-bold whitespace-nowrap"
                                      style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}
                                    >
                                      {formatPrice(displayPrice)}원
                                    </p>
                                    <p className="text-[10px] whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
                                      VAT제외 {formatPrice(exVatPrice)}원
                                    </p>
                                  </div>
                                  <Plus
                                    className="w-4 h-4 flex-shrink-0"
                                    style={{ color: 'var(--muted-foreground)' }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Cart Bottom Bar */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-4 py-3 border-t shadow-lg"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div
              onClick={() => cart.length > 0 && setIsCartExpanded(true)}
              className={`flex-1 ${cart.length > 0 ? 'cursor-pointer' : ''}`}
            >
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                공급가 {formatPrice(calcExVat(totalAmount))}원 + VAT
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {formatPrice(totalAmount)}원
                </p>
                {cart.length > 0 && (
                  <ChevronUp className="w-4 h-4 animate-bounce" style={{ color: 'var(--primary)' }} />
                )}
              </div>
            </div>
            <button
              onClick={openOrderConfirm}
              className="px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Calculator className="w-4 h-4" />
              주문 확인 ({totalQuantity})
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Cart Panel (desktop fixed sidebar) */}
      <div
        className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[400px] flex-col border-l z-20"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {/* Cart Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>주문 목록</h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {cart.length}종 / {totalQuantity}개
            </span>
          </div>
          <button
            onClick={() => setIsCartExpanded(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors"
            title="전체보기"
          >
            <Maximize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <ShoppingCart className="w-10 h-10 mb-2" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>주문 목록이 비어있습니다</p>
            </div>
          ) : (
            <div className="p-2 grid grid-cols-2 gap-1.5">
              {cartWithDiscount.map(item => {
                const baseStock = item.stock !== undefined ? item.stock : 50;
                const remainingStock = baseStock - item.quantity;
                const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                return (
                  <div
                    key={item.id}
                    className="rounded-lg p-2 group relative border transition-colors hover:bg-[var(--accent)]"
                    style={{
                      background: hasDiscount
                        ? 'color-mix(in srgb, var(--warning) 6%, var(--card))'
                        : 'var(--secondary)',
                      borderColor: hasDiscount
                        ? 'color-mix(in srgb, var(--warning) 30%, var(--border))'
                        : 'var(--border)',
                    }}
                  >
                    {/* Delete button */}
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full transition-all"
                      style={{ background: 'var(--destructive)', color: 'white' }}
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* Name + stock/discount badge */}
                    <div className="flex items-center justify-between pr-5 mb-2">
                      <p className="text-xs font-medium truncate flex-1" style={{ color: 'var(--foreground)' }}>
                        {item.name}
                      </p>
                      {hasDiscount ? (
                        <span
                          className="text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' }}
                        >
                          {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}%↓` : `${formatPrice(item.appliedTier.value)}↓`}
                        </span>
                      ) : (
                        <span
                          className="text-[9px] px-1 py-0.5 rounded flex-shrink-0"
                          style={{
                            background: remainingStock <= 0
                              ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                              : 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)',
                            color: remainingStock <= 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
                          }}
                        >
                          {remainingStock <= 0 ? '마지막' : `잔여${remainingStock}`}
                        </span>
                      )}
                    </div>

                    {/* Quantity + amount */}
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-0.5 rounded-lg px-1 border"
                        style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                      >
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                        >
                          <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val >= 0) updateQuantity(item.id, val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-9 h-6 text-center text-sm font-bold bg-transparent border-none focus:outline-none"
                          style={{ color: 'var(--foreground)' }}
                        />
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                        >
                          <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                      </div>
                      <div className="text-right">
                        {hasDiscount && (
                          <p className="text-[9px] line-through" style={{ color: 'var(--muted-foreground)' }}>
                            {formatPrice(item.originalTotal)}원
                          </p>
                        )}
                        <p
                          className="text-xs font-semibold"
                          style={{ color: hasDiscount ? 'var(--warning)' : 'var(--primary)' }}
                        >
                          {formatPrice(item.finalTotal)}원
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="text-xs space-y-0.5" style={{ color: 'var(--muted-foreground)' }}>
                <p>공급가 {formatPrice(calcExVat(totalAmount))}원</p>
                <p>VAT {formatPrice(totalAmount - calcExVat(totalAmount))}원</p>
                {totalDiscount > 0 && (
                  <p style={{ color: 'var(--warning)' }}>할인 -{formatPrice(totalDiscount)}원</p>
                )}
              </div>
              <div
                className="text-right cursor-pointer rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-[var(--accent)]"
                onClick={() => onOpenQuickCalculator && onOpenQuickCalculator(totalAmount)}
                title="계산기 열기"
              >
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>총 금액</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {formatPrice(totalAmount)}원
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCart([])}
                className="py-2.5 px-4 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                초기화
              </button>
              <button
                onClick={openOrderConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Calculator className="w-4 h-4" />
                주문 확인
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Confirmation Page */}
      {showOrderConfirm && (
        <OrderPage
          cart={cart}
          priceType={priceType}
          totalAmount={totalAmount}
          formatPrice={formatPrice}
          onSaveOrder={async (orderData) => {
            if (!saveOrder) return null;
            const result = await saveOrder({
              customer_name: orderData.customerName || '일반고객',
              customer_phone: orderData.customerPhone || '',
              customer_address: orderData.customerAddress || '',
              memo: orderData.memo || '',
              items: orderData.items,
              total_amount: orderData.totalAmount,
              price_type: orderData.priceType,
              order_number: orderData.orderNumber,
              existing_customer_id: orderData.existingCustomerId,
            });
            if (result) onClearLoadedCustomer?.();
            return result;
          }}
          isSaving={false}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={removeFromCart}
          onAddItem={addToCart}
          onReplaceItem={replaceItem}
          products={products}
          initialCustomer={loadedCustomer}
          customers={customers}
          onBack={() => {
            setShowOrderConfirm(false);
            onClearLoadedCustomer?.();
          }}
          onSaveCart={(info) => {
            if (onSaveCartModal) onSaveCartModal(info);
          }}
          showToast={showToast}
        />
      )}

      {/* Cart Expanded Modal */}
      {isCartExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-fs-transition"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: isCartFullscreen ? '0' : '1rem' }}
          onClick={() => setIsCartExpanded(false)}
        >
          <div
            className="w-full h-full overflow-hidden flex flex-col border shadow-2xl modal-fs-transition"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', maxWidth: isCartFullscreen ? '100vw' : '56rem', maxHeight: isCartFullscreen ? '100vh' : '90vh', borderRadius: isCartFullscreen ? '0' : '1rem', boxShadow: isCartFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>주문 목록</h2>
                <span
                  className="text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                >
                  {cart.length}종 / {totalQuantity}개
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCartFullscreen(); }}
                  className="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
                  title={isCartFullscreen ? '원래 크기' : '전체화면'}
                >
                  {isCartFullscreen ? <Minimize2 className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} /> : <Maximize2 className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />}
                </button>
                <button
                  onClick={() => setIsCartExpanded(false)}
                  className="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
                >
                  <X className="w-6 h-6" style={{ color: 'var(--muted-foreground)' }} />
                </button>
              </div>
            </div>

            {/* Modal Items */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <ShoppingCart className="w-16 h-16 mb-4" style={{ color: 'var(--muted-foreground)', opacity: 0.3 }} />
                  <p className="text-lg" style={{ color: 'var(--muted-foreground)' }}>주문 목록이 비어있습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {cartWithDiscount.map(item => {
                    const baseStock = item.stock !== undefined ? item.stock : 50;
                    const remainingStock = baseStock - item.quantity;
                    const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl p-4 group relative border transition-colors hover:bg-[var(--accent)]"
                        style={{
                          background: hasDiscount ? 'color-mix(in srgb, var(--warning) 6%, var(--card))' : 'var(--secondary)',
                          borderColor: hasDiscount ? 'color-mix(in srgb, var(--warning) 30%, var(--border))' : 'var(--border)',
                        }}
                      >
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full transition-all"
                          style={{ background: 'var(--destructive)', color: 'white' }}
                        >
                          <X className="w-4 h-4" />
                        </button>

                        <div className="mb-3">
                          <p className="text-sm font-medium line-clamp-2 pr-6 min-h-[40px]" style={{ color: 'var(--foreground)' }}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {hasDiscount && (
                              <span
                                className="text-xs px-2 py-0.5 rounded font-medium"
                                style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' }}
                              >
                                {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}% 할인` : `${formatPrice(item.appliedTier.value)}원 할인`}
                              </span>
                            )}
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                background: remainingStock <= 0
                                  ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                                  : 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)',
                                color: remainingStock <= 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
                              }}
                            >
                              {remainingStock <= 0 ? '마지막' : `잔여${remainingStock}`}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs mb-2">
                          {hasDiscount ? (
                            <div className="flex items-center gap-2">
                              <span className="line-through" style={{ color: 'var(--muted-foreground)' }}>
                                {formatPrice(item.unitPrice)}원
                              </span>
                              <span className="font-medium" style={{ color: 'var(--warning)' }}>
                                {formatPrice(item.discountedPrice)}원
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)' }}>
                              단가: {formatPrice(item.unitPrice)}원
                            </span>
                          )}
                        </div>

                        <div
                          className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 mb-3 border"
                          style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                        >
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                          >
                            <Minus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (val >= 0) updateQuantity(item.id, val);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-14 h-8 text-center text-lg font-bold bg-transparent border-none focus:outline-none"
                            style={{ color: 'var(--foreground)' }}
                          />
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                          >
                            <Plus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                          </button>
                        </div>

                        <div className="text-center">
                          {hasDiscount && (
                            <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>
                              {formatPrice(item.originalTotal)}원
                            </p>
                          )}
                          <p
                            className="text-base font-bold"
                            style={{ color: hasDiscount ? 'var(--warning)' : 'var(--primary)' }}
                          >
                            {formatPrice(item.finalTotal)}원
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm space-y-1" style={{ color: 'var(--muted-foreground)' }}>
                    <p>공급가 {formatPrice(calcExVat(totalAmount))}원</p>
                    <p>VAT {formatPrice(totalAmount - calcExVat(totalAmount))}원</p>
                    {totalDiscount > 0 && (
                      <p style={{ color: 'var(--warning)' }}>할인 -{formatPrice(totalDiscount)}원</p>
                    )}
                  </div>
                  <div
                    className="text-right cursor-pointer rounded-lg p-2 -m-2 transition-colors hover:bg-[var(--accent)]"
                    onClick={() => onOpenQuickCalculator && onOpenQuickCalculator(totalAmount)}
                    title="계산기 열기"
                  >
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>총 금액</p>
                    <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
                      {formatPrice(totalAmount)}원
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setCart([])}
                    className="py-3 px-6 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    초기화
                  </button>
                  <button
                    onClick={() => {
                      setIsCartExpanded(false);
                      openOrderConfirm();
                    }}
                    className="flex-1 py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-colors"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    <Calculator className="w-5 h-5" />
                    주문 확인
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
