import { useEffect, useId, useRef } from 'react';
import { ArrowRight, Package, Replace, Search, X } from 'lucide-react';
import ViewportModal from './ui/ViewportModal';
import PriceTypeBadge from './PriceTypeBadge';
import { formatPrice } from '@/lib/utils';

export default function ProductReplacementModal({ currentItem, products, query, onQueryChange, priceType, onSelect, onClose }) {
  const titleId = useId();
  const dialog = useRef(null);
  const input = useRef(null);
  const results = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    // 모바일에서는 열자마자 키보드로 결과 영역을 가리지 않는다.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.current?.focus({ preventScroll: true });
    else dialog.current?.focus({ preventScroll: true });
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => { if (results.current) results.current.scrollTop = 0; }, [query]);

  return (
    <ViewportModal className="replacement-backdrop move-dialog-backdrop" onClick={event => { event.stopPropagation(); onClose(); }}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="replacement-dialog move-dialog" onClick={event => event.stopPropagation()}>
        <header className="replacement-header">
          <span className="replacement-icon"><Replace size={22} /></span>
          <h2 id={titleId}>제품 교체</h2>
          <button type="button" className="replacement-close" aria-label="닫기" onClick={onClose}><X size={22} /></button>
        </header>
        <div className="replacement-search-area">
          <div className="replacement-current"><span>현재 제품</span><strong title={currentItem?.name}>{currentItem?.name}</strong></div>
          <label className="replacement-search">
            <Search size={19} aria-hidden="true" />
            <input ref={input} aria-label="교체할 제품 검색" placeholder="제품명 또는 규격으로 검색" value={query}
              onChange={event => onQueryChange(event.target.value)} />
          </label>
          <div className="replacement-results-meta">
            <span role="status">{query.trim() ? '검색 결과' : '관련 제품'} <b>{products.length}건</b></span>
            <span><PriceTypeBadge priceType={priceType} /> <small>VAT 포함</small></span>
          </div>
        </div>
        <div ref={results} className="replacement-results" aria-label="교체 제품 목록" tabIndex={0}>
          {products.length === 0 ? <div className="replacement-empty"><Search size={30} /><strong>{query.trim() ? '검색 결과가 없습니다' : '관련 제품이 없습니다'}</strong><span>다른 제품명이나 규격으로 검색해 주세요.</span></div> :
            <div className="replacement-grid">{products.map(product => {
              const price = priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale);
              const stock = Number(product.stock || 0);
              return <button type="button" key={product.id} className="replacement-product" onClick={() => onSelect(product)}>
                <strong className="replacement-product-name">{product.name}</strong>
                <span className="replacement-product-meta"><span>{product.category || '기타'}</span><span data-empty={stock <= 0}><Package size={13} /> 재고 <b>{stock}</b></span></span>
                <span className="replacement-product-bottom"><strong data-retail={priceType === 'retail'}>{formatPrice(price)}<small>원</small></strong><span>교체 <ArrowRight size={14} /></span></span>
              </button>;
            })}</div>}
        </div>
        <footer className="replacement-footer"><span>제품을 선택하면 기존 수량을 유지해 교체합니다.</span><button type="button" onClick={onClose}>취소</button></footer>
      </section>
    </ViewportModal>
  );
}
