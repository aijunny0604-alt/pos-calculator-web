import { useState, useEffect, useMemo, useCallback } from 'react';
import { PackagePlus, Plus, Search, ArrowLeft, Trash2, X, AlertTriangle, PackageCheck, Database } from 'lucide-react';
import { formatPrice, getTodayKST } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// 매입 발주 — 매입처(JSR 등)에 발주한 건과 입고 진행 현황.
// ⚠️ 사이드바의 "스마트스토어 주문"에 나오는 "발주확인"은 네이버 판매 주문상태로 전혀 다른 개념이다. 혼동 주의.
// 1단계 범위(시트 대체): 품명/규격 자유입력, products 연결·재고 자동증가 없음.

const STATUS_STYLE = {
  '완료':      { bg: 'var(--success)',     fg: '#fff' },
  '부분 입고': { bg: 'var(--warning)',     fg: '#fff' },
  '미입고':    { bg: 'var(--destructive)', fg: '#fff' },
  '차감':      { bg: 'var(--muted)',       fg: 'var(--muted-foreground)' },
};
const overrideStyle = { bg: 'var(--muted)', fg: 'var(--muted-foreground)' };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// 시트 수식 재현: IF(입고=0,"미입고", IF(입고<수량,"부분 입고","완료"))
// + 시트에서 사장님이 상태를 손으로 덮어쓴 행("주문 취소" 등)은 status_override로 보존
// + 취소분 차감 행(수량 음수)은 "차감"
export function itemStatus(item) {
  if (item?.status_override) return item.status_override;
  const qty = num(item?.qty);
  const received = num(item?.received_qty);
  if (qty < 0) return '차감';
  if (qty === 0) return '-';
  if (received <= 0) return '미입고';
  if (received < qty) return '부분 입고';
  return '완료';
}
const isAutoStatus = (s) => Object.prototype.hasOwnProperty.call(STATUS_STYLE, s) || s === '-';
// 공급가액은 시트와 동일하게 "발주수량" 기준 (입고수량 아님)
const itemSupply = (item) => num(item?.unit_price) * num(item?.qty);
const itemRemaining = (item) => num(item?.qty) - num(item?.received_qty);
const poTotal = (po) => (po?.items || []).reduce((s, it) => s + itemSupply(it), 0);
// 미입고/부분입고가 하나라도 남았는지 (override 행은 사장님이 정리한 것으로 보고 제외)
const poOpenItems = (po) => (po?.items || []).filter((it) => !it.status_override && num(it.qty) > 0 && itemRemaining(it) > 0);
const poStatus = (po) => {
  const items = (po?.items || []).filter((it) => !it.status_override && num(it.qty) > 0);
  if (items.length === 0) return '완료';
  if (items.every((it) => itemRemaining(it) <= 0)) return '완료';
  if (items.every((it) => num(it.received_qty) <= 0)) return '미입고';
  return '부분 입고';
};

function StatusBadge({ status, className = '' }) {
  const st = STATUS_STYLE[status] || overrideStyle;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${className}`}
      style={{ background: st.bg, color: st.fg }}
    >
      {status}
    </span>
  );
}

const emptyItem = () => ({ name: '', spec: '', unit_price: 0, qty: 0, received_qty: 0, note: '' });

export default function PurchaseOrders({ showToast, setCurrentPage }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // 마이그008 미적용과 빈 목록을 구분
  const [tab, setTab] = useState('orders'); // 'orders' | 'pending'
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // { ...po } — 신규는 id 없음
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await supabase.getPurchaseOrders();
    if (rows === null) { setLoadFailed(true); setPos([]); }
    else { setLoadFailed(false); setPos(rows); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return pos;
    return pos.filter((po) =>
      (po.po_number || '').toLowerCase().includes(ql)
      || (po.supplier_name || '').toLowerCase().includes(ql)
      || (po.title || '').toLowerCase().includes(ql)
      || (po.items || []).some((it) => `${it.name || ''} ${it.spec || ''}`.toLowerCase().includes(ql))
    );
  }, [pos, q]);

  // 미입고 현황 — 발주를 가로질러 아직 안 들어온 품목만 평탄화 (시트 "미입고 현황"의 목적)
  const pendingItems = useMemo(() => {
    const out = [];
    for (const po of filtered) {
      for (const it of poOpenItems(po)) {
        out.push({ po, item: it });
      }
    }
    return out.sort((a, b) => String(a.po.order_date).localeCompare(String(b.po.order_date)));
  }, [filtered]);

  const summary = useMemo(() => ({
    count: pos.length,
    total: pos.reduce((s, po) => s + poTotal(po), 0),
    openCount: pos.filter((po) => poOpenItems(po).length > 0).length,
    openAmount: pos.reduce((s, po) => s + poOpenItems(po).reduce((t, it) => t + num(it.unit_price) * itemRemaining(it), 0), 0),
  }), [pos]);

  // 같은 날 두 건 발주(시트의 05/12·05/13 같은 케이스)도 충돌 없게 번호 뒤에 -2, -3 부여
  const makePoNumber = useCallback((dateStr) => {
    const base = `PO-${String(dateStr || getTodayKST()).slice(2).replace(/-/g, '')}`;
    const used = new Set(pos.map((p) => p.po_number));
    if (!used.has(base)) return base;
    for (let i = 2; i < 100; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
    return `${base}-${Date.now()}`;
  }, [pos]);

  const openNew = () => {
    const today = getTodayKST();
    setEditing({
      po_number: makePoNumber(today),
      supplier_name: 'JSR',
      order_date: today,
      title: '',
      memo: '',
      items: [emptyItem()],
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    const items = (editing.items || []).filter((it) => (it.name || '').trim() || (it.spec || '').trim());
    if (items.length === 0) { showToast?.('품목을 최소 1개 입력해주세요', 'error'); return; }
    if (!editing.order_date) { showToast?.('발주일을 입력해주세요', 'error'); return; }

    setSaving(true);
    const payload = {
      po_number: editing.po_number,
      supplier_name: (editing.supplier_name || '').trim() || 'JSR',
      order_date: editing.order_date,
      title: (editing.title || '').trim() || null,
      memo: (editing.memo || '').trim() || null,
      items: items.map((it) => ({
        name: (it.name || '').trim(),
        spec: (it.spec || '').trim(),
        unit_price: num(it.unit_price),
        qty: num(it.qty),
        received_qty: num(it.received_qty),
        ...(it.note ? { note: it.note } : {}),
        ...(it.status_override ? { status_override: it.status_override } : {}),
      })),
    };

    const res = editing.id
      ? await supabase.updatePurchaseOrder(editing.id, payload)
      : await supabase.addPurchaseOrder(payload);

    setSaving(false);
    if (!res) { showToast?.('저장 실패 — 마이그레이션 008 적용 여부를 확인해주세요', 'error'); return; }
    showToast?.(editing.id ? '발주를 수정했습니다' : '발주를 등록했습니다', 'success');
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const ok = await supabase.deletePurchaseOrder(confirmDelete.id);
    setConfirmDelete(null);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    showToast?.('발주를 삭제했습니다', 'success');
    setEditing(null);
    load();
  };

  const patchItem = (idx, patch) => {
    setEditing((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setCurrentPage?.('dashboard')} className="p-2 -ml-2 rounded-lg hover:bg-[var(--accent)] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <PackagePlus className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>매입 발주</h1>
          <button
            onClick={openNew}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'var(--primary)' }}
          >
            <Plus className="w-4 h-4" /> 발주 등록
          </button>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>발주 건수</div>
            <div className="text-lg font-black" style={{ color: 'var(--foreground)' }}>{summary.count}건</div>
          </div>
          <div className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>총 발주액</div>
            <div className="text-lg font-black" style={{ color: 'var(--foreground)' }}>₩{formatPrice(summary.total)}</div>
          </div>
          <div className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>미완료 발주</div>
            <div className="text-lg font-black" style={{ color: summary.openCount > 0 ? 'var(--destructive)' : 'var(--foreground)' }}>{summary.openCount}건</div>
          </div>
          <div className="px-3 py-2 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>미입고 금액</div>
            <div className="text-lg font-black" style={{ color: summary.openAmount > 0 ? 'var(--destructive)' : 'var(--foreground)' }}>₩{formatPrice(summary.openAmount)}</div>
          </div>
        </div>

        {/* 탭 + 검색 */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'orders', label: '발주 목록', count: filtered.length },
            { id: 'pending', label: '미입고 현황', count: pendingItems.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3.5 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5"
              style={tab === t.id
                ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
                : { background: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
            >
              {t.label}
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--muted)' }}>{t.count}</span>
            </button>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="품명, 규격, 매입처, 발주번호..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loadFailed && (
          <div className="mb-4 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
            <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
            <div className="text-sm" style={{ color: 'var(--foreground)' }}>
              <div className="font-bold mb-1">발주 테이블을 찾을 수 없습니다</div>
              <div style={{ color: 'var(--muted-foreground)' }}>
                Supabase 대시보드 &gt; SQL Editor 에서 <b>migrations/008_purchase_orders.sql</b> 을 실행해주세요.
                (실행하면 구글시트 기존 발주 10건도 함께 들어옵니다)
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>
        ) : tab === 'orders' ? (
          filtered.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {q ? '검색 결과가 없습니다' : '등록된 발주가 없습니다'}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((po) => {
                const st = poStatus(po);
                const open = poOpenItems(po);
                return (
                  <button
                    key={po.id}
                    onClick={() => setEditing({ ...po, items: (po.items || []).map((it) => ({ ...it })) })}
                    className="text-left rounded-xl border overflow-hidden hover:shadow-md transition-shadow"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex">
                      <div className="w-1.5 flex-shrink-0" style={{ background: (STATUS_STYLE[st] || overrideStyle).bg }} />
                      <div className="flex-1 p-3.5 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold font-mono" style={{ color: 'var(--muted-foreground)' }}>{po.po_number}</span>
                          <StatusBadge status={st} />
                          <span className="ml-auto text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>{po.supplier_name}</span>
                        </div>
                        <div className="text-sm font-bold mb-2 truncate" style={{ color: 'var(--foreground)' }}>
                          {po.order_date} 발주
                        </div>
                        <div className="space-y-0.5 mb-2">
                          {(po.items || []).slice(0, 3).map((it, i) => (
                            <div key={i} className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                              {it.name} {it.spec && <span className="opacity-70">/ {it.spec}</span>} · {num(it.qty)}개
                            </div>
                          ))}
                          {(po.items || []).length > 3 && (
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>외 {(po.items || []).length - 3}건</div>
                          )}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>₩{formatPrice(poTotal(po))}</div>
                          {open.length > 0 && (
                            <div className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--destructive)' }}>
                              <AlertTriangle className="w-3.5 h-3.5" /> 미입고 {open.length}품목
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : pendingItems.length === 0 ? (
          <div className="py-16 text-center" style={{ color: 'var(--muted-foreground)' }}>
            <PackageCheck className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <div className="text-sm font-bold">미입고 품목이 없습니다</div>
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'var(--muted)' }}>
                  {['발주', '품명', '규격명', '단가', '수량', '입고', '남은', '미입고 금액', '상태'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingItems.map(({ po, item }, i) => (
                  <tr key={`${po.id}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => setEditing({ ...po, items: (po.items || []).map((it) => ({ ...it })) })} className="font-mono text-xs font-bold underline" style={{ color: 'var(--primary)' }}>
                        {po.po_number}
                      </button>
                      <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{po.order_date}</div>
                    </td>
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--foreground)' }}>{item.name}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--muted-foreground)' }}>{item.spec}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>₩{formatPrice(item.unit_price)}</td>
                    <td className="px-3 py-2">{num(item.qty)}</td>
                    <td className="px-3 py-2">{num(item.received_qty)}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--destructive)' }}>{itemRemaining(item)}</td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: 'var(--destructive)' }}>₩{formatPrice(num(item.unit_price) * itemRemaining(item))}</td>
                    <td className="px-3 py-2"><StatusBadge status={itemStatus(item)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 발주 등록/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => !saving && setEditing(null)}>
          <div
            className="w-full max-w-5xl max-h-[92vh] rounded-2xl border flex flex-col overflow-hidden"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex-shrink-0 px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
              <PackagePlus className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h2 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>
                {editing.id ? '발주 수정' : '발주 등록'}
              </h2>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{editing.po_number}</span>
              <button onClick={() => setEditing(null)} className="ml-auto p-1.5 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* 발주 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <label className="block">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>매입처</span>
                  <input
                    value={editing.supplier_name || ''}
                    onChange={(e) => setEditing({ ...editing, supplier_name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>발주일</span>
                  <input
                    type="date"
                    value={editing.order_date || ''}
                    onChange={(e) => setEditing({ ...editing, order_date: e.target.value, po_number: editing.id ? editing.po_number : makePoNumber(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>메모</span>
                  <input
                    value={editing.memo || ''}
                    onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                </label>
              </div>

              {/* 품목 표 */}
              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-sm" style={{ minWidth: 880 }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)' }}>
                      {['품명', '규격명', '단가', '수량', '입고 수량', '남은 수량', '공급가액', '비고', '상태', ''].map((h) => (
                        <th key={h} className="px-2 py-2 text-left text-xs font-bold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(editing.items || []).map((it, idx) => {
                      const st = itemStatus(it);
                      const inputStyle = { background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' };
                      return (
                        <tr key={idx} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-2 py-1.5">
                            <input value={it.name || ''} onChange={(e) => patchItem(idx, { name: e.target.value })}
                              className="w-40 px-2 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={it.spec || ''} onChange={(e) => patchItem(idx, { spec: e.target.value })}
                              className="w-32 px-2 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={it.unit_price ?? 0} onChange={(e) => patchItem(idx, { unit_price: e.target.value })}
                              className="w-24 px-2 py-1.5 rounded-lg text-sm border outline-none text-right" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={it.qty ?? 0} onChange={(e) => patchItem(idx, { qty: e.target.value })}
                              className="w-16 px-2 py-1.5 rounded-lg text-sm border outline-none text-right" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={it.received_qty ?? 0} onChange={(e) => patchItem(idx, { received_qty: e.target.value })}
                              className="w-16 px-2 py-1.5 rounded-lg text-sm border outline-none text-right font-bold" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold" style={{ color: itemRemaining(it) > 0 ? 'var(--destructive)' : 'var(--muted-foreground)' }}>
                            {itemRemaining(it)}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap font-bold" style={{ color: 'var(--foreground)' }}>
                            ₩{formatPrice(itemSupply(it))}
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={it.note || ''} onChange={(e) => patchItem(idx, { note: e.target.value })}
                              className="w-24 px-2 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1.5">
                            {/* 자동 상태는 배지로, 사장님이 손으로 쓴 상태(주문 취소 등)는 그대로 수정 가능하게 */}
                            {isAutoStatus(st) ? (
                              <div className="flex items-center gap-1">
                                <StatusBadge status={st} />
                                <button
                                  onClick={() => patchItem(idx, { status_override: st === '-' ? '메모' : st })}
                                  className="text-[10px] underline" style={{ color: 'var(--muted-foreground)' }}
                                  title="상태를 직접 입력하려면 클릭"
                                >직접</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input value={it.status_override || ''} onChange={(e) => patchItem(idx, { status_override: e.target.value })}
                                  className="w-28 px-2 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle} />
                                <button
                                  onClick={() => patchItem(idx, { status_override: '' })}
                                  className="text-[10px] underline" style={{ color: 'var(--muted-foreground)' }}
                                  title="자동 계산으로 되돌리기"
                                >자동</button>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) })}
                              className="p-1.5 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--destructive)' }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                      <td colSpan={6} className="px-2 py-2 text-right text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>합계</td>
                      <td className="px-2 py-2 text-right text-lg font-black whitespace-nowrap" style={{ color: 'var(--foreground)' }}>
                        ₩{formatPrice(poTotal(editing))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <button
                onClick={() => setEditing({ ...editing, items: [...(editing.items || []), emptyItem()] })}
                className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <Plus className="w-4 h-4" /> 품목 추가
              </button>

              <p className="mt-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                공급가액은 시트와 동일하게 <b>발주수량</b> 기준입니다(입고수량 아님). 취소분 차감은 수량을 음수로 입력하세요.
              </p>
            </div>

            {/* 모달 푸터 */}
            <div className="flex-shrink-0 px-5 py-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              {editing.id && (
                <button
                  onClick={() => setConfirmDelete(editing)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border"
                  style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}
                >
                  <Trash2 className="w-4 h-4" /> 삭제
                </button>
              )}
              <button onClick={() => setEditing(null)} className="ml-auto px-4 py-2 rounded-xl text-sm font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                취소
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: 'var(--primary)' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--destructive)' }} />
              <h3 className="text-lg font-black" style={{ color: 'var(--foreground)' }}>발주 삭제</h3>
            </div>
            <div className="text-sm mb-1" style={{ color: 'var(--foreground)' }}>
              <b>{confirmDelete.po_number}</b> ({confirmDelete.supplier_name} · {confirmDelete.order_date})
            </div>
            <div className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
              품목 {(confirmDelete.items || []).length}건 · ₩{formatPrice(poTotal(confirmDelete))}
              <br />삭제하면 되돌릴 수 없습니다.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-bold border"
                style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--destructive)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
