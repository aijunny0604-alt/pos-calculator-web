import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ArrowRight, Package, Users, ClipboardList, LayoutDashboard, ShoppingBag, FileText, Settings, Sparkles, Calculator, Mic } from 'lucide-react';
import { matchesSearchQuery } from '@/lib/utils';

const PAGE_COMMANDS = [
  { id: 'dashboard', label: '대시보드', description: '매출과 주요 현황 보기', icon: LayoutDashboard },
  { id: 'pos', label: 'POS', description: '상품 선택 및 결제', icon: ShoppingBag },
  { id: 'orders', label: '주문 내역', description: '판매 기록과 주문 상세', icon: ClipboardList },
  { id: 'saved-carts', label: '저장된 장바구니', description: '보류 중인 주문 불러오기', icon: ShoppingBag },
  { id: 'customers', label: '거래처', description: '거래처 목록과 상세 정보', icon: Users },
  { id: 'invoices', label: '거래명세서', description: '명세서 발행 및 관리', icon: FileText },
  { id: 'stock', label: '재고', description: '상품 재고 현황 확인', icon: Package },
  { id: 'admin', label: '관리자', description: '상품, 거래처, 설정 관리', icon: Settings },
  { id: 'ai-analytics', label: 'AI 분석', description: 'MOVIS 분석 대시보드', icon: Sparkles },
];

const QUICK_ACTIONS = [
  { id: 'ai-analytics', label: 'AI 분석', description: 'AI 분석 화면으로 이동', icon: Sparkles, page: 'ai-analytics' },
  { id: 'calculator', label: '계산기', description: 'POS 계산 화면으로 이동', icon: Calculator, page: 'pos' },
  { id: 'new-order', label: '새 주문', description: '새 주문을 시작합니다', icon: Mic, page: 'pos' },
];

const CATEGORIES = {
  pages: '페이지 이동',
  products: '제품 검색',
  customers: '거래처 검색',
  orders: '주문 검색',
  actions: '빠른 액션',
};

const formatPrice = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ko-KR');
};

const getProductPrice = (product) => product?.price ?? product?.unitPrice ?? product?.salePrice ?? product?.selling_price ?? 0;
const getOrderNumber = (order) => order?.orderNumber ?? order?.order_number ?? order?.id ?? '';
const getOrderAmount = (order) => order?.totalAmount ?? order?.total ?? order?.amount ?? order?.grandTotal ?? 0;
const getOrderDate = (order) => order?.date ?? order?.createdAt ?? order?.created_at ?? order?.orderDate ?? order?.order_date;

export default function CommandBar({
  open,
  onClose,
  products = [],
  customers = [],
  orders = [],
  onNavigate,
  onAddToCart,
  onViewOrder,
  onViewCustomer,
  showToast,
}) {
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(open);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => {
      setQuery('');
      setSelectedIndex(0);
      onClose?.();
    }, 180);
  }, [onClose]);

  const runAction = (action) => {
    action?.();
    close();
  };

  const groupedResults = useMemo(() => {
    const q = query.trim();
    const hasQuery = q.length > 0;

    const pages = PAGE_COMMANDS
      .filter((page) => !hasQuery || matchesSearchQuery(`${page.label} ${page.id} ${page.description}`, q))
      .map((page) => ({
        type: 'pages',
        icon: page.icon,
        label: page.label,
        description: page.description,
        action: () => onNavigate?.(page.id),
      }));

    const productResults = hasQuery
      ? products
        .filter((product) => matchesSearchQuery(product?.name || '', q))
        .map((product) => {
          const price = formatPrice(getProductPrice(product));
          return {
            type: 'products',
            icon: Package,
            label: product.name,
            description: [product.category, price].filter(Boolean).join(' · '),
            action: () => {
              onAddToCart?.(product);
              showToast?.(`${product.name} 상품을 장바구니에 추가했습니다.`);
            },
          };
        })
      : [];

    const customerResults = hasQuery
      ? customers
        .filter((customer) => matchesSearchQuery(customer?.name || '', q))
        .map((customer) => ({
          type: 'customers',
          icon: Users,
          label: customer.name,
          description: customer.phone || customer.customerPhone || customer.mobile || '',
          action: () => onViewCustomer ? onViewCustomer(customer) : onNavigate?.('customers'),
        }))
      : [];

    const orderResults = hasQuery
      ? orders
        .filter((order) => {
          const customerName = order?.customerName ?? order?.customer_name ?? '';
          const orderNumber = getOrderNumber(order);
          return matchesSearchQuery(customerName, q) || matchesSearchQuery(String(orderNumber), q);
        })
        .map((order) => {
          const customerName = order?.customerName ?? order?.customer_name ?? '고객 미지정';
          const orderNumber = getOrderNumber(order);
          const amount = formatPrice(getOrderAmount(order));
          const date = formatDate(getOrderDate(order));
          return {
            type: 'orders',
            icon: ClipboardList,
            label: orderNumber ? `${customerName} · ${orderNumber}` : customerName,
            description: [date, amount].filter(Boolean).join(' · '),
            action: () => onViewOrder?.(order),
          };
        })
      : [];

    const actions = QUICK_ACTIONS
      .filter((item) => !hasQuery || matchesSearchQuery(`${item.label} ${item.description}`, q))
      .map((item) => ({
        type: 'actions',
        icon: item.icon,
        label: item.label,
        description: item.description,
        action: () => onNavigate?.(item.page),
      }));

    const ordered = hasQuery
      ? [...pages, ...productResults, ...customerResults, ...orderResults, ...actions]
      : [...pages, ...actions];

    return ordered.slice(0, 20).reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {});
  }, [customers, onAddToCart, onNavigate, onViewCustomer, onViewOrder, orders, products, query, showToast]);

  const flatResults = useMemo(() => Object.values(groupedResults).flat(), [groupedResults]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setQuery('');
      setSelectedIndex(0);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, Math.max(flatResults.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter' && flatResults[selectedIndex]) {
        event.preventDefault();
        runAction(flatResults[selectedIndex].action);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [flatResults, open, selectedIndex]);

  useEffect(() => {
    if (selectedIndex > flatResults.length - 1) {
      setSelectedIndex(Math.max(flatResults.length - 1, 0));
    }
  }, [flatResults.length, selectedIndex]);

  if (!shouldRender) return null;

  let itemIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 px-3 pt-4 sm:pt-20"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="absolute inset-0 bg-[var(--background)]/70 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onMouseDown={close}
      />
      <div
        ref={panelRef}
        className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border shadow-2xl transition-all duration-200 ease-out"
        style={{
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          borderColor: 'var(--border)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-12px)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="페이지, 상품, 거래처, 주문 검색"
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--muted-foreground)]"
            style={{ color: 'var(--foreground)' }}
          />
          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--accent)]"
            aria-label="명령창 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-2 sm:max-h-[560px]">
          {flatResults.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              검색 결과가 없습니다.
            </div>
          ) : (
            Object.entries(groupedResults).map(([type, items]) => (
              <div key={type} className="py-1">
                <div className="px-3 pb-1 pt-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                  {CATEGORIES[type]}
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    itemIndex += 1;
                    const Icon = item.icon;
                    const selected = itemIndex === selectedIndex;

                    return (
                      <button
                        key={`${type}-${item.label}-${itemIndex}`}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        onClick={() => runAction(item.action)}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors"
                        style={{
                          backgroundColor: selected ? 'var(--accent)' : 'transparent',
                          color: 'var(--foreground)',
                        }}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                          style={{
                            borderColor: 'var(--border)',
                            color: selected ? 'var(--primary)' : 'var(--muted-foreground)',
                          }}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          {item.description && (
                            <span className="block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>
                              {item.description}
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          className="h-4 w-4 shrink-0"
                          style={{ color: selected ? 'var(--primary)' : 'var(--muted-foreground)' }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
