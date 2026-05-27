// MOVIS 주문 등록 Confirm 모달 — 수정 모드 + 유사 후보 dropdown + 자연어 보정
// pendingAction.action === 'saveOrder' 일 때만 사용. 다른 액션은 기존 모달.

import { useState, useEffect, useMemo } from 'react';
import { Truck, Check, X, AlertTriangle, Edit3, Search, UserPlus, MessageSquare } from 'lucide-react';
import { matchCustomer } from '@/lib/fuzzyMatch';
import { findProductCandidates } from '@/lib/productMatch';

const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR');

export default function OrderConfirmEditable({
  pending,
  executing,
  customers = [],
  products = [],
  onConfirm,
  onCancel,
}) {
  const initialParams = pending.params;
  const [editMode, setEditMode] = useState(initialParams.needsConfirmation);

  // 편집 가능한 상태
  const [customerId, setCustomerId] = useState(initialParams.customerId || null);
  const [customerName, setCustomerName] = useState(initialParams.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(initialParams.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(initialParams.customerAddress || '');
  const [allowNewCustomer, setAllowNewCustomer] = useState(false); // 명시적 신규 등록 허용

  const [items, setItems] = useState(() => initialParams.items.map((it) => ({ ...it })));
  const [priceType, setPriceType] = useState(initialParams.priceType || 'wholesale');
  const [memo, setMemo] = useState(initialParams.memo || '');

  // 거래처 검색 (수정 모드에서 dropdown)
  const [customerQuery, setCustomerQuery] = useState('');
  const customerSearchResult = useMemo(() => {
    if (!customerQuery.trim()) return null;
    return matchCustomer(customerQuery, customers, { maxCandidates: 5, threshold: 0.4 });
  }, [customerQuery, customers]);

  // 제품 검색 (라인별 dropdown)
  const [productSearchIdx, setProductSearchIdx] = useState(null);
  const [productQuery, setProductQuery] = useState('');
  const productSearchResults = useMemo(() => {
    if (productSearchIdx === null || !productQuery.trim()) return [];
    const names = findProductCandidates(productQuery, products, 8);
    return names.map((n) => products.find((p) => p.name === n)).filter(Boolean);
  }, [productSearchIdx, productQuery, products]);

  const isCustomerOK = Boolean(customerId) || allowNewCustomer;
  const hasZeroPrice = items.some((it) => Number(it.price || 0) <= 0);
  const canConfirm = isCustomerOK && !hasZeroPrice && items.length > 0;

  const total = items.reduce((acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 0), 0);

  const pickCustomer = (c) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || '');
    setCustomerAddress(c.address || '');
    setCustomerQuery('');
    setAllowNewCustomer(false);
  };

  const pickProduct = (idx, p) => {
    setItems((prev) => prev.map((it, i) => i === idx ? {
      ...it,
      id: p.id,
      name: p.name,
      price: Number(p[priceType] || p.wholesale || p.retail) || 0,
      wholesale: Number(p.wholesale) || 0,
      retail: Number(p.retail) || 0,
      autoMatched: false,
      zeroPrice: Number(p[priceType] || p.wholesale || p.retail) <= 0,
    } : it));
    setProductSearchIdx(null);
    setProductQuery('');
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      ...pending,
      params: {
        ...initialParams,
        customerId,
        customerName,
        customerExists: Boolean(customerId),
        customerPhone,
        customerAddress,
        priceType,
        items: items.filter((it) => it.id && Number(it.price || 0) > 0),
        total,
        memo: memo || null,
      },
    });
  };

  // 거래처 후보 자동 표시 (초기엔 트래커가 제공한 후보)
  const showCandidatesInline = !customerId && initialParams.customerCandidates?.length > 0 && !customerQuery;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:py-10 backdrop-blur-sm overflow-y-auto">
      <div
        className="movis-glass-card w-full max-w-2xl p-5 sm:p-6 my-6 sm:my-10 min-w-0 flex flex-col"
        style={{
          background: 'rgba(10, 25, 41, 0.96)',
          maxHeight: 'calc(100vh - 80px)', // 모바일/PC 모두 위아래 40px gap 보장
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-4 movis-text-primary">
          <Truck className="w-6 h-6 text-[var(--jarvis-cyan)]" />
          <h3 className="text-xl font-bold flex-1">주문 등록 확인</h3>
          {/* [수정] 버튼 — 항상 노출 (정상 매칭이어도 사용자가 편집 가능하게) */}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-mono flex items-center gap-1.5 transition-colors"
            style={{
              background: editMode ? 'rgba(0,212,255,0.25)' : 'rgba(0,212,255,0.12)',
              color: '#4dffff',
              border: '1px solid rgba(0,212,255,0.4)',
            }}
          >
            <Edit3 className="w-4 h-4" />{editMode ? '수정 중' : '수정'}
          </button>
        </div>

        {/* 스크롤 영역 시작 (헤더/액션 버튼은 고정, 가운데만 스크롤) */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1" style={{ scrollbarGutter: 'stable' }}>

        {/* 경고/이슈 영역 */}
        {pending.warnings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg p-3.5 mb-4 space-y-1.5">
            {pending.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-300 break-words leading-snug">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* === 거래처 섹션 === */}
        <div className="mb-4 p-4 rounded-lg" style={{ background: 'rgba(15,26,45,0.5)', border: '1px solid rgba(0,212,255,0.2)' }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-2.5" style={{ color: 'var(--jarvis-text-muted)' }}>거래처</div>
          {!editMode ? (
            <div className="text-base" style={{ color: 'var(--jarvis-text-primary)' }}>
              {initialParams.customerName} {!customerId && <span className="text-amber-400 text-sm">❓미확정</span>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* 현재 선택된 거래처 */}
              {customerId ? (
                <div className="text-base flex items-center gap-2" style={{ color: '#00ff88' }}>
                  ✓ {customerName} {customerPhone && <span className="text-sm opacity-70">· {customerPhone}</span>}
                  <button onClick={() => { setCustomerId(null); setAllowNewCustomer(false); }} className="ml-auto text-sm opacity-70 hover:opacity-100">변경</button>
                </div>
              ) : allowNewCustomer ? (
                <div className="text-base flex items-center gap-2" style={{ color: '#ffaa00' }}>
                  ⚠ 신규 등록: "{customerName}"
                  <button onClick={() => setAllowNewCustomer(false)} className="ml-auto text-sm opacity-70 hover:opacity-100">취소</button>
                </div>
              ) : (
                <div className="text-base" style={{ color: '#ff4d6d' }}>
                  ❌ "{initialParams.customerName}" 매칭 안 됨 — 후보를 선택하거나 신규 등록
                </div>
              )}

              {/* 거래처 검색 input */}
              {!customerId && !allowNewCustomer && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="거래처 이름 검색..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.3)', color: '#e8f4fd' }}
                    />
                  </div>

                  {/* 초기 후보 (트래커 제공) */}
                  {showCandidatesInline && (
                    <div className="space-y-1.5">
                      <div className="text-xs opacity-70 font-mono">💡 혹시 이거?</div>
                      {initialParams.customerCandidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => pickCustomer(c)}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between hover:bg-cyan-500/15"
                          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}
                        >
                          <span style={{ color: '#e8f4fd' }}>{c.name}{c.phone && <span className="opacity-60 text-xs"> · {c.phone}</span>}</span>
                          <span className="text-xs font-mono" style={{ color: '#4dffff' }}>{Math.round(c.score * 100)}% · {c.reason}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 검색 결과 */}
                  {customerSearchResult?.candidates?.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {customerSearchResult.candidates.map((c) => (
                        <button
                          key={c.item.id}
                          onClick={() => pickCustomer({ id: c.item.id, name: c.item.name, phone: c.item.phone, address: c.item.address })}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-cyan-500/15"
                          style={{ background: 'rgba(15,26,45,0.6)', border: '1px solid rgba(0,212,255,0.15)' }}
                        >
                          <span style={{ color: '#e8f4fd' }}>{c.item.name}{c.item.phone && <span className="opacity-60 text-xs"> · {c.item.phone}</span>}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 신규 등록 버튼 */}
                  <button
                    onClick={() => { setCustomerName(customerQuery || initialParams.customerName); setAllowNewCustomer(true); }}
                    className="w-full px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5"
                    style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.3)', color: '#ffaa00' }}
                  >
                    <UserPlus className="w-4 h-4" />신규 거래처로 등록: "{customerQuery || initialParams.customerName}"
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* === 항목 섹션 === */}
        <div className="mb-4 p-4 rounded-lg" style={{ background: 'rgba(15,26,45,0.5)', border: '1px solid rgba(0,212,255,0.2)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>주문 항목 ({items.length})</div>
            <div className="text-sm font-mono" style={{ color: 'var(--jarvis-text-muted)' }}>
              {priceType === 'retail' ? '소비자가' : '도매가'}
            </div>
          </div>
          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={idx} className="text-sm">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 truncate text-base" style={{ color: it.zeroPrice ? '#ff4d6d' : '#e8f4fd' }}>
                    {it.autoMatched && <span className="text-amber-400 mr-1">🔄</span>}
                    {it.zeroPrice && <span className="text-rose-400 mr-1">⚠️</span>}
                    {it.name}
                    {it.originalInput && <span className="opacity-50 ml-1 text-xs">["{it.originalInput}"]</span>}
                  </div>
                  {editMode && (
                    <button
                      onClick={() => { setProductSearchIdx(productSearchIdx === idx ? null : idx); setProductQuery(it.name); }}
                      className="text-sm opacity-80 hover:opacity-100 px-2 py-0.5 rounded"
                      style={{ color: '#4dffff', background: 'rgba(0,212,255,0.1)' }}
                    >
                      변경
                    </button>
                  )}
                </div>
                {editMode ? (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs opacity-70 w-10">수량</span>
                    <input
                      type="number" min="1"
                      value={it.quantity}
                      onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, parseInt(e.target.value || '1', 10)) } : x))}
                      className="w-20 px-2 py-1.5 rounded-lg text-sm font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.3)', color: '#e8f4fd' }}
                    />
                    <span className="text-xs opacity-70 ml-3 w-10">단가</span>
                    <input
                      type="number" min="0"
                      value={it.price}
                      onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, price: Math.max(0, parseInt(e.target.value || '0', 10)), zeroPrice: Math.max(0, parseInt(e.target.value || '0', 10)) <= 0 } : x))}
                      className="w-28 px-2 py-1.5 rounded-lg text-sm font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', border: it.zeroPrice ? '1px solid rgba(255,77,109,0.5)' : '1px solid rgba(0,212,255,0.3)', color: it.zeroPrice ? '#ff4d6d' : '#e8f4fd' }}
                    />
                    <span className="text-sm opacity-80 ml-auto" style={{ color: '#4dffff' }}>= {fmtNum(it.price * it.quantity)}원</span>
                    <button
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-400 opacity-80 hover:opacity-100 text-xs px-2 py-0.5 rounded"
                      style={{ background: 'rgba(255,77,109,0.1)' }}
                    >제거</button>
                  </div>
                ) : (
                  <div className="text-sm opacity-80 mt-1">
                    × {it.quantity} = <span style={{ color: '#4dffff' }}>{fmtNum(it.price * it.quantity)}원</span> <span className="opacity-60">(단가 {fmtNum(it.price)})</span>
                  </div>
                )}

                {/* 제품 검색 dropdown */}
                {editMode && productSearchIdx === idx && (
                  <div className="mt-2 p-2.5 rounded-lg space-y-1.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,212,255,0.3)' }}>
                    <input
                      type="text"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="제품 이름 검색..."
                      autoFocus
                      className="w-full px-3 py-1.5 rounded-lg text-sm font-mono"
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,212,255,0.25)', color: '#e8f4fd' }}
                    />
                    {/* 자동 매칭된 항목의 대체 후보 */}
                    {it.alternatives?.length > 0 && (
                      <div className="text-xs opacity-70 pt-1">대체 후보:</div>
                    )}
                    {it.alternatives?.map((alt) => {
                      const p = products.find((x) => x.name === alt);
                      if (!p) return null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => pickProduct(idx, p)}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-cyan-500/15"
                          style={{ background: 'rgba(0,212,255,0.06)' }}
                        >
                          {p.name} <span className="opacity-60 text-xs">({fmtNum(p[priceType] || p.wholesale)}원)</span>
                        </button>
                      );
                    })}
                    {/* 검색 결과 */}
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {productSearchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => pickProduct(idx, p)}
                          className="w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-cyan-500/15"
                          style={{ background: 'rgba(15,26,45,0.4)' }}
                        >
                          {p.name} <span className="opacity-60 text-xs">({fmtNum(p[priceType] || p.wholesale)}원)</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-cyan-400/15 flex items-center justify-between">
            <span className="text-sm opacity-80">합계 (VAT 포함)</span>
            <span className="font-bold text-xl" style={{ color: '#4dffff' }}>{fmtNum(total)}원</span>
          </div>
        </div>

        {/* === 추가 지시사항 (자연어 메모) === */}
        {editMode && (
          <div className="mb-4">
            <label className="text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 mb-2" style={{ color: 'var(--jarvis-text-muted)' }}>
              <MessageSquare className="w-3.5 h-3.5" />추가 지시사항 / 메모
            </label>
            <textarea
              value={memo || ''}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="예: 오토심슨 사장님이 자스바라 76-100으로 변경 요청, 배송은 화요일..."
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.3)', color: '#e8f4fd' }}
            />
          </div>
        )}

        </div>
        {/* 스크롤 영역 종료 */}

        {/* 안내 (스크롤 밖, 항상 보임) */}
        {!canConfirm && (
          <div className="text-sm mt-3 mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,77,109,0.1)', color: '#ff4d6d', border: '1px solid rgba(255,77,109,0.3)' }}>
            {!isCustomerOK && '⚠ 거래처를 확정해주세요. '}
            {hasZeroPrice && '⚠ 단가 0원 항목이 있어요. '}
            {items.length === 0 && '⚠ 항목이 없습니다.'}
          </div>
        )}

        {/* 액션 버튼 (스크롤 밖, 고정) */}
        <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: canConfirm ? 'none' : '1px solid rgba(0,212,255,0.15)' }}>
          <button
            onClick={handleConfirm}
            disabled={executing || !canConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canConfirm ? 'var(--jarvis-cyan)' : 'rgba(126,156,184,0.3)', color: '#050b18' }}
          >
            <Check className="w-5 h-5" />
            {executing ? '실행 중...' : canConfirm ? '✅ 실행' : '확정 필요'}
          </button>
          <button
            onClick={() => onCancel(pending)}
            disabled={executing}
            className="px-5 py-3 rounded-lg border border-cyan-400/20 hover:bg-cyan-500/10 disabled:opacity-50 text-base"
            style={{ color: '#e8f4fd' }}
          >
            취소
          </button>
        </div>

        <div className="text-xs opacity-60 mt-3 text-center">
          💡 우측 상단 [수정] 버튼을 누르면 거래처/제품/수량/단가/메모를 직접 편집할 수 있어요.
        </div>
      </div>
    </div>
  );
}
