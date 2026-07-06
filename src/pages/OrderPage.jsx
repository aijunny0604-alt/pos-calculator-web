import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, X, Building, Phone, MapPin, Search, Plus, Minus,
  Package, ShoppingCart, RefreshCw, Trash2, Check, Copy, Printer,
  ShoppingBag, Maximize2, Minimize2, ChevronDown, Percent
} from 'lucide-react';
import QuickCalculator from './QuickCalculator';
import QuickItemBar from '@/components/ui/QuickItemBar';
import { formatPrice, calcExVat, formatDate, formatDateTime, matchesSearchQuery, handleSearchFocus, escapeHtml } from '@/lib/utils';
import { calcFinalPrice, convertDiscountValue, discountPlaceholder } from '@/lib/discount';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';

export default function OrderPage({
  cart, priceType, totalAmount, formatPrice: formatPriceProp, onSaveOrder, isSaving,
  onUpdateQuantity, onRemoveItem, onAddItem, onReplaceItem, onUpdateItem,
  products, initialCustomer, onSaveCart, customers = [],
  onBack, cartWithDiscount = [], totalDiscount = 0, showToast
}) {
  const fmt = formatPriceProp || formatPrice;

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone || '');
  const [customerAddress, setCustomerAddress] = useState(initialCustomer?.address || '');
  const [memo, setMemo] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [changingItemId, setChangingItemId] = useState(null);
  const [changeSearchQuery, setChangeSearchQuery] = useState('');
  const [showQuickCalculator, setShowQuickCalculator] = useState(false);
  const [calculatorInitialValue, setCalculatorInitialValue] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [openDiscountIds, setOpenDiscountIds] = useState(() => new Set());
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();

  const toggleDiscountOpen = (id) => {
    setOpenDiscountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const priceField = priceType === 'wholesale' ? 'wholesale' : 'retail';

  // 저장된 장바구니 불러올 때 고객 정보 반영
  useEffect(() => {
    if (initialCustomer) {
      if (initialCustomer.name) setCustomerName(initialCustomer.name);
      if (initialCustomer.phone) setCustomerPhone(initialCustomer.phone);
      if (initialCustomer.address) setCustomerAddress(initialCustomer.address);
    }
  }, [initialCustomer]);

  // 처음 마운트시 주문번호 생성
  useEffect(() => {
    if (!orderNumber) {
      const today = new Date();
      const newOrderNumber = `ORD-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      setOrderNumber(newOrderNumber);
    }
  }, []);

  // ESC 키로 뒤로가기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  // 모달 열릴 때 배경 스크롤 방지
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;

    body.classList.add('modal-open');
    body.style.top = `-${scrollY}px`;

    const preventTouchMove = (e) => {
      const target = e.target;
      // 스크롤 가능한 영역에서는 터치 스크롤 허용
      if (target.closest('.modal-scroll-area') || target.closest('[data-lenis-prevent]')) return;
      if (target.closest('[class*="overflow-y-auto"]') || target.closest('[class*="overflow-auto"]')) return;
      if (target.closest('[style*="overflow"]')) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    return () => {
      body.classList.remove('modal-open');
      body.style.top = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('touchmove', preventTouchMove);
    };
  }, []);

  // 거래처 검색 결과
  const customerSuggestions = customerName.length >= 1
    ? (customers || []).filter(c =>
        c?.name?.toLowerCase().replace(/\s/g, '').includes(customerName.toLowerCase().replace(/\s/g, ''))
      ).slice(0, 6)
    : [];

  // 거래처 선택
  const selectCustomer = useCallback((customer) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || '');
    setCustomerAddress(customer.address || '');
    setSelectedCustomerId(customer.id);
    setShowCustomerSuggestions(false);
  }, []);

  // 키보드 네비게이션
  const { highlightIndex: custHi, handleKeyDown: custKeyDown } = useKeyboardNav(
    customerSuggestions, selectCustomer, showCustomerSuggestions && customerSuggestions.length > 0
  );
  const customerDropRef = useRef(null);

  const selectProduct = useCallback((product) => {
    if (!cart.some(item => item.id === product.id)) {
      onAddItem(product);
      setProductSearch('');
      setShowSearchResults(false);
    }
  }, [cart, onAddItem]);

  // 검색 결과 필터링
  const searchResults = productSearch.length >= 1
    ? products.filter(p => {
        return matchesSearchQuery(p.name, productSearch) || matchesSearchQuery(p.category, productSearch);
      }).slice(0, 8)
    : [];

  const { highlightIndex: prodHi, handleKeyDown: prodKeyDown } = useKeyboardNav(
    searchResults, selectProduct, showSearchResults && searchResults.length > 0
  );
  const productDropRef = useRef(null);

  const today = new Date();
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  // 할인 기준가 계산 헬퍼
  // - originalPrice는 같은 가격타입 컨텍스트에서 저장된 경우만 신뢰 (originalPriceField로 식별)
  //   legacy 데이터(originalPriceField 없음)는 현 priceField와 동일 가정
  // - priceField 값이 유효하면 (>0) 그것 사용
  // - 0/null인 경우 wholesale 폴백 (화면 표시 로직 `item.retail || item.wholesale`와 정합)
  const getDiscountBase = useCallback((item) => {
    const savedField = item.originalPriceField;
    const savedBase = Number(item.originalPrice) || 0;
    if (savedBase > 0 && (savedField == null || savedField === priceField)) {
      return savedBase;
    }
    const fieldVal = Number(item[priceField]) || 0;
    if (fieldVal > 0) return fieldVal;
    const wholesale = Number(item.wholesale) || 0;
    return wholesale;
  }, [priceField]);

  // 라인 할인 적용/해제 (item.originalPrice/discountType/discountValue 메타 관리)
  const applyDiscount = useCallback((item, type, rawValue) => {
    const v = Math.max(0, Number(rawValue) || 0);
    const base = getDiscountBase(item);
    if (v <= 0) {
      onUpdateItem?.(item.id, {
        [priceField]: base,
        price: base,
        originalPrice: undefined,
        originalPriceField: undefined,
        discountType: undefined,
        discountValue: undefined,
      });
      return;
    }
    const final = calcFinalPrice(base, type, v);
    onUpdateItem?.(item.id, {
      [priceField]: final,
      price: final,
      originalPrice: base,
      originalPriceField: priceField,
      discountType: type,
      discountValue: v,
    });
  }, [getDiscountBase, onUpdateItem, priceField]);

  const switchDiscountType = useCallback((item, isLineDiscounted, currentUnit, newType) => {
    if (item.discountType === newType) return;
    if (!isLineDiscounted) {
      onUpdateItem?.(item.id, { discountType: newType });
      return;
    }
    const base = getDiscountBase(item) || currentUnit;
    const newValue = convertDiscountValue(base, currentUnit, newType);
    if (newValue <= 0) {
      onUpdateItem?.(item.id, { discountType: newType, discountValue: 0 });
      return;
    }
    applyDiscount(item, newType, newValue);
  }, [applyDiscount, getDiscountBase, onUpdateItem]);

  const clearDiscount = useCallback((item) => {
    const base = getDiscountBase(item);
    onUpdateItem?.(item.id, {
      [priceField]: base,
      price: base,
      originalPrice: undefined,
      originalPriceField: undefined,
      discountType: undefined,
      discountValue: undefined,
    });
  }, [getDiscountBase, onUpdateItem, priceField]);

  // 할인 메타가 현재 가격타입(priceField)에서 유효한지 판정
  // - originalPriceField가 다르면 이전 가격타입에서 적용된 할인이므로 현재 기준에선 무효
  // - legacy 데이터(originalPriceField 없음)는 현 priceField와 동일 가정 (역호환)
  const isDiscountActiveForCurrent = useCallback((item) => {
    if (!item.discountType || !(Number(item.discountValue) > 0)) return false;
    return item.originalPriceField == null || item.originalPriceField === priceField;
  }, [priceField]);

  // 라인 단가 계산 헬퍼: 현재 가격타입에서 유효한 할인이면 priceField 그대로 (0도 유효),
  // 아니면 기존 폴백 체인 (retail 0/null → wholesale)
  const getLineUnit = useCallback((item) => {
    if (isDiscountActiveForCurrent(item)) return Number(item[priceField]) || 0;
    // price 폴백: 저장 카트/주문이력 복사 item은 wholesale/retail 없이 price만 있을 수 있음 (0원 버그 방지)
    return priceType === 'wholesale' ? (item.wholesale || item.price || item.retail || 0) : (item.retail || item.price || item.wholesale || 0);
  }, [isDiscountActiveForCurrent, priceField, priceType]);

  // 실시간 총액 계산 (할인 적용)
  const currentTotal = cartWithDiscount.length > 0
    ? cartWithDiscount.reduce((sum, item) => sum + item.finalTotal, 0)
    : cart.reduce((sum, item) => sum + (getLineUnit(item) * item.quantity), 0);
  const exVat = calcExVat(currentTotal);
  const vat = currentTotal - exVat;

  const generateOrderText = () => {
    let text = `[ 주문서 ]\n\n`;
    text += `주문번호: ${orderNumber}\n`;
    text += `주문일자: ${formatDate(today.toISOString())}\n`;
    if (customerName) text += `고객명: ${customerName}\n`;
    if (customerPhone) text += `연락처: ${customerPhone}\n`;
    text += `단가기준: ${priceType === 'wholesale' ? '도매가 (부가세 포함)' : '소비자가 (부가세 포함)'}\n\n`;

    text += `[ 상품 목록 ]\n\n`;
    const itemsToShow = cartWithDiscount.length > 0 ? cartWithDiscount : cart.map(item => {
      const unit = getLineUnit(item);
      return { ...item, unitPrice: unit, finalTotal: unit * item.quantity, appliedTier: null };
    });

    itemsToShow.forEach((item, index) => {
      text += `${index + 1}. ${item.name}\n`;
      if (item.appliedTier && item.totalDiscount > 0) {
        const discountDesc = item.appliedTier.type === 'percent'
          ? `${item.appliedTier.value}%`
          : fmt(item.appliedTier.value);
        text += `   ${fmt(item.unitPrice)}원 × ${item.quantity}개 = ${fmt(item.finalTotal)}원 (${discountDesc} 할인)\n\n`;
      } else {
        text += `   ${fmt(item.unitPrice)}원 × ${item.quantity}개 = ${fmt(item.finalTotal)}원\n\n`;
      }
    });

    text += `[ 결제 정보 ]\n\n`;
    text += `총 수량: ${totalQuantity}개\n`;
    text += `공급가액: ${fmt(exVat)}원\n`;
    text += `부가세: ${fmt(vat)}원\n`;
    if (totalDiscount > 0) text += `할인: -${fmt(totalDiscount)}원\n`;
    text += `총 금액: ${fmt(currentTotal)}원\n\n`;
    if (memo) text += `메모: ${memo}\n\n`;
    text += `입금 계좌: 신한은행 010-5858-6046 무브모터스\n\n`;
    text += `※ 입금 확인 후 빠른 출고로 보답하겠습니다.\n`;

    return text;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateOrderText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  const handleSave = async () => {
    if (cart.length === 0) return;

    const orderData = {
      orderNumber,
      createdAt: today.toISOString(),
      customerName,
      customerPhone,
      customerAddress,
      existingCustomerId: selectedCustomerId,
      memo,
      priceType,
      totalAmount: currentTotal,
      // 수량 할인(cartWithDiscount.unitPrice)과 라인 할인 모두 반영되도록
      // cartWithDiscount가 있으면 그 단가 사용, 없으면 라인 단가 헬퍼 사용
      items: (cartWithDiscount.length > 0 ? cartWithDiscount : cart).map(item => {
        const unit = cartWithDiscount.length > 0
          ? Number(item.unitPrice) || 0
          : getLineUnit(item);
        const baseItem = { id: item.id, name: item.name, price: unit, quantity: item.quantity };
        // 현재 가격타입에서 유효한 할인 메타만 저장 (다른 가격타입 할인 메타 누락 방지)
        if (isDiscountActiveForCurrent(item)) {
          baseItem.originalPrice = Number(item.originalPrice) || unit;
          baseItem.discountType = item.discountType;
          baseItem.discountValue = Number(item.discountValue);
          baseItem.originalPriceField = item.originalPriceField || priceField;
        }
        return baseItem;
      })
    };

    const result = await onSaveOrder(orderData);
    if (result) {
      const isMerged = result?.merged;
      const isNewCustomer = customerName && !selectedCustomerId &&
        !(customers || []).find(c => c?.name?.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, ''));

      const isBlacklistCustomer = customerName && (customers || []).find(c =>
        c?.name?.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, '') && c.is_blacklist
      );

      let message;
      if (isMerged) {
        message = `기존 주문(${result.mergedOrderNumber})에 병합되었습니다!\n\n추가 금액: ${fmt(currentTotal)}`;
      } else {
        message = `주문이 저장되었습니다!\n\n주문번호: ${orderNumber}\n총 금액: ${fmt(currentTotal)}`;
      }
      if (isBlacklistCustomer) {
        message += `\n\n주의: "${customerName}"은(는) 블랙리스트 업체입니다!`;
      }
      if (isNewCustomer) {
        message += `\n\n신규 거래처 "${customerName}"이(가) 자동 등록되었습니다.`;
      }
      setSuccessModal(message);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>주문서 - ${orderNumber}</title>
          <style>
            body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
            h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .info { margin: 20px 0; }
            .info p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f5f5f5; }
            .total { font-size: 16px; text-align: right; margin-top: 20px; }
            .total p { margin: 5px 0; }
            .total .grand { font-size: 20px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
            .memo { margin-top: 20px; padding: 10px; background: #f9f9f9; border-radius: 5px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>주 문 서</h1>
          <div class="info">
            <p><strong>주문번호:</strong> ${orderNumber}</p>
            <p><strong>주문일자:</strong> ${formatDate(today.toISOString())}</p>
            ${customerName ? `<p><strong>고객명:</strong> ${escapeHtml(customerName)}</p>` : ''}
            ${customerPhone ? `<p><strong>연락처:</strong> ${escapeHtml(customerPhone)}</p>` : ''}
            <p><strong>단가기준:</strong> ${priceType === 'wholesale' ? '도매가' : '소비자가'}</p>
          </div>
          <table>
            <thead><tr><th>No</th><th>상품명</th><th>단가</th><th>수량</th><th>금액</th></tr></thead>
            <tbody>
              ${cart.map((item, index) => {
                const price = getLineUnit(item);
                return `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${fmt(price)}</td><td>${item.quantity}</td><td>${fmt(price * item.quantity)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="total">
            <p>총 수량: ${totalQuantity}개</p>
            <p>공급가액: ${fmt(exVat)}</p>
            <p>부가세(10%): ${fmt(vat)}</p>
            <p class="grand">총 금액: ${fmt(currentTotal)}</p>
          </div>
          ${memo ? `<div class="memo"><strong>메모:</strong> ${escapeHtml(memo)}</div>` : ''}
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // 모달 닫기 핸들러 (ghost click 방지)
  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTimeout(() => {
      onBack();
    }, 10);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-modal-backdrop modal-backdrop-fs-transition"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', touchAction: 'none', padding: isFullscreen ? '0' : '1rem' }}
      onClick={handleClose}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          handleClose(e);
        }
      }}
      onTouchMove={(e) => {
        if (!e.target.closest('.modal-scroll-area') && !e.target.closest('[class*="overflow-y-auto"]') && !e.target.closest('[class*="overflow-auto"]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full overflow-hidden flex flex-col shadow-2xl animate-modal-up modal-fs-transition"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', maxWidth: isFullscreen ? '100vw' : '56rem', height: isFullscreen ? '100vh' : 'auto', maxHeight: isFullscreen ? '100vh' : '95vh', borderRadius: isFullscreen ? '0' : '1rem', boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <header
          className="px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                <div>
                  <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>주문서</h1>
                  <p className="text-xs" style={{ color: 'var(--primary)' }}>{orderNumber}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{fmt(currentTotal)}원</p>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{totalQuantity}개</p>
              </div>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--muted-foreground)' }}
                title={isFullscreen ? '원래 크기' : '전체화면'}
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              <button
                onClick={handleClose}
                onTouchEnd={handleClose}
                className="p-2 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 modal-scroll-area"
          data-lenis-prevent="true"
          onTouchMove={(e) => e.stopPropagation()}
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          onClick={(e) => {
            // 고객 검색 / 제품 검색 영역 안에서 발생한 클릭은 닫지 않음
            if (e.target.closest('[data-customer-search-area]') || e.target.closest('[data-product-search-area]')) return;
            setShowSearchResults(false);
            setShowCustomerSuggestions(false);
          }}
        >
          {/* 고객 정보 */}
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'color-mix(in srgb, var(--card) 80%, transparent)', border: '1px solid var(--border)' }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative" data-customer-search-area onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }}>
                  <Building className="w-3 h-3" />
                  고객명 / 업체명
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setShowCustomerSuggestions(true);
                    setSelectedCustomerId(null);
                  }}
                  onFocus={(e) => { handleSearchFocus(e); setShowCustomerSuggestions(true); }}
                  onKeyDown={custKeyDown}
                  placeholder="고객명 또는 업체명 검색..."
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  style={{
                    background: 'var(--secondary)',
                    border: `1px solid ${selectedCustomerId ? 'var(--success)' : 'var(--border)'}`,
                    color: 'var(--foreground)',
                  }}
                />
                {selectedCustomerId && (
                  <span className="absolute right-3 top-7" style={{ color: 'var(--success)' }}>
                    <Check className="w-4 h-4" />
                  </span>
                )}
                {customerName && !selectedCustomerId && !showCustomerSuggestions && customerSuggestions.length === 0 && (
                  <span
                    className="absolute right-3 top-7 px-2 py-0.5 text-xs rounded-full"
                    style={{ background: 'color-mix(in srgb, var(--primary) 20%, transparent)', color: 'var(--primary)' }}
                  >
                    신규
                  </span>
                )}
                {showCustomerSuggestions && customerSuggestions.length > 0 && (
                  <div
                    ref={customerDropRef}
                    className="absolute z-20 w-full mt-1 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                  >
                    {customerSuggestions.map((customer, idx) => (
                      <button
                        key={customer.id}
                        onClick={() => selectCustomer(customer)}
                        className="w-full px-3 py-2.5 text-left transition-colors last:border-b-0"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx === custHi
                            ? 'var(--accent)'
                            : customer.is_blacklist
                              ? 'color-mix(in srgb, var(--destructive) 15%, transparent)'
                              : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = customer.is_blacklist
                            ? 'color-mix(in srgb, var(--destructive) 25%, transparent)'
                            : 'var(--secondary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = idx === custHi
                            ? 'var(--accent)'
                            : customer.is_blacklist
                              ? 'color-mix(in srgb, var(--destructive) 15%, transparent)'
                              : 'transparent';
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm flex items-center gap-1.5" style={{ color: customer.is_blacklist ? 'var(--destructive)' : 'var(--foreground)' }}>
                            {customer.is_blacklist && <span>🚫</span>}
                            {customer.name}
                            {customer.is_blacklist && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] rounded"
                                style={{ background: 'color-mix(in srgb, var(--destructive) 40%, transparent)', color: 'var(--destructive)' }}
                              >
                                블랙리스트
                              </span>
                            )}
                          </p>
                          {customer.phone && (
                            <span className="text-xs" style={{ color: customer.is_blacklist ? 'var(--destructive)' : 'var(--success)' }}>
                              {customer.phone}
                            </span>
                          )}
                        </div>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          {customer.address || '주소 미등록'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {showCustomerSuggestions && customerName.length >= 2 && customerSuggestions.length === 0 && (
                  <div
                    className="absolute z-20 w-full mt-1 rounded-lg shadow-xl p-3"
                    style={{ background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--primary) 50%, transparent)' }}
                  >
                    <p className="text-sm flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                      <span>🆕</span>
                      <span>"{customerName}" - 신규 업체로 자동 등록됩니다</span>
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }}>
                  <Phone className="w-3 h-3" />
                  연락처
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="연락처 입력"
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }}>
                <MapPin className="w-3 h-3" />
                배송 주소
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="배송 주소 입력 (택배 발송시 필수)"
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>

          {/* 제품 추가 검색 */}
          <div className="relative mb-4" data-product-search-area onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[var(--primary)]"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <Search className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={(e) => { handleSearchFocus(e); setShowSearchResults(true); }}
                onKeyDown={prodKeyDown}
                placeholder="제품 추가 검색..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--foreground)' }}
              />
              {productSearch && (
                <button onClick={() => { setProductSearch(''); setShowSearchResults(false); }}>
                  <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                </button>
              )}
            </div>

            {showSearchResults && searchResults.length > 0 && (
              <div
                ref={productDropRef}
                className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {searchResults.map((product, idx) => {
                  const isInCart = cart.some(item => item.id === product.id);
                  const price = priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale);
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        if (!isInCart) {
                          onAddItem(product);
                          setProductSearch('');
                          setShowSearchResults(false);
                        }
                      }}
                      className="flex items-center justify-between px-3 py-2.5 cursor-pointer last:border-0 hover:opacity-80"
                      style={{
                        borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                        opacity: isInCart ? 0.5 : 1,
                        background: idx === prodHi ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{product.name}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{product.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>{fmt(price)}</span>
                        {isInCart ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 20%, transparent)' }}
                          >
                            추가됨
                          </span>
                        ) : (
                          <Plus className="w-4 h-4" style={{ color: 'var(--success)' }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 상품 목록 */}
          <div className="mb-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <Package className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              주문 상품 ({cart.length}종 / {totalQuantity}개)
            </h3>

            <div className="space-y-2">
              {cart.length === 0 ? (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                  <p style={{ color: 'var(--muted-foreground)' }}>주문 상품이 없습니다</p>
                </div>
              ) : (
                (cartWithDiscount.length > 0 ? cartWithDiscount : cart.map(item => {
                  const unit = getLineUnit(item);
                  return {
                    ...item,
                    unitPrice: unit,
                    finalTotal: unit * item.quantity,
                    originalTotal: unit * item.quantity,
                    appliedTier: null,
                    totalDiscount: 0,
                  };
                })).map((item) => {
                  // 할인된 라인은 unitPrice가 0이어도 유효 → ?? 사용
                  const price = item.unitPrice ?? getLineUnit(item);
                  const itemTotal = item.finalTotal || price * item.quantity;
                  const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                  const isChanging = changingItemId === item.id;

                  // 라인 할인 메타 (현재 가격타입에서 유효한 할인만 인정)
                  const isLineDiscounted = isDiscountActiveForCurrent(item);
                  const lineBase = isLineDiscounted ? (Number(item.originalPrice) || price) : price;
                  const lineDiscountAmount = isLineDiscounted ? Math.max(0, lineBase - price) : 0;
                  const lineDiscountLabel = isLineDiscounted
                    ? (item.discountType === 'percent'
                        ? `${item.discountValue}%`
                        : item.discountType === 'amount'
                          ? `${fmt(item.discountValue)}원`
                          : `특가`)
                    : '';
                  const discountOpen = openDiscountIds.has(item.id) || isLineDiscounted;
                  const activeMode = item.discountType || 'percent';
                  const anyDiscount = hasDiscount || isLineDiscounted;

                  const changeSearchResults = isChanging && changeSearchQuery.trim()
                    ? products.filter(p => {
                        if (p.id === item.id) return false;
                        if (cart.some(c => c.id === p.id)) return false;
                        return matchesSearchQuery(p.name, changeSearchQuery) || matchesSearchQuery(p.category || '', changeSearchQuery);
                      }).slice(0, 8)
                    : [];

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl p-4 transition-colors"
                      style={{
                        background: anyDiscount
                          ? 'color-mix(in srgb, var(--warning) 10%, var(--card))'
                          : 'color-mix(in srgb, var(--card) 80%, transparent)',
                        border: anyDiscount
                          ? '1px solid color-mix(in srgb, var(--warning) 30%, transparent)'
                          : '1px solid var(--border)',
                      }}
                    >
                      {/* 상단: 상품명 + 변경/삭제 버튼 */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                            {hasDiscount && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)', color: 'var(--warning)' }}
                              >
                                {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}%↓` : `${fmt(item.appliedTier.value)}↓`}
                              </span>
                            )}
                            {isLineDiscounted && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-0.5"
                                style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)', color: 'var(--warning)' }}
                                title="라인 할인 적용됨"
                              >
                                🏷 {lineDiscountLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-sm mt-0.5">
                            {hasDiscount ? (
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className="line-through" style={{ color: 'var(--muted-foreground)' }}>{fmt(price)}</span>
                                <span className="font-medium" style={{ color: 'var(--warning)' }}>{fmt(item.discountedPrice)}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>(VAT제외 {fmt(Math.round(item.discountedPrice / 1.1))})</span>
                              </span>
                            ) : isLineDiscounted ? (
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className="line-through" style={{ color: 'var(--muted-foreground)' }}>{fmt(lineBase)}</span>
                                <span className="font-medium" style={{ color: 'var(--warning)' }}>{fmt(price)}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>(VAT제외 {fmt(Math.round(price / 1.1))})</span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--primary)' }}>
                                {fmt(price)} <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>(VAT제외 {fmt(Math.round(price / 1.1))})</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (isChanging) {
                                setChangingItemId(null);
                                setChangeSearchQuery('');
                              } else {
                                setChangingItemId(item.id);
                                setChangeSearchQuery('');
                              }
                            }}
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors"
                            style={{
                              background: isChanging
                                ? 'var(--primary)'
                                : 'color-mix(in srgb, var(--primary) 20%, transparent)',
                              color: isChanging
                                ? 'white'
                                : 'var(--primary)',
                            }}
                            title="제품 변경"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors"
                            style={{
                              background: 'color-mix(in srgb, var(--destructive) 20%, transparent)',
                              color: 'var(--destructive)',
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 제품 변경 UI */}
                      {isChanging && (
                        <div className="mb-3 relative">
                          <div
                            className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{
                              background: 'var(--secondary)',
                              border: '1px solid color-mix(in srgb, var(--primary) 50%, transparent)',
                            }}
                          >
                            <Search className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                            <input
                              type="text"
                              value={changeSearchQuery}
                              onChange={(e) => setChangeSearchQuery(e.target.value)}
                              onFocus={handleSearchFocus}
                              placeholder="변경할 제품 검색..."
                              className="flex-1 bg-transparent text-sm focus:outline-none"
                              style={{ color: 'var(--foreground)' }}
                              autoFocus
                            />
                            {changeSearchQuery && (
                              <button onClick={() => setChangeSearchQuery('')}>
                                <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                              </button>
                            )}
                          </div>

                          {/* 검색 결과 */}
                          {changeSearchResults.length > 0 && (
                            <div
                              className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto"
                              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            >
                              {changeSearchResults.map(product => {
                                const productPrice = priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale);
                                return (
                                  <div
                                    key={product.id}
                                    onClick={() => {
                                      if (onReplaceItem) {
                                        onReplaceItem(item.id, product, item.quantity);
                                      } else {
                                        const currentQty = item.quantity;
                                        onRemoveItem(item.id);
                                        onAddItem(product);
                                        setTimeout(() => {
                                          if (currentQty > 1) {
                                            onUpdateQuantity(product.id, currentQty);
                                          }
                                        }, 50);
                                      }
                                      setChangingItemId(null);
                                      setChangeSearchQuery('');
                                    }}
                                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer last:border-0 hover:opacity-80"
                                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{product.name}</p>
                                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{product.category}</p>
                                    </div>
                                    <span className="text-sm font-medium ml-2" style={{ color: 'var(--primary)' }}>{fmt(productPrice)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {changeSearchQuery && changeSearchResults.length === 0 && (
                            <div
                              className="absolute top-full left-0 right-0 mt-1 rounded-xl p-3 text-center text-sm"
                              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                            >
                              검색 결과가 없습니다
                            </div>
                          )}
                        </div>
                      )}

                      {/* 라인 할인 토글 바 */}
                      {onUpdateItem && (
                        <div
                          className="mb-2 rounded-lg overflow-hidden"
                          style={{
                            background: isLineDiscounted ? 'color-mix(in srgb, var(--warning) 8%, var(--card))' : 'var(--card)',
                            border: isLineDiscounted
                              ? '1px solid color-mix(in srgb, var(--warning) 30%, var(--border))'
                              : '1px solid var(--border)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleDiscountOpen(item.id)}
                            className="w-full flex items-center justify-between px-3 py-2 transition-colors hover:opacity-90"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: isLineDiscounted ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                              <Percent className="w-3.5 h-3.5" />
                              {isLineDiscounted
                                ? `할인 적용 중 · ${item.discountType === 'fixed' ? `특가 ${fmt(price)}원` : `${lineDiscountLabel} 할인`}`
                                : '할인 적용'}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${discountOpen ? 'rotate-180' : ''}`}
                              style={{ color: 'var(--muted-foreground)' }}
                            />
                          </button>
                          {discountOpen && (
                            <div className="px-3 pb-3 pt-1 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
                              <div className="flex items-center gap-1">
                                {[
                                  { k: 'percent', label: '%' },
                                  { k: 'amount', label: '원' },
                                  { k: 'fixed', label: '특가' },
                                ].map((m) => (
                                  <button
                                    key={m.k}
                                    type="button"
                                    onClick={() => switchDiscountType(item, isLineDiscounted, price, m.k)}
                                    className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors"
                                    style={{
                                      background: activeMode === m.k ? 'var(--warning)' : 'var(--secondary)',
                                      color: activeMode === m.k ? 'white' : 'var(--foreground)',
                                    }}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.discountValue ? Number(item.discountValue).toLocaleString('ko-KR') : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                    applyDiscount(item, activeMode, raw);
                                  }}
                                  placeholder={discountPlaceholder(activeMode)}
                                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--warning)]"
                                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                                />
                                {isLineDiscounted ? (
                                  <button
                                    type="button"
                                    onClick={() => clearDiscount(item)}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                                    style={{ background: 'var(--destructive)', color: 'white' }}
                                  >
                                    해제
                                  </button>
                                ) : (
                                  <span className="text-xs px-2" style={{ color: 'var(--muted-foreground)' }}>
                                    {activeMode === 'percent' ? '0~100' : activeMode === 'amount' ? '차감액' : '단가'}
                                  </span>
                                )}
                              </div>
                              {isLineDiscounted && (
                                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                  <span>차감액: <span className="font-bold" style={{ color: 'var(--warning)' }}>-{fmt(lineDiscountAmount)}원</span></span>
                                  <span>총 절감: <span className="font-bold" style={{ color: 'var(--warning)' }}>-{fmt(lineDiscountAmount * item.quantity)}원</span></span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 하단: 수량 조절 + 소계 */}
                      <div
                        className="flex items-center justify-between rounded-lg p-2"
                        style={{ background: 'var(--secondary)' }}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
                            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (val >= 0) onUpdateQuantity(item.id, val);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-14 h-9 text-center text-lg font-bold rounded-lg focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              color: 'var(--foreground)',
                            }}
                          />
                          <button
                            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
                            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>소계</p>
                          {hasDiscount && (
                            <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>{fmt(item.originalTotal)}원</p>
                          )}
                          {!hasDiscount && isLineDiscounted && (
                            <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>{fmt(lineBase * item.quantity)}원</p>
                          )}
                          <p className="font-bold text-lg" style={{ color: anyDiscount ? 'var(--warning)' : 'var(--success)' }}>
                            {fmt(itemTotal)}원
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 택배비/퀵비/수수료 등 부가 항목 즉석 추가 (주문 등록 단계에서도 청구 가능) */}
            <div className="mt-3">
              <QuickItemBar onAddLine={(line) => onAddItem(line)} />
            </div>
          </div>

          {/* 메모 */}
          <div className="mb-4">
            <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="추가 메모 입력 (선택)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          {/* 금액 요약 */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            {totalDiscount > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>할인 금액</span>
                <span className="font-medium" style={{ color: 'var(--warning)' }}>-{fmt(totalDiscount)}원</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>공급가액</span>
              <span style={{ color: 'var(--foreground)' }}>{fmt(exVat)}원</span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>부가세 (10%)</span>
              <span style={{ color: 'var(--foreground)' }}>{fmt(vat)}원</span>
            </div>
            <div
              className="flex items-center justify-between pt-3 cursor-pointer rounded-lg p-2 -mx-2 transition-colors hover:opacity-80"
              style={{ borderTop: '1px solid var(--border)' }}
              onClick={() => { setCalculatorInitialValue(currentTotal); setShowQuickCalculator(true); }}
              title="계산기 열기"
            >
              <span className="font-semibold" style={{ color: 'var(--foreground)' }}>총 금액</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{fmt(currentTotal)}원</span>
            </div>
          </div>
        </div>

        {/* 하단 버튼 영역 (모달 푸터) */}
        <div
          className="p-4 flex-shrink-0"
          style={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving || cart.length === 0}
                className="py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                style={{
                  background: saved
                    ? 'var(--success)'
                    : isSaving
                      ? 'var(--muted)'
                      : cart.length === 0
                        ? 'var(--muted)'
                        : 'var(--primary)',
                  color: (isSaving || cart.length === 0) && !saved
                    ? 'var(--muted-foreground)'
                    : 'white',
                  cursor: (isSaving || cart.length === 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {saved ? <><Check className="w-5 h-5" />저장 완료!</> :
                 isSaving ? <><RefreshCw className="w-5 h-5 animate-spin" />저장중...</> :
                 <><Check className="w-5 h-5" />주문 완료</>}
              </button>
              <button
                onClick={() => { if (cart.length > 0 && onSaveCart) onSaveCart({ name: customerName, phone: customerPhone, address: customerAddress }); }}
                disabled={cart.length === 0}
                className="py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: cart.length === 0 ? 'var(--muted)' : 'var(--warning)',
                  color: cart.length === 0 ? 'var(--muted-foreground)' : 'white',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ShoppingBag className="w-5 h-5" />담기
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleCopy}
                disabled={cart.length === 0}
                className="py-2.5 rounded-xl font-medium flex items-center justify-center gap-1 text-sm transition-all"
                style={{
                  background: copied ? 'var(--success)' : cart.length === 0 ? 'var(--muted)' : 'var(--muted)',
                  color: copied ? 'white' : cart.length === 0 ? 'var(--muted-foreground)' : 'var(--foreground)',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {copied ? <><Check className="w-4 h-4" />완료</> : <><Copy className="w-4 h-4" />복사</>}
              </button>
              <button
                onClick={handlePrint}
                disabled={cart.length === 0}
                className="py-2.5 rounded-xl font-medium flex items-center justify-center gap-1 text-sm transition-colors"
                style={{
                  background: 'var(--muted)',
                  color: cart.length === 0 ? 'var(--muted-foreground)' : 'var(--foreground)',
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Printer className="w-4 h-4" />인쇄
              </button>
              <button
                onClick={onBack}
                className="py-2.5 rounded-xl font-medium text-sm transition-colors hover:opacity-80"
                style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 계산기 모달 */}
      {showQuickCalculator && (
        <QuickCalculator
          onClose={() => { setShowQuickCalculator(false); setCalculatorInitialValue(null); }}
          initialValue={calculatorInitialValue}
        />
      )}

      {/* 주문 완료 모달 */}
      {successModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-modal-up" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 text-center" style={{ background: 'var(--success)' }}>
              <Check className="w-10 h-10 mx-auto mb-1 text-white" />
              <h3 className="text-lg font-bold text-white">주문 완료</h3>
            </div>
            <div className="p-5">
              <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: 'var(--foreground)' }}>{successModal}</p>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => { setSuccessModal(null); onBack(); }}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors"
                style={{ background: 'var(--primary)' }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
