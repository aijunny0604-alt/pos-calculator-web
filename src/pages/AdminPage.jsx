import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, Trash2, Edit, Upload, Users, Package, Tag, Percent,
  Lock, ChevronDown, ChevronRight, X, Save, AlertTriangle, ShieldAlert, Fingerprint,
  UserPlus, Download, Copy, Car,
} from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/ui/StatusBadge';
import { formatPrice, matchesSearchQuery, handleSearchFocus } from '../lib/utils';
import { priceData } from '../lib/priceData';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = '4321';

const TABS = [
  { id: 'products',    label: '제품관리',    Icon: Package },
  { id: 'customers',   label: '거래처관리',  Icon: Users   },
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
        className={`px-4 py-3 text-base rounded-lg border ${
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
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 animate-modal-backdrop"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative bg-[var(--card)] rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col border border-[var(--border)] animate-modal-up`}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors">
            <X className="w-4 h-4" />
          </button>
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
function ProductsTab({ products, setProducts, supabaseConnected, showToast, supabase, initialCategory }) {
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
        setProducts(prev => prev.map(p => p.id === id ? saved : p));
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
      setEditTarget(null);
    } catch (err) {
      showToast('저장에 실패했습니다: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (supabaseConnected && supabase?.deleteProduct) {
        await supabase.deleteProduct(deleteTarget.id);
      }
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      showToast('제품이 삭제되었습니다', 'success');
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
        <div className="relative flex-1 min-w-[160px]">
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
          className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">전체 카테고리</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <ActionBtn variant="secondary" Icon={Download} onClick={exportProductsCSV}>
          엑셀 백업
        </ActionBtn>
        <ActionBtn variant="secondary" Icon={Upload} onClick={() => fileRef.current?.click()}>
          CSV 가져오기
        </ActionBtn>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
        <ActionBtn variant="primary" Icon={Plus} onClick={openNew}>
          제품 추가
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
                        <div className="max-w-[140px] sm:max-w-none truncate sm:whitespace-normal cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(product, 'name')}>
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
function CustomersTab({ customers, setCustomers, supabaseConnected, showToast, supabase }) {
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
        setCustomers(prev => prev.map(c => c.id === id ? saved : c));
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
    return customers.filter(c =>
      matchesSearchQuery(c.name, search) ||
      (c.phone && c.phone.includes(search))
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
      if (supabaseConnected && supabase?.saveCustomer) {
        const saved = await supabase.saveCustomer(isNew ? payload : { ...payload, id: editTarget.id });
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
    try {
      if (supabaseConnected && supabase?.deleteCustomer) {
        await supabase.deleteCustomer(deleteTarget.id);
      }
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
      showToast('거래처가 삭제되었습니다', 'success');
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
        <div className="relative flex-1 min-w-[160px]">
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
        <ActionBtn variant="secondary" Icon={Download} onClick={exportCustomersCSV}>
          엑셀 백업
        </ActionBtn>
        <ActionBtn variant="primary" Icon={UserPlus} onClick={openNew}>
          새 거래처 등록
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
                        <div className="max-w-[120px] sm:max-w-none truncate sm:whitespace-normal cursor-pointer hover:text-[var(--primary)]" onDoubleClick={() => startInlineEdit(customer, 'name')}>
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
                      {customer.blacklist
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
const BURNWAY_CAR_MODELS = [
  { id: 'veloster-n', label: '벨로스터N', keywords: ['벨로스터', '벨n', 'veloster'] },
  { id: 'avante-n', label: '아반떼N', keywords: ['아반떼', '아n', 'avante'] },
  { id: 'sg70-20', label: '스팅어 & G70 2.0', keywords: ['2.0'] },
  { id: 'sg70-25', label: '스팅어 & G70 2.5', keywords: ['2.5'] },
  { id: 'sg70-33', label: '스팅어 & G70 3.3', keywords: ['3.3'] },
];

function detectBurnwayCarModel(name) {
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

function BurnwayTab({ products, setProducts, supabaseConnected, showToast, supabase }) {
  const [expandedModel, setExpandedModel] = useState(null);
  const [editingStock, setEditingStock] = useState(null); // { id, value }
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', stock: '' });
  const [saving, setSaving] = useState(false);

  const burnwayProducts = useMemo(
    () => (products || []).filter((p) => p.category === '번웨이'),
    [products]
  );

  const grouped = useMemo(() => {
    const groups = {};
    BURNWAY_CAR_MODELS.forEach((m) => { groups[m.id] = []; });
    groups['unclassified'] = [];
    burnwayProducts.forEach((p) => {
      const modelId = detectBurnwayCarModel(p.name);
      if (modelId && groups[modelId]) groups[modelId].push(p);
      else groups['unclassified'].push(p);
    });
    return groups;
  }, [burnwayProducts]);

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
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
      showToast(`${product.name} 재고 → ${newStock}`, 'success');
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
        } else { showToast('등록 실패', 'error'); }
      } else {
        newProduct.id = Date.now();
        setProducts(prev => [...prev, newProduct]);
        showToast(`${newProduct.name} 등록 (로컬)`, 'success');
      }
      setAddForm({ name: '', stock: '' });
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
    } catch { showToast('삭제 실패', 'error'); }
  };

  const stockColor = (s) => s === 0 ? 'var(--destructive)' : s <= 2 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">번웨이 다운파이프</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {stats.total}개 제품 · <span style={{ color: 'var(--success)' }}>{stats.totalStock}세트</span>
            {stats.outOfStock > 0 && <span style={{ color: 'var(--destructive)' }}> · {stats.outOfStock} 품절</span>}
          </p>
        </div>
        <ActionBtn Icon={Plus} onClick={() => setShowAddModal(true)}>제품 추가</ActionBtn>
      </div>

      {/* Car model groups */}
      {BURNWAY_CAR_MODELS.map((model) => {
        const items = grouped[model.id] || [];
        const modelStock = items.reduce((sum, p) => sum + (p.stock ?? 0), 0);
        const hasOut = items.some(p => (p.stock ?? 0) === 0);
        const isExpanded = expandedModel === model.id;

        return (
          <SectionCard key={model.id}>
            <button
              onClick={() => setExpandedModel(isExpanded ? null : model.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--accent)] transition-colors rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: hasOut ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'color-mix(in srgb, var(--primary) 10%, transparent)' }}>
                  <Car className="w-4 h-4" style={{ color: hasOut ? 'var(--destructive)' : 'var(--primary)' }} />
                </div>
                <div className="text-left">
                  <span className="text-sm font-bold text-[var(--foreground)]">{model.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: stockColor(modelStock) }}>{modelStock}세트</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{items.length}개 제품</span>
                    {hasOut && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)' }}>품절</span>}
                  </div>
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-3">
                {items.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)] py-3 text-center">등록된 제품 없음</p>
                ) : (
                  <div className="space-y-1">
                    {items.map((p) => {
                      const stock = p.stock ?? 0;
                      const isEditing = editingStock?.id === p.id;
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--background)' }}>
                          <span className="flex-1 truncate text-[var(--foreground)]">{p.name}</span>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={editingStock.value}
                                onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleStockSave(p); if (e.key === 'Escape') setEditingStock(null); }}
                                onBlur={() => handleStockSave(p)}
                                autoFocus
                                className="w-16 px-2 py-1 text-xs text-center rounded border border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingStock({ id: p.id, value: String(stock) })}
                              className="px-2 py-1 rounded text-xs font-bold cursor-pointer hover:opacity-70 transition-opacity"
                              style={{ color: stockColor(stock), background: stock === 0 ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'transparent' }}
                              title="클릭하여 재고 수정"
                            >
                              {stock === 0 ? '품절' : `${stock}세트`}
                            </button>
                          )}
                          <button onClick={() => handleDelete(p)} className="p-1 rounded hover:bg-[var(--accent)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                            <Trash2 className="w-3.5 h-3.5" />
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
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--accent)] transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} />
              </div>
              <span className="text-sm font-bold text-[var(--foreground)]">미분류</span>
              <span className="text-xs text-[var(--muted-foreground)]">{grouped['unclassified'].length}개</span>
            </div>
            {expandedModel === 'unclassified' ? <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />}
          </button>
          {expandedModel === 'unclassified' && (
            <div className="px-4 pb-3 space-y-1">
              {grouped['unclassified'].map((p) => {
                const stock = p.stock ?? 0;
                const isEditing = editingStock?.id === p.id;
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--background)' }}>
                    <span className="flex-1 truncate text-[var(--foreground)]">{p.name}</span>
                    {isEditing ? (
                      <input type="number" min="0" value={editingStock.value}
                        onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleStockSave(p); if (e.key === 'Escape') setEditingStock(null); }}
                        onBlur={() => handleStockSave(p)} autoFocus
                        className="w-16 px-2 py-1 text-xs text-center rounded border border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                      />
                    ) : (
                      <button onClick={() => setEditingStock({ id: p.id, value: String(stock) })}
                        className="px-2 py-1 rounded text-xs font-bold cursor-pointer hover:opacity-70"
                        style={{ color: stockColor(stock) }} title="클릭하여 재고 수정">
                        {stock === 0 ? '품절' : `${stock}세트`}
                      </button>
                    )}
                    <button onClick={() => handleDelete(p)} className="p-1 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                      <Trash2 className="w-3.5 h-3.5" />
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
          <InputField label="제품명" required placeholder="예: 벨로스터N 전용 자바라 DCT" value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          <InputField label="초기 재고 (세트)" type="number" min="0" placeholder="0" value={addForm.stock}
            onChange={(e) => setAddForm({ ...addForm, stock: e.target.value })} />
          {addForm.name && (
            <p className="text-xs text-[var(--muted-foreground)]">
              자동 분류: <span className="font-medium text-[var(--foreground)]">
                {BURNWAY_CAR_MODELS.find(m => detectBurnwayCarModel(addForm.name)?.includes(m.id.split('-')[0]))?.label
                  || (() => { const id = detectBurnwayCarModel(addForm.name); return BURNWAY_CAR_MODELS.find(m => m.id === id)?.label; })()
                  || '미분류'}
              </span>
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
    <div className="mt-3 p-3 rounded-lg bg-[var(--muted)] border border-[var(--border)] flex flex-wrap gap-2 items-end">
      <InputField
        label="최소수량"
        type="number"
        value={tierForm.minQty}
        onChange={e => setTierForm(p => ({ ...p, minQty: e.target.value }))}
        placeholder="1"
        className="w-24"
      />
      <InputField
        label="최대수량"
        type="number"
        value={tierForm.maxQty}
        onChange={e => setTierForm(p => ({ ...p, maxQty: e.target.value }))}
        placeholder="없음"
        className="w-24"
      />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--foreground)]">할인타입</label>
        <select
          value={tierForm.type}
          onChange={e => setTierForm(p => ({ ...p, type: e.target.value }))}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
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
        className="w-28"
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
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--accent)] transition-colors select-none"
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                >
                  <span className="text-[var(--muted-foreground)]">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[var(--foreground)]">{product.name}</span>
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">{product.category}</span>
                  </div>
                  {tiers.length > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
                    >
                      {tiers.length}개 구간
                    </span>
                  )}
                  <span className="text-xs text-[var(--muted-foreground)]">도매 {formatPrice(product.wholesale)}원</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddTier(product.id); }}
                    className="ml-2 p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    title="할인구간 추가"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded Tiers */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--border)]">
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
                              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--muted)] border border-[var(--border)]">
                                <div className="flex-1 flex flex-wrap gap-4 text-sm">
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
                                    <span className="text-xs text-[var(--muted-foreground)] ml-1">
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
}) {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [selectedCategory, setSelectedCategory] = useState('');

  if (!isAdminAuth) {
    return <AdminLogin onSuccess={() => setIsAdminAuth(true)} />;
  }

  const tabProps = { products, setProducts, customers, setCustomers, supabaseConnected, showToast, supabase };

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
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all focus:outline-none ${
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
        {activeTab === 'burnway' && <BurnwayTab {...tabProps} />}
        {activeTab === 'categories' && <CategoriesTab {...tabProps} onSelectCategory={(cat) => { setSelectedCategory(cat); setActiveTab('products'); }} />}
        {activeTab === 'discounts' && <DiscountTiersTab {...tabProps} />}
      </main>
    </div>
  );
}
