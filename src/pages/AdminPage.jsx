import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, Trash2, Edit, Upload, Users, Package, Tag, Percent,
  Lock, ChevronDown, ChevronRight, X, Save, AlertTriangle, ShieldAlert, Fingerprint,
  UserPlus, Download, Copy, Car, Maximize2, Minimize2, Zap, Loader2,
  Check, Minus, ArrowRight, RefreshCw, TrendingUp, TrendingDown, DollarSign,
} from 'lucide-react';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/ui/StatusBadge';
import { formatPrice, matchesSearchQuery, handleSearchFocus, normalizeText } from '../lib/utils';
import { priceData } from '../lib/priceData';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = '4321';

const TABS = [
  { id: 'products',    label: '제품관리',    Icon: Package },
  { id: 'customers',   label: '거래처관리',  Icon: Users   },
  { id: 'price-adjust',label: '단가조정',    Icon: DollarSign },
  { id: 'ai-stock',    label: 'AI 입고',     Icon: Zap     },
  { id: 'burnway',     label: '번웨이',      Icon: Car     },
  { id: 'categories',  label: '카테고리',    Icon: Tag     },
  { id: 'discounts',   label: '할인설정',    Icon: Percent },
];

const EMPTY_PRODUCT = {
  name: '', category: '', wholesale: '', retail: '', stock: '', min_stock: '',
};

const EMPTY_CUSTOMER = {
  name: '', phone: '', address: '', memo: '', blacklist: false,
};

// ---------------------------------------------------------------------------
// Small shared sub-components
// ---------------------------------------------------------------------------
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function InputField({ label, required, error, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-[var(--foreground)]">
          {label}{required && <span className="text-[var(--destructive)] ml-0.5">*</span>}
        </label>
      )}
      <input
        className={`px-3 sm:px-4 py-3 text-base rounded-lg border ${
          error ? 'border-[var(--destructive)]' : 'border-[var(--border)]'
        } bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all`}
        {...props}
      />
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}

function ActionBtn({ variant = 'primary', size = 'sm', Icon, children, className = '', ...props }) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-2 text-sm', md: 'px-5 py-2.5 text-base', lg: 'px-6 py-3 text-base' };
  const variants = {
    primary:     'bg-[var(--primary)] text-white hover:opacity-90 focus:ring-[var(--primary)]',
    secondary:   'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] border border-[var(--border)] focus:ring-[var(--border)]',
    destructive: 'bg-[var(--destructive)] text-white hover:opacity-90 focus:ring-[var(--destructive)]',
    ghost:       'text-[var(--foreground)] hover:bg-[var(--accent)] focus:ring-[var(--border)]',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-5xl' }) {
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-modal-backdrop modal-backdrop-fs-transition"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isFullscreen ? '0' : '0.75rem' }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-[var(--card)] shadow-2xl w-full flex flex-col border border-[var(--border)] animate-modal-up modal-fs-transition"
        style={{
          maxWidth: isFullscreen ? '100vw' : ({ 'max-w-md': '28rem', 'max-w-lg': '32rem', 'max-w-xl': '36rem', 'max-w-2xl': '42rem', 'max-w-3xl': '48rem', 'max-w-4xl': '56rem', 'max-w-5xl': '64rem' }[maxWidth] || '64rem'),
          maxHeight: isFullscreen ? '100vh' : '90vh',
          borderRadius: isFullscreen ? '0' : '1rem',
          boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors" title={isFullscreen ? '원래 크기' : '전체화면'}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} /> : <Maximize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Login Gate
// ---------------------------------------------------------------------------
function AdminLogin({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      onSuccess();
    } else {
      setAttempts((prev) => prev + 1);
      setError('접근이 거부되었습니다');
      setShaking(true);
      setPw('');
      setTimeout(() => setShaking(false), 600);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 admin-hazard-stripe" style={{ background: 'var(--background)', minHeight: '100%' }}>
      {/* Outer restricted zone container */}
      <div className="w-full max-w-md animate-admin-fade-up" style={{ animationDelay: '0.1s' }}>
        {/* Warning banner */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-t-xl border border-b-0"
          style={{
            background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))',
            borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))',
          }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--destructive)' }} />
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--destructive)' }}>
            Restricted Area
          </span>
          <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--muted-foreground)' }}>
            SEC-LEVEL: HIGH
          </span>
        </div>

        {/* Main card */}
        <div
          className={`relative overflow-hidden border rounded-b-xl ${shaking ? 'animate-admin-shake' : ''} animate-admin-border-glow`}
          style={{ background: 'var(--card)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))' }}
        >
          {/* Scan line overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute left-0 right-0 h-px animate-admin-scan"
              style={{ background: 'linear-gradient(90deg, transparent, var(--destructive), transparent)', opacity: 0.4 }}
            />
          </div>

          <div className="relative p-6 sm:p-8">
            {/* Icon with pulse rings */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full animate-admin-pulse-ring"
                  style={{ background: 'var(--destructive)', opacity: 0.15 }}
                />
                <div
                  className="absolute inset-0 rounded-full animate-admin-pulse-ring"
                  style={{ background: 'var(--destructive)', opacity: 0.15, animationDelay: '0.8s' }}
                />
                <div
                  className="relative w-16 h-16 rounded-full flex items-center justify-center animate-admin-icon-float"
                  style={{ background: 'linear-gradient(135deg, var(--destructive), #dc2626)', boxShadow: '0 8px 32px color-mix(in srgb, var(--destructive) 30%, transparent)' }}
                >
                  <ShieldAlert className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
                관리자 접근 인증
              </h1>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                인가된 관리자만 접근할 수 있습니다
              </p>
            </div>

            {/* Status indicator */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg mb-5"
              style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: attempts > 0 ? 'var(--destructive)' : 'var(--warning)', boxShadow: `0 0 6px ${attempts > 0 ? 'var(--destructive)' : 'var(--warning)'}` }}
                />
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                  {attempts > 0 ? `인증 실패 ${attempts}회` : '인증 대기 중'}
                </span>
              </div>
              <Fingerprint className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--foreground)' }}>
                  <Lock className="w-3 h-3" />
                  인증 코드
                  <span style={{ color: 'var(--destructive)' }}>*</span>
                </label>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setError(''); }}
                  placeholder="관리자 비밀번호를 입력하세요"
                  autoFocus
                  required
                  className="w-full px-4 py-3 rounded-lg border text-sm font-mono tracking-widest focus:outline-none focus:ring-2 transition-all"
                  style={{
                    background: 'var(--background)',
                    borderColor: error ? 'var(--destructive)' : 'var(--border)',
                    color: 'var(--foreground)',
                    ...(error ? { boxShadow: '0 0 0 2px color-mix(in srgb, var(--destructive) 20%, transparent)' } : {}),
                  }}
                />
                {error && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--destructive)' }}>
                    <AlertTriangle className="w-3 h-3" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, var(--destructive), #dc2626)',
                  color: 'white',
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--destructive) 30%, transparent)',
                }}
              >
                <ShieldAlert className="w-4 h-4" />
                접근 인증
              </button>
            </form>

            {/* Footer warning */}
            <div className="flex items-center justify-center gap-1.5 mt-5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              <Lock className="w-3 h-3" />
              <span>무단 접근 시도 시 기록이 남습니다</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Management Tab
// ---------------------------------------------------------------------------
function ProductsTab({ products, setProducts, supabaseConnected, showToast, supabase, initialCategory, pushUndo }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (initialCategory) {
      setCategoryFilter(initialCategory);
    }
  }, [initialCategory]);
  const [editTarget, setEditTarget] = useState(null);   // null = closed, {} = new, product = edit
  const [formData, setFormData] = useState(EMPTY_PRODUCT);
  const [formErrors, setFormErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const [inlineEdit, setInlineEdit] = useState(null); // { id, field, value }

  const startInlineEdit = (product, field) => {
    const value = product[field] ?? '';
    setInlineEdit({ id: product.id, field, value: String(value) });
  };

  const saveInlineEdit = async () => {
    if (!inlineEdit) return;
    const { id, field, value } = inlineEdit;
    let updateData = {};
    if (['wholesale', 'retail', 'stock', 'min_stock'].includes(field)) {
      updateData[field] = parseInt(value.replace(/[^0-9-]/g, '')) || 0;
    } else {
      updateData[field] = value;
    }
    try {
      if (supabaseConnected && supabase?.saveProduct) {
        const product = products.find(p => p.id === id);
        const saved = await supabase.saveProduct({ ...product, ...updateData });
        if (saved) setProducts(prev => prev.map(p => p.id === id ? saved : p));
      } else {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updateData } : p));
      }
      showToast('수정되었습니다', 'success');
    } catch (err) {
      showToast('수정 실패: ' + err.message, 'error');
    }
    setInlineEdit(null);
  };

  const cancelInlineEdit = () => setInlineEdit(null);

  const handleInlineKeyDown = (e) => {
    if (e.key === 'Enter') saveInlineEdit();
    else if (e.key === 'Escape') cancelInlineEdit();
  };

  const displayProducts = (products && products.length > 0) ? products : priceData;

  const categories = useMemo(() => {
    const cats = [...new Set(displayProducts.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [displayProducts]);

  const filtered = useMemo(() => {
    return displayProducts.filter(p => {
      const matchSearch = matchesSearchQuery(p.name, search);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [displayProducts, search, categoryFilter]);

  const openNew = () => {
    setFormData(EMPTY_PRODUCT);
    setFormErrors({});
    setEditTarget({});
  };

  const openEdit = (product) => {
    setFormData({
      name: product.name || '',
      category: product.category || '',
      wholesale: product.wholesale ?? '',
      retail: product.retail ?? '',
      stock: product.stock ?? '',
      min_stock: product.min_stock ?? '',
    });
    setFormErrors({});
    setEditTarget(product);
  };

  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = '제품명을 입력하세요';
    if (!formData.category.trim()) errors.category = '카테고리를 입력하세요';
    if (formData.wholesale === '' || isNaN(Number(formData.wholesale))) errors.wholesale = '유효한 숫자를 입력하세요';
    return errors;
  };

  const handleSave = async () => {
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        wholesale: Number(formData.wholesale),
        retail: formData.retail !== '' ? Number(formData.retail) : null,
        stock: formData.stock !== '' ? Number(formData.stock) : null,
        min_stock: formData.min_stock !== '' ? Number(formData.min_stock) : null,
      };
      const isNew = !editTarget?.id;
      if (supabaseConnected && supabase?.saveProduct) {
        const saved = await supabase.saveProduct(isNew ? payload : { ...payload, id: editTarget.id });
        if (isNew) {
          setProducts(prev => [...prev, saved]);
        } else {
          setProducts(prev => prev.map(p => p.id === editTarget.id ? saved : p));
        }
      } else {
        if (isNew) {
          const newProd = { ...payload, id: Date.now() };
          setProducts(prev => [...prev, newProd]);
        } else {
          setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...payload } : p));
        }
      }
      showToast(isNew ? '제품이 추가되었습니다' : '제품이 수정되었습니다', 'success');
      if (pushUndo) {
        if (isNew) {
          // Undo add = delete the newly added product
          const addedProduct = isNew && supabaseConnected ? (await supabase.getProducts())?.find(p => p.name === payload.name && p.category === payload.category) : null;
          if (addedProduct) {
            pushUndo({
              type: 'product-add',
              label: `제품 추가 (${payload.name})`,
              undo: async () => {
                await supabase.deleteProduct(addedProduct.id);
                setProducts(prev => prev.filter(p => p.id !== addedProduct.id));
              },
            });
          }
        } else {
          // Undo edit = restore previous values
          const prevProduct = products.find(p => p.id === editTarget.id);
          if (prevProduct) {
            pushUndo({
              type: 'product-edit',
              label: `제품 수정 (${payload.name})`,
              undo: async () => {
                await supabase.saveProduct(prevProduct);
                setProducts(prev => prev.map(p => p.id === prevProduct.id ? prevProduct : p));
              },
            });
          }
        }
      }
      setEditTarget(null);
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const deleted = deleteTarget;
    try {
      if (supabaseConnected && supabase?.deleteProduct) {
        await supabase.deleteProduct(deleted.id);
      }
      setProducts(prev => prev.filter(p => p.id !== deleted.id));
      showToast('제품이 삭제되었습니다', 'success');
      if (pushUndo) {
        pushUndo({
          type: 'product-delete',
          label: `제품 삭제 (${deleted.name})`,
          undo: async () => {
            const { id: _id, ...rest } = deleted;
            const restored = await supabase.addProduct(rest);
            if (restored) setProducts(prev => [...prev, restored]);
          },
        });
      }
    } catch (err) {
      showToast('삭제에 실패했습니다: ' + err.message, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = header.indexOf('name');
        const catIdx = header.indexOf('category');
        const wsIdx = header.indexOf('wholesale');
        const rtIdx = header.indexOf('retail');
        if (nameIdx === -1 || catIdx === -1) {
          showToast('CSV 헤더에 name, category 컬럼이 필요합니다', 'error');
          return;
        }
        const imported = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (!cols[nameIdx]) continue;
          imported.push({
            id: Date.now() + i,
            name: cols[nameIdx],
            category: cols[catIdx] || '',
            wholesale: wsIdx !== -1 ? Number(cols[wsIdx]) || 0 : 0,
            retail: rtIdx !== -1 && cols[rtIdx] ? Number(cols[rtIdx]) : null,
          });
        }
        setProducts(prev => [...prev, ...imported]);
        showToast(`${imported.length}개 제품을 가져왔습니다`, 'success');
      } catch (err) {
        showToast('CSV 파싱 실패: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportProductsCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['ID', '카테고리', '제품명', '도매가', '소매가', '재고', '최소재고'];
    const rows = filtered.map(p => [
      p.id, p.category || '', p.name || '', p.wholesale || 0, p.retail || 0, p.stock ?? 0, p.min_stock ?? 0
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `제품목록_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('제품 목록이 저장되었습니다', 'success');
  };

  const handleDuplicate = async (product) => {
    const newProduct = {
      name: product.name + ' (복사)',
      category: product.category,
      wholesale: product.wholesale,
      retail: product.retail,
      stock: product.stock,
      min_stock: product.min_stock,
    };
    try {
      if (supabaseConnected && supabase?.addProduct) {
        const saved = await supabase.addProduct(newProduct);
        if (saved) {
          setProducts(prev => [...prev, saved]);
          showToast('제품이 복사되었습니다', 'success');
        }
      } else {
        setProducts(prev => [...prev, { ...newProduct, id: Date.now() }]);
        showToast('제품이 복사되었습니다', 'success');
      }
    } catch (err) {
      showToast('복사 실패: ' + err.message, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[120px] sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="제품명 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={handleSearchFocus}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-2 sm:px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] max-w-[140px] sm:max-w-none"
        >
          <option value="">전체 카테고리</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <ActionBtn variant="secondary" Icon={Download} onClick={exportProductsCSV} className="hidden sm:inline-flex">
          엑셀 백업
        </ActionBtn>
        <ActionBtn variant="secondary" Icon={Download} onClick={exportProductsCSV} className="sm:hidden">
          백업
        </ActionBtn>
        <ActionBtn variant="secondary" Icon={Upload} onClick={() => fileRef.current?.click()} className="hidden sm:inline-flex">
          CSV 가져오기
        </ActionBtn>
        <ActionBtn variant="secondary" Icon={Upload} onClick={() => fileRef.current?.click()} className="sm:hidden">
          CSV
        </ActionBtn>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
        <ActionBtn variant="primary" Icon={Plus} onClick={openNew}>
          추가
        </ActionBtn>
      </div>

      {/* Stats */}
      <p className="text-xs text-[var(--muted-foreground)]">
        총 {displayProducts.length.toLocaleString()}개 중 {filtered.length.toLocaleString()}개 표시
        {!supabaseConnected && <span className="ml-2 text-[var(--warning)]">(로컬 데이터 사용 중)</span>}
      </p>

      {/* Product Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="제품이 없습니다" description="제품을 추가하거나 CSV를 가져오세요" />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">제품명</th>
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden sm:table-cell">카테고리</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">도매가</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden sm:table-cell">소매가</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden md:table-cell">재고</th>
                  <th className="text-right px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden md:table-cell">최소재고</th>
                  <th className="px-1 sm:px-4 py-2.5 w-14 sm:w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(product => (
                  <tr key={product.id} className="hover:bg-[var(--accent)] transition-colors group">
                    <td className="px-2 sm:px-4 py-2.5 font-medium text-[var(--foreground)]">
                      {inlineEdit?.id === product.id && inlineEdit?.field === 'name' ? (
                        <input
                          autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="break-words cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'name')}>
                          {product.name}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-[var(--muted-foreground)] hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded-full bg-[var(--muted)] text-xs">{product.category}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-right text-[var(--foreground)]">
                      {inlineEdit?.id === product.id && inlineEdit?.field === 'wholesale' ? (
                        <input
                          autoFocus
                          type="number"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'wholesale')}>
                          {formatPrice(product.wholesale)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-right text-[var(--muted-foreground)] hidden sm:table-cell">
                      {inlineEdit?.id === product.id && inlineEdit?.field === 'retail' ? (
                        <input
                          autoFocus
                          type="number"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'retail')}>
                          {product.retail ? formatPrice(product.retail) : <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-right text-[var(--muted-foreground)] hidden md:table-cell">
                      {inlineEdit?.id === product.id && inlineEdit?.field === 'stock' ? (
                        <input
                          autoFocus
                          type="number"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'stock')}>
                          {product.stock != null ? product.stock : <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-right text-[var(--muted-foreground)] hidden md:table-cell">
                      {inlineEdit?.id === product.id && inlineEdit?.field === 'min_stock' ? (
                        <input
                          autoFocus
                          type="number"
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] text-right focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'min_stock')}>
                          {product.min_stock != null ? product.min_stock : <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-1 sm:px-4 py-2.5">
                      <div className="flex items-center gap-0.5 sm:gap-1 justify-end">
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                          title="수정"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(product)}
                          className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                          title="복사"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(product)}
                          className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget?.id ? '제품 수정' : '제품 추가'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <InputField
            label="제품명"
            required
            className="sm:col-span-2"
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            placeholder="제품명 입력"
            error={formErrors.name}
          />
          <InputField
            label="카테고리"
            required
            value={formData.category}
            onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
            placeholder="카테고리 입력"
            error={formErrors.category}
            list="cat-datalist"
          />
          <datalist id="cat-datalist">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
          <InputField
            label="도매가 (원)"
            required
            type="number"
            value={formData.wholesale}
            onChange={e => setFormData(p => ({ ...p, wholesale: e.target.value }))}
            placeholder="0"
            error={formErrors.wholesale}
          />
          <InputField
            label="소매가 (원)"
            type="number"
            value={formData.retail}
            onChange={e => setFormData(p => ({ ...p, retail: e.target.value }))}
            placeholder="0 (선택)"
          />
          <InputField
            label="재고"
            type="number"
            value={formData.stock}
            onChange={e => setFormData(p => ({ ...p, stock: e.target.value }))}
            placeholder="0 (선택)"
          />
          <InputField
            label="최소재고"
            type="number"
            value={formData.min_stock}
            onChange={e => setFormData(p => ({ ...p, min_stock: e.target.value }))}
            placeholder="0 (선택)"
          />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <ActionBtn variant="secondary" size="md" onClick={() => setEditTarget(null)}>취소</ActionBtn>
          <ActionBtn variant="primary" size="md" Icon={Save} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </ActionBtn>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="제품 삭제"
        message={`"${deleteTarget?.name}" 제품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer Management Tab
// ---------------------------------------------------------------------------
function CustomersTab({ customers, setCustomers, supabaseConnected, showToast, supabase, pushUndo }) {
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [formData, setFormData] = useState(EMPTY_CUSTOMER);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inlineEdit, setInlineEdit] = useState(null);

  const startInlineEdit = (customer, field) => {
    setInlineEdit({ id: customer.id, field, value: customer[field] || '' });
  };

  const saveInlineEdit = async () => {
    if (!inlineEdit) return;
    const { id, field, value } = inlineEdit;
    try {
      if (supabaseConnected && supabase?.saveCustomer) {
        const customer = customers.find(c => c.id === id);
        const saved = await supabase.saveCustomer({ ...customer, [field]: value });
        if (saved) setCustomers(prev => prev.map(c => c.id === id ? saved : c));
      } else {
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
      }
      showToast('수정되었습니다', 'success');
    } catch (err) {
      showToast('수정 실패: ' + err.message, 'error');
    }
    setInlineEdit(null);
  };

  const cancelInlineEdit = () => setInlineEdit(null);
  const handleInlineKeyDown = (e) => {
    if (e.key === 'Enter') saveInlineEdit();
    else if (e.key === 'Escape') cancelInlineEdit();
  };

  const filtered = useMemo(() => {
    if (!customers) return [];
    return customers.filter(c => c &&
      (matchesSearchQuery(c.name || '', search) ||
      (c.phone && c.phone.includes(search)))
    );
  }, [customers, search]);

  const openNew = () => {
    setFormData({ ...EMPTY_CUSTOMER });
    setEditTarget({});
  };

  const openEdit = (customer) => {
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      memo: customer.memo || '',
      blacklist: customer.blacklist || customer.is_blacklist || false,
    });
    setEditTarget(customer);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast('거래처명을 입력하세요', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        is_blacklist: formData.blacklist,
      };
      const isNew = !editTarget?.id;
      const { blacklist: _bl, ...dbPayload } = payload;
      if (supabaseConnected && supabase?.saveCustomer) {
        const saved = await supabase.saveCustomer(isNew ? dbPayload : { ...dbPayload, id: editTarget.id });
        if (!saved) throw new Error('서버 응답 오류');
        if (isNew) {
          setCustomers(prev => [...prev, saved]);
        } else {
          setCustomers(prev => prev.map(c => c.id === editTarget.id ? saved : c));
        }
      } else {
        if (isNew) {
          const newCust = { ...payload, id: Date.now() };
          setCustomers(prev => [...prev, newCust]);
        } else {
          setCustomers(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...payload } : c));
        }
      }
      showToast(isNew ? '거래처가 등록되었습니다' : '거래처 정보가 수정되었습니다', 'success');
      setEditTarget(null);
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const deleted = deleteTarget;
    try {
      if (supabaseConnected && supabase?.deleteCustomer) {
        await supabase.deleteCustomer(deleted.id);
      }
      setCustomers(prev => prev.filter(c => c.id !== deleted.id));
      showToast('거래처가 삭제되었습니다', 'success');
      if (pushUndo) {
        pushUndo({
          type: 'customer-delete',
          label: `거래처 삭제 (${deleted.name})`,
          undo: async () => {
            const { id: _id, ...rest } = deleted;
            const restored = await supabase.addCustomer(rest);
            if (restored) setCustomers(prev => [...prev, restored]);
          },
        });
      }
    } catch (err) {
      showToast('삭제에 실패했습니다: ' + err.message, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const exportCustomersCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['ID', '거래처명', '전화번호', '주소', '메모', '블랙리스트'];
    const rows = filtered.map(c => [
      c.id, c.name || '', c.phone || '', c.address || '', c.memo || '', (c.blacklist || c.is_blacklist) ? 'Y' : 'N'
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `거래처목록_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('거래처 목록이 저장되었습니다', 'success');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[120px] sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="거래처명 또는 전화번호 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={handleSearchFocus}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <ActionBtn variant="secondary" Icon={Download} onClick={exportCustomersCSV} className="hidden sm:inline-flex">
          엑셀 백업
        </ActionBtn>
        <ActionBtn variant="secondary" Icon={Download} onClick={exportCustomersCSV} className="sm:hidden">
          백업
        </ActionBtn>
        <ActionBtn variant="primary" Icon={UserPlus} onClick={openNew} className="hidden sm:inline-flex">
          새 거래처 등록
        </ActionBtn>
        <ActionBtn variant="primary" Icon={UserPlus} onClick={openNew} className="sm:hidden">
          등록
        </ActionBtn>
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        총 {(customers || []).length.toLocaleString()}개 중 {filtered.length.toLocaleString()}개 표시
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="거래처가 없습니다" description="POS에서 거래를 완료하면 거래처가 등록됩니다" />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)] border-b border-[var(--border)]">
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">거래처명</th>
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden sm:table-cell">전화번호</th>
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden lg:table-cell">주소</th>
                  <th className="text-left px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide hidden xl:table-cell">메모</th>
                  <th className="text-center px-2 sm:px-4 py-2.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">상태</th>
                  <th className="px-1 sm:px-4 py-2.5 w-14 sm:w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(customer => (
                  <tr key={customer.id} className="hover:bg-[var(--accent)] transition-colors group">
                    <td className="px-2 sm:px-4 py-2.5 font-medium text-[var(--foreground)]">
                      {inlineEdit?.id === customer.id && inlineEdit?.field === 'name' ? (
                        <input
                          autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="break-words cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(customer, 'name')}>
                          {customer.name}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-[var(--muted-foreground)] hidden sm:table-cell">
                      {inlineEdit?.id === customer.id && inlineEdit?.field === 'phone' ? (
                        <input
                          autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(customer, 'phone')}>
                          {customer.phone || <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-[var(--muted-foreground)] hidden lg:table-cell max-w-[200px]">
                      {inlineEdit?.id === customer.id && inlineEdit?.field === 'address' ? (
                        <input
                          autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="truncate cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(customer, 'address')}>
                          {customer.address || <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-[var(--muted-foreground)] hidden xl:table-cell max-w-[150px]">
                      {inlineEdit?.id === customer.id && inlineEdit?.field === 'memo' ? (
                        <input
                          autoFocus
                          value={inlineEdit.value}
                          onChange={e => setInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                          onBlur={saveInlineEdit}
                          onKeyDown={handleInlineKeyDown}
                          className="w-full px-2 py-1 text-sm border border-[var(--primary)] rounded bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      ) : (
                        <div className="truncate cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(customer, 'memo')}>
                          {customer.memo || <span className="text-[var(--border)]">-</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-center">
                      {(customer.is_blacklist || customer.blacklist)
                        ? <StatusBadge status="blacklist" />
                        : <span className="text-xs text-[var(--muted-foreground)]">일반</span>
                      }
                    </td>
                    <td className="px-1 sm:px-4 py-2.5">
                      <div className="flex items-center gap-0.5 sm:gap-1 justify-end">
                        <button
                          onClick={() => openEdit(customer)}
                          className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                          title="수정"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(customer)}
                          className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget?.id ? '거래처 수정' : '새 거래처 등록'}
      >
        <div className="flex flex-col gap-4">
          <InputField
            label="거래처명"
            required
            value={formData.name}
            onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
            placeholder="거래처명 입력"
          />
          <InputField
            label="전화번호"
            value={formData.phone}
            onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
            placeholder="010-0000-0000"
          />
          <InputField
            label="주소"
            value={formData.address}
            onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
            placeholder="주소 입력 (선택)"
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--foreground)]">메모</label>
            <textarea
              value={formData.memo}
              onChange={e => setFormData(p => ({ ...p, memo: e.target.value }))}
              placeholder="메모 입력 (선택)"
              rows={3}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            />
          </div>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--accent)] transition-colors">
            <input
              type="checkbox"
              checked={formData.blacklist}
              onChange={e => setFormData(p => ({ ...p, blacklist: e.target.checked }))}
              className="w-4 h-4 accent-[var(--destructive)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">블랙리스트 등록</p>
              <p className="text-xs text-[var(--muted-foreground)]">블랙리스트 거래처는 경고 표시가 됩니다</p>
            </div>
            {formData.blacklist && (
              <AlertTriangle className="w-4 h-4 text-[var(--destructive)] ml-auto" />
            )}
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <ActionBtn variant="secondary" size="md" onClick={() => setEditTarget(null)}>취소</ActionBtn>
          <ActionBtn variant="primary" size="md" Icon={Save} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </ActionBtn>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="거래처 삭제"
        message={`"${deleteTarget?.name}" 거래처를 삭제하시겠습니까? 거래 내역은 유지됩니다.`}
        confirmText="삭제"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Management Tab
// ---------------------------------------------------------------------------
function CategoriesTab({ products, setProducts, supabaseConnected, showToast, supabase, onSelectCategory }) {
  const [editTarget, setEditTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const displayProducts = (products && products.length > 0) ? products : priceData;

  const categories = useMemo(() => {
    const map = {};
    displayProducts.forEach(p => {
      if (!p.category) return;
      if (!map[p.category]) map[p.category] = 0;
      map[p.category]++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayProducts]);

  const openEdit = (catName) => {
    setEditTarget(catName);
    setNewName(catName);
  };

  const handleRename = async () => {
    if (!newName.trim()) { showToast('카테고리명을 입력하세요', 'error'); return; }
    if (newName.trim() === editTarget) { setEditTarget(null); return; }
    setSaving(true);
    try {
      const updated = displayProducts.map(p =>
        p.category === editTarget ? { ...p, category: newName.trim() } : p
      );
      if (supabaseConnected && supabase?.saveProduct) {
        const affected = updated.filter(p => p.category === newName.trim());
        await Promise.all(affected.map(p => supabase.saveProduct(p)));
      }
      setProducts(updated);
      showToast(`카테고리 "${editTarget}"이(가) "${newName.trim()}"으로 변경되었습니다`, 'success');
      setEditTarget(null);
    } catch (err) {
      showToast('변경에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--muted-foreground)]">
        총 {categories.length}개 카테고리 - 카테고리명을 변경하면 해당 카테고리의 모든 제품에 적용됩니다.
      </p>

      {categories.length === 0 ? (
        <EmptyState icon={Tag} title="카테고리가 없습니다" description="제품을 추가하면 카테고리가 자동으로 생성됩니다" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map(([catName, count]) => (
            <SectionCard key={catName} className="p-4 flex items-center justify-between group">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--foreground)]">{catName}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-[var(--muted-foreground)]">{count}개 제품</p>
                  {onSelectCategory && (
                    <button
                      onClick={() => onSelectCategory(catName)}
                      className="text-xs text-[var(--primary)] hover:underline transition-colors"
                    >
                      제품 보기 →
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => openEdit(catName)}
                className="p-2 rounded-lg hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors opacity-0 group-hover:opacity-100"
                title="카테고리명 변경"
              >
                <Edit className="w-4 h-4" />
              </button>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Rename Modal */}
      <Modal isOpen={editTarget !== null} onClose={() => setEditTarget(null)} title="카테고리명 변경" maxWidth="max-w-md">
        <InputField
          label="새 카테고리명"
          required
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRename()}
          placeholder="카테고리명 입력"
          autoFocus
        />
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          이 카테고리에 속한 모든 제품의 카테고리가 변경됩니다.
        </p>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <ActionBtn variant="secondary" onClick={() => setEditTarget(null)}>취소</ActionBtn>
          <ActionBtn variant="primary" Icon={Save} onClick={handleRename} disabled={saving}>
            {saving ? '저장 중...' : '변경'}
          </ActionBtn>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discount Tier Management Tab
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// BurnwayTab - 번웨이 다운파이프 관리
// ---------------------------------------------------------------------------
const BURNWAY_INITIAL_MODELS = [
  { id: 'veloster-n', label: '벨로스터N', keywords: ['벨로스터', '벨n', 'veloster'], hasJabara: true, hasDctManual: true },
  { id: 'avante-n', label: '아반떼N', keywords: ['아반떼', '아n', 'avante'], hasJabara: true, hasDctManual: false },
  { id: 'sg70-20', label: '스팅어 & G70 2.0', keywords: ['2.0'], hasJabara: false, hasDctManual: false },
  { id: 'sg70-25', label: '스팅어 & G70 2.5', keywords: ['2.5'], hasJabara: false, hasDctManual: false },
  { id: 'sg70-33', label: '스팅어 & G70 3.3', keywords: ['3.3'], hasJabara: false, hasDctManual: false },
];

const BURNWAY_MODELS_KEY = 'burnway-car-models';

function loadBurnwayModels() {
  try {
    const stored = localStorage.getItem(BURNWAY_MODELS_KEY);
    if (stored) {
      // Restore hasJabara/hasDctManual from defaults if missing
      const models = JSON.parse(stored);
      let needsSave = false;
      const restored = models.map(m => {
        const def = BURNWAY_INITIAL_MODELS.find(d => d.id === m.id);
        if (def && m.hasJabara === undefined) {
          needsSave = true;
          return { ...m, hasJabara: def.hasJabara, hasDctManual: def.hasDctManual };
        }
        return m;
      });
      if (needsSave) localStorage.setItem(BURNWAY_MODELS_KEY, JSON.stringify(restored));
      return restored;
    }
    // Migrate from old key if exists
    const oldCustom = localStorage.getItem('burnway-custom-car-models');
    if (oldCustom) {
      const merged = [...BURNWAY_INITIAL_MODELS, ...JSON.parse(oldCustom)];
      localStorage.setItem(BURNWAY_MODELS_KEY, JSON.stringify(merged));
      localStorage.removeItem('burnway-custom-car-models');
      return merged;
    }
    // First load: initialize with defaults
    localStorage.setItem(BURNWAY_MODELS_KEY, JSON.stringify(BURNWAY_INITIAL_MODELS));
    return [...BURNWAY_INITIAL_MODELS];
  } catch { return [...BURNWAY_INITIAL_MODELS]; }
}

function saveBurnwayModels(models) {
  localStorage.setItem(BURNWAY_MODELS_KEY, JSON.stringify(models));
}

function detectBurnwayCarModel(name, allModels) {
  const n = name.toLowerCase().replace(/\s/g, '');
  // Keyword-based matching from all models
  for (const m of allModels) {
    if (m.keywords && m.keywords.some(kw => n.includes(kw.toLowerCase().replace(/\s/g, '')))) return m.id;
  }
  return null;
}

function BurnwayTab({ products, setProducts, supabaseConnected, showToast, supabase, pushUndo }) {
  const [expandedModel, setExpandedModel] = useState(null);
  const [editingStock, setEditingStock] = useState(null); // { id, value }
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', stock: '', carModel: '', productType: '' });
  const [saving, setSaving] = useState(false);
  const [allModels, setAllModels] = useState(() => loadBurnwayModels());
  const [showModelManager, setShowModelManager] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [editingModel, setEditingModel] = useState(null); // { id, label, keywords }

  const burnwayProducts = useMemo(
    () => (products || []).filter((p) => p.category === '번웨이'),
    [products]
  );

  const grouped = useMemo(() => {
    const groups = {};
    allModels.forEach((m) => { groups[m.id] = []; });
    groups['unclassified'] = [];
    burnwayProducts.forEach((p) => {
      const modelId = detectBurnwayCarModel(p.name, allModels);
      if (modelId && groups[modelId]) groups[modelId].push(p);
      else groups['unclassified'].push(p);
    });
    return groups;
  }, [burnwayProducts, allModels]);

  const stats = useMemo(() => ({
    total: burnwayProducts.length,
    totalStock: burnwayProducts.reduce((sum, p) => sum + (p.stock ?? 0), 0),
    outOfStock: burnwayProducts.filter((p) => (p.stock ?? 0) === 0).length,
  }), [burnwayProducts]);

  const handleStockSave = async (product) => {
    if (!editingStock || editingStock.id !== product.id) return;
    const newStock = parseInt(editingStock.value, 10);
    if (isNaN(newStock) || newStock < 0) { showToast('올바른 재고 수량을 입력하세요', 'error'); return; }
    if (newStock === (product.stock ?? 0)) { setEditingStock(null); return; }
    setSaving(true);
    try {
      if (supabaseConnected && supabase?.updateProduct) {
        await supabase.updateProduct(product.id, { stock: newStock });
      }
      const oldStock = product.stock ?? 0;
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
      showToast(`${product.name} 재고 → ${newStock}`, 'success');
      if (pushUndo) {
        pushUndo({
          type: 'burnway-stock-edit',
          label: `번웨이 재고 수정 (${product.name}: ${oldStock}→${newStock})`,
          undo: async () => {
            await supabase.updateProduct(product.id, { stock: oldStock });
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: oldStock } : p));
          },
        });
      }
    } catch { showToast('재고 수정 실패', 'error'); }
    setSaving(false);
    setEditingStock(null);
  };

  const handleAddProduct = async () => {
    if (!addForm.name.trim()) { showToast('제품명을 입력하세요', 'error'); return; }
    const stock = parseInt(addForm.stock, 10) || 0;
    setSaving(true);
    try {
      const newProduct = { name: addForm.name.trim(), category: '번웨이', stock, min_stock: 0, wholesale: 0, retail: 0 };
      if (supabaseConnected && supabase?.addProduct) {
        const saved = await supabase.addProduct(newProduct);
        if (saved) {
          setProducts(prev => [...prev, saved]);
          showToast(`${saved.name} 등록 완료`, 'success');
          if (pushUndo) {
            pushUndo({
              type: 'burnway-product-add',
              label: `번웨이 제품 추가 (${saved.name})`,
              undo: async () => {
                await supabase.deleteProduct(saved.id);
                setProducts(prev => prev.filter(p => p.id !== saved.id));
              },
            });
          }
        } else { showToast('등록 실패', 'error'); }
      } else {
        newProduct.id = Date.now();
        setProducts(prev => [...prev, newProduct]);
        showToast(`${newProduct.name} 등록 (로컬)`, 'success');
      }
      setAddForm({ name: '', stock: '', carModel: '', productType: '' });
      setShowAddModal(false);
    } catch { showToast('등록 실패', 'error'); }
    setSaving(false);
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`"${product.name}" 삭제하시겠습니까?`)) return;
    try {
      if (supabaseConnected && supabase?.deleteProduct) {
        await supabase.deleteProduct(product.id);
      }
      setProducts(prev => prev.filter(p => p.id !== product.id));
      showToast(`${product.name} 삭제됨`, 'success');
      if (pushUndo) {
        pushUndo({
          type: 'burnway-product-delete',
          label: `번웨이 제품 삭제 (${product.name})`,
          undo: async () => {
            const { id: _id, ...rest } = product;
            const restored = await supabase.addProduct(rest);
            if (restored) setProducts(prev => [...prev, restored]);
          },
        });
      }
    } catch { showToast('삭제 실패', 'error'); }
  };

  // Car model management
  const [newModelJabara, setNewModelJabara] = useState(false);
  const [newModelDctManual, setNewModelDctManual] = useState(false);

  const handleAddModel = () => {
    const name = newModelName.trim();
    if (!name) { showToast('모델명을 입력하세요', 'error'); return; }
    if (allModels.some(m => m.label === name)) { showToast('이미 존재하는 모델입니다', 'error'); return; }
    const id = 'model-' + name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '') + '-' + Date.now();
    const newModel = { id, label: name, keywords: [name.toLowerCase()], hasJabara: newModelJabara, hasDctManual: newModelJabara && newModelDctManual };
    const updated = [...allModels, newModel];
    setAllModels(updated);
    saveBurnwayModels(updated);
    setNewModelName('');
    setNewModelJabara(false);
    setNewModelDctManual(false);
    showToast(`차량 모델 "${name}" 추가됨`, 'success');
  };

  const handleDeleteModel = (modelToDelete) => {
    const modelProducts = grouped[modelToDelete.id] || [];
    if (modelProducts.length > 0) {
      if (!window.confirm(`"${modelToDelete.label}" 모델에 ${modelProducts.length}개 제품이 등록되어 있습니다.\n삭제하면 해당 제품들은 미분류로 이동합니다.\n계속하시겠습니까?`)) return;
    }
    if (allModels.length <= 1) { showToast('최소 1개 모델은 유지해야 합니다', 'error'); return; }
    const updated = allModels.filter(m => m.id !== modelToDelete.id);
    setAllModels(updated);
    saveBurnwayModels(updated);
    showToast(`차량 모델 "${modelToDelete.label}" 삭제됨`, 'success');
  };

  const handleEditModel = (model) => {
    setEditingModel({ id: model.id, label: model.label, keywords: (model.keywords || []).join(', '), hasJabara: !!model.hasJabara, hasDctManual: !!model.hasDctManual });
  };

  const handleSaveEditModel = () => {
    if (!editingModel) return;
    const label = editingModel.label.trim();
    if (!label) { showToast('모델명을 입력하세요', 'error'); return; }
    if (allModels.some(m => m.id !== editingModel.id && m.label === label)) { showToast('이미 존재하는 모델명입니다', 'error'); return; }
    const keywords = editingModel.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.length === 0) keywords.push(label.toLowerCase());
    const updated = allModels.map(m => m.id === editingModel.id ? { ...m, label, keywords, hasJabara: !!editingModel.hasJabara, hasDctManual: editingModel.hasJabara && !!editingModel.hasDctManual } : m);
    setAllModels(updated);
    saveBurnwayModels(updated);
    setEditingModel(null);
    showToast(`"${label}" 모델 수정됨`, 'success');
  };

  const stockColor = (s) => s === 0 ? 'var(--destructive)' : s <= 2 ? 'var(--warning)' : 'var(--success)';

  // Detect model for display
  const getDetectedModelLabel = (name) => {
    const id = detectBurnwayCarModel(name, allModels);
    return allModels.find(m => m.id === id)?.label || '미분류';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">번웨이 다운파이프</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {stats.total}개 제품 · <span style={{ color: 'var(--success)' }}>{stats.totalStock}개</span>
            {stats.outOfStock > 0 && <span style={{ color: 'var(--destructive)' }}> · {stats.outOfStock} 품절</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionBtn variant="secondary" Icon={Car} onClick={() => setShowModelManager(!showModelManager)}>
            {showModelManager ? '닫기' : '모델 관리'}
          </ActionBtn>
          <ActionBtn Icon={Plus} onClick={() => setShowAddModal(true)}>제품 추가</ActionBtn>
        </div>
      </div>

      {/* Car Model Manager */}
      {showModelManager && (
        <SectionCard>
          <div className="px-4 sm:px-5 py-4">
            <div className="flex items-center gap-2.5 mb-4">
              <Car className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <span className="text-base font-bold text-[var(--foreground)]">차량 모델 관리</span>
            </div>
            {/* Add new model */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddModel(); }}
                  placeholder="새 차량 모델명 입력"
                  className="flex-1 px-4 py-3 text-base rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <ActionBtn Icon={Plus} onClick={handleAddModel}>추가</ActionBtn>
              </div>
              <div className="flex items-center gap-4 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={newModelJabara} onChange={(e) => { setNewModelJabara(e.target.checked); if (!e.target.checked) setNewModelDctManual(false); }} className="rounded w-4 h-4" />
                  <span className="text-sm text-[var(--muted-foreground)]">자바라 세트</span>
                </label>
                {newModelJabara && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={newModelDctManual} onChange={(e) => setNewModelDctManual(e.target.checked)} className="rounded w-4 h-4" />
                    <span className="text-sm text-[var(--muted-foreground)]">DCT/수동 구분</span>
                  </label>
                )}
              </div>
            </div>
            {/* Model list */}
            <div className="space-y-1.5">
              {allModels.map((model) => {
                const count = (grouped[model.id] || []).length;
                if (editingModel && editingModel.id === model.id) {
                  return (
                    <div key={model.id} className="px-4 py-3 rounded-lg space-y-3" style={{ background: 'var(--background)' }}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingModel.label}
                          onChange={(e) => setEditingModel({ ...editingModel, label: e.target.value })}
                          placeholder="모델명"
                          className="flex-1 px-3 py-2.5 text-base rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingModel.keywords}
                          onChange={(e) => setEditingModel({ ...editingModel, keywords: e.target.value })}
                          placeholder="키워드 (쉼표 구분)"
                          className="flex-1 px-3 py-2.5 text-base rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div className="flex items-center gap-4 px-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={editingModel.hasJabara} onChange={(e) => setEditingModel({ ...editingModel, hasJabara: e.target.checked, hasDctManual: e.target.checked ? editingModel.hasDctManual : false })} className="rounded w-4 h-4" />
                          <span className="text-sm text-[var(--muted-foreground)]">자바라 세트</span>
                        </label>
                        {editingModel.hasJabara && (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={editingModel.hasDctManual} onChange={(e) => setEditingModel({ ...editingModel, hasDctManual: e.target.checked })} className="rounded w-4 h-4" />
                            <span className="text-sm text-[var(--muted-foreground)]">DCT/수동 구분</span>
                          </label>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={handleSaveEditModel} className="p-2 rounded hover:bg-[var(--accent)] text-[var(--success)] transition-colors">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingModel(null)} className="p-2 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={model.id} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: 'var(--background)' }}>
                    <div className="flex items-center gap-2.5">
                      <Car className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                      <span className="text-base font-medium text-[var(--foreground)]">{model.label}</span>
                      <span className="text-sm text-[var(--muted-foreground)]">{count}개</span>
                      {model.hasJabara ? (
                        model.hasDctManual ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>자바라 DCT/수동</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>자바라</span>
                        )
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)', color: 'var(--muted-foreground)' }}>다운파이프만</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditModel(model)}
                        className="p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                        title="수정"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model)}
                        className="p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Car model groups */}
      {allModels.map((model) => {
        const items = grouped[model.id] || [];
        const modelStock = items.reduce((sum, p) => sum + (p.stock ?? 0), 0);
        const hasOut = items.some(p => (p.stock ?? 0) === 0);
        const isExpanded = expandedModel === model.id;

        return (
          <SectionCard key={model.id}>
            <button
              onClick={() => setExpandedModel(isExpanded ? null : model.id)}
              className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-[var(--accent)] transition-colors rounded-xl"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                  style={{ background: hasOut ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
                  <Car className="w-5 h-5" style={{ color: hasOut ? 'var(--destructive)' : 'var(--primary)' }} />
                </div>
                <div className="text-left min-w-0">
                  <span className="text-base font-bold text-[var(--foreground)]">{model.label}</span>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className="text-sm" style={{ color: stockColor(modelStock) }}>{modelStock}개</span>
                    <span className="text-sm text-[var(--muted-foreground)]">{items.length}종</span>
                    {hasOut && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)' }}>품절</span>}
                  </div>
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />}
            </button>

            {isExpanded && (
              <div className="px-3 sm:px-5 pb-4">
                {items.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">등록된 제품 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {items.map((p) => {
                      const stock = p.stock ?? 0;
                      const isEditing = editingStock?.id === p.id;
                      return (
                        <div key={p.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--background)' }}>
                          <span className="flex-1 min-w-0 break-words text-[var(--foreground)] text-sm sm:text-base">{p.name}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="number"
                                min="0"
                                value={editingStock.value}
                                onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleStockSave(p); if (e.key === 'Escape') setEditingStock(null); }}
                                onBlur={() => handleStockSave(p)}
                                autoFocus
                                className="w-16 sm:w-20 px-3 py-2 text-sm text-center rounded border border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingStock({ id: p.id, value: String(stock) })}
                              className="px-2.5 sm:px-3 py-1.5 rounded text-sm font-bold cursor-pointer hover:opacity-70 transition-opacity flex-shrink-0"
                              style={{ color: stockColor(stock), background: stock === 0 ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'transparent' }}
                              title="클릭하여 재고 수정"
                            >
                              {stock === 0 ? '품절' : `${stock}개`}
                            </button>
                          )}
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-[var(--accent)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--destructive)] flex-shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        );
      })}

      {/* Unclassified */}
      {grouped['unclassified']?.length > 0 && (
        <SectionCard>
          <button
            onClick={() => setExpandedModel(expandedModel === 'unclassified' ? null : 'unclassified')}
            className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-[var(--accent)] transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
              </div>
              <span className="text-base font-bold text-[var(--foreground)]">미분류</span>
              <span className="text-sm text-[var(--muted-foreground)]">{grouped['unclassified'].length}개</span>
            </div>
            {expandedModel === 'unclassified' ? <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />}
          </button>
          {expandedModel === 'unclassified' && (
            <div className="px-3 sm:px-5 pb-4 space-y-1.5">
              {grouped['unclassified'].map((p) => {
                const stock = p.stock ?? 0;
                const isEditing = editingStock?.id === p.id;
                return (
                  <div key={p.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-lg text-sm" style={{ background: 'var(--background)' }}>
                    <span className="flex-1 min-w-0 break-words text-[var(--foreground)] text-sm sm:text-base">{p.name}</span>
                    {isEditing ? (
                      <input type="number" min="0" value={editingStock.value}
                        onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleStockSave(p); if (e.key === 'Escape') setEditingStock(null); }}
                        onBlur={() => handleStockSave(p)} autoFocus
                        className="w-16 sm:w-20 px-3 py-2 text-sm text-center rounded border border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                      />
                    ) : (
                      <button onClick={() => setEditingStock({ id: p.id, value: String(stock) })}
                        className="px-2.5 sm:px-3 py-1.5 rounded text-sm font-bold cursor-pointer hover:opacity-70 flex-shrink-0"
                        style={{ color: stockColor(stock) }} title="클릭하여 재고 수정">
                        {stock === 0 ? '품절' : `${stock}개`}
                      </button>
                    )}
                    <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Add Product Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="번웨이 제품 추가" maxWidth="max-w-md">
        <div className="space-y-4">
          {/* Car model selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--foreground)]">차량 모델</label>
            <select
              value={addForm.carModel}
              onChange={(e) => {
                const modelId = e.target.value;
                const model = allModels.find(m => m.id === modelId);
                const autoName = model && addForm.productType
                  ? `${model.label} ${addForm.productType}`
                  : model ? model.label + ' ' : '';
                setAddForm(prev => ({ ...prev, carModel: modelId, name: autoName }));
              }}
              className="px-3 py-3 text-base rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
            >
              <option value="">선택 안함 (자동 분류)</option>
              {allModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          {/* Product type selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--foreground)]">제품 타입</label>
            <select
              value={addForm.productType}
              onChange={(e) => {
                const type = e.target.value;
                const model = allModels.find(m => m.id === addForm.carModel);
                const autoName = model && type
                  ? `${model.label} ${type}`
                  : model ? model.label + ' ' + type : type;
                setAddForm(prev => ({ ...prev, productType: type, name: autoName.trim() }));
              }}
              className="px-3 py-3 text-base rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
            >
              <option value="">선택하세요</option>
              <option value="촉매 다운파이프">촉매 다운파이프</option>
              <option value="직관 다운파이프">직관 다운파이프</option>
              <option value="자바라 DCT">자바라 DCT</option>
              <option value="자바라 수동">자바라 수동</option>
              <option value="자바라">자바라 (단일)</option>
            </select>
          </div>
          <InputField label="제품명" required placeholder="차량 모델 + 타입 선택 시 자동 생성" value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          <InputField label="초기 재고 (개)" type="number" min="0" placeholder="0" value={addForm.stock}
            onChange={(e) => setAddForm({ ...addForm, stock: e.target.value })} />
          {addForm.name && (
            <p className="text-xs text-[var(--muted-foreground)]">
              자동 분류: <span className="font-medium text-[var(--foreground)]">
                {addForm.carModel
                  ? allModels.find(m => m.id === addForm.carModel)?.label || '미분류'
                  : getDetectedModelLabel(addForm.name)}
              </span>
              {addForm.productType && <> · 타입: <span className="font-medium text-[var(--foreground)]">{addForm.productType}</span></>}
              {' '}· 카테고리: 번웨이
            </p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <ActionBtn variant="secondary" size="md" onClick={() => setShowAddModal(false)}>취소</ActionBtn>
            <ActionBtn Icon={Plus} size="md" onClick={handleAddProduct} disabled={saving}>{saving ? '저장 중...' : '추가'}</ActionBtn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiscountTiersTab
// ---------------------------------------------------------------------------
// AI Stock Tab
// ---------------------------------------------------------------------------
function AIStockTab({ products, setProducts, supabaseConnected, showToast, supabase }) {
  const [inputText, setInputText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const getGeminiKey = () => {
    const stored = localStorage.getItem('geminiApiKey');
    if (stored) return stored;
    try { return atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj'); } catch { return ''; }
  };

  const synonyms = {
    '스텐': '스덴', '스테인': '스덴', 'sus': '스덴',
    '밴드': '밴딩', '벤딩': '밴딩',
    '후렌지': '플랜지', '후란지': '플랜지',
    '공갈레조': 'CH', '뻥레조': 'CH', '직관레조': 'CH', '직관 레조': 'CH',
    '가변소음기': 'TVB', '가변': 'TVB', '진공가변': 'TVB',
    '레듀서': '레듀샤', '리듀서': '레듀샤',
  };

  const applySynonyms = (text) => {
    let r = text.toLowerCase();
    Object.entries(synonyms).forEach(([k, v]) => { r = r.replace(new RegExp(k, 'gi'), v); });
    return r;
  };

  const calculateMatchScore = (productName, searchText) => {
    let score = 0;
    const np = normalizeText(productName);
    const ns = normalizeText(searchText);
    if (np === ns) return 1000;
    if (np.includes(ns)) score += 100 + ns.length * 5;
    if (applySynonyms(np).includes(applySynonyms(ns))) score += 80 + ns.length * 4;
    const parts = ns.match(/[가-힣a-z]+|\d+/gi) || [];
    if (parts.length > 0) {
      let lastIdx = -1, seq = 0;
      parts.forEach(p => { const fi = np.indexOf(p, lastIdx + 1); if (fi > lastIdx) { seq++; lastIdx = fi + p.length - 1; score += p.length * 3; } });
      if (seq === parts.length) score += 40;
    }
    const sw = searchText.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 0);
    let mw = 0;
    sw.forEach(w => { if (np.includes(normalizeText(w)) || applySynonyms(np).includes(applySynonyms(w))) { mw++; score += w.length * 2; } });
    if (mw === sw.length && sw.length > 1) score += 30;
    return score;
  };

  const findProduct = (name) => {
    if (!name) return null;
    const exact = products.find(p => p.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    const ci = products.find(p => p.name.toLowerCase() === lower);
    if (ci) return ci;
    const norm = normalizeText(name);
    const ni = products.find(p => normalizeText(p.name) === norm);
    if (ni) return ni;
    let best = null, bestScore = 0;
    products.forEach(p => {
      const s = calculateMatchScore(p.name, name);
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return bestScore >= 20 ? best : null;
  };

  const analyzeStock = async () => {
    if (!inputText.trim()) return;
    setIsAnalyzing(true);
    setParsedItems([]);

    const geminiKey = getGeminiKey();
    if (!geminiKey) { showToast('Gemini API 키가 없습니다', 'error'); setIsAnalyzing(false); return; }

    const grouped = {};
    products.forEach(p => {
      const cat = p.category || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`${p.name} (재고:${p.stock ?? '?'})`);
    });
    const productList = Object.entries(grouped).map(([c, ns]) => `[${c}]\n${ns.join('\n')}`).join('\n\n');

    const prompt = `당신은 자동차 튜닝/배기 부품 재고 관리 AI입니다. 텍스트에서 제품과 수량, 동작(입고/출고/설정)을 추출하세요.

## 제품 매칭 규칙 (최우선!)
- "직관 레조", "직관레조" → **CH 뻥레조** (CH 200 64 등). "일반 레조" → 진짜 레조 (레조 100 250 64 등)
- "가변소음기 63h 2개" → "용접된 TVB 64 h 좌, 우 1세트" qty:1 (h/Y 2개=1세트)
- "가변소음기 54y 2개" → "용접된 TVB 54 Y 좌,우 1세트" qty:1
- 내경 63→64 매핑 (제품에 63 없음)
- "중통 원밴딩 76" → 76파이 관련 중통/원밴딩 제품
- 차종 약어: 벨N=벨로스터N, 아N=아반떼N, 코나N=코나N
- 숫자가 여러개인 레조: "100 250 64" → 외경100 길이250 내경64

## 동작 판정
- "입고", "입고 완료", "추가", "들어옴", "도착" → action: "add" (현재 재고에 추가)
- "출고", "차감", "빠짐", "나감", "사용" → action: "subtract" (현재 재고에서 차감)
- "재고 설정", "재고 30개로", "30개로 변경" → action: "set" (절대값 설정)
- **동작 미지정 시 기본값: "add"** (입고가 가장 일반적)

## 제품 목록 (현재 재고 포함)
${productList}

## 입력 텍스트
${inputText}

## 응답 형식 (JSON 배열만, 다른 텍스트 없이)
[{"originalText":"원본","matchedProduct":"정확한 제품명 or null","quantity":수량,"action":"add|subtract|set","confidence":"high|medium|low","alternatives":["제품명1"]}]

## 예시
입력: "레조 100 250 64 20개 입고 완료"
→ [{"originalText":"레조 100 250 64 20개 입고 완료","matchedProduct":"레조 100 250 64","quantity":20,"action":"add","confidence":"high","alternatives":[]}]

입력: "중통 원밴딩 76 아N 4개 벨N 3개 입고"
→ [{"originalText":"중통 원밴딩 76 아N 4개","matchedProduct":"76파이 아N 중통 원밴딩 배기라인","quantity":4,"action":"add","confidence":"high","alternatives":[]},{"originalText":"중통 원밴딩 76 벨N 3개","matchedProduct":"벨N 중통 원밴딩 배기라인","quantity":3,"action":"add","confidence":"high","alternatives":[]}]

입력: "직관 레조 200 54 재고 10개로 설정"
→ [{"originalText":"직관 레조 200 54 재고 10개로 설정","matchedProduct":"CH 200 54","quantity":10,"action":"set","confidence":"high","alternatives":[]}]`;

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4096 } }) }
      );
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let jsonStr = aiText;
      const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) || aiText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) jsonStr = jsonMatch[1] || jsonMatch[0];
      const aiResults = JSON.parse(jsonStr);

      const items = aiResults.map(item => {
        const searchTerms = [item.matchedProduct, ...(item.alternatives || []), item.originalText].filter(Boolean);
        let matched = null;
        const alts = [];
        for (const term of searchTerms) {
          const found = findProduct(term);
          if (found && !matched) matched = found;
          else if (found && !alts.some(a => a.id === found.id) && found.id !== matched?.id) alts.push(found);
        }
        const action = item.action || 'add';
        const qty = item.quantity || 1;
        let newStock = matched ? (matched.stock ?? 0) : 0;
        if (action === 'add') newStock += qty;
        else if (action === 'subtract') newStock = Math.max(0, newStock - qty);
        else if (action === 'set') newStock = qty;

        return {
          originalText: item.originalText,
          matchedProduct: matched,
          quantity: qty,
          action,
          newStock,
          confidence: item.confidence || (matched ? 'high' : 'low'),
          alternatives: alts.slice(0, 3),
          selected: !!matched,
        };
      });
      setParsedItems(items);
    } catch (e) {
      console.error('AI Stock error:', e);
      showToast(`AI 분석 실패: ${e.message}`, 'error');
    }
    setIsAnalyzing(false);
  };

  const recalcStock = (item) => {
    const current = item.matchedProduct?.stock ?? 0;
    if (item.action === 'add') return current + item.quantity;
    if (item.action === 'subtract') return Math.max(0, current - item.quantity);
    if (item.action === 'set') return item.quantity;
    return current;
  };

  const updateItem = (idx, changes) => {
    setParsedItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, ...changes };
      updated.newStock = recalcStock(updated);
      return updated;
    }));
  };

  const switchProduct = (idx, product) => {
    setParsedItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, matchedProduct: product, selected: true };
      updated.newStock = recalcStock(updated);
      return updated;
    }));
  };

  const applyChanges = async () => {
    const selected = parsedItems.filter(it => it.selected && it.matchedProduct);
    if (selected.length === 0) { showToast('적용할 항목이 없습니다', 'error'); return; }
    setIsApplying(true);
    let success = 0, fail = 0;
    for (const item of selected) {
      const updated = await supabase.updateProduct(item.matchedProduct.id, { stock: item.newStock });
      if (updated) {
        setProducts(prev => prev.map(p => p.id === item.matchedProduct.id ? { ...p, stock: item.newStock } : p));
        success++;
      } else { fail++; }
    }
    showToast(`${success}건 적용 완료${fail ? `, ${fail}건 실패` : ''}`, fail ? 'error' : 'success');
    if (success > 0) { setParsedItems([]); setInputText(''); }
    setIsApplying(false);
  };

  const actionLabel = { add: '입고', subtract: '출고', set: '설정' };
  const actionColor = { add: 'text-green-600', subtract: 'text-red-600', set: 'text-blue-600' };
  const confBadge = { high: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-red-100 text-red-700' };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">AI 재고 관리</h2>
      <p className="text-sm text-gray-500">자연어로 입고/출고를 입력하면 AI가 제품을 매칭합니다. 결과에서 개별적으로 입고↔교체 전환 가능.</p>

      {/* Input */}
      <div className="space-y-2">
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={"예시:\nJSR 레조 100 250 64 20개\n100 250 54 20개\n중통 원밴딩 76 아N 4개 벨N 3개\n\n입고 완료"}
          className="w-full h-40 p-3 border rounded-lg text-sm resize-y focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        />
        <button
          onClick={analyzeStock}
          disabled={isAnalyzing || !inputText.trim()}
          className="w-full py-3 bg-[var(--primary)] text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isAnalyzing ? <><Loader2 size={18} className="animate-spin" /> 분석 중...</> : <><Zap size={18} /> AI 분석</>}
        </button>
      </div>

      {/* Results */}
      {parsedItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">분석 결과 ({parsedItems.filter(i => i.selected).length}/{parsedItems.length}건 선택)</h3>
            <button
              onClick={applyChanges}
              disabled={isApplying || !parsedItems.some(i => i.selected && i.matchedProduct)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {isApplying ? <><Loader2 size={16} className="animate-spin" /> 적용 중...</> : <><Check size={16} /> 일괄 적용</>}
            </button>
          </div>

          {parsedItems.map((item, idx) => (
            <div key={idx} className={`p-3 rounded-lg border ${item.selected ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
              {/* Header: checkbox + original text + confidence */}
              <div className="flex items-start gap-2 mb-2">
                <input type="checkbox" checked={item.selected} onChange={e => updateItem(idx, { selected: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-500">{item.originalText}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confBadge[item.confidence] || confBadge.low}`}>
                  {item.confidence}
                </span>
              </div>

              {item.matchedProduct ? (
                <>
                  {/* Product name + stock change */}
                  <div className="ml-6 mb-2">
                    <div className="font-medium text-sm">{item.matchedProduct.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm">
                      <span className="text-gray-500">현재 <strong>{item.matchedProduct.stock ?? 0}</strong>개</span>
                      <ArrowRight size={14} className="text-gray-400" />
                      <span className={`font-bold ${actionColor[item.action]}`}>{item.newStock}개</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${item.action === 'add' ? 'bg-green-100 text-green-700' : item.action === 'subtract' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {actionLabel[item.action]} {item.action !== 'set' && `${item.action === 'add' ? '+' : '-'}${item.quantity}`}
                        {item.action === 'set' && `→ ${item.quantity}`}
                      </span>
                    </div>
                  </div>

                  {/* Controls: action toggle + quantity */}
                  <div className="ml-6 flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1">
                      {[['add', '+입고', 'bg-green-100 text-green-700 ring-green-400'], ['set', '=교체', 'bg-blue-100 text-blue-700 ring-blue-400'], ['subtract', '-출고', 'bg-red-100 text-red-700 ring-red-400']].map(([act, label, colors]) => (
                        <button key={act} onClick={() => updateItem(idx, { action: act })}
                          className={`text-xs px-2 py-1 rounded font-medium transition-all ${item.action === act ? colors + ' ring-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateItem(idx, { quantity: Math.max(1, item.quantity - 1) })}
                        className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300"><Minus size={12} /></button>
                      <input type="number" value={item.quantity} min={1}
                        onChange={e => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 text-center text-sm border rounded px-1 py-0.5" />
                      <button onClick={() => updateItem(idx, { quantity: item.quantity + 1 })}
                        className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300"><Plus size={12} /></button>
                    </div>
                  </div>

                  {/* Alternatives */}
                  {item.alternatives.length > 0 && (
                    <div className="ml-6 mt-2 flex gap-1 flex-wrap">
                      <span className="text-xs text-gray-400">대안:</span>
                      {item.alternatives.map((alt, ai) => (
                        <button key={ai} onClick={() => switchProduct(idx, alt)}
                          className="text-xs px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600">{alt.name}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="ml-6 text-sm text-red-500">매칭 실패 - 제품을 찾을 수 없습니다</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 단가 일괄 조정 탭
// ---------------------------------------------------------------------------
function PriceAdjustTab({ products, setProducts, supabaseConnected, showToast, supabase, pushUndo }) {
  const [selectedCats, setSelectedCats] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set()); // 개별 제품 선택
  const [excludedIds, setExcludedIds] = useState(new Set()); // 카테고리에서 제외할 제품
  const [adjustType, setAdjustType] = useState('percent');
  const [adjustDir, setAdjustDir] = useState('up');
  const [adjustValue, setAdjustValue] = useState('');
  const [target, setTarget] = useState('wholesale');
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);

  const displayProducts = (products && products.length > 0) ? products : priceData;

  const categories = useMemo(() => {
    return [...new Set(displayProducts.map(p => p.category).filter(Boolean))].sort();
  }, [displayProducts]);

  const filteredCats = useMemo(() => {
    if (!catSearch) return categories;
    const s = catSearch.toLowerCase();
    return categories.filter(c => c.toLowerCase().includes(s));
  }, [categories, catSearch]);

  const toggleCat = (cat) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
        // 카테고리 해제 시 해당 제품 개별선택/제외도 정리
        const catProductIds = displayProducts.filter(p => p.category === cat).map(p => p.id);
        setExcludedIds(prev2 => { const n = new Set(prev2); catProductIds.forEach(id => n.delete(id)); return n; });
      } else {
        next.add(cat);
      }
      return next;
    });
    setShowPreview(false);
  };

  const toggleProductInCat = (productId) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
    setShowPreview(false);
  };

  const toggleIndividualProduct = (productId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
    setShowPreview(false);
  };

  const selectAll = () => {
    setSelectedCats(new Set(filteredCats));
    setExcludedIds(new Set());
    setShowPreview(false);
  };

  const deselectAll = () => {
    setSelectedCats(new Set());
    setSelectedIds(new Set());
    setExcludedIds(new Set());
    setShowPreview(false);
  };

  // 카테고리 선택 제품 (제외 항목 빼고) + 개별 선택 제품 합산
  const affectedProducts = useMemo(() => {
    const fromCats = displayProducts.filter(p => selectedCats.has(p.category) && !excludedIds.has(p.id));
    const fromIndividual = displayProducts.filter(p => selectedIds.has(p.id) && !selectedCats.has(p.category));
    return [...fromCats, ...fromIndividual];
  }, [displayProducts, selectedCats, selectedIds, excludedIds]);

  // 제품 검색 결과 (개별 추가용)
  const productSearchResults = useMemo(() => {
    if (!productSearch.trim()) return [];
    return displayProducts.filter(p =>
      matchesSearchQuery(p.name, productSearch) && !selectedCats.has(p.category)
    ).slice(0, 20);
  }, [displayProducts, productSearch, selectedCats]);

  const calcNewPrice = (price) => {
    if (!price || !adjustValue) return price;
    const val = parseFloat(adjustValue);
    if (isNaN(val) || val === 0) return price;
    if (adjustType === 'percent') {
      const mult = adjustDir === 'up' ? (1 + val / 100) : (1 - val / 100);
      return Math.round(price * mult / 100) * 100; // 100원 단위 반올림
    } else {
      const delta = adjustDir === 'up' ? val : -val;
      return Math.max(0, Math.round((price + delta) / 100) * 100);
    }
  };

  const previewData = useMemo(() => {
    if (!adjustValue || parseFloat(adjustValue) === 0 || affectedProducts.length === 0) return [];
    return affectedProducts.map(p => ({
      ...p,
      newWholesale: (target === 'wholesale' || target === 'both') ? calcNewPrice(p.wholesale) : p.wholesale,
      newRetail: (target === 'retail' || target === 'both') ? calcNewPrice(p.retail) : p.retail,
    }));
  }, [affectedProducts, adjustValue, adjustType, adjustDir, target]);

  const handleApply = async () => {
    if (previewData.length === 0) return;
    setApplying(true);
    try {
      // 되돌리기용 백업
      const backup = affectedProducts.map(p => ({ id: p.id, wholesale: p.wholesale, retail: p.retail }));

      const updatedAll = displayProducts.map(p => {
        const preview = previewData.find(pp => pp.id === p.id);
        if (!preview) return p;
        return { ...p, wholesale: preview.newWholesale, retail: preview.newRetail };
      });

      // Supabase 업데이트
      if (supabaseConnected && supabase?.saveProduct) {
        const toUpdate = previewData.filter(p => p.wholesale !== p.newWholesale || p.retail !== p.newRetail);
        for (const p of toUpdate) {
          await supabase.saveProduct({ id: p.id, wholesale: p.newWholesale, retail: p.newRetail });
        }
      }

      setProducts(updatedAll);

      if (pushUndo) {
        pushUndo({
          label: `단가 ${adjustDir === 'up' ? '인상' : '인하'} (${selectedCats.size}개 카테고리, ${previewData.length}개 제품)`,
          undo: async () => {
            const restored = displayProducts.map(p => {
              const bk = backup.find(b => b.id === p.id);
              return bk ? { ...p, wholesale: bk.wholesale, retail: bk.retail } : p;
            });
            if (supabaseConnected && supabase?.saveProduct) {
              for (const b of backup) await supabase.saveProduct(b);
            }
            setProducts(restored);
          },
        });
      }

      showToast(`${previewData.length}개 제품 단가 ${adjustDir === 'up' ? '인상' : '인하'} 완료`, 'success');
      setAdjustValue('');
      setSelectedCats(new Set());
    } catch (err) {
      showToast('단가 조정 실패: ' + err.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const SectionCard = ({ children }) => (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">{children}</div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>단가 일괄 조정</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>카테고리를 선택하고 원하는 만큼 가격을 올리거나 내릴 수 있습니다</p>
      </div>

      {/* Step 1: 카테고리 + 제품 선택 */}
      <SectionCard>
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>① 카테고리 · 제품 선택</h3>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs px-2 py-1 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--primary)' }}>전체선택</button>
            <button onClick={deselectAll} className="text-xs px-2 py-1 rounded-lg hover:bg-[var(--accent)]" style={{ color: 'var(--muted-foreground)' }}>전체해제</button>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* 카테고리 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              value={catSearch}
              onChange={e => setCatSearch(e.target.value)}
              placeholder="카테고리 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* 카테고리 칩 + 펼치기 */}
          <div className="space-y-1 max-h-64 overflow-y-auto custom-scroll">
            {filteredCats.map(cat => {
              const isSelected = selectedCats.has(cat);
              const catProducts = displayProducts.filter(p => p.category === cat);
              const excludedCount = catProducts.filter(p => excludedIds.has(p.id)).length;
              const isExpanded = expandedCat === cat;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                      style={{
                        background: isSelected ? 'var(--primary)' : 'transparent',
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <button
                      onClick={() => setExpandedCat(isExpanded ? null : cat)}
                      className="flex-1 flex items-center justify-between py-1.5 text-left hover:bg-[var(--accent)] rounded-lg px-2 transition-all"
                    >
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {cat} <span className="text-xs font-normal" style={{ color: 'var(--muted-foreground)' }}>({catProducts.length}개{excludedCount > 0 ? `, ${excludedCount}개 제외` : ''})</span>
                      </span>
                      {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />}
                    </button>
                  </div>
                  {/* 펼친 제품 목록 */}
                  {isExpanded && (
                    <div className="ml-7 mt-1 mb-2 space-y-0.5 max-h-48 overflow-y-auto custom-scroll rounded-lg border border-[var(--border)] bg-[var(--background)]">
                      {catProducts.map(p => {
                        const isExcluded = excludedIds.has(p.id);
                        const active = isSelected && !isExcluded;
                        return (
                          <button
                            key={p.id}
                            onClick={() => isSelected ? toggleProductInCat(p.id) : null}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-all ${isSelected ? 'hover:bg-[var(--accent)] cursor-pointer' : 'opacity-50 cursor-default'}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div
                                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                                style={{
                                  background: active ? 'var(--primary)' : 'transparent',
                                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                                  opacity: isSelected ? 1 : 0.3,
                                }}
                              >
                                {active && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="break-words" style={{ color: isExcluded ? 'var(--muted-foreground)' : 'var(--foreground)', textDecoration: isExcluded ? 'line-through' : 'none' }}>{p.name}</span>
                            </div>
                            <span className="flex-shrink-0 ml-2 font-medium" style={{ color: 'var(--primary)' }}>
                              {formatPrice(p.wholesale)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 제품 개별 검색 추가 */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>제품 개별 추가 (카테고리 외 제품 검색)</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="제품명 검색..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            {productSearchResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto custom-scroll rounded-lg border border-[var(--border)] bg-[var(--background)]">
                {productSearchResults.map(p => {
                  const isAdded = selectedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleIndividualProduct(p.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--accent)] transition-all"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                          style={{
                            background: isAdded ? 'var(--success)' : 'transparent',
                            borderColor: isAdded ? 'var(--success)' : 'var(--border)',
                          }}
                        >
                          {isAdded && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="break-words" style={{ color: 'var(--foreground)' }}>{p.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{p.category}</span>
                      </div>
                      <span className="flex-shrink-0 ml-2 font-medium" style={{ color: 'var(--primary)' }}>
                        {formatPrice(p.wholesale)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* 개별 선택된 제품 태그 */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[...selectedIds].map(id => {
                  const p = displayProducts.find(pp => pp.id === id);
                  if (!p) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', borderColor: 'var(--success)', color: 'var(--success)' }}>
                      {p.name}
                      <button onClick={() => toggleIndividualProduct(id)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 선택 요약 */}
          {affectedProducts.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                총 {affectedProducts.length}개 제품 선택됨
                {selectedCats.size > 0 && ` (${selectedCats.size}개 카테고리`}{excludedIds.size > 0 ? `, ${excludedIds.size}개 제외` : ''}{selectedCats.size > 0 && ')'}
                {selectedIds.size > 0 && ` + 개별 ${selectedIds.size}개`}
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Step 2: 조정 설정 */}
      {affectedProducts.length > 0 && (
        <SectionCard>
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>② 조정 설정</h3>
          </div>
          <div className="p-4 space-y-4">
            {/* 인상/인하 */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted-foreground)' }}>방향</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAdjustDir('up')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all"
                  style={{
                    background: adjustDir === 'up' ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'var(--background)',
                    borderColor: adjustDir === 'up' ? 'var(--destructive)' : 'var(--border)',
                    color: adjustDir === 'up' ? 'var(--destructive)' : 'var(--muted-foreground)',
                  }}
                >
                  <TrendingUp className="w-4 h-4" /> 인상 ▲
                </button>
                <button
                  onClick={() => setAdjustDir('down')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all"
                  style={{
                    background: adjustDir === 'down' ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                    borderColor: adjustDir === 'down' ? 'var(--primary)' : 'var(--border)',
                    color: adjustDir === 'down' ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  <TrendingDown className="w-4 h-4" /> 인하 ▼
                </button>
              </div>
            </div>

            {/* 수치 + 단위 */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted-foreground)' }}>수치</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={adjustValue}
                  onChange={e => setAdjustValue(e.target.value)}
                  placeholder={adjustType === 'percent' ? '20' : '5000'}
                  className="flex-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                  <button
                    onClick={() => setAdjustType('percent')}
                    className="px-4 py-2.5 text-sm font-medium transition-all"
                    style={{
                      background: adjustType === 'percent' ? 'var(--primary)' : 'var(--background)',
                      color: adjustType === 'percent' ? 'white' : 'var(--muted-foreground)',
                    }}
                  >%</button>
                  <button
                    onClick={() => setAdjustType('fixed')}
                    className="px-4 py-2.5 text-sm font-medium transition-all"
                    style={{
                      background: adjustType === 'fixed' ? 'var(--primary)' : 'var(--background)',
                      color: adjustType === 'fixed' ? 'white' : 'var(--muted-foreground)',
                    }}
                  >원</button>
                </div>
              </div>
            </div>

            {/* 적용 대상 */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted-foreground)' }}>적용 대상</label>
              <div className="flex gap-2">
                {[
                  { value: 'wholesale', label: '도매가' },
                  { value: 'retail', label: '소매가' },
                  { value: 'both', label: '둘 다' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTarget(opt.value)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all"
                    style={{
                      background: target === opt.value ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                      borderColor: target === opt.value ? 'var(--primary)' : 'var(--border)',
                      color: target === opt.value ? 'var(--primary)' : 'var(--muted-foreground)',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* 수치 입력 시 미리보기 자동 표시 */}
          </div>
        </SectionCard>
      )}

      {/* Step 3: 미리보기 + 적용 */}
      {previewData.length > 0 && (
        <SectionCard>
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>③ 변경 미리보기</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
              background: adjustDir === 'up' ? 'color-mix(in srgb, var(--destructive) 15%, transparent)' : 'color-mix(in srgb, var(--primary) 15%, transparent)',
              color: adjustDir === 'up' ? 'var(--destructive)' : 'var(--primary)',
            }}>
              {adjustDir === 'up' ? '▲' : '▼'} {adjustValue}{adjustType === 'percent' ? '%' : '원'} {adjustDir === 'up' ? '인상' : '인하'}
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto custom-scroll">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--muted)]">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>제품명</th>
                  {(target === 'wholesale' || target === 'both') && (
                    <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>도매가</th>
                  )}
                  {(target === 'retail' || target === 'both') && (
                    <th className="text-right px-3 py-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>소매가</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {previewData.map(p => (
                  <tr key={p.id} className="hover:bg-[var(--accent)]">
                    <td className="px-3 py-2 break-words" style={{ color: 'var(--foreground)' }}>{p.name}</td>
                    {(target === 'wholesale' || target === 'both') && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-xs line-through mr-1" style={{ color: 'var(--muted-foreground)' }}>{formatPrice(p.wholesale)}</span>
                        <span className="font-bold" style={{ color: adjustDir === 'up' ? 'var(--destructive)' : 'var(--primary)' }}>
                          {formatPrice(p.newWholesale)}
                        </span>
                      </td>
                    )}
                    {(target === 'retail' || target === 'both') && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {p.retail ? (
                          <>
                            <span className="text-xs line-through mr-1" style={{ color: 'var(--muted-foreground)' }}>{formatPrice(p.retail)}</span>
                            <span className="font-bold" style={{ color: adjustDir === 'up' ? 'var(--destructive)' : 'var(--primary)' }}>
                              {formatPrice(p.newRetail)}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-[var(--border)] flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setAdjustValue('')}
              className="flex-1 py-3 rounded-xl text-sm font-medium border border-[var(--border)] hover:bg-[var(--accent)] transition-all"
              style={{ color: 'var(--foreground)' }}
            >
              취소
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              style={{
                background: adjustDir === 'up' ? 'var(--destructive)' : 'var(--primary)',
                color: 'white',
                opacity: applying ? 0.6 : 1,
              }}
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : adjustDir === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {applying ? '적용 중...' : `${previewData.length}개 제품 ${adjustDir === 'up' ? '인상' : '인하'} 적용`}
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const EMPTY_TIER = { minQty: '', maxQty: '', type: 'percent', value: '' };

function DiscountTiersTab({ products, setProducts, supabaseConnected, showToast, supabase }) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [tierForm, setTierForm] = useState(EMPTY_TIER);
  const [editingTier, setEditingTier] = useState(null);  // { productId, tierIndex }
  const [saving, setSaving] = useState(false);

  const displayProducts = (products && products.length > 0) ? products : priceData;

  const filtered = useMemo(() => {
    return displayProducts.filter(p => matchesSearchQuery(p.name, search));
  }, [displayProducts, search]);

  const saveProductTiers = async (productId, tiers) => {
    const updated = displayProducts.map(p => p.id === productId ? { ...p, discount_tiers: tiers } : p);
    if (supabaseConnected && supabase?.saveProduct) {
      const product = updated.find(p => p.id === productId);
      await supabase.saveProduct(product);
    }
    setProducts(updated);
  };

  const handleAddTier = async (productId) => {
    const { minQty, maxQty, type, value } = tierForm;
    if (!minQty || !value) { showToast('최소수량과 할인값을 입력하세요', 'error'); return; }
    setSaving(true);
    try {
      const product = displayProducts.find(p => p.id === productId);
      const existing = Array.isArray(product?.discount_tiers) ? product.discount_tiers : [];
      const newTier = {
        minQty: Number(minQty),
        maxQty: maxQty ? Number(maxQty) : null,
        type,
        value: Number(value),
      };
      await saveProductTiers(productId, [...existing, newTier]);
      showToast('할인 구간이 추가되었습니다', 'success');
      setAddingId(null);
      setTierForm(EMPTY_TIER);
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTier = async (productId, tierIndex) => {
    const { minQty, maxQty, type, value } = tierForm;
    if (!minQty || !value) { showToast('최소수량과 할인값을 입력하세요', 'error'); return; }
    setSaving(true);
    try {
      const product = displayProducts.find(p => p.id === productId);
      const tiers = [...(product?.discount_tiers || [])];
      tiers[tierIndex] = {
        minQty: Number(minQty),
        maxQty: maxQty ? Number(maxQty) : null,
        type,
        value: Number(value),
      };
      await saveProductTiers(productId, tiers);
      showToast('할인 구간이 수정되었습니다', 'success');
      setEditingTier(null);
      setTierForm(EMPTY_TIER);
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async (productId, tierIndex) => {
    try {
      const product = displayProducts.find(p => p.id === productId);
      const tiers = (product?.discount_tiers || []).filter((_, i) => i !== tierIndex);
      await saveProductTiers(productId, tiers);
      showToast('할인 구간이 삭제되었습니다', 'success');
    } catch (err) {
      showToast('삭제에 실패했습니다: ' + err.message, 'error');
    }
  };

  const openAddTier = (productId) => {
    setTierForm(EMPTY_TIER);
    setEditingTier(null);
    setAddingId(productId);
    setExpandedId(productId);
  };

  const openEditTier = (productId, tierIndex, tier) => {
    setTierForm({
      minQty: tier.minQty ?? '',
      maxQty: tier.maxQty ?? '',
      type: tier.type || 'percent',
      value: tier.value ?? '',
    });
    setEditingTier({ productId, tierIndex });
    setAddingId(null);
  };

  const TierFormInline = ({ productId, tierIndex = null }) => (
    <div className="mt-3 p-2 sm:p-3 rounded-lg bg-[var(--muted)] border border-[var(--border)] flex flex-wrap gap-2 items-end">
      <InputField
        label="최소수량"
        type="number"
        value={tierForm.minQty}
        onChange={e => setTierForm(p => ({ ...p, minQty: e.target.value }))}
        placeholder="1"
        className="w-20 sm:w-24"
      />
      <InputField
        label="최대수량"
        type="number"
        value={tierForm.maxQty}
        onChange={e => setTierForm(p => ({ ...p, maxQty: e.target.value }))}
        placeholder="없음"
        className="w-20 sm:w-24"
      />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--foreground)]">할인타입</label>
        <select
          value={tierForm.type}
          onChange={e => setTierForm(p => ({ ...p, type: e.target.value }))}
          className="px-2 sm:px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="percent">퍼센트 (%)</option>
          <option value="amount">금액 (원)</option>
        </select>
      </div>
      <InputField
        label={tierForm.type === 'percent' ? '할인율 (%)' : '할인금액 (원)'}
        type="number"
        value={tierForm.value}
        onChange={e => setTierForm(p => ({ ...p, value: e.target.value }))}
        placeholder={tierForm.type === 'percent' ? '10' : '1000'}
        className="w-24 sm:w-28"
      />
      <div className="flex gap-2">
        <ActionBtn
          variant="primary"
          Icon={Save}
          disabled={saving}
          onClick={() => tierIndex !== null ? handleUpdateTier(productId, tierIndex) : handleAddTier(productId)}
        >
          {saving ? '저장 중...' : (tierIndex !== null ? '수정' : '추가')}
        </ActionBtn>
        <ActionBtn
          variant="secondary"
          onClick={() => { setAddingId(null); setEditingTier(null); setTierForm(EMPTY_TIER); }}
        >
          취소
        </ActionBtn>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          placeholder="제품명으로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={handleSearchFocus}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Percent} title="제품이 없습니다" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(product => {
            const tiers = Array.isArray(product.discount_tiers) ? product.discount_tiers : [];
            const isExpanded = expandedId === product.id;
            const isAdding = addingId === product.id;

            return (
              <SectionCard key={product.id}>
                {/* Product Header Row */}
                <div
                  className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 cursor-pointer hover:bg-[var(--accent)] transition-colors select-none"
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                >
                  <span className="text-[var(--muted-foreground)] flex-shrink-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--foreground)] text-sm break-words block sm:inline">{product.name}</span>
                    <span className="ml-0 sm:ml-2 text-xs text-[var(--muted-foreground)] hidden sm:inline">{product.category}</span>
                  </div>
                  {tiers.length > 0 && (
                    <span
                      className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium flex-shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
                    >
                      {tiers.length}개
                    </span>
                  )}
                  <span className="text-xs text-[var(--muted-foreground)] hidden sm:inline flex-shrink-0">도매 {formatPrice(product.wholesale)}원</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddTier(product.id); }}
                    className="ml-1 sm:ml-2 p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                    title="할인구간 추가"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded Tiers */}
                {isExpanded && (
                  <div className="px-2 sm:px-4 pb-4 border-t border-[var(--border)]">
                    {tiers.length === 0 && !isAdding ? (
                      <p className="text-sm text-[var(--muted-foreground)] py-3">
                        할인 구간이 없습니다.
                        <button
                          onClick={() => openAddTier(product.id)}
                          className="ml-2 text-[var(--primary)] hover:underline"
                        >
                          추가하기
                        </button>
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
                        {tiers.map((tier, idx) => {
                          const isEditingThis = editingTier?.productId === product.id && editingTier?.tierIndex === idx;
                          return (
                            <div key={idx}>
                              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-[var(--muted)] border border-[var(--border)]">
                                <div className="flex-1 flex flex-wrap gap-2 sm:gap-4 text-sm min-w-0">
                                  <span>
                                    <span className="text-[var(--muted-foreground)] text-xs mr-1">수량</span>
                                    <span className="font-medium">{tier.minQty}</span>
                                    {tier.maxQty ? <span className="text-[var(--muted-foreground)]"> ~ {tier.maxQty}</span> : <span className="text-[var(--muted-foreground)]"> ~</span>}
                                  </span>
                                  <span>
                                    <span className="text-[var(--muted-foreground)] text-xs mr-1">할인</span>
                                    <span className="font-medium" style={{ color: 'var(--primary)' }}>
                                      {tier.type === 'percent' ? `${tier.value}%` : `${formatPrice(tier.value)}원`}
                                    </span>
                                    <span className="text-xs text-[var(--muted-foreground)] ml-1 hidden sm:inline">
                                      ({tier.type === 'percent' ? '비율' : '정액'})
                                    </span>
                                  </span>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => openEditTier(product.id, idx, tier)}
                                    className="p-1.5 rounded hover:bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                    title="수정"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTier(product.id, idx)}
                                    className="p-1.5 rounded hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {isEditingThis && (
                                <TierFormInline productId={product.id} tierIndex={idx} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isAdding && <TierFormInline productId={product.id} />}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminPage
// ---------------------------------------------------------------------------
export default function AdminPage({
  products,
  setProducts,
  customers,
  setCustomers,
  supabaseConnected,
  showToast,
  supabase,
  pushUndo,
}) {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [selectedCategory, setSelectedCategory] = useState('');

  if (!isAdminAuth) {
    return <AdminLogin onSuccess={() => setIsAdminAuth(true)} />;
  }

  const tabProps = { products, setProducts, customers, setCustomers, supabaseConnected, showToast, supabase, pushUndo };

  return (
    <div className="bg-[var(--background)]">
      {/* Page Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[var(--foreground)]">관리자 패널</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {supabaseConnected
                ? <span style={{ color: 'var(--success)' }}>Supabase 연결됨</span>
                : <span className="text-[var(--warning)]">오프라인 (로컬 데이터)</span>
              }
            </p>
          </div>
          <button
            onClick={() => setIsAdminAuth(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            로그아웃
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-4 sm:px-6">
        <div>
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide" role="tablist">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all focus:outline-none ${
                  activeTab === id
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="px-4 sm:px-6 py-6">
        {activeTab === 'products' && <ProductsTab {...tabProps} initialCategory={selectedCategory} />}
        {activeTab === 'customers' && <CustomersTab {...tabProps} />}
        {activeTab === 'price-adjust' && <PriceAdjustTab {...tabProps} />}
        {activeTab === 'ai-stock' && <AIStockTab {...tabProps} />}
        {activeTab === 'burnway' && <BurnwayTab {...tabProps} />}
        {activeTab === 'categories' && <CategoriesTab {...tabProps} onSelectCategory={(cat) => { setSelectedCategory(cat); setActiveTab('products'); }} />}
        {activeTab === 'discounts' && <DiscountTiersTab {...tabProps} />}
      </main>
    </div>
  );
}
