import { useState, useMemo } from 'react';
import { ArrowLeft, User, Phone, MapPin, FileText, Trash2, Plus, Minus, Save, Search, ShoppingCart, CheckCircle } from 'lucide-react';
import { formatPrice, calcExVat, calculateDiscount } from '@/lib/utils';

export default function OrderPage({
  cart = [],
  priceType = 'wholesale',
  totalAmount = 0,
  onSaveOrder,
  isSaving,
  onUpdateQuantity,
  onRemoveItem,
  onAddItem,
  onReplaceItem,
  products = [],
  initialCustomer,
  customers = [],
  onBack,
  onSaveCart,
  showToast,
}) {
  const [customerName, setCustomerName] = useState(initialCustomer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone || '');
  const [customerAddress, setCustomerAddress] = useState(initialCustomer?.address || '');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomer?.id || null);
  const [orderComplete, setOrderComplete] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const cartItems = useMemo(() => {
    return cart.map(item => {
      const product = products.find(p => p.id === item.id);
      const { discountedPrice, appliedTier } = calculateDiscount(product, item.quantity, item.price);
      return { ...item, discountedPrice, appliedTier, lineTotal: discountedPrice * item.quantity };
    });
  }, [cart, products]);

  const calculatedTotal = useMemo(() =>
    cartItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [cartItems]
  );

  const handleSelectCustomer = (customer) => {
    setCustomerName(customer.name || '');
    setCustomerPhone(customer.phone || '');
    setCustomerAddress(customer.address || '');
    setSelectedCustomerId(customer.id);
    setShowCustomerList(false);
    setCustomerSearch('');
  };

  const handleSaveOrder = async () => {
    if (cart.length === 0) {
      showToast?.('장바구니가 비어있습니다', 'error');
      return;
    }
    setSaving(true);
    try {
      const orderData = {
        customerName: customerName.trim() || '일반고객',
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        memo: memo.trim(),
        items: cartItems.map(item => ({
          id: item.id,
          name: item.name,
          price: item.discountedPrice,
          quantity: item.quantity,
          original_price: item.price,
        })),
        totalAmount: calculatedTotal,
        priceType,
        orderNumber: `ORD-${Date.now()}`,
        existingCustomerId: selectedCustomerId,
      };
      const result = await onSaveOrder?.(orderData);
      if (result) {
        setOrderComplete(true);
        showToast?.('주문이 저장되었습니다', 'success');
        setTimeout(() => onBack?.(), 1500);
      }
    } catch (err) {
      showToast?.('주문 저장 실패', 'error');
    }
    setSaving(false);
  };

  if (orderComplete) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'var(--background)' }}>
        <CheckCircle className="w-16 h-16 mb-4" style={{ color: 'var(--success)' }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>주문 완료!</h2>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>주문이 성공적으로 저장되었습니다</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 h-14 px-4 border-b flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <button onClick={onBack} className="p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>주문 확인</h1>
          <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            {cart.length}개 상품 · {priceType === 'wholesale' ? '도매가' : '소매가'}
          </p>
        </div>
        <button
          onClick={handleSaveOrder}
          disabled={saving || cart.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          <Save className="w-4 h-4" />
          {saving ? '저장중...' : '주문 저장'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 space-y-4">

          {/* Customer Info */}
          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--muted-foreground)' }}>
              고객 정보
            </h3>

            {/* Customer search */}
            {customers.length > 0 && (
              <div className="relative mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCustomerList(!showCustomerList)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors hover:bg-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    <Search className="w-3.5 h-3.5" />
                    기존 거래처 검색
                  </button>
                  {selectedCustomerId && (
                    <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)' }}>
                      거래처 연결됨
                    </span>
                  )}
                </div>
                {showCustomerList && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border shadow-lg max-h-60 overflow-y-auto"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
                      <input
                        type="text"
                        placeholder="이름 또는 전화번호 검색..."
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm bg-transparent"
                        style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        autoFocus
                      />
                    </div>
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                        style={{ color: 'var(--foreground)' }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && <span className="ml-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.phone}</span>}
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>검색 결과 없음</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="고객명 (미입력 시 일반고객)"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="tel"
                  placeholder="전화번호"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="주소"
                  value={customerAddress}
                  onChange={e => setCustomerAddress(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="메모"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                주문 상품
              </h3>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{cart.length}개</span>
            </div>
            <div className="space-y-2">
              {cartItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: 'var(--background)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {formatPrice(item.discountedPrice)}원
                      </span>
                      {item.appliedTier && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)' }}>
                          할인 적용
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdateQuantity?.(item.id, Math.max(1, item.quantity - 1))}
                      className="p-1 rounded hover:bg-[var(--accent)] transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--foreground)' }}>{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity?.(item.id, item.quantity + 1)}
                      className="p-1 rounded hover:bg-[var(--accent)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                    </button>
                  </div>
                  <span className="text-sm font-bold w-24 text-right" style={{ color: 'var(--foreground)' }}>
                    {formatPrice(item.lineTotal)}원
                  </span>
                  <button
                    onClick={() => onRemoveItem?.(item.id)}
                    className="p-1 rounded hover:bg-[var(--accent)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--destructive)' }} />
                  </button>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="flex flex-col items-center py-8">
                  <ShoppingCart className="w-10 h-10 mb-2" style={{ color: 'var(--muted-foreground)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>장바구니가 비어있습니다</p>
                </div>
              )}
            </div>
          </div>

          {/* Total */}
          {cart.length > 0 && (
            <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>합계</span>
                <span className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{formatPrice(calculatedTotal)}원</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>부가세 제외</span>
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{formatPrice(calcExVat(calculatedTotal))}원</span>
              </div>
            </div>
          )}

          {/* Bottom spacer for mobile */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
