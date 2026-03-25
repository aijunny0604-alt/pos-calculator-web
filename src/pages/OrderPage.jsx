import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, X, Building, Phone, MapPin, Search, Plus, Minus,
  Package, ShoppingCart, RefreshCw, Trash2, Check, Copy, Printer,
  ShoppingBag, Maximize2, Minimize2
} from 'lucide-react';
import QuickCalculator from './QuickCalculator';
import { formatPrice, calcExVat, formatDate, formatDateTime, matchesSearchQuery, handleSearchFocus, escapeHtml } from '@/lib/utils';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';

export default function OrderPage({
  cart, priceType, totalAmount, formatPrice: formatPriceProp, onSaveOrder, isSaving,
  onUpdateQuantity, onRemoveItem, onAddItem, onReplaceItem,
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
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();

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
      if (target.closest('.modal-scroll-area') || target.closest('[data-lenis-prevent]')) {
        return;
      }
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

  // ─── 자바라 자동 연동 ──────────────────────────────────────
  // 번웨이 다운파이프 주문 시 해당 차종 자바라 재고도 함께 차감
  // 차종별로 그룹핑, 여러 자바라 타입이 있으면 선택 가능
  const [linkedJabaras, setLinkedJabaras] = useState([]);
  // { carModel, jabaraOptions: [{id, name, stock}], selectedId, qty }

  useEffect(() => {
    if (!products || products.length === 0) return;

    // 번웨이 다운파이프만 필터 (스팅어/G70 제외, 자바라 제외)
    const downpipeItems = cart.filter(item => {
      const cat = (item.category || '').toLowerCase();
      const name = (item.name || '').toLowerCase().replace(/\s/g, '');
      if (cat !== '번웨이') return false;
      if (!name.includes('다운파이프') && !name.includes('직관') && !name.includes('촉매')) return false;
      if (name.includes('자바라')) return false;
      if (name.includes('스팅어') || name.includes('g70')) return false;
      return true;
    });

    if (downpipeItems.length === 0) {
      setLinkedJabaras([]);
      return;
    }

    // 차종별 그룹핑
    const carGroups = new Map(); // carModel → { totalQty, fromItems }
    for (const item of downpipeItems) {
      const name = item.name || '';
      let carModel = '';
      if (/벨로스터/i.test(name)) carModel = '벨로스터N';
      else if (/아반떼/i.test(name)) carModel = '아반떼N';
      else if (/젠쿠/i.test(name)) carModel = '젠쿠비';
      else {
        const parts = name.split(/\s+/);
        carModel = parts[0] || '';
      }
      if (!carModel) continue;

      if (carGroups.has(carModel)) {
        const g = carGroups.get(carModel);
        g.totalQty += item.quantity;
        g.fromItems.push(item.name);
      } else {
        carGroups.set(carModel, { totalQty: item.quantity, fromItems: [item.name] });
      }
    }

    // 차종별 자바라 옵션 찾기
    setLinkedJabaras(prev => {
      const newList = [];
      for (const [carModel, group] of carGroups) {
        const jabaraOptions = products.filter(p => {
          const pName = (p.name || '').toLowerCase().replace(/\s/g, '');
          const pCat = (p.category || '').toLowerCase();
          return pCat === '번웨이' && pName.includes('자바라') && pName.includes(carModel.toLowerCase().replace(/\s/g, ''));
        }).map(p => ({ id: p.id, name: p.name, stock: p.stock }));

        if (jabaraOptions.length === 0) continue;

        // 이전 선택 유지
        const prevEntry = prev.find(j => j.carModel === carModel);
        const defaultSelected = jabaraOptions[0].id;

        newList.push({
          carModel,
          fromItems: group.fromItems,
          jabaraOptions,
          selectedId: prevEntry ? (jabaraOptions.find(o => o.id === prevEntry.selectedId) ? prevEntry.selectedId : defaultSelected) : defaultSelected,
          qty: prevEntry !== undefined ? prevEntry.qty : group.totalQty,
          suggestedQty: group.totalQty,
        });
      }
      return newList;
    });
  }, [cart, products]);

  // 실시간 총액 계산 (할인 적용)
  const currentTotal = cartWithDiscount.length > 0
    ? cartWithDiscount.reduce((sum, item) => sum + item.finalTotal, 0)
    : cart.reduce((sum, item) => {
        const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
        return sum + (price * item.quantity);
      }, 0);
  const exVat = calcExVat(currentTotal);
  const vat = currentTotal - exVat;

  const generateOrderText = () => {
    let text = `[ 주문서 ]\n\n`;
    text += `${orderNumber}\n`;
    text += `${formatDate(today.toISOString())}\n`;
    if (customerName) text += `${customerName}`;
    if (customerPhone) text += ` ${customerPhone}`;
    if (customerName || customerPhone) text += `\n`;
    text += `${priceType === 'wholesale' ? '도매가' : '소비자가'}\n\n`;

    const itemsToShow = cartWithDiscount.length > 0 ? cartWithDiscount : cart.map(item => ({
      ...item,
      unitPrice: priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale),
      finalTotal: (priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale)) * item.quantity,
      appliedTier: null
    }));

    itemsToShow.forEach((item, index) => {
      if (item.appliedTier && item.totalDiscount > 0) {
        const discountDesc = item.appliedTier.type === 'percent'
          ? `${item.appliedTier.value}%`
          : fmt(item.appliedTier.value);
        text += `${index + 1}. ${item.name} x${item.quantity} = ${fmt(item.finalTotal)} (${discountDesc} 할인)\n`;
      } else {
        text += `${index + 1}. ${item.name} x${item.quantity} = ${fmt(item.finalTotal)}\n`;
      }
    });

    text += `\n`;
    if (totalDiscount > 0) {
      text += `할인: -${fmt(totalDiscount)}\n`;
    }
    text += `총 ${totalQuantity}개 | ${fmt(currentTotal)}\n`;
    text += `(공급가 ${fmt(exVat)} + 부가세 ${fmt(vat)})\n`;

    if (memo) text += `\n메모: ${memo}\n`;

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
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        price: priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale),
        quantity: item.quantity
      })),
      // 자바라 연동 차감 정보
      linkedJabaraDeductions: linkedJabaras.filter(j => j.qty > 0).map(j => {
        const selected = j.jabaraOptions.find(o => o.id === j.selectedId);
        return {
          productId: j.selectedId,
          productName: selected?.name || '',
          quantity: j.qty,
        };
      }),
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
                const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
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
        if (!e.target.closest('.modal-scroll-area')) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full h-full overflow-hidden flex flex-col shadow-2xl animate-modal-up modal-fs-transition"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', maxWidth: isFullscreen ? '100vw' : '56rem', maxHeight: isFullscreen ? '100vh' : '95vh', borderRadius: isFullscreen ? '0' : '1rem', boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
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
          className="flex-1 overflow-y-auto px-4 py-4 modal-scroll-area"
          data-lenis-prevent="true"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          onClick={() => { setShowSearchResults(false); setShowCustomerSuggestions(false); }}
        >
          {/* 고객 정보 */}
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'color-mix(in srgb, var(--card) 80%, transparent)', border: '1px solid var(--border)' }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative" onClick={(e) => e.stopPropagation()}>
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
          <div className="relative mb-4" onClick={(e) => e.stopPropagation()}>
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
                        <p className="text-sm font-medium break-keep leading-tight" style={{ color: 'var(--foreground)' }}>{product.name}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{product.category}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
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
                (cartWithDiscount.length > 0 ? cartWithDiscount : cart.map(item => ({
                  ...item,
                  unitPrice: priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale),
                  finalTotal: (priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale)) * item.quantity,
                  originalTotal: (priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale)) * item.quantity,
                  appliedTier: null,
                  totalDiscount: 0
                }))).map((item) => {
                  const price = item.unitPrice || (priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale));
                  const itemTotal = item.finalTotal || price * item.quantity;
                  const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                  const isChanging = changingItemId === item.id;

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
                        background: hasDiscount
                          ? 'color-mix(in srgb, var(--warning) 10%, var(--card))'
                          : 'color-mix(in srgb, var(--card) 80%, transparent)',
                        border: hasDiscount
                          ? '1px solid color-mix(in srgb, var(--warning) 30%, transparent)'
                          : '1px solid var(--border)',
                      }}
                    >
                      {/* 상단: 상품명 + 변경/삭제 버튼 */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium break-keep leading-tight" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                            {hasDiscount && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                                style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)', color: 'var(--warning)' }}
                              >
                                {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}%↓` : `${fmt(item.appliedTier.value)}↓`}
                              </span>
                            )}
                          </div>
                          <div className="text-sm mt-0.5">
                            {hasDiscount ? (
                              <span className="flex items-center gap-2">
                                <span className="line-through" style={{ color: 'var(--muted-foreground)' }}>{fmt(price)}</span>
                                <span className="font-medium" style={{ color: 'var(--warning)' }}>{fmt(item.discountedPrice)}</span>
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>(VAT제외 {fmt(Math.round(item.discountedPrice / 1.1))})</span>
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
                                      <p className="text-sm font-medium break-keep leading-tight" style={{ color: 'var(--foreground)' }}>{product.name}</p>
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
                          <p className="font-bold text-lg" style={{ color: hasDiscount ? 'var(--warning)' : 'var(--success)' }}>
                            {fmt(itemTotal)}원
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 자바라 연동 차감 */}
          {linkedJabaras.length > 0 && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>자바라 연동 차감</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>자동</span>
              </div>
              {linkedJabaras.map((j) => {
                const selectedOption = j.jabaraOptions.find(o => o.id === j.selectedId);
                const stock = selectedOption?.stock;
                return (
                  <div key={j.carModel} className="py-3 border-b last:border-0" style={{ borderColor: 'color-mix(in srgb, var(--border) 50%, transparent)' }}>
                    {/* 차종명 */}
                    <p className="text-xs mb-1.5" style={{ color: 'var(--muted-foreground)' }}>{j.carModel} 다운파이프</p>

                    {/* 자바라 타입 선택 (2개 이상일 때만) */}
                    {j.jabaraOptions.length > 1 ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {j.jabaraOptions.map(opt => {
                          const isSelected = opt.id === j.selectedId;
                          // "벨로스터N DCT 자바라" → "DCT", "벨로스터N 수동 자바라" → "수동"
                          const typeLabel = opt.name.replace(/자바라/g, '').replace(new RegExp(j.carModel, 'gi'), '').trim() || opt.name;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setLinkedJabaras(prev => prev.map(x => x.carModel === j.carModel ? { ...x, selectedId: opt.id } : x))}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                              style={{
                                background: isSelected ? 'var(--primary)' : 'var(--muted)',
                                color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                              }}
                            >
                              {typeLabel} ({opt.stock ?? '?'})
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm font-medium break-keep leading-tight mb-1" style={{ color: 'var(--foreground)' }}>
                        {selectedOption?.name}
                      </p>
                    )}

                    {/* 수량 + 재고 */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        재고: {stock ?? '?'}개 {j.qty > 0 && `→ ${Math.max(0, (stock || 0) - j.qty)}개`}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLinkedJabaras(prev => prev.map(x => x.carModel === j.carModel ? { ...x, qty: Math.max(0, x.qty - 1) } : x))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--muted)]"
                          style={{ border: '1px solid var(--border)' }}
                        >
                          <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold" style={{ color: j.qty === 0 ? 'var(--muted-foreground)' : 'var(--primary)' }}>{j.qty}</span>
                        <button
                          type="button"
                          onClick={() => setLinkedJabaras(prev => prev.map(x => x.carModel === j.carModel ? { ...x, qty: x.qty + 1 } : x))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--muted)]"
                          style={{ border: '1px solid var(--border)' }}
                        >
                          <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
