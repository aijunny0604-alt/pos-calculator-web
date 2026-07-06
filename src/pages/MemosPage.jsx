import { useState, useMemo } from 'react';
import { FileText, CheckCircle2, Package, Search, ArrowLeft, StickyNote } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

// 주문 메모 판별 — 스토어 자동메모는 사용자 메모 아님. ⚠️ OrderHistory.jsx isStoreAutoMemo와 반드시 동일 규칙 유지
// (다르면 메모 목록·개수가 주문내역/대시보드와 어긋남)
const isStoreAutoMemo = (memo) => {
  const m = (memo || '').trim();
  if (!m) return false;
  return /^\[\s*엠파츠\s*\]/.test(m)
    || /\[\s*네\s*이\s*버\s*스마트스토어\s*\]/.test(m)
    || /^\[\s*(쿠팡|G마켓|지마켓|11번가|옥션|위메프|티몬|스마트스토어|네이버)\s*\]\s*주문번호\s*:/.test(m);
};
const hasUserMemo = (o) => !!o?.memo && !isStoreAutoMemo(o.memo);

// 제품 강조색 (AdminPage FLAG_COLORS와 동일 키/색: red/amber/blue/green/purple)
const FLAG_MAP = { red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', green: '#22c55e', purple: '#a78bfa' };

export default function MemosPage({ orders = [], products = [], onViewOrder, onUpdateOrder, setCurrentPage }) {
  const [tab, setTab] = useState('order'); // 'order' | 'product'
  const [memoFilter, setMemoFilter] = useState('all'); // all | unchecked
  const [q, setQ] = useState('');

  const orderMemosAll = useMemo(() => (orders || []).filter(hasUserMemo), [orders]);
  const uncheckedCount = useMemo(() => orderMemosAll.filter((o) => !o.memoChecked).length, [orderMemosAll]);
  const productNotesAll = useMemo(
    () => (products || []).filter((p) => p.note && String(p.note).trim()),
    [products]
  );

  const orderMemos = useMemo(() => {
    let list = orderMemosAll;
    if (memoFilter === 'unchecked') list = list.filter((o) => !o.memoChecked);
    if (q.trim()) {
      const ql = q.toLowerCase();
      list = list.filter((o) => (o.memo || '').toLowerCase().includes(ql) || (o.customerName || '').toLowerCase().includes(ql));
    }
    return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [orderMemosAll, memoFilter, q]);

  const productNotes = useMemo(() => {
    let list = productNotesAll;
    if (q.trim()) {
      const ql = q.toLowerCase();
      list = list.filter((p) => (p.note || '').toLowerCase().includes(ql) || (p.name || '').toLowerCase().includes(ql));
    }
    return list;
  }, [productNotesAll, q]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setCurrentPage?.('dashboard')} className="p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <StickyNote className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>메모 모아보기</h1>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setTab('order')}
            className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5"
            style={tab === 'order'
              ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
              : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            <FileText className="w-4 h-4" /> 주문 메모
            <span className="ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === 'order' ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}>{orderMemosAll.length}</span>
            {uncheckedCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--destructive)', color: 'white' }}>미확인 {uncheckedCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('product')}
            className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5"
            style={tab === 'product'
              ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
              : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            <Package className="w-4 h-4" /> 제품 주의사항
            <span className="ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === 'product' ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}>{productNotesAll.length}</span>
          </button>
        </div>

        {/* 검색 + (주문 탭) 미확인 필터 */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="메모·거래처·제품명 검색"
              className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm focus:outline-none"
              style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)', fontSize: '16px' }}
            />
          </div>
          {tab === 'order' && (
            <div className="flex rounded-xl overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              {[{ k: 'all', l: '전체' }, { k: 'unchecked', l: '미확인' }].map(({ k, l }) => (
                <button key={k} onClick={() => setMemoFilter(k)}
                  className="px-3 py-2 text-xs font-bold transition-colors"
                  style={memoFilter === k ? { background: 'var(--primary)', color: 'white' } : { background: 'var(--card)', color: 'var(--muted-foreground)' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 pb-24 md:pb-6 space-y-2.5">
        {tab === 'order' ? (
          orderMemos.length === 0 ? (
            <Empty text={memoFilter === 'unchecked' ? '미확인 메모가 없습니다' : '주문 메모가 없습니다'} />
          ) : (
            orderMemos.map((order) => (
              <div
                key={order.id || order.orderNumber}
                onClick={() => onViewOrder?.(order)}
                className="group flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:-translate-y-px"
                style={{
                  background: order.memoChecked ? 'var(--card)' : 'color-mix(in srgb, var(--destructive) 5%, var(--card))',
                  borderColor: order.memoChecked ? 'var(--border)' : 'color-mix(in srgb, var(--destructive) 30%, var(--border))',
                  borderLeftWidth: '4px',
                  borderLeftColor: order.memoChecked ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--destructive)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{order.customerName || '미등록'}</span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(order.createdAt)}</span>
                    {!order.memoChecked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'var(--destructive)', color: 'white' }}>미확인</span>
                    )}
                  </div>
                  <p className="text-base break-words leading-snug" style={{ color: 'var(--foreground)' }}>{order.memo}</p>
                </div>
                {!order.memoChecked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateOrder?.(order.id || order.orderNumber, { memo_checked: true }); }}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={{ background: 'color-mix(in srgb, var(--success) 14%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)' }}
                    title="확인 완료 처리"
                  >
                    <CheckCircle2 className="w-4 h-4" /> 확인
                  </button>
                )}
              </div>
            ))
          )
        ) : (
          productNotes.length === 0 ? (
            <Empty text="주의사항 메모가 있는 제품이 없습니다" />
          ) : (
            productNotes.map((p) => {
              const flag = FLAG_MAP[p.flag_color] || 'var(--warning)';
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-3 p-4 rounded-xl border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)', borderLeftWidth: '4px', borderLeftColor: flag }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-bold break-words" style={{ color: 'var(--foreground)' }}>{p.name}</span>
                      {p.category && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{p.category}</span>}
                    </div>
                    <p className="text-base break-words leading-snug font-medium flex items-start gap-1.5" style={{ color: flag }}>
                      <span className="flex-shrink-0">⚠️</span>{p.note}
                    </p>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <StickyNote className="w-12 h-12 mb-3" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} />
      <p style={{ color: 'var(--muted-foreground)' }}>{text}</p>
    </div>
  );
}
