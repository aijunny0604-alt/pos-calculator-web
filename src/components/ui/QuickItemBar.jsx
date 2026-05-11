import { useState } from 'react';
import { Plus, Settings, Truck, Zap, Receipt, X, Save } from 'lucide-react';
import useQuickItems from '@/hooks/useQuickItems';

const ICON_MAP = {
  shipping: Truck,
  quick: Zap,
  fee: Receipt,
};

function fmt(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

export default function QuickItemBar({ onAddLine, compact = false }) {
  const { items, addPreset, updatePreset, removePreset, buildLineItem } = useQuickItems();
  const [manageOpen, setManageOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const handlePickPreset = (preset) => {
    onAddLine?.(buildLineItem(preset));
  };

  const handleAddCustom = () => {
    const name = customName.trim();
    const price = Number(String(customPrice).replace(/[^\d]/g, '')) || 0;
    if (!name) return;
    const rand = Math.random().toString(36).slice(2, 7);
    onAddLine?.({
      id: `custom_${Date.now()}_${rand}`,
      name,
      price,
      wholesale: price,
      retail: price,
      quantity: 1,
      isCustom: true,
    });
    setCustomName('');
    setCustomPrice('');
    setCustomOpen(false);
  };

  const handleAddNewPreset = () => {
    const name = customName.trim();
    if (!name) return;
    const price = Number(String(customPrice).replace(/[^\d]/g, '')) || 0;
    addPreset({ name, defaultPrice: price });
    setCustomName('');
    setCustomPrice('');
  };

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-3 py-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>빠른 추가:</span>
          {items.map((p) => {
            const Icon = ICON_MAP[p.id] || Plus;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePickPreset(p)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors hover:bg-[var(--accent)]"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                title={`${p.name} ${fmt(p.defaultPrice)}원으로 추가`}
              >
                <Icon className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                <span>{p.name}</span>
                {!compact && p.defaultPrice > 0 && (
                  <span className="text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                    {fmt(p.defaultPrice)}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const next = !customOpen;
              setCustomOpen(next);
              if (next) setManageOpen(false); // m10: mutex
              else { setCustomName(''); setCustomPrice(''); } // m9: 닫을 때 입력값 reset
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border-2 border-dashed text-xs font-semibold transition-colors hover:bg-[var(--accent)]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            <Plus className="w-3 h-3" />
            <span>커스텀</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !manageOpen;
            setManageOpen(next);
            if (next) setCustomOpen(false); // m10: mutex
          }}
          className="p-1.5 rounded hover:bg-[var(--accent)] transition-colors flex-shrink-0"
          aria-label="프리셋 관리"
          title="프리셋 관리"
        >
          <Settings className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
        </button>
      </div>

      {/* 커스텀 즉석 입력 */}
      {customOpen && (
        <div className="border-t px-3 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="항목명 (예: 포장비)"
            className="px-2 py-1.5 text-sm border rounded bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            style={{ borderColor: 'var(--border)' }}
            autoFocus
          />
          <input
            type="text"
            inputMode="numeric"
            value={customPrice ? Number(String(customPrice).replace(/[^\d]/g, '')).toLocaleString('ko-KR') : ''}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder="금액"
            className="w-28 px-2 py-1.5 text-sm tabular-nums text-right border rounded bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            style={{ borderColor: 'var(--border)' }}
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2.5 py-1.5 rounded text-xs font-bold bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
          >
            이번만 추가
          </button>
          <button
            type="button"
            onClick={handleAddNewPreset}
            className="px-2.5 py-1.5 rounded text-xs font-bold border transition-colors hover:bg-[var(--accent)]"
            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
            title="다음에도 빠르게 쓸 수 있도록 프리셋으로 저장"
          >
            프리셋으로 저장
          </button>
        </div>
      )}

      {/* 프리셋 관리 펼침 */}
      {manageOpen && (
        <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
          <div className="text-[11px] font-bold" style={{ color: 'var(--muted-foreground)' }}>프리셋 편집</div>
          {items.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <input
                type="text"
                value={p.name}
                onChange={(e) => updatePreset(p.id, { name: e.target.value })}
                className="px-2 py-1 text-sm border rounded bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                style={{ borderColor: 'var(--border)' }}
              />
              <input
                type="text"
                inputMode="numeric"
                value={p.defaultPrice ? Number(p.defaultPrice).toLocaleString('ko-KR') : ''}
                onChange={(e) => updatePreset(p.id, { defaultPrice: String(e.target.value).replace(/[^\d]/g, '') })}
                placeholder="기본 금액"
                className="w-24 px-2 py-1 text-sm tabular-nums text-right border rounded bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                style={{ borderColor: 'var(--border)' }}
              />
              {p.builtin ? (
                <span className="text-[10px] text-[var(--muted-foreground)] px-1">기본</span>
              ) : (
                <button
                  type="button"
                  onClick={() => removePreset(p.id)}
                  className="p-1 rounded transition-colors hover:bg-[var(--destructive)]/10"
                  style={{ color: 'var(--destructive)' }}
                  aria-label="프리셋 삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setCustomOpen(true); setManageOpen(false); }}
            className="w-full px-2 py-1.5 text-xs font-bold rounded border-2 border-dashed transition-colors hover:bg-[var(--accent)]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            + 커스텀 항목 / 프리셋 추가
          </button>
        </div>
      )}
    </div>
  );
}
