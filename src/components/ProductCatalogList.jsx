import PriceTypeBadge from './PriceTypeBadge';
import { Plus, Minus, Star, Package } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
export default function ProductCatalogList({products,cartMap,priceType,onAdd,onStep,onQuantity,favorites,onFavorite}) {
 return <div className="pos-product-list" aria-label="상품 목록">
  <div className="pos-list-heading"><span>상품 · 규격</span><span>재고</span><span>단가 <PriceTypeBadge priceType={priceType}/><small>VAT 포함</small></span><span>주문 수량</span></div>
  {products.map(product=>{
   const quantity=cartMap.get(product.id)?.quantity || 0;
   const price=priceType==='wholesale'?product.wholesale:(product.retail || product.wholesale);
   return <div key={product.id} className={`pos-product-row ${quantity?'is-selected':''}`} data-product-id={product.id}>
    <div className="pos-product-identity"><button className="pos-favorite" aria-label={`${product.name} 즐겨찾기`} aria-pressed={favorites.includes(String(product.id))} onClick={()=>onFavorite(product.id)}><Star size={17} fill={favorites.includes(String(product.id))?'currentColor':'none'}/></button><div><strong>{product.name}</strong><small>{product.category || '기타'}{product.specification?` · ${product.specification}`:''}</small>{product.note&&<p className="pos-product-note">{product.note}</p>}</div></div>
    <span className={`pos-stock ${Number(product.stock)===0?'is-empty':''}`}><Package size={13}/>{product.stock ?? '미등록'}<small>{product.stock!=null?'개':''}</small></span>
    <strong className="pos-product-price" style={{color:priceType==='retail'?'var(--destructive)':'var(--foreground)'}}>{formatPrice(price || 0)}<small>원</small></strong>
    <div className="pos-quantity">{quantity ? <><button aria-label={`${product.name} 수량 줄이기`} onClick={()=>onStep(product.id,-1)}><Minus size={15}/></button><input aria-label={`${product.name} 수량`} inputMode="numeric" value={quantity} onChange={e=>{const n=Number(e.target.value);if(Number.isSafeInteger(n)&&n>=0)onQuantity(product.id,n);}}/><button aria-label={`${product.name} 수량 늘리기`} onClick={()=>onStep(product.id,1)}><Plus size={15}/></button></> : <button className="pos-add" onClick={()=>onAdd(product)} aria-label={`${product.name} 담기`}><Plus size={16}/> 담기</button>}</div>
   </div>;
  })}
 </div>;
}
