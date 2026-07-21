import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  ArrowLeft, Menu, Building, Search, Phone, MapPin, ChevronDown, ChevronRight,
  Receipt, Copy, RotateCcw, X, Minus, Plus, Maximize2, Minimize2, FileText, Upload, Trash2
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import CustomerDetailModal from '@/components/CustomerDetailModal';
import PaymentRegisterModal from '@/components/PaymentRegisterModal';
import PaymentEditModal from '@/components/PaymentEditModal';
import BulkPaymentModal from '@/components/BulkPaymentModal';
import { formatPrice, formatDate, calcExVat, handleSearchFocus } from '@/lib/utils';
import SubPrice from '@/components/ui/SubPrice';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import { supabase } from '@/lib/supabase';
import { uploadCustomerCert, deleteImages } from '@/lib/imageUpload';
import { CircleDollarSign } from 'lucide-react';

const PaymentsContainer = lazy(() => import('@/pages/PaymentsContainer'));
const CertLibrary = lazy(() => import('@/pages/CertLibrary'));

export default function CustomerList({
  customers,
  orders = [],
  onBack,
  onAddCustomer,
  onSaveCustomerReturn,
  onRefreshOrders,
  onUpdateOrder,
  onGoToInvoices,
  showToast
}) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'payments' | 'certs'
  const [searchTerm, setSearchTerm] = useState('');
  // 카테고리 필터 (사용자 정책: 네이버=엠파츠 카테고리 분류)
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'none' | <category name>
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [certUploading, setCertUploading] = useState(false); // 사업자등록증 업로드 중
  const [certViewer, setCertViewer] = useState(null);         // 사업자등록증 이미지 확대 보기 URL
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => window.innerWidth < 768);
  const [detailOrder, setDetailOrder] = useState(null);
  const [blacklistFilter, setBlacklistFilter] = useState('all');
  const [outstandingFilter, setOutstandingFilter] = useState(false); // 미수 있는 업체만
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'outstanding'
  const [isReturning, setIsReturning] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', memo: '' });
  const { isFullscreen: isDetailFullscreen, toggleFullscreen: toggleDetailFullscreen } = useModalFullscreen();

  // ===== 업체별 미수 (pos-payments 통합) =====
  const [outstandingByCustomer, setOutstandingByCustomer] = useState({});
  const [paymentDetailCustomer, setPaymentDetailCustomer] = useState(null);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regPrefill, setRegPrefill] = useState({ customerId: null, recordId: null });
  const [editHistory, setEditHistory] = useState(null);
  const [bulkPay, setBulkPay] = useState(null);

  // ===== 선택 업체 주문별 결제 정보 =====
  const [paymentsByOrder, setPaymentsByOrder] = useState({}); // { orderId: { record, history[] } }
  const reloadCustomerPayments = (customerId) => {
    if (!customerId) { setPaymentsByOrder({}); return; }
    Promise.all([
      supabase.getPaymentRecords({ customerId }),
      supabase.getPaymentHistory({}),
    ]).then(([records, history]) => {
      const byOrderId = {};
      const recordIdToOrderId = {};
      for (const r of records || []) {
        if (!r.order_id) continue;
        byOrderId[String(r.order_id)] = { record: r, history: [] };
        recordIdToOrderId[String(r.id)] = String(r.order_id);
      }
      for (const h of history || []) {
        const orderId = recordIdToOrderId[String(h.payment_record_id)];
        if (orderId && byOrderId[orderId]) byOrderId[orderId].history.push(h);
      }
      setPaymentsByOrder(byOrderId);
    }).catch(() => setPaymentsByOrder({}));
  };
  useEffect(() => {
    reloadCustomerPayments(selectedCustomer?.id);
  }, [selectedCustomer?.id]);

  const reloadOutstanding = () => {
    supabase.getPaymentRecords({ hasBalance: true }).then((records) => {
      const map = {};
      for (const r of records || []) {
        if (!r.customer_id) continue;
        map[String(r.customer_id)] = (map[String(r.customer_id)] || 0) + Number(r.balance || 0);
      }
      setOutstandingByCustomer(map);
    }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    supabase.getPaymentRecords({ hasBalance: true }).then((records) => {
      if (cancelled) return;
      const map = {};
      for (const r of records || []) {
        if (!r.customer_id) continue;
        map[String(r.customer_id)] = (map[String(r.customer_id)] || 0) + Number(r.balance || 0);
      }
      setOutstandingByCustomer(map);
    }).catch(() => {/* 실패 시 미수 표시만 생략 */});
    return () => { cancelled = true; };
  }, []);

  const blacklistStats = {
    total: (customers || []).length,
    blacklist: (customers || []).filter(c => c.is_blacklist).length,
    normal: (customers || []).filter(c => !c.is_blacklist).length
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (detailOrder) {
          setDetailOrder(null);
        } else if (selectedCustomer) {
          setSelectedCustomer(null);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, selectedCustomer, detailOrder]);

  // -- Filters --

  // 등록된 카테고리 목록 (필터 dropdown 옵션)
  const categoryOptions = useMemo(() => {
    const set = new Set();
    (customers || []).forEach((c) => { if (c.category) set.add(c.category); });
    return Array.from(set).sort();
  }, [customers]);

  const filteredCustomers = (customers || []).filter(c => {
    if (blacklistFilter === 'blacklist' && !c.is_blacklist) return false;
    if (blacklistFilter === 'normal' && c.is_blacklist) return false;
    if (outstandingFilter && !(outstandingByCustomer[String(c.id)] > 0)) return false;
    // 카테고리 필터
    if (categoryFilter === 'none' && c.category) return false;
    if (categoryFilter !== 'all' && categoryFilter !== 'none' && c.category !== categoryFilter) return false;
    const search = searchTerm.toLowerCase().replace(/\s/g, '');
    const name = c.name.toLowerCase().replace(/\s/g, '');
    const address = (c.address || '').toLowerCase().replace(/\s/g, '');
    const phone = (c.phone || '').replace(/\s/g, '');
    return name.includes(search) || address.includes(search) || phone.includes(search);
  }).sort((a, b) => {
    if (sortBy === 'outstanding') {
      const ba = outstandingByCustomer[String(a.id)] || 0;
      const bb = outstandingByCustomer[String(b.id)] || 0;
      if (ba !== bb) return bb - ba; // 미수 많은 순
    }
    return (a.name || '').localeCompare(b.name || '', 'ko-KR');
  });

  // -- Order helpers --

  const getCustomerOrders = (customerName) => {
    return (orders || []).filter(order =>
      order.customerName &&
      order.customerName.toLowerCase().replace(/\s/g, '') === customerName.toLowerCase().replace(/\s/g, '')
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const getCustomerTotalAmount = (customerName) => {
    const customerOrders = getCustomerOrders(customerName);
    return customerOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  };

  // -- Return handling --

  const startReturn = () => {
    if (!detailOrder) return;
    setReturnItems((detailOrder.items || []).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      returnQty: 0
    })));
    setIsReturning(true);
  };

  const saveReturn = async () => {
    if (!detailOrder || !onSaveCustomerReturn) return;
    const returnedItems = returnItems.filter(item => item.returnQty > 0);
    if (returnedItems.length === 0) {
      alert('반품할 제품을 선택하세요.');
      return;
    }

    const returnId = `RET-${Date.now()}`;
    const returnData = returnedItems.map(item => ({
      order_number: detailOrder.orderNumber,
      return_id: returnId,
      item_id: item.id,
      item_name: item.name,
      quantity: item.returnQty,
      price: item.price,
      total: item.price * item.returnQty,
      returned_at: new Date().toISOString()
    }));

    for (const data of returnData) {
      await onSaveCustomerReturn(data);
    }

    const newReturns = [
      ...(detailOrder.returns || []),
      ...returnedItems.filter(ri => ri.returnQty > 0).map(item => ({
        returnId: returnId,
        itemId: item.id,
        itemName: item.name,
        quantity: item.returnQty,
        price: item.price,
        total: item.price * item.returnQty,
        returnedAt: new Date().toISOString()
      }))
    ];
    const totalReturned = newReturns.reduce((sum, r) => sum + (r.total || r.price * r.quantity), 0);

    const updatedOrder = {
      ...detailOrder,
      returns: newReturns,
      totalReturned: totalReturned,
      updatedAt: new Date().toISOString()
    };

    setDetailOrder(updatedOrder);

    if (onUpdateOrder) {
      await onUpdateOrder(detailOrder.id || detailOrder.orderNumber, {
        returns: newReturns,
        total_returned: totalReturned
      });
    }

    setIsReturning(false);
    setReturnItems([]);

    if (showToast) showToast(`반품 처리 완료 (${returnedItems.length}건)`);
  };

  // 보관함(CertLibrary)이 소유한 파일인지 — business-cert/library/… 는 보관함 원본이라 거래처 쪽에서 지우면 안 된다
  const isLibraryOwnedPath = (p) => /business-cert\/library\//.test(String(p || ''));

  // -- 사업자등록증 업로드/교체/삭제 (기존 있으면 최신으로 교체) --
  const handleCertUpload = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !selectedCustomer) return;
    setCertUploading(true);
    try {
      const oldPath = selectedCustomer.business_cert_path;
      const { url, path } = await uploadCustomerCert(file, selectedCustomer.id);
      const res = await supabase.setCustomerCert(selectedCustomer.id, url, path);
      if (!res.ok) {
        await deleteImages([path]).catch(() => {}); // 방금 올린 새 파일 정리
        if (res.needsMigration) {
          showToast?.('DB에 사업자등록증 컬럼이 아직 없어요. 안내드린 SQL을 Supabase에 실행 후 다시 시도해주세요.', 'error');
        } else {
          showToast?.(`저장 실패: ${res.error || ''}`, 'error');
        }
        return;
      }
      if (oldPath && oldPath !== path) {
        // 🚨 보관함(business-cert/library/…) 원본을 연결해둔 거래처는 파일·행을 지우면 안 된다.
        //    보관함에서 연결하면 customers.business_cert_path가 '보관함 파일'을 가리키므로,
        //    여기서 지우면 교체 한 번에 보관함 문서가 통째로 증발한다. 연결만 끊고 원본은 보존.
        if (isLibraryOwnedPath(oldPath)) {
          await supabase.clearCustomerCertLinks(selectedCustomer.id).catch(() => {});
        } else {
          await deleteImages([oldPath]).catch(() => {});                    // 거래처 전용 파일만 삭제(최신 교체)
          await supabase.deleteBusinessCertsByPath(oldPath).catch(() => {}); // 보관함의 옛 행도 정리(깨진 썸네일 방지)
        }
      }
      setSelectedCustomer((prev) => prev ? { ...prev, business_cert_url: url, business_cert_path: path } : prev);

      // 📄 보관함(business_certs)에도 자동 등록 — 거래처에서 올린 등록증이 보관함에서도 검색되게.
      // 실패해도 거래처 저장 자체는 성공이므로 흐름을 막지 않고 경고만.
      const lib = await supabase.addBusinessCert({
        name: selectedCustomer.name || '등록증',
        storagePath: path,
        url,
        customerId: selectedCustomer.id,
      });
      if (lib?.ok) {
        // 1거래처 = 1등록증 — 같은 거래처를 가리키던 다른 보관함 행은 연결 해제
        await supabase.clearCustomerCertLinks(selectedCustomer.id, lib.data?.id).catch(() => {});
        showToast?.('사업자등록증 저장 완료 · 보관함에도 등록됨', 'success');
      } else {
        showToast?.('사업자등록증 저장 완료 (보관함 등록은 실패)', 'warning');
      }
    } catch (err) {
      showToast?.(err?.message || '업로드 실패', 'error');
    } finally {
      setCertUploading(false);
    }
  };

  const handleCertDelete = async () => {
    if (!selectedCustomer?.business_cert_url) return;
    const oldPath = selectedCustomer.business_cert_path;
    const fromLibrary = isLibraryOwnedPath(oldPath);
    // 🚨 되돌릴 수 없는 파괴 작업이라 반드시 확인 (보관함 원본까지 지워질 수 있음)
    const msg = fromLibrary
      ? `"${selectedCustomer.name}" 거래처의 사업자등록증 연결을 해제할까요?\n\n보관함의 원본 문서는 그대로 남습니다.`
      : `"${selectedCustomer.name}" 사업자등록증을 삭제할까요?\n\n⚠️ 저장된 원본 파일과 보관함 항목까지 완전히 지워지며 되돌릴 수 없습니다.`;
    if (!window.confirm(msg)) return;

    const res = await supabase.setCustomerCert(selectedCustomer.id, null, null);
    if (!res.ok) { showToast?.('삭제 실패', 'error'); return; }
    if (oldPath && fromLibrary) {
      await supabase.clearCustomerCertLinks(selectedCustomer.id).catch(() => {}); // 연결만 해제
    } else if (oldPath) {
      await deleteImages([oldPath]).catch(() => {});
      await supabase.deleteBusinessCertsByPath(oldPath).catch(() => {}); // 보관함 행도 함께 정리
    }
    setSelectedCustomer((prev) => prev ? { ...prev, business_cert_url: null, business_cert_path: null } : prev);
    showToast?.(fromLibrary ? '연결 해제됨 (보관함 원본 유지)' : '사업자등록증 삭제됨', 'success');
  };

  // -- Copy helpers --

  const copyOrderText = (order) => {
    const lines = [
      formatDate(order.createdAt),
      ...(order.items || []).map(item => `${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
      `총 금액: ${formatPrice(order.totalAmount)}`,
      order.memo ? `메모: ${order.memo}` : ''
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
  };

  const copyAllOrders = () => {
    const customerOrders = getCustomerOrders(selectedCustomer.name);
    const totalAmount = customerOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const allText = [
      `[ ${selectedCustomer.name} 주문 이력 ]`,
      `총 ${customerOrders.length}건 / 총 금액: ${formatPrice(totalAmount)}`,
      '',
      ...customerOrders.map((order, idx) => [
        `━━━ ${idx + 1}. ${formatDate(order.createdAt)} ━━━`,
        ...(order.items || []).map(item => `  ${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
        `  → 소계: ${formatPrice(order.totalAmount)}`,
        order.memo ? `  메모: ${order.memo}` : ''
      ].filter(Boolean)).flat()
    ].join('\n');
    navigator.clipboard.writeText(allText);
  };

  return (
    <div className="h-full bg-[var(--background)] flex flex-col">
      {/* ═══ 상단 뷰 전환 탭 ═══ */}
      <div className="px-2 sm:px-4 pt-2 flex items-center gap-1 bg-[var(--card)] border-b border-[var(--border)]">
        <button
          onClick={() => setViewMode('list')}
          className="px-3 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: viewMode === 'list' ? 'var(--primary)' : 'var(--muted-foreground)',
            borderBottom: viewMode === 'list' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          <Building className="w-4 h-4" />업체 목록
        </button>
        <button
          onClick={() => setViewMode('payments')}
          className="px-3 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: viewMode === 'payments' ? 'var(--primary)' : 'var(--muted-foreground)',
            borderBottom: viewMode === 'payments' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          <CircleDollarSign className="w-4 h-4" />페이먼트
        </button>
        <button
          onClick={() => setViewMode('certs')}
          className="px-3 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: viewMode === 'certs' ? 'var(--primary)' : 'var(--muted-foreground)',
            borderBottom: viewMode === 'certs' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          <FileText className="w-4 h-4" />사업자등록증
        </button>
      </div>

      {/* 페이먼트 탭 */}
      {viewMode === 'payments' && (
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>페이먼트 로드 중...</div>}>
            <PaymentsContainer customers={customers} onGoToInvoices={onGoToInvoices} />
          </Suspense>
        </div>
      )}

      {/* 사업자등록증 보관함 탭 */}
      {viewMode === 'certs' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>보관함 로드 중...</div>}>
            <CertLibrary customers={customers} showToast={showToast} />
          </Suspense>
        </div>
      )}

      {/* 업체 목록 탭 (기존) */}
      {viewMode === 'list' && (
      <>
      {/* Header */}
      <header className="bg-[var(--card)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="w-full px-2 sm:px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mobile: menu button (only at list level) or back arrow (when customer selected) */}
              {selectedCustomer ? (
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                    className="md:hidden p-2 rounded-lg transition-colors hover:bg-[var(--accent)]"
                  >
                    <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                  <button
                    onClick={onBack}
                    className="hidden md:block p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                </>
              )}
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5" style={{ color: 'var(--success)' }} />
                <div>
                  <h1 className="text-lg font-bold">
                    {selectedCustomer ? selectedCustomer.name : '거래처 목록'}
                  </h1>
                  <p className="text-[var(--muted-foreground)] text-xs">
                    {selectedCustomer
                      ? `주문 ${getCustomerOrders(selectedCustomer.name).length}건 / 총 ${formatPrice(getCustomerTotalAmount(selectedCustomer.name))}`
                      : `전체 ${customers?.length || 0}개 · 검색 ${filteredCustomers.length}개`
                    }
                  </p>
                </div>
              </div>
            </div>
            {!selectedCustomer && (
              <div className="flex items-center gap-2">
                {onAddCustomer && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-white"
                    style={{ background: 'var(--success)' }}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">거래처 등록</span>
                  </button>
                )}
                <button
                  onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                  className="p-2 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg transition-colors"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isHeaderCollapsed ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* Collapsed summary */}
          {!selectedCustomer && isHeaderCollapsed && (
            <div className="mt-2 flex items-center justify-between text-xs bg-[var(--secondary)] rounded-lg px-3 py-2">
              <span className="text-[var(--muted-foreground)]">
                거래처 <span className="font-semibold text-[var(--foreground)]">{filteredCustomers.length}개</span>
              </span>
              {searchTerm && <span className="text-[var(--primary)]">검색: {searchTerm}</span>}
            </div>
          )}
        </div>

        {/* Expandable search / filter */}
        {!selectedCustomer && (
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isHeaderCollapsed ? 'max-h-0 opacity-0' : 'max-h-[400px] opacity-100'}`}>
            <div className="px-2 sm:px-4 pt-1 pb-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={handleSearchFocus}
                  placeholder="업체명, 주소, 전화번호로 검색..."
                  className="w-full pl-10 pr-4 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
                />
              </div>

              {/* 카테고리 필터 — 네이버=엠파츠 등 자동 태그된 거래처 그룹 */}
              {categoryOptions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--muted-foreground)]">카테고리:</span>
                  {['all', ...categoryOptions, 'none'].map((cat) => {
                    const label = cat === 'all' ? '전체' : cat === 'none' ? '미분류' : cat;
                    const count = cat === 'all'
                      ? (customers || []).length
                      : cat === 'none'
                        ? (customers || []).filter((c) => !c.category).length
                        : (customers || []).filter((c) => c.category === cat).length;
                    const active = categoryFilter === cat;
                    return (
                      <button key={cat} onClick={() => setCategoryFilter(cat)}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                        style={{
                          background: active ? 'var(--primary)' : 'var(--card)',
                          color: active ? 'white' : 'var(--foreground)',
                          borderColor: active ? 'var(--primary)' : 'var(--border)',
                          fontWeight: active ? 700 : 400,
                        }}>
                        {cat === '엠파츠' ? '🛒 ' : ''}{label} <span className="opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Stats badges */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--muted-foreground)]">현황:</span>
                <span className="px-2 py-1 bg-[var(--secondary)] border border-[var(--border)] rounded-lg">전체 {blacklistStats.total}</span>
                <span
                  className="px-2 py-1 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--success)'
                  }}
                >정상 {blacklistStats.normal}</span>
                <span
                  className="px-2 py-1 rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--destructive)'
                  }}
                >블랙리스트 {blacklistStats.blacklist}</span>
              </div>

              {/* Blacklist filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { key: 'all', label: '전체' },
                  { key: 'normal', label: '정상' },
                  { key: 'blacklist', label: '블랙리스트' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setBlacklistFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      blacklistFilter === key
                        ? key === 'all'
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-white'
                        : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                    }`}
                    style={
                      blacklistFilter === key && key === 'blacklist'
                        ? { background: 'var(--destructive)', color: 'white' }
                        : blacklistFilter === key && key === 'normal'
                          ? { background: 'var(--success)', color: 'white' }
                          : undefined
                    }
                  >
                    {label}
                  </button>
                ))}

                {/* 미수 필터 */}
                <button
                  onClick={() => setOutstandingFilter((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                    outstandingFilter
                      ? 'text-white'
                      : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                  }`}
                  style={outstandingFilter ? { background: 'var(--warning)', color: 'white', borderColor: 'var(--warning)' } : undefined}
                  title="이월 미수가 있는 업체만"
                >
                  💲 미수만
                </button>

                {/* 정렬 토글 */}
                <button
                  onClick={() => setSortBy((v) => v === 'name' ? 'outstanding' : 'name')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]"
                  title="정렬 기준 변경"
                >
                  정렬: {sortBy === 'outstanding' ? '미수 많은 순' : '이름순'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full px-2 sm:px-4 py-4">
          {selectedCustomer ? (
            /* Customer detail view */
            <>
              {/* Customer info card */}
              <div className="bg-[var(--card)] rounded-xl p-4 mb-4 border border-[var(--border)]">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 text-sm">
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--success)' }} />
                      <span className="min-w-0">{selectedCustomer.phone}</span>
                      <button onClick={() => { navigator.clipboard.writeText(selectedCustomer.phone); showToast?.('전화번호 복사됨', 'success'); }} className="p-1 rounded hover:bg-[var(--accent)] transition-colors flex-shrink-0" title="전화번호 복사">
                        <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                      <span className="text-[var(--muted-foreground)] break-keep leading-snug flex-1 min-w-0">{selectedCustomer.address}</span>
                      <button onClick={() => { navigator.clipboard.writeText(selectedCustomer.address); showToast?.('주소 복사됨', 'success'); }} className="p-1 rounded hover:bg-[var(--accent)] transition-colors flex-shrink-0" title="주소 복사">
                        <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                      </button>
                    </div>
                  )}
                  {(selectedCustomer.phone || selectedCustomer.address) && (
                    <button
                      onClick={() => {
                        const parts = [];
                          if (selectedCustomer.name) parts.push(`업체명 : ${selectedCustomer.name}`);
                          if (selectedCustomer.phone) parts.push(`연락처 : ${selectedCustomer.phone}`);
                          if (selectedCustomer.address) parts.push(`주소지 : ${selectedCustomer.address}`);
                          const info = parts.join('\n');
                        navigator.clipboard.writeText(info);
                        showToast?.('배송 정보 복사됨', 'success');
                      }}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors hover:bg-[var(--accent)] flex-shrink-0"
                      style={{ color: 'var(--primary)', border: '1px solid var(--border)' }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      배송 정보 복사
                    </button>
                  )}
                </div>
                {selectedCustomer.memo && (
                  <p className="text-[var(--muted-foreground)] text-sm mt-2 pt-2 border-t border-[var(--border)]">
                    메모: {selectedCustomer.memo}
                  </p>
                )}
                {selectedCustomer.is_blacklist && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)]">
                    <StatusBadge status="blacklist" />
                    {selectedCustomer.blacklist_reason && (
                      <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>사유: {selectedCustomer.blacklist_reason}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Order stats summary */}
              {getCustomerOrders(selectedCustomer.name).length > 0 && (() => {
                const customerOrders = getCustomerOrders(selectedCustomer.name);
                const totalAmount = customerOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
                const totalReturned = customerOrders.reduce((sum, o) => sum + (o.totalReturned || 0), 0);
                const netAmount = totalAmount - totalReturned;
                const supplyAmount = calcExVat(netAmount);
                const vatAmount = netAmount - supplyAmount;
                const returnCount = customerOrders.filter(o => o.returns && o.returns.length > 0).length;
                return (
                  <div
                    className="rounded-xl p-4 mb-4 border"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                      background: 'color-mix(in srgb, var(--success) 12%, transparent)'
                    }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)' }}>
                          <Receipt className="w-5 h-5" style={{ color: 'var(--success)' }} />
                        </div>
                        <div>
                          <p className="text-[var(--muted-foreground)] text-xs">총 주문 금액</p>
                          {totalReturned > 0 ? (
                            <>
                              <p className="text-[var(--muted-foreground)] text-sm line-through">{formatPrice(totalAmount)}</p>
                              <p className="font-bold text-lg sm:text-xl" style={{ color: 'var(--success)' }}>{formatPrice(netAmount)}</p>
                            </>
                          ) : (
                            <p className="font-bold text-lg sm:text-xl" style={{ color: 'var(--success)' }}>{formatPrice(totalAmount)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">공급가액</p>
                          <p className="font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(supplyAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">부가세</p>
                          <p className="font-bold" style={{ color: 'var(--purple)' }}>{formatPrice(vatAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[var(--muted-foreground)] text-xs">주문 건수</p>
                          <p className="font-bold">{customerOrders.length}건</p>
                        </div>
                        {totalReturned > 0 && (
                          <div className="text-right">
                            <p className="text-xs" style={{ color: 'var(--warning)' }}>반품 ({returnCount}건)</p>
                            <p className="font-bold" style={{ color: 'var(--warning)' }}>-{formatPrice(totalReturned)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 사업자등록증 */}
              {(() => {
                const certUrl = selectedCustomer.business_cert_url;
                const isPdf = /\.pdf($|\?)/i.test(selectedCustomer.business_cert_path || certUrl || '');
                return (
                  <div className="mb-4 rounded-xl border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-base font-bold flex items-center gap-1.5">
                        <FileText className="w-5 h-5" style={{ color: 'var(--primary)' }} /> 사업자등록증
                      </p>
                      {certUrl && (
                        <button onClick={handleCertDelete} className="text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1 transition-colors hover:bg-[var(--accent)]" style={{ color: 'var(--destructive)' }}>
                          <Trash2 className="w-3.5 h-3.5" /> 삭제
                        </button>
                      )}
                    </div>
                    {certUrl ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        {isPdf ? (
                          <a href={certUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] transition-colors font-medium text-sm">
                            <FileText className="w-5 h-5" style={{ color: 'var(--destructive)' }} /> 📄 PDF 열람
                          </a>
                        ) : (
                          <img src={certUrl} alt="사업자등록증" onClick={() => setCertViewer(certUrl)}
                            className="w-28 h-28 object-cover rounded-lg border border-[var(--border)] cursor-zoom-in hover:brightness-105 transition" />
                        )}
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] cursor-pointer text-sm font-medium transition-colors self-start" style={certUploading ? { opacity: 0.5 } : undefined}>
                          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleCertUpload} disabled={certUploading} />
                          <Upload className="w-4 h-4" /> {certUploading ? '업로드 중…' : '교체'}
                        </label>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-sm font-bold transition-all hover:brightness-95 active:scale-[0.98]" style={{ background: certUploading ? 'var(--muted)' : 'var(--primary)', color: certUploading ? 'var(--muted-foreground)' : 'white' }}>
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleCertUpload} disabled={certUploading} />
                        <Upload className="w-4 h-4" /> {certUploading ? '업로드 중…' : '사업자등록증 올리기'}
                      </label>
                    )}
                    <p className="text-xs mt-2.5" style={{ color: 'var(--muted-foreground)' }}>이미지(사진) 또는 PDF · 새로 올리면 기존 것은 최신 버전으로 교체됩니다</p>
                  </div>
                );
              })()}

              {/* Order history header */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-[var(--foreground)] text-base sm:text-lg font-bold">주문 이력</p>
                {getCustomerOrders(selectedCustomer.name).length > 0 && (
                  <button
                    onClick={copyAllOrders}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: 'color-mix(in srgb, var(--success) 12%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: 'var(--success)'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--success) 20%, transparent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--success) 12%, transparent)'; }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    전체 복사
                  </button>
                )}
              </div>

              {/* Order list */}
              {getCustomerOrders(selectedCustomer.name).length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="주문 이력이 없습니다"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                  {getCustomerOrders(selectedCustomer.name).map(order => {
                    const net = (order.totalAmount || 0) - (order.totalReturned || 0);
                    const items = order.items || [];
                    return (
                    <div
                      key={order.orderNumber}
                      onClick={() => setDetailOrder(order)}
                      className="card-interactive bg-[var(--card)] rounded-xl border cursor-pointer relative overflow-hidden"
                      style={
                        order.totalReturned > 0
                          ? { borderColor: 'color-mix(in srgb, var(--warning) 45%, var(--border))' }
                          : { borderColor: 'var(--border)' }
                      }
                    >
                      {/* 좌측 액센트 바 */}
                      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: order.totalReturned > 0 ? 'var(--warning)' : 'linear-gradient(180deg, #22c55e, #3b82f6)' }} />

                      <div className="pl-4 pr-3 py-3">
                        {/* 상단: 날짜 ←→ 금액 */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="text-base sm:text-lg font-bold whitespace-nowrap">{formatDate(order.createdAt)}</span>
                            {order.totalReturned > 0 && (
                              <span className="px-1.5 py-0.5 text-[11px] rounded-md font-bold" style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' }}>반품</span>
                            )}
                            {order.memo && (
                              <span className="px-1.5 py-0.5 text-[11px] rounded-md font-bold" style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }} title={order.memo}>📝</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {order.totalReturned > 0 && (
                              <p className="text-[var(--muted-foreground)] text-xs line-through leading-none mb-0.5">{formatPrice(order.totalAmount)}</p>
                            )}
                            <p className="font-black text-xl sm:text-2xl tabular-nums leading-none" style={{ color: 'var(--success)' }}>{formatPrice(net)}<span className="text-sm font-bold ml-0.5">원</span></p>
                            <div className="mt-1"><SubPrice total={net} layout="supply-only" size="xs" /></div>
                          </div>
                        </div>

                        {/* 품목: 최대 3줄 (한 줄씩 콤팩트) */}
                        <div className="bg-[var(--secondary)] rounded-lg px-2.5 py-2 mb-2.5 space-y-1">
                          {items.slice(0, 3).map((item, idx) => {
                            const lineTotal = (item.price ?? item.wholesale ?? item.retail ?? 0) * item.quantity;
                            const isDiscounted = !!item.discountType && Number(item.discountValue) > 0;
                            return (
                              <div key={idx} className="flex justify-between gap-2 text-sm">
                                <span className="flex-1 min-w-0 truncate font-medium">
                                  {item.name} <span className="text-[var(--muted-foreground)]">×{item.quantity}</span>
                                  {isDiscounted && <span className="ml-1 text-[10px] font-bold" style={{ color: 'var(--warning)' }}>🏷</span>}
                                </span>
                                <span className="flex-shrink-0 tabular-nums font-semibold">{formatPrice(lineTotal)}</span>
                              </div>
                            );
                          })}
                          {items.length > 3 && (
                            <p className="text-xs text-[var(--muted-foreground)] font-medium">외 {items.length - 3}개 상품</p>
                          )}
                          {order.returns && order.returns.length > 0 && (
                            <p className="text-xs font-bold pt-1" style={{ color: 'var(--warning)' }}>↩ 반품 {order.returns.length}건 · -{formatPrice(order.totalReturned)}</p>
                          )}
                          {order.memo && (
                            <p className="text-xs truncate pt-1 border-t border-[var(--border)] mt-1" style={{ color: 'var(--primary)' }} title={order.memo}>📝 {order.memo}</p>
                          )}
                        </div>

                        {/* 하단: 결제상태 + 복사 */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex-1 min-w-0">
                            <OrderPaymentInline
                              payment={paymentsByOrder[String(order.id)]}
                              onRegister={(e) => {
                                e.stopPropagation();
                                const pay = paymentsByOrder[String(order.id)];
                                setRegPrefill({ customerId: selectedCustomer.id, recordId: pay?.record?.id || null });
                                setRegModalOpen(true);
                              }}
                            />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyOrderText(order); }}
                            className="flex-shrink-0 px-2.5 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-sm font-medium flex items-center gap-1 self-start"
                            title="주문 내용 복사"
                          >
                            <Copy className="w-4 h-4" /> 복사
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Customer list */
            <>
              {filteredCustomers.length === 0 ? (
                <EmptyState
                  icon={Building}
                  title="등록된 거래처가 없습니다"
                  description="관리자 페이지에서 거래처를 추가하세요"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCustomers.map(customer => {
                    const orderCount = getCustomerOrders(customer.name).length;
                    const totalAmount = getCustomerTotalAmount(customer.name);
                    const isBlacklist = customer.is_blacklist;

                    return (
                      <div
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="card-interactive rounded-xl p-4 border cursor-pointer relative overflow-hidden"
                        style={
                          isBlacklist
                            ? {
                                background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
                                borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                                borderLeftWidth: '4px',
                                borderLeftColor: 'var(--destructive)'
                              }
                            : {
                                background: 'var(--card)',
                                borderColor: 'var(--border)',
                                borderLeftWidth: '4px',
                                borderLeftColor: 'transparent'
                              }
                        }
                        onMouseEnter={(e) => {
                          if (isBlacklist) {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--destructive) 70%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'var(--destructive)';
                          } else {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--success) 70%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'color-mix(in srgb, var(--success) 70%, var(--border))';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isBlacklist) {
                            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--destructive) 40%, var(--border))';
                            e.currentTarget.style.borderLeftColor = 'var(--destructive)';
                          } else {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.borderLeftColor = 'transparent';
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          {/* 사업자등록증 연동된 업체는 목록에서 바로 썸네일로 구분 — 클릭하면 크게 (2026-07-15) */}
                          {customer.business_cert_url && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setCertViewer(customer.business_cert_url); }}
                              className="mr-3 w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 relative group/cert"
                              style={{ borderColor: 'var(--primary)', background: 'white' }}
                              title={`${customer.name} 사업자등록증 — 클릭하면 크게 보기`}
                            >
                              <img src={customer.business_cert_url} alt="사업자등록증" className="w-full h-full object-cover" loading="lazy" />
                              <span className="absolute inset-0 bg-black/0 group-hover/cert:bg-black/35 transition-colors flex items-center justify-center">
                                <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover/cert:opacity-100 transition-opacity" />
                              </span>
                            </button>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {isBlacklist && <span className="flex-shrink-0" style={{ color: 'var(--destructive)' }}>🚫</span>}
                              <h3 className="font-semibold truncate" style={isBlacklist ? { color: 'var(--destructive)' } : undefined}>
                                {customer.name}
                              </h3>
                              {isBlacklist && (
                                <StatusBadge status="blacklist" className="flex-shrink-0" />
                              )}
                              {orderCount > 0 && (
                                <span
                                  className="px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0"
                                  style={{
                                    background: 'color-mix(in srgb, var(--success) 20%, transparent)',
                                    color: 'var(--success)'
                                  }}
                                >
                                  {orderCount}건
                                </span>
                              )}
                            </div>

                            {isBlacklist && customer.blacklist_reason && (
                              <p className="text-xs mb-1 break-words leading-snug" style={{ color: 'var(--destructive)' }}>{customer.blacklist_reason}</p>
                            )}

                            <div className="flex items-center gap-1.5 mt-1">
                              <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                              <span className={`text-sm ${customer.phone ? '' : 'text-[var(--muted-foreground)]'}`}>
                                {customer.phone || '전화번호 미등록'}
                              </span>
                            </div>

                            <div className="flex items-start gap-1.5 mt-1 min-w-0">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                              <span className="text-sm text-[var(--muted-foreground)] break-keep leading-snug flex-1 min-w-0">
                                {customer.address || '주소 미등록'}
                              </span>
                            </div>

                            {totalAmount > 0 && (
                              <p className="text-xs mt-2 font-medium" style={{ color: 'var(--primary)' }}>
                                총 거래: {formatPrice(totalAmount)}
                              </p>
                            )}
                            {outstandingByCustomer[String(customer.id)] > 0 && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
                                  이월 미수: {formatPrice(outstandingByCustomer[String(customer.id)])}원
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPaymentDetailCustomer(customer); }}
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border"
                                  style={{
                                    background: 'color-mix(in srgb, var(--warning) 10%, var(--card))',
                                    borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                                    color: 'var(--warning)',
                                  }}
                                  title="결제 상세 보기"
                                >
                                  <CircleDollarSign className="w-3 h-3" /> 결제 상세
                                </button>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Order detail modal */}
      {/* 사업자등록증 이미지 확대 보기 */}
      {certViewer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={() => setCertViewer(null)}>
          <button onClick={() => setCertViewer(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 transition-colors" title="닫기">
            <X className="w-6 h-6 text-white" />
          </button>
          <img src={certViewer} alt="사업자등록증" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {detailOrder && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 animate-modal-backdrop modal-backdrop-fs-transition"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isDetailFullscreen ? '0' : '1rem' }}
          onClick={() => { if (!isReturning) { setDetailOrder(null); setIsReturning(false); setReturnItems([]); } }}
        >
          <div
            className="bg-[var(--card)] w-full h-full border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col animate-modal-up modal-fs-transition"
            style={{ maxWidth: isDetailFullscreen ? '100vw' : '52rem', maxHeight: isDetailFullscreen ? '100vh' : '92vh', borderRadius: isDetailFullscreen ? '0' : '0.75rem', boxShadow: isDetailFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="px-5 py-4 flex-shrink-0"
              style={{ background: detailOrder.totalReturned > 0 ? 'var(--warning)' : 'var(--success)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/20 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-bold text-white">주문 상세</h2>
                      {detailOrder.totalReturned > 0 && (
                        <span className="px-2 py-0.5 bg-white/20 rounded-full text-sm text-white font-medium flex items-center gap-1">
                          <RotateCcw className="w-3.5 h-3.5" /> 반품
                        </span>
                      )}
                    </div>
                    <p className="text-base" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {formatDate(detailOrder.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={toggleDetailFullscreen}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    title={isDetailFullscreen ? '원래 크기' : '전체화면'}
                  >
                    {isDetailFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
                  </button>
                  <button
                    onClick={() => { setDetailOrder(null); setIsReturning(false); setReturnItems([]); }}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    title="닫기"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal content */}
            <div className="p-5 overflow-y-auto flex-1">
              {/* Amount summary */}
              <div className="bg-[var(--secondary)] rounded-xl p-5 mb-5">
                <div className={`grid gap-4 text-center ${detailOrder.totalReturned > 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <div>
                    <p className="text-[var(--muted-foreground)] text-sm mb-1.5">총 금액</p>
                    <p className="font-black text-2xl sm:text-3xl tabular-nums" style={{ color: 'var(--success)' }}>{formatPrice(detailOrder.totalAmount)}</p>
                  </div>
                  {detailOrder.totalReturned > 0 ? (
                    <div>
                      <p className="text-[var(--muted-foreground)] text-sm mb-1.5">반품 금액</p>
                      <p className="font-black text-2xl sm:text-3xl tabular-nums" style={{ color: 'var(--warning)' }}>-{formatPrice(detailOrder.totalReturned)}</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-[var(--muted-foreground)] text-sm mb-1.5">공급가액</p>
                        <p className="font-bold text-xl sm:text-2xl tabular-nums" style={{ color: 'var(--primary)' }}>{formatPrice(calcExVat(detailOrder.totalAmount))}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted-foreground)] text-sm mb-1.5">부가세</p>
                        <p className="font-bold text-xl sm:text-2xl tabular-nums" style={{ color: 'var(--purple)' }}>{formatPrice(detailOrder.totalAmount - calcExVat(detailOrder.totalAmount))}</p>
                      </div>
                    </>
                  )}
                </div>
                {detailOrder.totalReturned > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--muted-foreground)] text-base font-medium">실결제액</span>
                      <span className="text-[var(--primary)] font-black text-2xl sm:text-3xl tabular-nums">{formatPrice(detailOrder.totalAmount - detailOrder.totalReturned)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="mb-5">
                <p className="text-[var(--muted-foreground)] text-sm mb-2.5 font-semibold">상품 목록 ({(detailOrder.items || []).length}종)</p>
                <div className="bg-[var(--background)] rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                  {(detailOrder.items || []).map((item, idx) => {
                    const returnedQty = (detailOrder.returns || []).reduce((sum, ret) => {
                      if (ret.itemId === item.id || ret.itemName === item.name) {
                        return sum + (ret.quantity || 0);
                      }
                      return sum;
                    }, 0);
                    return (
                      <div
                        key={idx}
                        className="flex justify-between items-center gap-3 p-3.5"
                        style={returnedQty > 0 ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)' } : undefined}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold break-words leading-snug">{item.name}</p>
                            {returnedQty > 0 && (
                              <span
                                className="px-2 py-0.5 text-xs rounded font-bold flex-shrink-0"
                                style={{
                                  background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                                  color: 'var(--warning)'
                                }}
                              >
                                반품 {returnedQty}개
                              </span>
                            )}
                          </div>
                          <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                            수량: {item.quantity}개 × {formatPrice(item.price ?? item.wholesale ?? item.retail ?? 0)}원
                            <span className="ml-1 text-xs opacity-75">(공급 {formatPrice(calcExVat(item.price ?? item.wholesale ?? item.retail ?? 0))}원)</span>
                            {(item.price == null || Number(item.price) === 0) && (
                              <span className="ml-1 text-xs text-red-500 font-bold">⚠️ 단가 누락</span>
                            )}
                          </p>
                        </div>
                        <p
                          className={`font-bold text-lg sm:text-xl text-right tabular-nums flex-shrink-0 ${returnedQty > 0 ? 'line-through' : ''}`}
                          style={{ color: returnedQty > 0 ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {formatPrice((Number(item.price) || Number(item.wholesale) || Number(item.retail) || 0) * item.quantity)}
                          <span className="block text-xs font-normal leading-tight" style={{ color: 'var(--muted-foreground)' }}>공급 {formatPrice(calcExVat((Number(item.price) || Number(item.wholesale) || Number(item.retail) || 0) * item.quantity))}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return history */}
              {detailOrder.returns && detailOrder.returns.length > 0 && (() => {
                const groupedReturns = (detailOrder.returns || []).reduce((acc, ret) => {
                  const key = ret.returnId || 'unknown';
                  if (!acc[key]) {
                    acc[key] = { returnId: key, returnedAt: ret.returnedAt, items: [], totalAmount: 0 };
                  }
                  acc[key].items.push(ret);
                  acc[key].totalAmount += ret.total || (ret.price * ret.quantity);
                  return acc;
                }, {});
                const returnGroups = Object.values(groupedReturns);

                return (
                  <div className="mb-4">
                    <p className="text-xs mb-2 font-medium flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                      <RotateCcw className="w-3 h-3" /> 반품 내역 ({returnGroups.length}건)
                    </p>
                    <div
                      className="rounded-lg divide-y"
                      style={{
                        background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        '--tw-divide-color': 'color-mix(in srgb, var(--warning) 20%, transparent)'
                      }}
                    >
                      {returnGroups.map((group, idx) => (
                        <div key={idx} className="p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs" style={{ color: 'var(--warning)' }}>{formatDate(group.returnedAt)}</span>
                            <span className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>-{formatPrice(group.totalAmount)}</span>
                          </div>
                          <div className="space-y-1">
                            {group.items.map((item, itemIdx) => (
                              <div key={itemIdx} className="flex justify-between items-center text-xs">
                                <span className="text-[var(--muted-foreground)]">{item.itemName || item.name} x{item.quantity || item.returnQuantity}</span>
                                <span style={{ color: 'var(--warning)' }}>-{formatPrice(item.total || (item.price * (item.quantity || item.returnQuantity)))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Memo */}
              {detailOrder.memo && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--primary) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <p className="text-sm font-bold mb-1.5" style={{ color: 'var(--primary)' }}>메모</p>
                  <p className="text-base leading-relaxed break-words">{detailOrder.memo}</p>
                </div>
              )}
            </div>

            {/* Return form */}
            {isReturning && (
              <div className="px-4 pb-3">
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))',
                    borderWidth: '1px',
                    borderStyle: 'solid'
                  }}
                >
                  <p className="text-xs font-bold mb-3 flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                    <RotateCcw className="w-3.5 h-3.5" /> 반품 수량 선택
                  </p>
                  <div className="space-y-2">
                    {returnItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-words leading-snug">{item.name}</p>
                          <p className="text-[var(--muted-foreground)] text-xs">{formatPrice(item.price)} × 주문 {item.quantity}개</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, returnQty: Math.max(0, ri.returnQty - 1) } : ri))}
                            className="w-7 h-7 border border-[var(--border)] hover:bg-[var(--accent)] rounded flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold" style={{ color: item.returnQty > 0 ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            {item.returnQty}
                          </span>
                          <button
                            onClick={() => setReturnItems(prev => prev.map((ri, i) => i === idx ? { ...ri, returnQty: Math.min(ri.quantity, ri.returnQty + 1) } : ri))}
                            className="w-7 h-7 border border-[var(--border)] hover:bg-[var(--accent)] rounded flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {returnItems.some(ri => ri.returnQty > 0) && (
                    <div className="mt-3 pt-3 text-right" style={{ borderTop: '1px solid color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
                      <span className="font-bold text-sm" style={{ color: 'var(--warning)' }}>
                        반품 금액: -{formatPrice(returnItems.reduce((sum, ri) => sum + ri.price * ri.returnQty, 0))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal footer buttons */}
            <div className="p-4 border-t border-[var(--border)] flex-shrink-0">
              {isReturning ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsReturning(false); setReturnItems([]); }}
                    className="flex-1 py-2.5 border border-[var(--border)] hover:bg-[var(--accent)] rounded-lg font-medium transition-colors text-sm"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveReturn}
                    className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--warning)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    반품 확정
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const lines = [
                        `[${selectedCustomer?.name || '업체명'}]`,
                        formatDate(detailOrder.createdAt),
                        '',
                        ...(detailOrder.items || []).map(item => `${item.name} x${item.quantity}  ${formatPrice(item.price * item.quantity)}`),
                        '',
                        `총 금액: ${formatPrice(detailOrder.totalAmount)}`,
                      ];
                      if (detailOrder.totalReturned > 0) {
                        lines.push(`반품: -${formatPrice(detailOrder.totalReturned)}`);
                        lines.push(`실결제액: ${formatPrice(detailOrder.totalAmount - detailOrder.totalReturned)}`);
                      } else {
                        lines.push(`공급가액: ${formatPrice(calcExVat(detailOrder.totalAmount))}`);
                      }
                      if (detailOrder.memo) lines.push(`메모: ${detailOrder.memo}`);
                      navigator.clipboard.writeText(lines.join('\n'));
                      if (showToast) showToast('복사되었습니다');
                    }}
                    className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                    style={{ background: 'var(--success)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <Copy className="w-4 h-4" />
                    주문 복사
                  </button>
                  {onSaveCustomerReturn && (
                    <button
                      onClick={startReturn}
                      className="flex-1 py-2.5 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
                      style={{ background: 'var(--warning)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                    >
                      <RotateCcw className="w-4 h-4" />
                      반품 처리
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 거래처 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-modal-up" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>거래처 등록</h2>
              <button onClick={() => { setShowAddModal(false); setNewCustomer({ name: '', phone: '', address: '', memo: '' }); }} className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>업체명 <span style={{ color: 'var(--destructive)' }}>*</span></label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="업체명 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>연락처</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="연락처 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>주소</label>
                <input
                  type="text"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  placeholder="주소 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--foreground)' }}>메모</label>
                <input
                  type="text"
                  value={newCustomer.memo}
                  onChange={(e) => setNewCustomer({ ...newCustomer, memo: e.target.value })}
                  placeholder="메모 입력"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={async () => {
                  if (!newCustomer.name.trim()) { showToast?.('업체명을 입력하세요', 'error'); return; }
                  const result = await onAddCustomer(newCustomer);
                  if (result) {
                    setShowAddModal(false);
                    setNewCustomer({ name: '', phone: '', address: '', memo: '' });
                  }
                }}
                disabled={!newCustomer.name.trim()}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--success)' }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Phase 4: 결제 상세 모달 (CustomerDetailModal + 결제 등록/수정) */}
      <CustomerDetailModal
        open={!!paymentDetailCustomer}
        customer={paymentDetailCustomer}
        onClose={() => setPaymentDetailCustomer(null)}
        onAddPayment={(cid, rid) => {
          setPaymentDetailCustomer(null);
          setRegPrefill({ customerId: cid, recordId: rid });
          setRegModalOpen(true);
        }}
        onEditHistory={(h) => {
          setPaymentDetailCustomer(null);
          setEditHistory(h);
        }}
        onBulkPay={(cust, records) => {
          setPaymentDetailCustomer(null);
          setBulkPay({ customer: cust, records });
        }}
        onViewInvoice={(cid) => {
          setPaymentDetailCustomer(null);
          onGoToInvoices?.(cid);
        }}
      />

      <BulkPaymentModal
        open={!!bulkPay}
        customer={bulkPay?.customer}
        records={bulkPay?.records}
        onClose={() => setBulkPay(null)}
        onSaved={() => { setBulkPay(null); reloadOutstanding(); }}
      />

      <PaymentRegisterModal
        open={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        onSaved={() => {
          setRegModalOpen(false);
          reloadOutstanding();
          reloadCustomerPayments(selectedCustomer?.id);
        }}
        initialCustomerId={regPrefill.customerId}
        initialRecordId={regPrefill.recordId}
      />

      <PaymentEditModal
        open={!!editHistory}
        history={editHistory}
        onClose={() => setEditHistory(null)}
        onSaved={() => {
          setEditHistory(null);
          reloadOutstanding();
          reloadCustomerPayments(selectedCustomer?.id);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 주문 카드 내부 결제 섹션 (상태 + 잔금 + 최근 입금 + 버튼)
// ─────────────────────────────────────────────
function OrderPaymentInline({ payment, onRegister }) {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  const STATUS = {
    paid:    { label: '완납', bg: '#dcfce7', fg: '#15803d' },
    partial: { label: '부분', bg: '#ffedd5', fg: '#c2410c' },
    unpaid:  { label: '미수', bg: '#fee2e2', fg: '#b91c1c' },
  };

  if (!payment) {
    // 결제 레코드 없음 — 입금 등록 유도 (가벼운 미등록 배지)
    return (
      <div className="mb-2 p-2 rounded-lg flex items-center justify-between gap-2"
           style={{ background: 'var(--muted)', border: '1px dashed var(--border)' }}>
        <span className="text-[10px] text-[var(--muted-foreground)]">결제 레코드 미생성</span>
        <button
          onClick={onRegister}
          className="text-[10px] font-bold px-2 py-1 rounded-md bg-[var(--primary)] text-white hover:brightness-110"
        >
          💵 입금 등록
        </button>
      </div>
    );
  }

  const { record, history } = payment;
  const s = STATUS[record.payment_status] || STATUS.unpaid;
  const balance = Number(record.balance || 0);
  const paidAmount = Number(record.paid_amount || 0);
  const recent = (history || [])[0];

  return (
    <div
      className="mb-2 p-2 rounded-lg"
      style={{ background: `${s.bg}50`, border: `1px solid ${s.bg}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: s.bg, color: s.fg }}
        >
          {s.label}
        </span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: s.fg }}>
          잔금 {fmt(balance)}원
        </span>
      </div>

      {paidAmount > 0 && (
        <div className="text-[10px] text-gray-600 flex justify-between">
          <span>입금 {history.length}건</span>
          {recent && (
            <span className="tabular-nums">
              최근 {(recent.paid_at || '').slice(5, 10)}: {fmt(recent.amount)}원
            </span>
          )}
        </div>
      )}

      <button
        onClick={onRegister}
        className="mt-1.5 w-full py-1 rounded-md text-[10px] font-bold transition-colors"
        style={{
          background: balance > 0 ? 'var(--primary)' : 'var(--secondary)',
          color: balance > 0 ? 'white' : 'var(--foreground)',
        }}
      >
        💵 {balance > 0 ? '입금 등록' : '추가 입금'}
      </button>
    </div>
  );
}
