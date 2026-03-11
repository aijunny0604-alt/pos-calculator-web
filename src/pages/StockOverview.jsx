import { useState, useEffect } from 'react';
import { ArrowLeft, Menu, Package, Search, ChevronDown } from 'lucide-react';

function matchesSearchQuery(name, query) {
  if (!query.trim()) return true;
  const normalizedName = name.toLowerCase().replace(/\s/g, '');
  const normalizedQuery = query.toLowerCase().replace(/\s/g, '');
  return normalizedName.includes(normalizedQuery);
}

export default function StockOverview({ products = [], categories = [], formatPrice, onBack }) {
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [stockFilter, setStockFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === '전체' || p.category === selectedCategory;
    const matchesSearch = matchesSearchQuery(p.name, searchTerm);
    const stock = p.stock ?? 50;
    const minStock = p.min_stock || 5;

    let matchesStock = true;
    if (stockFilter === 'out') matchesStock = stock === 0 && p.stock_status !== 'incoming';
    else if (stockFilter === 'incoming') matchesStock = p.stock_status === 'incoming';
    else if (stockFilter === 'low') matchesStock = stock > 0 && stock <= minStock;
    else if (stockFilter === 'normal') matchesStock = stock > minStock;

    return matchesCategory && matchesSearch && matchesStock;
  });

  const stats = {
    total: products.length,
    normal: products.filter((p) => (p.stock ?? 50) > (p.min_stock || 5)).length,
    low: products.filter((p) => (p.stock ?? 50) > 0 && (p.stock ?? 50) <= (p.min_stock || 5)).length,
    incoming: products.filter((p) => p.stock_status === 'incoming').length,
    out: products.filter((p) => (p.stock ?? 50) === 0 && p.stock_status !== 'incoming').length,
  };

  const statCards = [
    { key: 'all', label: '전체', value: stats.total, color: 'var(--foreground)', activeBorder: 'var(--primary)', activeBg: 'var(--secondary)' },
    { key: 'normal', label: '정상', value: stats.normal, color: 'var(--success)', activeBorder: 'var(--success)', activeBg: 'color-mix(in srgb, var(--success) 12%, transparent)' },
    { key: 'low', label: '부족', value: stats.low, color: 'var(--warning)', activeBorder: 'var(--warning)', activeBg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
    { key: 'incoming', label: '입고대기', value: stats.incoming, color: 'var(--warning)', activeBorder: 'var(--warning)', activeBg: 'color-mix(in srgb, var(--warning) 12%, transparent)' },
    { key: 'out', label: '품절', value: stats.out, color: 'var(--destructive)', activeBorder: 'var(--destructive)', activeBg: 'color-mix(in srgb, var(--destructive) 12%, transparent)' },
  ];

  const getStockBadge = (product) => {
    const stock = product.stock ?? 50;
    const minStock = product.min_stock || 5;
    const isIncoming = product.stock_status === 'incoming';
    const isOut = stock === 0 && !isIncoming;
    const isLow = stock > 0 && stock <= minStock;

    if (isIncoming) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--warning)' }} />
          입고대기
        </span>
      );
    }
    if (isOut) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={{ background: 'color-mix(in srgb, var(--destructive) 20%, transparent)', color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
          품절
        </span>
      );
    }
    if (isLow) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)', borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}>
          {stock}개
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border" style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)' }}>
        {stock}개
      </span>
    );
  };

  const getRowBg = (product) => {
    const stock = product.stock ?? 50;
    const minStock = product.min_stock || 5;
    const isIncoming = product.stock_status === 'incoming';
    const isOut = stock === 0 && !isIncoming;
    const isLow = stock > 0 && stock <= minStock;

    if (isIncoming) return { background: 'color-mix(in srgb, var(--warning) 8%, transparent)' };
    if (isOut) return { background: 'color-mix(in srgb, var(--destructive) 8%, transparent)' };
    if (isLow) return { background: 'color-mix(in srgb, var(--warning) 8%, transparent)' };
    return null;
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile: menu button */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
                className="md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--secondary)]"
              >
                <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
              {/* Desktop: back button */}
              <button
                onClick={onBack}
                className="hidden md:block p-2 rounded-lg transition-colors hover:bg-[var(--secondary)]"
              >
                <ArrowLeft className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                <div>
                  <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>재고 현황</h1>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    전체 {products.length}개 · 검색 {filteredProducts.length}개
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              <span className="hidden sm:inline">{isHeaderCollapsed ? '펼치기' : '접기'}</span>
              <ChevronDown
                className="w-4 h-4 transition-transform duration-300"
                style={{ transform: isHeaderCollapsed ? 'rotate(180deg)' : 'rotate(0)' }}
              />
            </button>
          </div>

          {/* Collapsed summary */}
          {isHeaderCollapsed && (
            <div
              className="mt-2 flex items-center justify-between text-xs rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--secondary)' }}
            >
              <span style={{ color: 'var(--muted-foreground)' }}>
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{stats.total}개</span>
                {' · '}
                <span style={{ color: 'var(--success)' }}>{stats.normal} 정상</span>
                {' · '}
                <span style={{ color: 'var(--warning)' }}>{stats.low} 부족</span>
                {' · '}
                <span style={{ color: 'var(--warning)' }}>{stats.incoming} 입고대기</span>
                {' · '}
                <span style={{ color: 'var(--destructive)' }}>{stats.out} 품절</span>
              </span>
              {searchTerm && <span style={{ color: 'var(--primary)' }}>검색: {searchTerm}</span>}
            </div>
          )}
        </div>

        {/* Expandable filters */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: isHeaderCollapsed ? '0px' : '500px', opacity: isHeaderCollapsed ? 0 : 1 }}
        >
          <div className="px-4 pb-4 pt-2 space-y-3">
            {/* Stat filter cards */}
            <div className="grid grid-cols-5 gap-1.5">
              {statCards.map(({ key, label, value, color, activeBorder, activeBg }) => (
                <button
                  key={key}
                  onClick={() => setStockFilter(key)}
                  className={`rounded-lg p-2 text-center transition-all border ${
                    stockFilter === key
                      ? 'ring-2 ring-offset-1'
                      : 'border-[var(--border)] hover:bg-[var(--secondary)]'
                  }`}
                  style={{
                    backgroundColor: stockFilter === key ? activeBg : 'var(--card)',
                    borderColor: stockFilter === key ? activeBorder : undefined,
                    '--tw-ring-color': stockFilter === key ? activeBorder : 'transparent',
                  }}
                >
                  <p className="text-[10px] mb-0.5" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                  <p className="text-base font-bold" style={{ color }}>{value}</p>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="제품 검색..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                  '--tw-ring-color': 'var(--primary)',
                }}
              />
            </div>

            {/* Category filter */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              <button
                onClick={() => setSelectedCategory('전체')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === '전체'
                    ? 'text-white'
                    : 'hover:bg-[var(--secondary)]'
                }`}
                style={{
                  backgroundColor: selectedCategory === '전체' ? 'var(--primary)' : 'var(--muted)',
                  color: selectedCategory === '전체' ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}
              >
                전체
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: selectedCategory === cat ? 'var(--primary)' : 'var(--muted)',
                    color: selectedCategory === cat ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-4">
          <p className="text-sm mb-3" style={{ color: 'var(--muted-foreground)' }}>
            {selectedCategory !== '전체' && (
              <span style={{ color: 'var(--primary)' }}>{selectedCategory}</span>
            )}
            {selectedCategory !== '전체' && ' · '}
            검색 결과:{' '}
            <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {filteredProducts.length}개
            </span>
          </p>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p style={{ color: 'var(--muted-foreground)' }}>해당 조건의 제품이 없습니다</p>
            </div>
          ) : (
            <div className="rounded-xl border" style={{ borderColor: 'var(--border)', overflow: 'clip' }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--secondary)' }}>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                        제품명
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                        카테고리
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                        도매가
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                        재고
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: 'var(--muted-foreground)' }}>
                        최소 재고
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, index) => (
                      <tr
                        key={product.id}
                        className="border-t transition-colors hover:bg-[var(--secondary)]"
                        style={{ borderColor: 'var(--border)', ...(getRowBg(product) || {}) }}
                      >
                        <td className="px-2 sm:px-4 py-3">
                          <span className="font-medium text-xs sm:text-sm" style={{ color: 'var(--foreground)' }}>
                            {product.name}
                          </span>
                          <span className="block sm:hidden text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                            {product.category} · {formatPrice(product.wholesale)}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-3 hidden sm:table-cell">
                          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {product.category}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                            {formatPrice(product.wholesale)}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center">
                          {getStockBadge(product)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-center hidden md:table-cell">
                          <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {product.min_stock || 5}개
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
