import { useState, useEffect, useCallback } from 'react';
import {
  X, FileText, Package, Plus, Minus, Trash2, Edit3, RotateCcw,
  Copy, Check, Printer, Building2, Phone, MapPin, Calendar, Calculator,
  ChevronUp, ChevronDown, Maximize2, Minimize2
} from 'lucide-react';
import { formatPrice, calcExVat, formatDate, formatDateTime, matchesSearchQuery, handleSearchFocus, escapeHtml } from '@/lib/utils';
import QuickCalculator from './QuickCalculator';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';

// Safe price getter - fallback for items without price field
const getItemPrice = (item) => item.price ?? item.wholesale ?? 0;

export default function OrderDetail({
  isOpen,
  onClose,
  order,
  onUpdateOrder,
  products = [],
  onSaveCustomerReturn,
  onDeleteCustomerReturn,
  showToast,
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedOrder, setEditedOrder] = useState(null);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  // Return state
  const [isReturning, setIsReturning] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [deletingReturnId, setDeletingReturnId] = useState(null);
  // Product replace state
  const [replacingItemIndex, setReplacingItemIndex] = useState(null);
  const [replaceSearchTerm, setReplaceSearchTerm] = useState('');
  // Calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  // Mobile bottom section collapse state
  const [isBottomExpanded, setIsBottomExpanded] = useState(true);
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();

  // Reset editedOrder whenever order changes
  useEffect(() => {
    if (order) {
      setEditedOrder({
        ...order,
        customerAddress: order.customerAddress || '',
        items: [...order.items],
      });
    }
  }, [order]);

  // ESC key handling
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (replacingItemIndex !== null) {
          setReplacingItemIndex(null);
          setReplaceSearchTerm('');
        } else if (isReturning) {
          handleReturnCancel();
        } else if (isEditing) {
          setEditedOrder({
            ...order,
            customerAddress: order.customerAddress || '',
            items: [...order.items],
          });
          setIsEditing(false);
          setShowProductSearch(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, isEditing, isReturning, order, replacingItemIndex]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    };
  }, [isOpen]);

  // Product search for adding (must be before early return for hooks rule)
  const filteredProducts = products.filter(product => {
    if (!productSearchTerm) return false;
    return matchesSearchQuery(product.name, productSearchTerm);
  }).slice(0, 8);

  const handleAddProduct = useCallback((product) => {
    if (!editedOrder || !order) return;
    const price = order.priceType === 'wholesale'
      ? product.wholesale
      : (product.retail || product.wholesale);
    const existingIndex = editedOrder.items.findIndex(item => item.id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...editedOrder.items];
      newItems[existingIndex] = { ...newItems[existingIndex], quantity: newItems[existingIndex].quantity + 1 };
      setEditedOrder({ ...editedOrder, items: newItems });
    } else {
      const newItem = { id: product.id, name: product.name, price, quantity: 1 };
      setEditedOrder({ ...editedOrder, items: [...editedOrder.items, newItem] });
    }
    setProductSearchTerm('');
    setShowProductSearch(false);
  }, [editedOrder, order]);

  const { highlightIndex: addProdHi, handleKeyDown: addProdKeyDown } = useKeyboardNav(
    filteredProducts, handleAddProduct, showProductSearch && filteredProducts.length > 0
  );

  if (!isOpen || !order || !editedOrder) return null;

  const currentItems = isEditing ? editedOrder.items : order.items;
  const currentTotal = currentItems.reduce((sum, item) => sum + (getItemPrice(item) * item.quantity), 0);
  const totalQuantity = currentItems.reduce((sum, item) => sum + item.quantity, 0);
  const exVat = calcExVat(currentTotal);
  const vat = currentTotal - exVat;
  const totalReturned = order.totalReturned || 0;

  // Product search for replacing
  const replaceFilteredProducts = products.filter(product => {
    if (!replaceSearchTerm) return false;
    return matchesSearchQuery(product.name, replaceSearchTerm);
  }).slice(0, 10);

  const getReturnedQuantity = (itemId) => {
    return (order.returns || [])
      .filter(r => r.itemId === itemId)
      .reduce((sum, r) => sum + r.quantity, 0);
  };

  // Edit: quantity change
  const handleQuantityChange = (index, delta) => {
    const newItems = [...editedOrder.items];
    const newQuantity = newItems[index].quantity + delta;
    if (newQuantity > 0) {
      newItems[index] = { ...newItems[index], quantity: newQuantity };
      setEditedOrder({ ...editedOrder, items: newItems });
    }
  };

  // Edit: remove item
  const handleRemoveItem = (index) => {
    const newItems = editedOrder.items.filter((_, i) => i !== index);
    if (newItems.length > 0) {
      setEditedOrder({ ...editedOrder, items: newItems });
    } else {
      alert('최소 1개의 제품이 필요합니다.');
    }
  };

  // Edit: open replace product
  const openReplaceProduct = (index) => {
    setReplacingItemIndex(index);
    setReplaceSearchTerm('');
  };

  // Edit: execute replace
  const handleReplaceProduct = (newProduct) => {
    if (replacingItemIndex === null || !editedOrder) return;
    const price = order.priceType === 'wholesale'
      ? newProduct.wholesale
      : (newProduct.retail || newProduct.wholesale);
    const currentQty = editedOrder.items[replacingItemIndex].quantity;
    const newItems = [...editedOrder.items];
    newItems[replacingItemIndex] = {
      id: newProduct.id,
      name: newProduct.name,
      price: price,
      quantity: currentQty,
    };
    setEditedOrder({ ...editedOrder, items: newItems });
    setReplacingItemIndex(null);
    setReplaceSearchTerm('');
  };

  // Edit: save
  const handleSave = () => {
    const updatedData = {
      items: editedOrder.items,
      customer_name: editedOrder.customerName,
      customer_phone: editedOrder.customerPhone,
      customer_address: editedOrder.customerAddress,
      total: currentTotal,
      subtotal: Math.round(currentTotal / 1.1),
      vat: currentTotal - Math.round(currentTotal / 1.1),
      memo: editedOrder.memo,
    };
    if (onUpdateOrder) onUpdateOrder(order.id, updatedData);
    setIsEditing(false);
    setShowProductSearch(false);
  };

  // Edit: cancel
  const handleCancel = () => {
    setEditedOrder({
      ...order,
      customerAddress: order.customerAddress || '',
      items: [...order.items],
    });
    setIsEditing(false);
    setShowProductSearch(false);
  };

  // Return: start
  const startReturn = () => {
    const items = order.items.map(item => {
      const alreadyReturned = (order.returns || [])
        .filter(r => r.itemId === item.id)
        .reduce((sum, r) => sum + r.quantity, 0);
      return {
        ...item,
        returnQuantity: 0,
        maxReturnQuantity: item.quantity - alreadyReturned,
      };
    });
    setReturnItems(items);
    setIsReturning(true);
  };

  // Return: quantity change
  const handleReturnQuantityChange = (index, delta) => {
    setReturnItems(prev => {
      const newItems = [...prev];
      const newQty = newItems[index].returnQuantity + delta;
      if (newQty >= 0 && newQty <= newItems[index].maxReturnQuantity) {
        newItems[index] = { ...newItems[index], returnQuantity: newQty };
      }
      return newItems;
    });
  };

  // Return: submit
  const handleReturnSubmit = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQuantity > 0);
    if (itemsToReturn.length === 0) {
      alert('반품할 상품을 선택해주세요.');
      return;
    }

    const returnTotal = itemsToReturn.reduce((sum, item) => sum + (getItemPrice(item) * item.returnQuantity), 0);
    const returnId = `RET-${Date.now()}`;
    const returnedAt = new Date().toISOString();

    const newReturns = itemsToReturn.map(item => ({
      returnId,
      itemId: item.id,
      itemName: item.name,
      price: getItemPrice(item),
      quantity: item.returnQuantity,
      total: getItemPrice(item) * item.returnQuantity,
      returnedAt,
    }));

    const updatedOrder = {
      ...order,
      returns: [...(order.returns || []), ...newReturns],
      totalReturned: (order.totalReturned || 0) + returnTotal,
      updatedAt: new Date().toISOString(),
    };

    if (onUpdateOrder) onUpdateOrder(order.id || order.orderNumber, {
      returns: updatedOrder.returns,
      totalReturned: updatedOrder.totalReturned,
      updatedAt: updatedOrder.updatedAt,
    });

    if (onSaveCustomerReturn && order.customerName) {
      const customerReturnData = {
        return_id: returnId,
        customer_name: order.customerName,
        customer_id: order.customerId || null,
        order_number: order.orderNumber,
        items: newReturns,
        total_amount: returnTotal,
        returned_at: returnedAt,
      };
      await onSaveCustomerReturn(customerReturnData);
    }

    setIsReturning(false);
    setReturnItems([]);
  };

  // Return: cancel
  const handleReturnCancel = () => {
    setIsReturning(false);
    setReturnItems([]);
  };

  // Return: delete
  const handleDeleteReturn = async (returnId) => {
    if (!confirm('이 반품을 취소하시겠습니까?')) return;
    setDeletingReturnId(returnId);

    const returnsToDelete = (order.returns || []).filter(r => r.returnId === returnId);
    const deleteTotal = returnsToDelete.reduce((sum, r) => sum + r.total, 0);

    const updatedOrder = {
      ...order,
      returns: (order.returns || []).filter(r => r.returnId !== returnId),
      totalReturned: Math.max(0, (order.totalReturned || 0) - deleteTotal),
      updatedAt: new Date().toISOString(),
    };

    if (onUpdateOrder) onUpdateOrder(order.id || order.orderNumber, {
      returns: updatedOrder.returns,
      totalReturned: updatedOrder.totalReturned,
      updatedAt: updatedOrder.updatedAt,
    });
    if (onDeleteCustomerReturn) await onDeleteCustomerReturn(returnId);

    setDeletingReturnId(null);
  };

  const returnTotal = returnItems.reduce((sum, item) => sum + (getItemPrice(item) * item.returnQuantity), 0);

  // Generate order text
  const generateOrderText = () => {
    let text = `[ 주문서 ]\n\n`;
    text += `주문번호: ${order.orderNumber}\n`;
    text += `주문일자: ${formatDate(order.createdAt)}\n`;
    if (order.customerName) text += `고객명: ${order.customerName}\n`;
    if (order.customerPhone) text += `연락처: ${order.customerPhone}\n`;
    text += `단가기준: ${order.priceType === 'wholesale' ? '도매가 (부가세 포함)' : '소비자가 (부가세 포함)'}\n\n`;
    text += `[ 상품 목록 ]\n\n`;
    order.items.forEach((item, index) => {
      text += `${index + 1}. ${item.name}\n`;
      text += `   ${formatPrice(getItemPrice(item))}원 × ${item.quantity}개 = ${formatPrice(getItemPrice(item) * item.quantity)}원\n\n`;
    });
    text += `[ 결제 정보 ]\n\n`;
    text += `총 수량: ${totalQuantity}개\n`;
    text += `공급가액: ${formatPrice(exVat)}원\n`;
    text += `부가세: ${formatPrice(vat)}원\n`;
    text += `총 금액: ${formatPrice(order.totalAmount)}원\n\n`;
    if (order.memo) text += `메모: ${order.memo}\n\n`;
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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { if (showToast) showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.', 'error'); return; }
    printWindow.document.write(`
      <html>
        <head>
          <title>주문서 - ${order.orderNumber}</title>
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
            .account { margin-top: 30px; padding: 15px; background: #f0f8ff; border: 1px solid #3b82f6; border-radius: 5px; text-align: center; }
            .account strong { color: #1e40af; font-size: 18px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>주 문 서</h1>
          <div class="info">
            <p><strong>주문번호:</strong> ${order.orderNumber}</p>
            <p><strong>주문일자:</strong> ${formatDate(order.createdAt)}</p>
            ${order.customerName ? `<p><strong>고객명:</strong> ${escapeHtml(order.customerName)}</p>` : ''}
            ${order.customerPhone ? `<p><strong>연락처:</strong> ${escapeHtml(order.customerPhone)}</p>` : ''}
            <p><strong>단가기준:</strong> ${order.priceType === 'wholesale' ? '도매가' : '소비자가'}</p>
          </div>
          <table>
            <thead><tr><th>No</th><th>상품명</th><th>단가</th><th>수량</th><th>금액</th></tr></thead>
            <tbody>
              ${order.items.map((item, index) => `
                <tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${formatPrice(getItemPrice(item))}원</td><td>${item.quantity}</td><td>${formatPrice(getItemPrice(item) * item.quantity)}원</td></tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total">
            <p>총 수량: ${totalQuantity}개</p>
            <p>공급가액: ${formatPrice(exVat)}원</p>
            <p>부가세(10%): ${formatPrice(vat)}원</p>
            <p class="grand">총 금액: ${formatPrice(order.totalAmount)}원</p>
          </div>
          ${order.memo ? `<div class="memo"><strong>메모:</strong> ${escapeHtml(order.memo)}</div>` : ''}
          <div class="account">
            <strong>입금 계좌</strong><br>
            신한은행 010-5858-6046 무브모터스<br><br>
            <span style="color: #e74c3c; font-size: 12px;">※ 입금 확인 후 빠른 출고로 보답하겠습니다.</span>
          </div>
          <script>window.onload = function() { window.print(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-modal-backdrop modal-backdrop-fs-transition"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', touchAction: 'none', padding: isFullscreen ? '0' : '1rem' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full h-full overflow-hidden border shadow-2xl flex flex-col animate-modal-up modal-fs-transition"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', maxWidth: isFullscreen ? '100vw' : '72rem', maxHeight: isFullscreen ? '100vh' : '95vh', borderRadius: isFullscreen ? '0' : '1rem', boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
      >
        {/* Header - sticky for scroll visibility */}
        <div
          className="px-6 py-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-10"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">주문 상세</h2>
              <p className="text-sm opacity-80">{order.orderNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
              >
                <Edit3 className="w-4 h-4" />
                수정
              </button>
            )}
            {isEditing && (
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors bg-white"
                style={{ color: 'var(--primary)' }}
              >
                <Check className="w-4 h-4" />
                저장
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              title={isFullscreen ? '원래 크기' : '전체화면'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {/* Order info section */}
          <div className="p-4 md:p-6 border-b" style={{ borderColor: 'var(--border)' }}>
            {/* Top row: date + price type badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDateTime(order.createdAt)}</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-bold"
                style={{
                  background: order.priceType === 'wholesale'
                    ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                    : 'color-mix(in srgb, var(--purple) 15%, transparent)',
                  color: order.priceType === 'wholesale' ? 'var(--primary)' : 'var(--purple)',
                }}
              >
                {order.priceType === 'wholesale' ? '도매가' : '소비자가'}
              </span>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* 업체명 */}
              <div
                className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: 'var(--secondary)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}
                >
                  <Building2 className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>업체명</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.customerName || ''}
                      onChange={(e) => setEditedOrder({ ...editedOrder, customerName: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg border text-sm focus:outline-none focus:ring-2"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                      placeholder="업체명 입력"
                    />
                  ) : (
                    <div className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>
                      {order.customerName || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* 전화번호 */}
              <div
                className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: 'var(--secondary)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}
                >
                  <Phone className="w-4 h-4" style={{ color: 'var(--success)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>전화번호</div>
                    {!isEditing && order.customerPhone && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(order.customerPhone); showToast?.('전화번호 복사됨', 'success'); }}
                        className="p-0.5 rounded hover:bg-[var(--accent)] transition-colors"
                        title="전화번호 복사"
                      >
                        <Copy className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.customerPhone || ''}
                      onChange={(e) => setEditedOrder({ ...editedOrder, customerPhone: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg border text-sm focus:outline-none focus:ring-2"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                      placeholder="전화번호 입력"
                    />
                  ) : (
                    <div className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                      {order.customerPhone || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* 배송주소 - full width */}
              <div
                className="flex items-start gap-3 rounded-xl p-3 md:col-span-2"
                style={{ background: 'var(--secondary)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)' }}
                >
                  <MapPin className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>배송주소</div>
                    {!isEditing && order.customerAddress && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(order.customerAddress); showToast?.('주소 복사됨', 'success'); }}
                        className="p-0.5 rounded hover:bg-[var(--accent)] transition-colors"
                        title="주소 복사"
                      >
                        <Copy className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <textarea
                      value={editedOrder.customerAddress || ''}
                      onChange={(e) => setEditedOrder({ ...editedOrder, customerAddress: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg border text-sm focus:outline-none focus:ring-2"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                      placeholder="배송주소 입력"
                      rows={2}
                    />
                  ) : (
                    <div className="font-medium text-sm break-words" style={{ color: 'var(--foreground)' }}>
                      {order.customerAddress || '-'}
                    </div>
                  )}
                </div>
              </div>

              {/* 배송 정보 통합 복사 */}
              {!isEditing && (order.customerPhone || order.customerAddress) && (
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={() => {
                      const parts = [];
                      if (order.customerName) parts.push(`업체명 : ${order.customerName}`);
                      if (order.customerPhone) parts.push(`연락처 : ${order.customerPhone}`);
                      if (order.customerAddress) parts.push(`주소지 : ${order.customerAddress}`);
                      navigator.clipboard.writeText(parts.join('\n'));
                      showToast?.('배송 정보 복사됨', 'success');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--accent)]"
                    style={{ color: 'var(--primary)', border: '1px solid var(--border)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    배송 정보 복사
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Items section */}
          <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <Package className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                주문 상품 ({currentItems.length}종)
              </h3>
              {isEditing && (
                <button
                  onClick={() => setShowProductSearch(!showProductSearch)}
                  className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5 transition-colors"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  <Plus className="w-4 h-4" />
                  제품 추가
                </button>
              )}
            </div>

            {/* Product search for adding */}
            {isEditing && showProductSearch && (
              <div className="mb-4 relative">
                <input
                  type="text"
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  onFocus={handleSearchFocus}
                  onKeyDown={addProdKeyDown}
                  placeholder="제품명 검색..."
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                  autoFocus
                />
                {productSearchTerm && filteredProducts.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl max-h-60 overflow-y-auto z-50"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    {filteredProducts.map((product, idx) => {
                      const price = order.priceType === 'wholesale'
                        ? product.wholesale
                        : (product.retail || product.wholesale);
                      const alreadyAdded = editedOrder.items.some(item => item.id === product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => handleAddProduct(product)}
                          className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--accent)] border-b last:border-0"
                          style={{ borderColor: 'var(--border)', background: idx === addProdHi ? 'var(--accent)' : 'transparent' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{product.name}</div>
                              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{product.category}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm" style={{ color: 'var(--primary)' }}>
                                {formatPrice(price)}원
                              </span>
                              {alreadyAdded && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded"
                                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
                                >
                                  추가됨
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Product replace search modal */}
            {replacingItemIndex !== null && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
              >
                <div
                  className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                      제품 교체 - {editedOrder.items[replacingItemIndex]?.name}
                    </h4>
                    <button
                      onClick={() => { setReplacingItemIndex(null); setReplaceSearchTerm(''); }}
                      className="p-1 rounded hover:bg-[var(--accent)] transition-colors"
                    >
                      <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  </div>
                  <div className="p-3">
                    <input
                      type="text"
                      value={replaceSearchTerm}
                      onChange={(e) => setReplaceSearchTerm(e.target.value)}
                      onFocus={handleSearchFocus}
                      placeholder="교체할 제품 검색..."
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 mb-2"
                      style={{
                        background: 'var(--background)',
                        borderColor: 'var(--border)',
                        color: 'var(--foreground)',
                      }}
                      autoFocus
                    />
                    <div className="max-h-60 overflow-y-auto">
                      {replaceSearchTerm && replaceFilteredProducts.map(product => {
                        const price = order.priceType === 'wholesale'
                          ? product.wholesale
                          : (product.retail || product.wholesale);
                        return (
                          <button
                            key={product.id}
                            onClick={() => handleReplaceProduct(product)}
                            className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--accent)] rounded-lg"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm" style={{ color: 'var(--foreground)' }}>{product.name}</div>
                                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{product.category}</div>
                              </div>
                              <span className="font-medium text-sm" style={{ color: 'var(--primary)' }}>
                                {formatPrice(price)}원
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {replaceSearchTerm && replaceFilteredProducts.length === 0 && (
                        <p className="text-center py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                          검색 결과가 없습니다
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop table header */}
            <div
              className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 rounded-t-xl text-xs font-semibold"
              style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              <div className="col-span-1 text-center">No.</div>
              <div className={isEditing ? 'col-span-4' : 'col-span-5'}>제품명</div>
              <div className="col-span-2 text-right">단가</div>
              <div className={`${isEditing ? 'col-span-2' : 'col-span-1'} text-center`}>수량</div>
              <div className="col-span-2 text-right">금액</div>
              {isEditing && <div className="col-span-1" />}
            </div>

            {/* Items list */}
            <div className="space-y-3 md:space-y-0 md:rounded-b-xl md:border md:overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {currentItems.map((item, index) => {
                const returnedQty = getReturnedQuantity(item.id);
                const isEven = index % 2 === 0;
                return (
                  <div
                    key={index}
                    className="rounded-xl md:rounded-none border md:border-0 md:border-b last:md:border-b-0 overflow-hidden"
                    style={{
                      background: isEven ? 'var(--background)' : 'var(--secondary)',
                      borderColor: returnedQty > 0
                        ? 'color-mix(in srgb, var(--warning) 50%, var(--border))'
                        : 'var(--border)',
                    }}
                  >
                    {/* Mobile card layout */}
                    <div className="block md:hidden p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                            >
                              No.{index + 1}
                            </span>
                            {returnedQty > 0 && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{
                                  background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                                  color: 'var(--warning)',
                                }}
                              >
                                반품 {returnedQty}개
                              </span>
                            )}
                          </div>
                          <div className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                            <span className="break-words">{item.name}</span>
                            {isEditing && (
                              <button
                                onClick={() => openReplaceProduct(index)}
                                className="p-1 rounded transition-colors hover:bg-[var(--accent)] ml-1 inline-flex align-middle"
                                title="다른 제품으로 변경"
                              >
                                <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                              </button>
                            )}
                          </div>
                        </div>
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="flex-shrink-0 p-1.5 rounded transition-colors"
                            style={{
                              background: 'color-mix(in srgb, var(--destructive) 15%, transparent)',
                              color: 'var(--destructive)',
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg p-2" style={{ background: 'var(--muted)' }}>
                          <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>단가</div>
                          <div className="font-medium" style={{ color: 'var(--foreground)' }}>{formatPrice(getItemPrice(item))}원</div>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: 'var(--muted)' }}>
                          <div className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>금액</div>
                          <div className="font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(getItemPrice(item) * item.quantity)}원</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg p-2" style={{ background: 'var(--muted)' }}>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>수량</span>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuantityChange(index, -1)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border hover:bg-[var(--accent)] transition-colors"
                              style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                            >
                              <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                            </button>
                            <input
                              type="number"
                              className="w-12 text-center font-bold border rounded-lg"
                              style={{ color: 'var(--foreground)', background: 'var(--background)', borderColor: 'var(--border)' }}
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                if (val > 0) {
                                  const newItems = [...editedOrder.items];
                                  newItems[index] = { ...newItems[index], quantity: val };
                                  setEditedOrder({ ...editedOrder, items: newItems });
                                }
                              }}
                              min={1}
                            />
                            <button
                              onClick={() => handleQuantityChange(index, 1)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border hover:bg-[var(--accent)] transition-colors"
                              style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                            >
                              <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-medium" style={{ color: 'var(--foreground)' }}>{item.quantity}개</span>
                        )}
                      </div>
                    </div>

                    {/* Desktop table layout */}
                    <div className="hidden md:block">
                      <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                        <div className="col-span-1 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                          {index + 1}
                        </div>
                        <div className={`${isEditing ? 'col-span-4' : 'col-span-5'} font-medium flex items-center gap-2 min-w-0`} style={{ color: 'var(--foreground)' }}>
                          <span className="flex-1 min-w-0 break-words text-sm leading-snug">{item.name}</span>
                          {returnedQty > 0 && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{
                                background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                                color: 'var(--warning)',
                              }}
                            >
                              반품 {returnedQty}
                            </span>
                          )}
                          {isEditing && (
                            <button
                              onClick={() => openReplaceProduct(index)}
                              className="p-1 rounded opacity-60 hover:opacity-100 transition-all hover:bg-[var(--accent)] flex-shrink-0"
                              title="다른 제품으로 변경"
                            >
                              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                            </button>
                          )}
                        </div>
                        <div className="col-span-2 text-right text-sm" style={{ color: 'var(--muted-foreground)' }}>
                          {formatPrice(getItemPrice(item))}원
                        </div>
                        <div className={`${isEditing ? 'col-span-2' : 'col-span-1'} text-center`}>
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleQuantityChange(index, -1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center border hover:bg-[var(--accent)] transition-colors"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                              >
                                <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                              </button>
                              <input
                                type="number"
                                className="w-10 text-center font-bold text-sm border rounded-lg"
                                style={{ color: 'var(--foreground)', background: 'var(--background)', borderColor: 'var(--border)' }}
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 1;
                                  if (val > 0) {
                                    const newItems = [...editedOrder.items];
                                    newItems[index] = { ...newItems[index], quantity: val };
                                    setEditedOrder({ ...editedOrder, items: newItems });
                                  }
                                }}
                                min={1}
                              />
                              <button
                                onClick={() => handleQuantityChange(index, 1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center border hover:bg-[var(--accent)] transition-colors"
                                style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                              >
                                <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                              </button>
                            </div>
                          ) : (
                            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{item.quantity}개</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right font-bold text-sm" style={{ color: 'var(--primary)' }}>
                          {formatPrice(getItemPrice(item) * item.quantity)}원
                        </div>
                        {isEditing && (
                          <div className="col-span-1 flex justify-center">
                            <button
                              onClick={() => handleRemoveItem(index)}
                              className="p-1.5 rounded-lg flex items-center justify-center transition-colors"
                              style={{
                                background: 'color-mix(in srgb, var(--destructive) 15%, transparent)',
                                color: 'var(--destructive)',
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Memo */}
            {isEditing ? (
              <div className="mt-4">
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted-foreground)' }}>메모</label>
                <textarea
                  className="w-full p-3 text-sm rounded-lg border resize-none"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  rows={2}
                  value={editedOrder.memo || ''}
                  onChange={(e) => setEditedOrder({ ...editedOrder, memo: e.target.value })}
                  placeholder="메모 입력..."
                />
              </div>
            ) : order.memo ? (
              <div
                className="mt-4 p-3 rounded-lg border"
                style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>메모: </span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>{order.memo}</span>
              </div>
            ) : null}

            {/* Return history */}
            {order.returns && order.returns.length > 0 && (() => {
              const groupedReturns = (order.returns || []).reduce((acc, r) => {
                const key = r.returnId || 'legacy';
                if (!acc[key]) acc[key] = { items: [], total: 0, returnedAt: r.returnedAt };
                acc[key].items.push(r);
                acc[key].total += r.total;
                return acc;
              }, {});

              return (
                <div
                  className="mt-4 p-3 rounded-xl border"
                  style={{
                    background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                  }}
                >
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--warning)' }}>
                    <RotateCcw className="w-4 h-4" />
                    반품 내역
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(groupedReturns).map(([returnId, group]) => (
                      <div
                        key={returnId}
                        className="rounded-lg p-2"
                        style={{ background: 'var(--card)' }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            {group.returnedAt ? new Date(group.returnedAt).toLocaleDateString('ko-KR') : ''}
                          </span>
                          {returnId !== 'legacy' && (
                            <button
                              onClick={() => handleDeleteReturn(returnId)}
                              disabled={deletingReturnId === returnId}
                              className="text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                              style={{
                                background: 'color-mix(in srgb, var(--destructive) 15%, transparent)',
                                color: 'var(--destructive)',
                              }}
                            >
                              {deletingReturnId === returnId ? '취소중...' : '취소'}
                            </button>
                          )}
                        </div>
                        {group.items.map((r, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="flex-1 min-w-0 break-words" style={{ color: 'var(--foreground)' }}>
                              {r.itemName} x{r.quantity}
                            </span>
                            <span className="font-medium ml-2 flex-shrink-0" style={{ color: 'var(--warning)' }}>
                              -{formatPrice(r.total)}원
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-2 pt-2 border-t flex justify-between items-center"
                    style={{ borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }}
                  >
                    <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>반품 총액</span>
                    <span className="font-bold" style={{ color: 'var(--warning)' }}>
                      -{formatPrice(order.totalReturned || 0)}원
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Return mode UI */}
            {isReturning && (
              <div
                className="mt-4 p-4 rounded-xl border"
                style={{
                  background: 'color-mix(in srgb, var(--warning) 8%, var(--card))',
                  borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                }}
              >
                <h4 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--warning)' }}>
                  <RotateCcw className="w-4 h-4" />
                  반품 처리
                </h4>
                <div className="space-y-2">
                  {returnItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words leading-snug" style={{ color: 'var(--foreground)' }}>
                          {item.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          최대 {item.maxReturnQuantity}개 반품 가능
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleReturnQuantityChange(index, -1)}
                          disabled={item.returnQuantity === 0}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40 hover:bg-[var(--accent)]"
                          style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                        >
                          <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                        <span
                          className="w-8 text-center font-bold"
                          style={{ color: item.returnQuantity > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}
                        >
                          {item.returnQuantity}
                        </span>
                        <button
                          onClick={() => handleReturnQuantityChange(index, 1)}
                          disabled={item.returnQuantity >= item.maxReturnQuantity}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40 hover:bg-[var(--accent)]"
                          style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
                        >
                          <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {returnTotal > 0 && (
                  <div
                    className="mt-3 pt-3 border-t flex justify-between items-center"
                    style={{ borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }}
                  >
                    <span className="font-medium" style={{ color: 'var(--warning)' }}>반품 금액</span>
                    <span className="font-bold" style={{ color: 'var(--warning)' }}>-{formatPrice(returnTotal)}원</span>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleReturnCancel}
                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleReturnSubmit}
                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--warning)', color: 'white' }}
                  >
                    반품 처리
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Desktop: always full, Mobile: collapsible */}

        {/* Desktop footer (always full) */}
        <div
          className="hidden lg:block border-t p-6 flex-shrink-0"
          style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
        >
          {/* Totals */}
          <div className="flex items-start justify-between mb-4">
            <div className="text-sm space-y-1" style={{ color: 'var(--muted-foreground)' }}>
              <p>총 수량: <span className="font-medium" style={{ color: 'var(--foreground)' }}>{totalQuantity}개</span></p>
            </div>
            <div className="text-right">
              <div className="text-sm space-y-1 mb-2" style={{ color: 'var(--muted-foreground)' }}>
                <p className="flex justify-between gap-3">
                  <span>공급가액:</span>
                  <span style={{ color: 'var(--foreground)' }}>{formatPrice(exVat)}원</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span>부가세:</span>
                  <span style={{ color: 'var(--foreground)' }}>{formatPrice(vat)}원</span>
                </p>
                {totalReturned > 0 && (
                  <p className="flex justify-between gap-3">
                    <span style={{ color: 'var(--warning)' }}>반품:</span>
                    <span style={{ color: 'var(--warning)' }}>-{formatPrice(totalReturned)}원</span>
                  </p>
                )}
              </div>
              {totalReturned > 0 ? (
                <div>
                  <p className="text-sm line-through" style={{ color: 'var(--muted-foreground)' }}>
                    {formatPrice(order.totalAmount)}원
                  </p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                    {formatPrice(order.totalAmount - totalReturned)}원
                  </p>
                </div>
              ) : (
                <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {formatPrice(isEditing ? currentTotal : order.totalAmount)}원
                </p>
              )}
            </div>
          </div>

          {/* Action buttons - Desktop */}
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl font-medium transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl font-medium transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                저장
              </button>
            </div>
          ) : isReturning ? null : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={startReturn}
                className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border"
                style={{
                  background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--warning) 50%, var(--border))',
                  color: 'var(--warning)',
                }}
              >
                <RotateCcw className="w-4 h-4" />
                반품
              </button>
              <button
                onClick={() => setShowCalculator(true)}
                className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border"
                style={{
                  background: 'color-mix(in srgb, var(--info) 10%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--info) 50%, var(--border))',
                  color: 'var(--info)',
                }}
              >
                <Calculator className="w-4 h-4" />
                계산기
              </button>
              <button
                onClick={handleCopy}
                className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    복사
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <Printer className="w-4 h-4" />
                인쇄
              </button>
            </div>
          )}
        </div>

        {/* Mobile footer (collapsible) */}
        <div
          className="lg:hidden border-t flex-shrink-0"
          style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
        >
          {/* Compact bar - always visible on mobile */}
          <button
            onClick={() => setIsBottomExpanded(!isBottomExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between"
            style={{ color: 'var(--foreground)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>총액</span>
              <span className="text-lg font-bold">
                {totalReturned > 0
                  ? formatPrice(order.totalAmount - totalReturned)
                  : formatPrice(isEditing ? currentTotal : order.totalAmount)
                }원
              </span>
              {totalReturned > 0 && (
                <span className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>
                  {formatPrice(order.totalAmount)}원
                </span>
              )}
            </div>
            {isBottomExpanded ? (
              <ChevronDown className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
            ) : (
              <ChevronUp className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
            )}
          </button>

          {/* Expandable content */}
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: isBottomExpanded ? '400px' : '0px',
              opacity: isBottomExpanded ? 1 : 0,
            }}
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Amount breakdown */}
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>총 수량</span>
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>{totalQuantity}개</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>공급가액</span>
                  <span style={{ color: 'var(--foreground)' }}>{formatPrice(exVat)}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted-foreground)' }}>부가세</span>
                  <span style={{ color: 'var(--foreground)' }}>{formatPrice(vat)}원</span>
                </div>
                {totalReturned > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--warning)' }}>반품</span>
                    <span style={{ color: 'var(--warning)' }}>-{formatPrice(totalReturned)}원</span>
                  </div>
                )}
              </div>

              {/* Action buttons - Mobile */}
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    저장
                  </button>
                </div>
              ) : isReturning ? null : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    <Edit3 className="w-4 h-4" />
                    수정
                  </button>
                  <button
                    onClick={startReturn}
                    className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border"
                    style={{
                      background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--warning) 50%, var(--border))',
                      color: 'var(--warning)',
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    반품
                  </button>
                  <button
                    onClick={() => setShowCalculator(true)}
                    className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border"
                    style={{
                      background: 'color-mix(in srgb, var(--info) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--info) 50%, var(--border))',
                      color: 'var(--info)',
                    }}
                  >
                    <Calculator className="w-4 h-4" />
                    계산기
                  </button>
                  <button
                    onClick={handleCopy}
                    className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        복사
                      </>
                    )}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    <Printer className="w-4 h-4" />
                    인쇄
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Calculator */}
      {showCalculator && (
        <QuickCalculator
          onClose={() => setShowCalculator(false)}
          initialValue={totalReturned > 0 ? order.totalAmount - totalReturned : (isEditing ? currentTotal : order.totalAmount)}
        />
      )}
    </div>
  );
}
