import { formatPrice } from '@/lib/utils';
import SubPrice from '@/components/ui/SubPrice';

export default function OrderCardAmount({ order, discount }) {
  return <div className="order-card-amount" data-discounted={discount.hasDiscount || undefined}>
    {discount.hasDiscount && <div className="order-card-adjustment">
      {discount.originalTotal != null && <s aria-label={`할인 전 ${formatPrice(discount.originalTotal)}원`}>{formatPrice(discount.originalTotal)}원</s>}
      {discount.saved != null
        ? <span className="order-card-saving" title="기존 금액에서 차감된 금액" aria-label={`할인액 ${formatPrice(discount.saved)}원`}>−{formatPrice(discount.saved)}원</span>
        : <span className="order-card-adjusted" title="할인된 단가입니다. 할인 전 가격은 저장되어 있지 않습니다.">단가 조정</span>}
    </div>}
    <p className="order-card-final" style={{ color: order.priceType === 'retail' ? 'var(--destructive)' : 'var(--success)' }}>
      {formatPrice(order.totalAmount || 0)}원
    </p>
    <SubPrice total={order.totalAmount || 0} layout="stacked" size="sm" className="mt-0.5" />
  </div>;
}
