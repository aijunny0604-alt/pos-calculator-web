export default function PriceTypeBadge({ priceType }) {
  const label = priceType === 'retail' ? '소매가' : priceType === 'wholesale' ? '도매가' : '단가 미지정';
  return <span className="price-type-badge" data-price-type={priceType}>{label}</span>;
}
