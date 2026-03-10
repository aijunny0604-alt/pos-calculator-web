import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Menu, Package, Car, AlertTriangle, X } from 'lucide-react';

// 차종 분류
const CAR_MODELS = [
  { id: 'veloster-n', label: '벨로스터N', short: '벨N', keywords: ['벨로스터', '벨n', 'veloster'], hasJabara: true, hasDctManual: true },
  { id: 'avante-n', label: '아반떼N', short: '아N', keywords: ['아반떼', '아n', 'avante'], hasJabara: true, hasDctManual: false },
  { id: 'sg70-20', label: '스팅어 & G70 2.0', short: '2.0T', keywords: ['2.0'], hasJabara: false, hasDctManual: false },
  { id: 'sg70-25', label: '스팅어 & G70 2.5', short: '2.5T', keywords: ['2.5'], hasJabara: false, hasDctManual: false },
  { id: 'sg70-33', label: '스팅어 & G70 3.3', short: '3.3T', keywords: ['3.3'], hasJabara: false, hasDctManual: false },
];

function detectCarModel(name) {
  const n = name.toLowerCase().replace(/\s/g, '');
  if ((n.includes('스팅어') || n.includes('g70') || n.includes('stinger')) && n.includes('3.3')) return 'sg70-33';
  if ((n.includes('스팅어') || n.includes('g70') || n.includes('stinger')) && n.includes('2.5')) return 'sg70-25';
  if ((n.includes('스팅어') || n.includes('g70') || n.includes('stinger')) && n.includes('2.0')) return 'sg70-20';
  if (n.includes('벨로스터') || n.includes('벨n') || n.includes('veloster')) return 'veloster-n';
  if (n.includes('아반떼') || n.includes('아n') || n.includes('avante')) return 'avante-n';
  if (n.includes('3.3')) return 'sg70-33';
  if (n.includes('2.5')) return 'sg70-25';
  if (n.includes('2.0')) return 'sg70-20';
  return null;
}

function detectProductType(name) {
  const n = name.toLowerCase().replace(/\s/g, '');
  if (n.includes('자바라') || n.includes('flex')) return 'jabara';
  if (n.includes('촉매') || n.includes('catalytic') || n.includes('catted')) return 'catalytic';
  if (n.includes('직관') || n.includes('straight') || n.includes('catless')) return 'straight';
  return 'downpipe';
}

function detectTransmission(name) {
  const n = name.toLowerCase().replace(/\s/g, '');
  if (n.includes('dct') || n.includes('자동')) return 'dct';
  if (n.includes('수동') || n.includes('mt') || n.includes('manual')) return 'manual';
  return null;
}

function classifyProducts(model, products) {
  const result = {
    catalytic: { stock: 0, products: [] },
    straight: { stock: 0, products: [] },
  };
  if (model.hasJabara) {
    if (model.hasDctManual) {
      result.jabara_dct = { stock: 0, products: [] };
      result.jabara_manual = { stock: 0, products: [] };
    } else {
      result.jabara = { stock: 0, products: [] };
    }
  }
  products.forEach((p) => {
    const type = detectProductType(p.name);
    const trans = detectTransmission(p.name);
    const stock = p.stock ?? 0;
    if (type === 'jabara' && model.hasJabara) {
      if (model.hasDctManual) {
        if (trans === 'manual') { result.jabara_manual.stock += stock; result.jabara_manual.products.push(p); }
        else { result.jabara_dct.stock += stock; result.jabara_dct.products.push(p); }
      } else { result.jabara.stock += stock; result.jabara.products.push(p); }
    } else if (type === 'catalytic') { result.catalytic.stock += stock; result.catalytic.products.push(p); }
    else if (type === 'straight') { result.straight.stock += stock; result.straight.products.push(p); }
    else { result.straight.stock += stock; result.straight.products.push(p); }
  });
  return result;
}

// 재고 표시 뱃지
function StockBadge({ stock, label }) {
  const s = stock ?? 0;
  const isOut = s === 0;
  const isLow = s > 0 && s <= 2;
  const color = isOut ? 'var(--destructive)' : isLow ? 'var(--warning)' : 'var(--success)';
  const bg = isOut
    ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
    : isLow
    ? 'color-mix(in srgb, var(--warning) 12%, transparent)'
    : 'color-mix(in srgb, var(--success) 8%, transparent)';

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      {isOut ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: bg, color }}
        >
          <AlertTriangle className="w-3 h-3" />품절
        </span>
      ) : (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: bg, color }}
        >
          {s}<span className="font-normal ml-0.5">세트</span>
        </span>
      )}
    </div>
  );
}

// 차종 카드
function ModelCard({ model, products, onClick }) {
  const classified = useMemo(() => classifyProducts(model, products), [products, model]);
  const totalStock = Object.values(classified).reduce((sum, c) => sum + c.stock, 0);
  const hasOutOfStock = Object.values(classified).some((c) => c.stock === 0);

  return (
    <button
      onClick={onClick}
      className="card-interactive w-full text-left rounded-xl border p-4 transition-all"
      style={{
        background: 'var(--card)',
        borderColor: hasOutOfStock
          ? 'color-mix(in srgb, var(--destructive) 30%, var(--border))'
          : 'var(--border)',
      }}
    >
      {/* Card top */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
          style={{
            background: hasOutOfStock
              ? 'color-mix(in srgb, var(--destructive) 10%, transparent)'
              : 'color-mix(in srgb, var(--primary) 10%, transparent)',
          }}
        >
          <Car className="w-5 h-5" style={{ color: hasOutOfStock ? 'var(--destructive)' : 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{model.label}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-medium" style={{ color: hasOutOfStock ? 'var(--destructive)' : 'var(--success)' }}>
              {totalStock}세트
            </span>
            {hasOutOfStock && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)' }}>
                품절
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stock list */}
      <div
        className="rounded-lg px-3 py-1 divide-y"
        style={{ background: 'var(--background)', borderColor: 'var(--border)', '--tw-divide-color': 'var(--border)' }}
      >
        <StockBadge stock={classified.catalytic.stock} label="촉매 타입" />
        <StockBadge stock={classified.straight.stock} label="직관 타입" />
        {model.hasJabara && model.hasDctManual && (
          <>
            <StockBadge stock={classified.jabara_dct.stock} label="자바라 DCT" />
            <StockBadge stock={classified.jabara_manual.stock} label="자바라 수동" />
          </>
        )}
        {model.hasJabara && !model.hasDctManual && (
          <StockBadge stock={classified.jabara.stock} label="자바라" />
        )}
      </div>
    </button>
  );
}

// 상세 모달
function DetailModal({ model, products, onClose }) {
  if (!model) return null;
  const classified = classifyProducts(model, products);

  const typeLabels = {
    catalytic: '촉매 타입',
    straight: '직관 타입',
    jabara: '자바라',
    jabara_dct: '자바라 DCT',
    jabara_manual: '자바라 수동',
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 animate-modal-backdrop"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-[var(--border)] animate-modal-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
            >
              <Car className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{model.label}</h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{products.length}개 제품</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {Object.entries(classified).map(([key, val]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                  {typeLabels[key] || key}
                </span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: val.stock === 0 ? 'var(--destructive)' : 'var(--success)',
                    background: val.stock === 0
                      ? 'color-mix(in srgb, var(--destructive) 12%, transparent)'
                      : 'color-mix(in srgb, var(--success) 8%, transparent)',
                  }}
                >
                  {val.stock === 0 ? '품절' : `${val.stock}세트`}
                </span>
              </div>
              {val.products.length === 0 ? (
                <p className="text-xs py-2 px-3 rounded-lg" style={{ background: 'var(--background)', color: 'var(--muted-foreground)' }}>
                  등록된 제품 없음
                </p>
              ) : (
                <div className="space-y-1">
                  {val.products.map((p) => {
                    const stock = p.stock ?? 0;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--background)' }}
                      >
                        <span className="truncate flex-1 mr-3" style={{ color: 'var(--foreground)' }}>{p.name}</span>
                        <span
                          className="font-bold flex-shrink-0 text-xs"
                          style={{ color: stock === 0 ? 'var(--destructive)' : stock <= 2 ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {stock === 0 ? '품절' : `${stock}세트`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BurnwayStock({ products = [], formatPrice, onBack }) {
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedModel) setSelectedModel(null);
        else onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, selectedModel]);

  const burnwayProducts = useMemo(
    () => products.filter((p) => p.category === '번웨이'),
    [products]
  );

  const groupedByModel = useMemo(() => {
    const groups = {};
    CAR_MODELS.forEach((m) => { groups[m.id] = []; });
    burnwayProducts.forEach((p) => {
      const modelId = detectCarModel(p.name);
      if (modelId && groups[modelId]) groups[modelId].push(p);
    });
    return groups;
  }, [burnwayProducts]);

  const stats = useMemo(() => {
    const total = burnwayProducts.length;
    const totalStock = burnwayProducts.reduce((sum, p) => sum + (p.stock ?? 0), 0);
    const outOfStock = burnwayProducts.filter((p) => (p.stock ?? 0) === 0).length;
    return { total, totalStock, outOfStock };
  }, [burnwayProducts]);

  const selectedModelData = selectedModel ? CAR_MODELS.find(m => m.id === selectedModel) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 h-14 px-4 border-b flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
          className="md:hidden p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]"
        >
          <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
        </button>
        <button onClick={onBack} className="hidden md:block p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>번웨이 다운파이프</h1>
          <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            {stats.total}개 제품 · <span style={{ color: 'var(--success)' }}>{stats.totalStock}세트</span>
            {stats.outOfStock > 0 && (
              <span style={{ color: 'var(--destructive)' }}> · {stats.outOfStock} 품절</span>
            )}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {burnwayProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="w-14 h-14 mb-4" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>번웨이 제품이 없습니다</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>관리자 페이지에서 제품을 추가해주세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAR_MODELS.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  products={groupedByModel[model.id] || []}
                  onClick={() => setSelectedModel(model.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <DetailModal
        model={selectedModelData}
        products={selectedModelData ? groupedByModel[selectedModelData.id] || [] : []}
        onClose={() => setSelectedModel(null)}
      />
    </div>
  );
}
