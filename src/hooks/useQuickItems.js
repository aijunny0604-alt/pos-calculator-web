import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pos_quick_items_v1';

const DEFAULT_PRESETS = [
  { id: 'shipping', name: '택배비', defaultPrice: 5000, builtin: true },
  { id: 'quick', name: '퀵비', defaultPrice: 30000, builtin: true },
  { id: 'fee', name: '수수료', defaultPrice: 0, builtin: true },
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    return parsed;
  } catch {
    return DEFAULT_PRESETS;
  }
}

function save(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota
  }
}

export default function useQuickItems() {
  const [items, setItems] = useState(load);

  useEffect(() => {
    save(items);
  }, [items]);

  // 외부 탭 변경 동기화
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addPreset = ({ name, defaultPrice = 0 } = {}) => {
    if (!name || !name.trim()) return;
    const newItem = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      defaultPrice: Number(defaultPrice) || 0,
      builtin: false,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const updatePreset = (id, patch) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, defaultPrice: Number(patch.defaultPrice ?? p.defaultPrice) || 0 } : p)));
  };

  const removePreset = (id) => {
    setItems((prev) => prev.filter((p) => p.id !== id || p.builtin)); // 기본 프리셋은 삭제 불가
  };

  // 카트/주문에 추가할 라인 객체 생성 — ID에 random suffix로 빠른 클릭 race 방지
  const buildLineItem = (preset, overrides = {}) => {
    const price = Number(overrides.price ?? preset.defaultPrice) || 0;
    const rand = Math.random().toString(36).slice(2, 7);
    return {
      id: `${preset.id}_${Date.now()}_${rand}`,
      name: overrides.name ?? preset.name,
      price,
      wholesale: price,
      retail: price,
      quantity: 1,
      isCustom: true,
      presetId: preset.id,
    };
  };

  return { items, addPreset, updatePreset, removePreset, buildLineItem };
}
