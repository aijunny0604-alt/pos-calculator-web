import { useState, useMemo, useEffect } from 'react';
import { X, Search, Building2, Check, Phone, MapPin } from 'lucide-react';

// 거래처 교체 선택 모달 — "제품 교체"와 같은 방식으로, 등록된 거래처에서 골라 업체를 바꾼다.
// 직접 타이핑하면 오타·미등록 상호가 생겨 명세서 대조·미수 집계가 어긋나므로 목록에서 고르게 한다.
// onPick(customer) — customer = { name, phone, address, ... } (직접 입력한 자유 문자열이면 {name} 만)

export default function CustomerPickerModal({ open, customers = [], current = '', onPick, onClose }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);

  const norm = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
  const list = useMemo(() => {
    const ql = norm(q);
    const arr = (customers || []).filter((c) => c?.name);
    const filtered = ql
      ? arr.filter((c) => norm(c.name).includes(ql) || norm(c.phone).includes(ql) || norm(c.address).includes(ql))
      : arr;
    // 현재 업체를 맨 위로, 나머지는 이름순
    return [...filtered].sort((a, b) => {
      const ac = norm(a.name) === norm(current) ? 0 : 1;
      const bc = norm(b.name) === norm(current) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return String(a.name).localeCompare(String(b.name), 'ko');
    });
  }, [customers, q, current]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border flex flex-col"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Building2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <h4 className="text-lg font-black flex-1">업체 교체</h4>
          <button onClick={onClose}><X className="w-5 h-5 opacity-60" /></button>
        </div>

        <div className="px-4 py-2.5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="업체명, 전화, 주소 검색..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-base border outline-none"
              style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
          </div>
          {current && <div className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>현재: <b style={{ color: 'var(--foreground)' }}>{current}</b></div>}
        </div>

        <div className="overflow-y-auto px-2 pb-2">
          {list.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              검색 결과가 없습니다.
              {q.trim() && (
                <button onClick={() => { onPick({ name: q.trim() }); onClose(); }}
                  className="mt-3 block mx-auto px-3.5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
                  &quot;{q.trim()}&quot; 그대로 입력하기
                </button>
              )}
            </div>
          ) : list.map((c) => {
            const isCur = norm(c.name) === norm(current);
            return (
              <button key={c.id || c.name} onClick={() => { onPick(c); onClose(); }}
                className="w-full text-left px-3 py-2.5 rounded-xl mb-1 border transition-all hover:brightness-105"
                style={{ background: isCur ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'var(--card)', borderColor: isCur ? 'var(--primary)' : 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base" style={{ color: 'var(--foreground)' }}>{c.name}</span>
                  {isCur && <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold text-white flex items-center gap-0.5" style={{ background: 'var(--primary)' }}><Check className="w-3 h-3" />현재</span>}
                  {c.isBlacklisted && <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ background: 'var(--destructive)' }}>블랙리스트</span>}
                </div>
                {(c.phone || c.address) && (
                  <div className="text-xs mt-0.5 flex flex-wrap gap-x-3" style={{ color: 'var(--muted-foreground)' }}>
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{c.address}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
