import { useState, useEffect } from 'react';
import { Save, X, Maximize2, Minimize2 } from 'lucide-react';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import { getTodayKST } from '@/lib/utils';

export default function SaveCartModal({
  isOpen,
  onSave,
  cart = [],
  priceType = 'wholesale',
  formatPrice,
  customerName = '',
  initialPhone = '',
  initialAddress = '',
  customers = [],
  onBack,
  onCloseAll,
}) {
  const [cartName, setCartName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [priority, setPriority] = useState('normal');
  const [memo, setMemo] = useState('');
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();

  useEffect(() => {
    if (!isOpen) return;

    if (customerName && customerName.trim()) {
      setCartName(customerName.trim());
    } else {
      const now = new Date();
      const defaultName = `${now.getMonth() + 1}월 ${now.getDate()}일 ${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      setCartName(defaultName);
    }

    setDeliveryDate(getTodayKST());
    setStatus('pending');
    setPriority('normal');
    setMemo('');
    // 초기 전화번호/주소가 있으면 사용, 없으면 등록된 거래처에서 자동 매칭
    let phone = initialPhone || '';
    let address = initialAddress || '';
    if (customerName && customers.length > 0 && (!phone || !address)) {
      const matched = customers.find(
        c => c?.name?.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, '')
      );
      if (matched) {
        if (!phone && matched.phone) phone = matched.phone;
        if (!address && matched.address) address = matched.address;
      }
    }
    setCustomerPhone(phone);
    setCustomerAddress(address);
  }, [customerName, initialPhone, initialAddress, customers, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onBack]);

  const total = cart.reduce((sum, item) => {
    const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
    return sum + price * item.quantity;
  }, 0);

  const handleSave = async () => {
    if (!cartName.trim()) return;
    await onSave({
      name: cartName.trim(),
      phone: customerPhone.trim(),
      address: customerAddress.trim(),
      deliveryDate,
      status,
      priority,
      memo: memo.trim(),
    });
    if (onCloseAll) {
      onCloseAll();
    } else {
      onBack();
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors';
  const inputStyle = {
    backgroundColor: 'var(--background)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-modal-backdrop modal-backdrop-fs-transition"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isFullscreen ? '0' : '1rem' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onBack} />

      <div
        className="relative w-full overflow-hidden flex flex-col shadow-2xl border animate-modal-up modal-fs-transition"
        style={{
          backgroundColor: 'var(--card)', borderColor: 'var(--border)',
          maxWidth: isFullscreen ? '100vw' : '42rem',
          height: isFullscreen ? '100vh' : 'auto',
          maxHeight: isFullscreen ? '100vh' : '85vh',
          borderRadius: isFullscreen ? '0' : '1rem',
          boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }}
        >
          <div className="flex items-center gap-3">
            <Save className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              장바구니 저장
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]" title={isFullscreen ? '원래 크기' : '전체화면'}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} /> : <Maximize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />}
            </button>
            <button onClick={onBack} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]">
              <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Cart name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
              저장 이름 (업체명)
            </label>
            <input
              type="text"
              value={cartName}
              onChange={(e) => {
                const val = e.target.value;
                setCartName(val);
                // 등록된 거래처명과 일치하면 전화번호/주소 자동 채움
                if (val.trim() && customers.length > 0) {
                  const matched = customers.find(
                    c => c?.name?.toLowerCase().replace(/\s/g, '') === val.trim().toLowerCase().replace(/\s/g, '')
                  );
                  if (matched) {
                    if (matched.phone) setCustomerPhone(matched.phone);
                    if (matched.address) setCustomerAddress(matched.address);
                  }
                }
              }}
              placeholder="고객명 또는 저장명 입력"
              className={inputClass}
              style={inputStyle}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          </div>

          {/* Phone and Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                전화번호
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="010-0000-0000"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                주소
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="배송 주소 입력"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Delivery date */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
              배송 예정일
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Status and priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                상태
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="pending">대기</option>
                <option value="draft">작성 중</option>
                <option value="scheduled">예약됨</option>
                <option value="ready">준비 완료</option>
                <option value="hold">보류</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                우선순위
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
              메모
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="배송 관련 메모 (선택)"
              rows={2}
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </div>

          {/* Cart summary */}
          <div
            className="rounded-lg p-4 border"
            style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>상품</span>
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {cart.length}종 / {cart.reduce((sum, item) => sum + item.quantity, 0)}개
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>합계</span>
              <span className="text-lg font-bold" style={{ color: 'var(--success)' }}>
                {formatPrice(total)}
              </span>
            </div>
          </div>

          {/* Cart items */}
          <div
            className="rounded-lg p-3 border max-h-28 overflow-y-auto"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {cart.map((item) => `${item.name}(${item.quantity})`).join(', ')}
            </p>
          </div>
        </div>

        {/* Footer buttons */}
        <div
          className="flex gap-3 px-5 py-4 border-t flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
        >
          <button
            onClick={handleSave}
            disabled={!cartName.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: cartName.trim() ? 'var(--primary)' : 'var(--muted)',
              color: cartName.trim() ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            <Save className="w-4 h-4" />
            저장하기
          </button>
          <button
            onClick={onBack}
            className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
