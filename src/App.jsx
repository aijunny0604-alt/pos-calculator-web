import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Toast from '@/components/ui/Toast';

import Dashboard from '@/pages/Dashboard';
import MainPOS from '@/pages/MainPOS';
import OrderHistory from '@/pages/OrderHistory';
import MemosPage from '@/pages/MemosPage';
import OrderDetail from '@/pages/OrderDetail';
import SavedCarts from '@/pages/SavedCarts';
import CustomerList from '@/pages/CustomerList';
import ShippingLabel from '@/pages/ShippingLabel';
import StockOverview from '@/pages/StockOverview';
import BurnwayStock from '@/pages/BurnwayStock';
import TextAnalyze from '@/pages/TextAnalyze';
import AdminPage from '@/pages/AdminPage';
import SaveCartModal from '@/pages/SaveCartModal';
import QuickCalculator from '@/pages/QuickCalculator';
import NotificationSettings from '@/pages/NotificationSettings';
import CommandBar from '@/components/CommandBar';
import StoreOrderAlerts from '@/components/StoreOrderAlerts';
import ReservationAlertBar from '@/components/ReservationAlertBar';

import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
// 결제 관련 페이지는 lazy load (exceljs + html-to-image 포함된 무거운 chunk)
const PaymentsContainer = lazy(() => import('@/pages/PaymentsContainer'));
const InvoicesContainer = lazy(() => import('@/pages/InvoicesContainer'));
const AIAnalytics = lazy(() => import('@/pages/AIAnalytics'));
const SmartStoreOrders = lazy(() => import('@/pages/SmartStoreOrders'));
const PurchaseOrders = lazy(() => import('@/pages/PurchaseOrders'));
const SupplierPrices = lazy(() => import('@/pages/SupplierPrices'));
const SupplierLedger = lazy(() => import('@/pages/SupplierLedger'));

import { supabase } from '@/lib/supabase';
import { priceData } from '@/lib/priceData';
import { formatPrice, getTodayKST, toDateKST } from '@/lib/utils';
import { isOrderPending } from '@/lib/orderStatus';

// 자체 레이아웃(h-full 루트)을 쓰는 페이지 — AppLayout.jsx의 fullScreenPages와 동일하게 유지.
// 이 페이지들만 flex-1 래퍼로 감싸 알림바 위 겹침을 방지한다 (2026-07-24).
const FULLSCREEN_PAGES = new Set(['pos', 'orders', 'customers', 'saved-carts', 'stock', 'shipping', 'burnway-stock', 'ai-order', 'ai-analytics', 'smartstore']);

export default function App() {
  // ─── Navigation ───────────────────────────────────────────────
  // 현재 페이지를 세션에 보존 → lazy 청크 404로 ChunkErrorBoundary가 자동 새로고침해도
  // 대시보드로 튕기지 않고 보던 페이지(스토어/MOVIS 등)로 복귀. (2026-06-11 fix)
  const [currentPage, setCurrentPageRaw] = useState(() => {
    try { return sessionStorage.getItem('pos_current_page') || 'dashboard'; } catch { return 'dashboard'; }
  });
  const setCurrentPage = useCallback((page) => {
    setCurrentPageRaw((prev) => {
      const next = typeof page === 'function' ? page(prev) : page;
      try { sessionStorage.setItem('pos_current_page', next); } catch { /* noop */ }
      return next;
    });
  }, []);
  const [aiOrderText, setAiOrderText] = useState('');
  // 명세서 페이지로 점프 시 자동 선택할 업체 ID (페이먼트/업체관리 → 명세서 cross-navigation)
  const [invoicesInitialCustomerId, setInvoicesInitialCustomerId] = useState(null);
  const goToInvoices = useCallback((customerId = null) => {
    setInvoicesInitialCustomerId(customerId);
    setCurrentPage('invoices');
  }, []);

  // ─── Core data ────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [savedCarts, setSavedCarts] = useState([]);
  const [aiLearningData, setAiLearningData] = useState([]);
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // ─── API 호출 쓰로틀링 (egress 최적화) ─────────────────────
  const lastFetchRef = useRef(0);
  const FETCH_THROTTLE_MS = 30000; // 30초

  // ─── POS state ────────────────────────────────────────────────
  const [cart, setCart] = useState([]);

  // ─── Global Undo System ──────────────────────────────────────
  // Each undo entry: { type, undo: async () => void, label: string, toast?: boolean }
  const undoStackRef = useRef([]);
  const MAX_UNDO = 20;
  // 보이는 실행취소 스낵바 (데스크탑 Ctrl+Z + 태블릿/폰 터치 공용) { id, label }
  const [undoHint, setUndoHint] = useState(null);
  const undoHintTimerRef = useRef(null);
  const undoSeqRef = useRef(0);

  const pushUndo = useCallback((entry) => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
      entry,
    ];
    // 스낵바는 삭제류 작업에만 노출 (제품 추가/수정·재고·단가 등 비삭제 작업은 Ctrl+Z만 가능, 노이즈 방지).
    // toast:true면 강제 노출, toast:false면 강제 숨김.
    const showHint = entry?.toast === true
      || (entry?.toast !== false && /delete/i.test(String(entry?.type || '')));
    if (showHint) {
      const id = ++undoSeqRef.current;
      setUndoHint({ id, label: entry?.label || '작업' });
      if (undoHintTimerRef.current) clearTimeout(undoHintTimerRef.current);
      undoHintTimerRef.current = setTimeout(() => {
        setUndoHint((cur) => (cur && cur.id === id ? null : cur));
      }, 10000);
    }
  }, []);

  // Cart wrapper that auto-pushes undo (스낵바는 띄우지 않음 — Ctrl+Z만 가능)
  const setCartWithHistory = useCallback((newCartOrUpdater) => {
    setCart((prev) => {
      const next = typeof newCartOrUpdater === 'function'
        ? newCartOrUpdater(prev)
        : newCartOrUpdater;
      const snapshot = prev;
      pushUndo({
        type: 'cart',
        label: '장바구니 변경',
        toast: false,
        undo: () => setCart(snapshot),
      });
      return next;
    });
  }, [pushUndo]);

  const [priceType, setPriceType] = useState('wholesale');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [loadedCustomer, setLoadedCustomer] = useState(null);

  // ─── Modal / overlay state ────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);
  const [saveCartCustomerOverride, setSaveCartCustomerOverride] = useState(null);
  const [showQuickCalc, setShowQuickCalc] = useState(false);
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStep, setSavingStep] = useState('');

  // ─── Toast ────────────────────────────────────────────────────
  const [toast, setToast] = useState({ message: '', type: 'info' });

  // ─── Notification settings (persisted to localStorage) ────────
  const [notificationSettings, setNotificationSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('notificationSettings');
      return saved
        ? JSON.parse(saved)
        : { enabled: false, schedule: [], defaultMessage: '', daysBeforeReminder: [] };
    } catch {
      return { enabled: false, schedule: [], defaultMessage: '', daysBeforeReminder: [] };
    }
  });

  // ─── Helpers ──────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  // 실행취소 실행 (Ctrl+Z 키 + 스낵바 버튼 공용)
  const performUndo = useCallback(async () => {
    if (undoHintTimerRef.current) clearTimeout(undoHintTimerRef.current);
    setUndoHint(null);
    if (undoStackRef.current.length === 0) {
      showToast('되돌릴 작업이 없습니다', 'info');
      return;
    }
    const entry = undoStackRef.current.pop();
    try {
      await entry.undo();
      showToast(`복원됨: ${entry.label}`, 'success');
    } catch (err) {
      console.error('Undo failed:', err);
      showToast('복원에 실패했습니다', 'error');
    }
  }, [showToast]);

  // ─── Persist notification settings ───────────────────────────
  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // ─── Ctrl+K Command Bar + Ctrl+Z Global Undo ────────────────
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandBar(prev => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
          return;
        }
        e.preventDefault();
        await performUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performUndo]);

  // ─── Format order: snake_case → camelCase (이전 버전과 동일) ──
  const formatOrder = useCallback((o) => ({
    ...o,
    orderNumber: o.id,
    createdAt: o.created_at,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    customerAddress: o.customer_address || '',
    priceType: o.price_type,
    totalAmount: o.total || o.total_amount || 0,
    totalReturned: o.total_returned || 0,
    returns: o.returns || [],
    memoChecked: o.memo_checked || false,
    items: o.items || [],
  }), []);

  // ─── Initial data load ────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [fetchedOrders, fetchedProducts, fetchedCustomers, fetchedCarts, fetchedLearning] =
          await Promise.all([
            supabase.getOrders(),
            supabase.getProducts(),
            supabase.getCustomers(),
            supabase.getSavedCarts(),
            supabase.getAiLearning(),
          ]);

        setSupabaseConnected(true);

        if (fetchedOrders) setOrders(fetchedOrders.map(formatOrder));
        if (fetchedProducts && fetchedProducts.length > 0) {
          setProducts(fetchedProducts);
        } else {
          setProducts(priceData);
        }
        if (fetchedCustomers) setCustomers(fetchedCustomers);
        if (fetchedCarts) setSavedCarts(fetchedCarts);
        if (fetchedLearning) setAiLearningData(fetchedLearning);
      } catch (err) {
        console.error('Data load failed, using local fallback:', err);
        setSupabaseConnected(false);
        setProducts(priceData);
      }
    }

    loadData();
  }, []);

  // ─── 스마트스토어 메뉴 배지 ────────────────────────────────────
  // 처리 대기(배송 전 미처리) 주문 건수, 날짜 무관.
  // 갱신 경로 3개: 마운트 / 60초 폴링 / 탭 복귀.
  // 탭 복귀가 핵심 — 크롬이 백그라운드 탭 타이머를 얼려서 폴링만 믿으면
  // 안 보는 사이 들어온 주문이 배지에 안 잡힌다 (2026-07-22 사고).
  const [smartstoreCount, setSmartstoreCount] = useState(0);
  const refreshSmartstoreCount = useCallback(async () => {
    try {
      // 배지 카운트는 isOrderPending 판정만 하므로 필요한 컬럼만 (raw_payload 제외 → 폴링 가볍게)
      const list = await supabase.getExternalOrders({ limit: 200, select: 'id,order_status,internal_order_id,naver_dispatch_succeeded_at' });
      // 결제완료/발주확인 등 아직 처리 안 한 주문 (배송중/종결 제외). 옛 미처리 주문도 포함.
      setSmartstoreCount((list || []).filter((o) => isOrderPending(o)).length);
    } catch (e) {
      // 조용히 삼키면 배지가 0인 게 "주문 없음"인지 "조회 실패"인지 구분이 안 된다
      console.warn('스마트스토어 배지 갱신 실패:', e);
    }
  }, []);

  useEffect(() => {
    refreshSmartstoreCount();
    const interval = setInterval(refreshSmartstoreCount, 60000);
    return () => clearInterval(interval);
  }, [refreshSmartstoreCount]);

  // ─── Supabase real-time WebSocket ─────────────────────────────
  useEffect(() => {
    if (!supabaseConnected) return;

    // Derive WSS URL from Supabase REST URL
    const supabaseUrl = 'https://jubzppndcclhnvgbvrxr.supabase.co';
    const supabaseKey = 'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU';
    const wsUrl =
      supabaseUrl.replace('https://', 'wss://') +
      '/realtime/v1/websocket?apikey=' +
      supabaseKey +
      '&vsn=1.0.0';

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ['orders', 'products', 'customers', 'saved_carts', 'ai_learning'].forEach((table) => {
        ws.send(
          JSON.stringify({
            topic: `realtime:public:${table}`,
            event: 'phx_join',
            payload: { config: { broadcast: { self: false } } },
            ref: table,
          })
        );
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const evt = msg.event;
        if (!['INSERT', 'UPDATE', 'DELETE'].includes(evt)) return;
        const table = msg.topic?.split(':')[2];
        const record = msg.payload?.record;
        const oldRecord = msg.payload?.old_record;

        if (table === 'orders') {
          if (evt === 'INSERT' && record) {
            setOrders((prev) => [formatOrder(record), ...prev]);
          } else if (evt === 'UPDATE' && record) {
            setOrders((prev) => prev.map((o) => o.id === record.id ? formatOrder(record) : o));
          } else if (evt === 'DELETE' && oldRecord) {
            setOrders((prev) => prev.filter((o) => o.id !== oldRecord.id));
          }
        } else if (table === 'products') {
          if (evt === 'INSERT' && record) {
            setProducts((prev) => [...prev, record]);
          } else if (evt === 'UPDATE' && record) {
            setProducts((prev) => prev.map((p) => p.id === record.id ? record : p));
          } else if (evt === 'DELETE' && oldRecord) {
            setProducts((prev) => prev.filter((p) => p.id !== oldRecord.id));
          }
        } else if (table === 'customers') {
          if (evt === 'INSERT' && record) {
            setCustomers((prev) => [...prev, record]);
          } else if (evt === 'UPDATE' && record) {
            setCustomers((prev) => prev.map((c) => c.id === record.id ? record : c));
          } else if (evt === 'DELETE' && oldRecord) {
            setCustomers((prev) => prev.filter((c) => c.id !== oldRecord.id));
          }
        } else if (table === 'saved_carts') {
          if (evt === 'INSERT' && record) {
            setSavedCarts((prev) => [record, ...prev]);
          } else if (evt === 'UPDATE' && record) {
            setSavedCarts((prev) => prev.map((c) => c.id === record.id ? record : c));
          } else if (evt === 'DELETE' && oldRecord) {
            setSavedCarts((prev) => prev.filter((c) => c.id !== oldRecord.id));
          }
        } else if (table === 'ai_learning') {
          if (evt === 'INSERT' && record) {
            setAiLearningData((prev) => [...prev, record]);
          } else if (evt === 'UPDATE' && record) {
            setAiLearningData((prev) => prev.map((l) => l.id === record.id ? record : l));
          } else if (evt === 'DELETE' && oldRecord) {
            setAiLearningData((prev) => prev.filter((l) => l.id !== oldRecord.id));
          }
        }
      } catch (err) {
        console.warn('WebSocket message parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('Supabase WebSocket error:', err);
    };

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: 'hb',
          })
        );
      }
    }, 30000);

    // 폴링 백업 (WebSocket 연결 실패 대비, 5분마다)
    const pollInterval = setInterval(() => {
      supabase.getOrders().then((d) => d && setOrders(d.map(formatOrder)));
      supabase.getSavedCarts().then((d) => d && setSavedCarts(d));
    }, 300000);

    // 탭 포커스 복귀 시 갱신 (30초 쓰로틀링 적용)
    const handleVisibility = () => {
      if (!document.hidden) {
        // 배지는 쓰로틀 밖에서 먼저 — 얼어 있던 탭이 깨어난 직후가 제일 낡은 시점이다
        refreshSmartstoreCount();
        const now = Date.now();
        if (now - lastFetchRef.current < FETCH_THROTTLE_MS) return;
        lastFetchRef.current = now;
        supabase.getOrders().then((d) => d && setOrders(d.map(formatOrder)));
        supabase.getProducts().then((d) => d && d.length > 0 && setProducts(d));
        supabase.getCustomers().then((d) => d && setCustomers(d));
        supabase.getSavedCarts().then((d) => d && setSavedCarts(d));
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeat);
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      ws.close();
    };
  }, [supabaseConnected, refreshSmartstoreCount]);

  // ─── Derived: badge counts ──────────────────────────────────
  const todayOrderCount = useMemo(() => {
    const today = getTodayKST();
    return orders.filter((o) => {
      if (!o.createdAt) return false;
      return toDateKST(o.createdAt) === today;
    }).length;
  }, [orders]);

  const savedCartCount = useMemo(() => savedCarts.length, [savedCarts]);

  const shippingCount = useMemo(() => {
    const today = getTodayKST();
    return orders.filter((o) => {
      if (!o.createdAt) return false;
      return toDateKST(o.createdAt) === today;
    }).length;
  }, [orders]);

  // ─── Derived: product categories ──────────────────────────────
  const productCategories = useMemo(
    () => ['전체', ...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );

  // ─── Refresh helpers ──────────────────────────────────────────
  const refreshOrders = useCallback(async () => {
    const data = await supabase.getOrders();
    if (data) setOrders(data.map(formatOrder));
  }, [formatOrder]);

  const refreshCustomers = useCallback(async () => {
    const data = await supabase.getCustomers();
    if (data) setCustomers(data);
  }, []);

  const refreshSavedCarts = useCallback(async () => {
    const data = await supabase.getSavedCarts();
    if (data) setSavedCarts(data);
  }, []);

  // ─── 재고 차감 (병렬 처리) ───────────────────
  const deductStock = useCallback(async (items) => {
    const updates = items.map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product || product.stock === undefined || product.stock === null) return null;
      const newStock = Math.max(0, product.stock - (item.quantity || 1));
      return { productId: product.id, newStock };
    }).filter(Boolean);

    if (updates.length === 0) return;

    // 로컬 state 즉시 반영 (UI 빠른 업데이트)
    setProducts(prev => prev.map(p => {
      const u = updates.find(x => x.productId === p.id);
      return u ? { ...p, stock: u.newStock } : p;
    }));

    // API 호출은 병렬로 (백그라운드)
    await Promise.all(
      updates.map(u => supabase.updateProduct(u.productId, { stock: u.newStock }))
    );
  }, [products]);

  // ─── Restore stock (주문 삭제/취소 시 재고 복원) ──────────────
  const restoreStock = useCallback(async (items) => {
    if (!items || items.length === 0) return;
    // 동일 제품 수량 합산 (다건 삭제 시 같은 제품이 여러 주문에 포함될 수 있음)
    const merged = items.reduce((acc, item) => {
      const id = item.id;
      acc[id] = (acc[id] || 0) + (item.quantity || 1);
      return acc;
    }, {});
    const updates = Object.entries(merged).map(([id, qty]) => {
      const product = products.find(p => p.id === Number(id));
      if (!product || product.stock == null) return null;
      return { productId: product.id, newStock: product.stock + qty };
    }).filter(Boolean);

    if (updates.length === 0) return;

    setProducts(prev => prev.map(p => {
      const u = updates.find(x => x.productId === p.id);
      return u ? { ...p, stock: u.newStock } : p;
    }));

    await Promise.all(
      updates.map(u => supabase.updateProduct(u.productId, { stock: u.newStock }))
    );
  }, [products]);

  // ─── Save order (with same-day merge logic) ───────────────────
  const saveOrder = useCallback(
    async (orderData) => {
      setIsSaving(true);
      setSavingStep('주문 정보 확인 중...');
      try {
        const customer_name = orderData.customer_name || orderData.customerName || '일반고객';
        const items = orderData.items || [];
        const price_type = orderData.price_type || orderData.priceType || 'wholesale';
        const totalVal = orderData.total_amount || orderData.totalAmount || 0;

        // 🛡️ 가격 검증 — price가 undefined/null/0인 item이 있으면 저장 차단
        const invalidItems = items.filter((it) => !Number.isFinite(Number(it.price)) || Number(it.price) <= 0);
        if (invalidItems.length > 0) {
          const names = invalidItems.map((it) => it.name || `#${it.id}`).join(', ');
          const ok = confirm(`⚠️ 다음 품목의 가격이 0원 또는 비어있습니다:\n\n${names}\n\n이대로 저장하면 명세서에 0원으로 표시됩니다. 그래도 진행할까요?\n\n[취소] 눌러 가격 먼저 확인하시길 권장합니다.`);
          if (!ok) { setIsSaving(false); setSavingStep(''); return null; }
        }

        // Auto-register unknown customers (skip 일반고객)
        const existingCustomer = customer_name && customer_name !== '일반고객'
          ? customers.find((c) => c.name?.toLowerCase() === customer_name?.toLowerCase())
          : null;
        if (customer_name && customer_name !== '일반고객' && !existingCustomer) {
          setSavingStep('신규 거래처 등록 중...');
          const customerData = { name: customer_name };
          if (orderData.customer_phone) customerData.phone = orderData.customer_phone;
          if (orderData.customer_address) customerData.address = orderData.customer_address;
          // 사용자 정책: 외부 마켓 주문(엠파츠/네이버 등) 신규 거래처는 category 태그
          if (orderData.customer_category) customerData.category = orderData.customer_category;
          const newCustomer = await supabase.addCustomer(customerData);
          if (newCustomer) {
            setCustomers((prev) => [...prev, newCustomer]);
          }
        } else if (existingCustomer && orderData.customer_category && !existingCustomer.category) {
          // 기존 거래처가 채널 주문(엠파츠 등)으로 첫 매칭 → category 태그 업데이트
          // (Codex 버그 fix: 기존 거래처 매칭 시 카테고리 누락되어 필터에서 보이지 않던 문제)
          const updated = await supabase.updateCustomer(existingCustomer.id, { category: orderData.customer_category });
          if (updated) {
            setCustomers((prev) => prev.map((c) => c.id === existingCustomer.id ? { ...c, category: orderData.customer_category } : c));
          }
        }

        const today = getTodayKST();

        // Check for same-customer same-day order to merge (skip for 일반고객)
        if (customer_name && customer_name !== '일반고객') {
          const existingOrder = orders.find((o) => {
            const orderDate = o.createdAt ? toDateKST(o.createdAt) : '';
            return (
              o.customerName?.toLowerCase() === customer_name?.toLowerCase() &&
              orderDate === today
            );
          });

          if (existingOrder) {
            setSavingStep('기존 주문에 합산 중...');
            // Merge items: match by id + price + 할인메타. 할인 조건이 다르면 별도 라인 유지 [bug-hunt 5]
            const mergedItems = [...(existingOrder.items || [])];
            for (const newItem of items) {
              const idx = mergedItems.findIndex(
                (i) => i.id === newItem.id
                  && i.price === newItem.price
                  && (i.discountType ?? null) === (newItem.discountType ?? null)
                  && (i.discountValue ?? null) === (newItem.discountValue ?? null)
              );
              if (idx >= 0) {
                mergedItems[idx] = {
                  ...mergedItems[idx],
                  quantity: mergedItems[idx].quantity + newItem.quantity,
                };
              } else {
                mergedItems.push(newItem);
              }
            }
            // price 없는 항목은 wholesale/retail 폴백 (병합 후 0/과소계산 방지) [bug-hunt 4]
            const mergedTotal = mergedItems.reduce(
              (sum, i) => sum + Number(i.price ?? i.wholesale ?? i.retail ?? 0) * (i.quantity || 1),
              0
            );
            const mergeData = {
              items: mergedItems,
              total: mergedTotal,
              subtotal: Math.round(mergedTotal / 1.1),
              vat: mergedTotal - Math.round(mergedTotal / 1.1),
            };
            // 네이버 전환 등 추적정보 보존 — 기존에 없으면 채움(기존값 덮어쓰기 X) [bug-hunt 3]
            // memo: 송장 발송인=엠파츠·착불/선불·네이버 식별이 memo 마커에 의존하므로 병합 시 유실 방지
            const incomingMemo = (orderData.memo || '').trim();
            if (incomingMemo && !(existingOrder.memo || '').includes(incomingMemo)) {
              mergeData.memo = existingOrder.memo ? `${existingOrder.memo}\n${incomingMemo}` : incomingMemo;
            }
            const incomingPhone = orderData.customer_phone || orderData.customerPhone || '';
            const incomingAddr = orderData.customer_address || orderData.customerAddress || '';
            if (!existingOrder.customerPhone && incomingPhone) mergeData.customer_phone = incomingPhone;
            if (!existingOrder.customerAddress && incomingAddr) mergeData.customer_address = incomingAddr;
            const updated = await supabase.updateOrder(existingOrder.id, mergeData);
            if (updated) {
              // 로컬 state 직접 업데이트 (refreshOrders 제거)
              setOrders(prev => prev.map(o =>
                o.id === existingOrder.id
                  ? { ...o, ...mergeData, items: mergedItems, totalAmount: mergedTotal }
                  : o
              ));
              // 재고 차감 (병렬) + 장바구니 초기화 동시
              setSavingStep('재고 반영 중...');
              await deductStock(items);
              setCartWithHistory([]);
              showToast('기존 주문에 합산되었습니다', 'success');
              return { ...updated, merged: true };
            }
          }
        }

        // New order
        setSavingStep('주문 저장 중...');
        const orderId = orderData.orderNumber || orderData.id || `ORD-${getTodayKST().replace(/-/g,'')}-${String(Math.floor(Math.random()*10000)).padStart(4,'0')}`;
        const orderPayload = {
          id: orderId,
          customer_name,
          customer_phone: orderData.customer_phone || orderData.customerPhone || '',
          customer_address: orderData.customer_address || orderData.customerAddress || '',
          price_type: price_type || 'wholesale',
          items,
          total: totalVal,
          subtotal: Math.round(totalVal / 1.1),
          vat: totalVal - Math.round(totalVal / 1.1),
          memo: orderData.memo || null,
        };
        const created = await supabase.saveOrder(orderPayload);

        if (created) {
          // 로컬 state 직접 업데이트 (refreshOrders 제거)
          const newOrder = Array.isArray(created) ? created[0] : created;
          if (newOrder) {
            setOrders(prev => [formatOrder(newOrder), ...prev]);
          }
          // 재고 차감 (병렬)
          setSavingStep('재고 반영 중...');
          await deductStock(items);
          setCartWithHistory([]);
          showToast('주문이 저장되었습니다', 'success');
        } else {
          showToast('주문 저장에 실패했습니다', 'error');
        }
        return created;
      } finally {
        setIsSaving(false);
        setSavingStep('');
      }
    },
    [customers, orders, formatOrder, showToast, deductStock]
  );

  // ─── Order handlers ───────────────────────────────────────────
  const handleDeleteOrder = useCallback(
    async (id) => {
      // Snapshot before delete for undo
      const deletedOrder = orders.find((o) => o.id === id);
      const ok = await supabase.deleteOrder(id);
      if (ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        // 재고 복원
        if (deletedOrder?.items) await restoreStock(deletedOrder.items);
        showToast('주문이 삭제되었습니다 (재고 복원됨)', 'success');
        if (deletedOrder) {
          pushUndo({
            type: 'order-delete',
            label: `주문 삭제 (${deletedOrder.customerName || '주문'})`,
            undo: async () => {
              const restored = await supabase.saveOrder({
                id: deletedOrder.id,
                customer_name: deletedOrder.customerName,
                customer_phone: deletedOrder.customerPhone || '',
                customer_address: deletedOrder.customerAddress || '',
                price_type: deletedOrder.priceType || 'wholesale',
                items: deletedOrder.items || [],
                total: deletedOrder.totalAmount || 0,
                subtotal: Math.round((deletedOrder.totalAmount || 0) / 1.1),
                vat: (deletedOrder.totalAmount || 0) - Math.round((deletedOrder.totalAmount || 0) / 1.1),
                memo: deletedOrder.memo || null,
                // 원래 주문 날짜 보존 (누락 시 DB default=NOW로 오늘 날짜가 됨)
                ...(deletedOrder.received_at ? { received_at: deletedOrder.received_at } : {}),
              });
              if (restored) await refreshOrders();
            },
          });
        }
      } else {
        showToast('삭제에 실패했습니다', 'error');
      }
    },
    [orders, showToast, pushUndo, refreshOrders, restoreStock]
  );

  const handleDeleteMultipleOrders = useCallback(
    async (ids) => {
      const deletedOrders = orders.filter((o) => ids.includes(o.id));
      let successOrders = []; // 실제 삭제 성공분 (undo 복원 대상 — 부분실패 시 안 지워진 건 제외)
      try {
        const results = await Promise.allSettled(ids.map((id) => supabase.deleteOrder(id)));
        const successIds = ids.filter((_, i) => results[i].status === 'fulfilled' && results[i].value);
        const failCount = ids.length - successIds.length;
        setOrders((prev) => prev.filter((o) => !successIds.includes(o.id)));
        // 성공 건만 재고 복원
        successOrders = deletedOrders.filter(o => successIds.includes(o.id));
        const allItems = successOrders.flatMap(o => o.items || []);
        if (allItems.length > 0) await restoreStock(allItems);
        if (failCount > 0) {
          showToast(`${successIds.length}건 삭제 (${failCount}건 실패, 재고 복원됨)`, 'warning');
        } else {
          showToast(`${ids.length}건 삭제되었습니다 (재고 복원됨)`, 'success');
        }
      } catch (err) {
        showToast('삭제 중 오류: ' + err.message, 'error');
        return;
      }
      if (successOrders.length > 0) {
        pushUndo({
          type: 'orders-delete-multiple',
          label: `주문 ${successOrders.length}건 삭제`,
          undo: async () => {
            await Promise.all(successOrders.map((o) =>
              supabase.saveOrder({
                id: o.id,
                customer_name: o.customerName,
                customer_phone: o.customerPhone || '',
                customer_address: o.customerAddress || '',
                price_type: o.priceType || 'wholesale',
                items: o.items || [],
                total: o.totalAmount || 0,
                subtotal: Math.round((o.totalAmount || 0) / 1.1),
                vat: (o.totalAmount || 0) - Math.round((o.totalAmount || 0) / 1.1),
                memo: o.memo || null,
                // 원래 주문 날짜 보존 (누락 시 DB default=NOW로 오늘 날짜가 됨)
                ...(o.received_at ? { received_at: o.received_at } : {}),
              })
            ));
            await refreshOrders();
          },
        });
      }
    },
    [orders, showToast, pushUndo, refreshOrders, restoreStock]
  );

  // opts.syncCustomer — 거래처 테이블까지 같이 고칠지.
  //   true  = 고친다 / false = 이 주문만 (일회성 배송지 등)
  //   생략  = 기존 자동 동기화 (주문상세 외 호출부 동작 유지)
  const handleUpdateOrder = useCallback(
    async (id, data, opts = {}) => {
      const result = await supabase.updateOrder(id, data);
      if (result) {
        // customerName을 setOrders 외부에서 미리 추출
        const existingOrder = orders.find(o => o.id === id);
        const customerName = existingOrder?.customerName || data.customer_name;
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== id) return o;
            const merged = { ...o, ...data };
            if (data.total != null) merged.totalAmount = data.total;
            if (data.customer_name != null) merged.customerName = data.customer_name;
            if (data.customer_phone != null) merged.customerPhone = data.customer_phone;
            if (data.customer_address != null) merged.customerAddress = data.customer_address;
            if (data.total_returned != null) merged.totalReturned = data.total_returned;
            if (data.returns != null) merged.returns = data.returns;
            if (data.memo_checked != null) merged.memoChecked = data.memo_checked;
            return merged;
          })
        );

        // 거래처 테이블 동기화 (전화번호/주소 변경 시).
        // 주문상세에서는 모달로 동의를 받고 opts.syncCustomer를 넘긴다 —
        // 일회성 배송지를 거래처 기본 주소로 덮어쓰는 사고를 막기 위함 (2026-07-22).
        const wantSync = opts.syncCustomer !== false;
        if (wantSync && customerName && (data.customer_phone != null || data.customer_address != null)) {
          const customer = customers.find(c => c.name?.toLowerCase() === customerName?.toLowerCase());
          if (customer) {
            const customerUpdate = {};
            if (data.customer_phone != null) customerUpdate.phone = data.customer_phone;
            if (data.customer_address != null) customerUpdate.address = data.customer_address;
            const saved = await supabase.updateCustomer(customer.id, customerUpdate);
            if (saved) {
              setCustomers(prev => prev.map(c =>
                c.id === customer.id ? { ...c, ...customerUpdate } : c
              ));
              if (opts.syncCustomer === true) showToast(`거래처 「${customer.name}」 정보도 변경했습니다`, 'success');
            } else if (opts.syncCustomer === true) {
              // 조용히 실패하면 "바꿨는데 왜 그대로지"가 된다
              showToast('거래처 정보 변경에 실패했습니다', 'error');
            }
          }
        }
      }
      return result;
    },
    [orders, customers, showToast]
  );

  // ─── Cart save modal helpers ──────────────────────────────────
  const handleSaveCart = useCallback(
    async (cartData) => {
      const result = await supabase.addSavedCart(cartData);
      if (result) {
        await refreshSavedCarts();
        showToast('장바구니가 저장되었습니다', 'success');
      } else {
        showToast('저장에 실패했습니다', 'error');
      }
      return result;
    },
    [refreshSavedCarts, showToast]
  );

  const handleUpdateSavedCart = useCallback(
    async (id, data) => {
      const result = await supabase.updateSavedCart(id, data);
      if (result) {
        await refreshSavedCarts();
      }
      return result;
    },
    [refreshSavedCarts]
  );

  const handleDeleteSavedCart = useCallback(
    async (id) => {
      if (!id && id !== 0) {
        showToast('삭제 실패: ID가 없습니다', 'error');
        return;
      }
      try {
        const deletedCart = savedCarts.find((c) => String(c.id) === String(id));
        const ok = await supabase.deleteSavedCart(id);
        if (ok) {
          setSavedCarts((prev) => prev.filter((c) => String(c.id) !== String(id)));
          showToast('삭제되었습니다', 'success');
          if (deletedCart) {
            pushUndo({
              type: 'saved-cart-delete',
              label: `장바구니 삭제 (${deletedCart.name || '장바구니'})`,
              undo: async () => {
                const { id: _id, ...cartWithoutId } = deletedCart;
                const restored = await supabase.addSavedCart(cartWithoutId);
                if (restored) await refreshSavedCarts();
              },
            });
          }
        } else {
          showToast('삭제에 실패했습니다', 'error');
        }
      } catch (err) {
        console.error('[handleDeleteSavedCart] error:', err);
        showToast('삭제 중 오류가 발생했습니다', 'error');
      }
    },
    [savedCarts, showToast, pushUndo, refreshSavedCarts]
  );

  const handleDeleteAllSavedCarts = useCallback(async () => {
    const snapshot = [...savedCarts];
    const ok = await supabase.deleteAllSavedCarts();
    if (ok) {
      setSavedCarts([]);
      showToast('전체 삭제되었습니다', 'success');
      if (snapshot.length > 0) {
        pushUndo({
          type: 'saved-carts-delete-all',
          label: `장바구니 전체 삭제 (${snapshot.length}건)`,
          undo: async () => {
            await Promise.all(snapshot.map((c) => {
              const { id: _id, ...cartWithoutId } = c;
              return supabase.addSavedCart(cartWithoutId);
            }));
            await refreshSavedCarts();
          },
        });
      }
    } else {
      showToast('삭제에 실패했습니다', 'error');
    }
  }, [savedCarts, showToast, pushUndo, refreshSavedCarts]);

  // ─── Customer add handler ──────────────────────────────────
  const handleAddCustomer = useCallback(async (customerData) => {
    const result = await supabase.addCustomer(customerData);
    if (result) {
      const data = await supabase.getCustomers();
      if (data) setCustomers(data);
      showToast('거래처가 등록되었습니다', 'success');
      return result;
    } else {
      showToast('거래처 등록에 실패했습니다', 'error');
      return null;
    }
  }, [showToast]);

  // ─── Customer return handlers ──────────────────────────────────
  const handleSaveCustomerReturn = useCallback(
    async (returnData) => {
      const result = await supabase.addCustomerReturn(returnData);
      if (result) {
        showToast('반품이 처리되었습니다', 'success');
      } else {
        showToast('반품 처리에 실패했습니다', 'error');
      }
      return result;
    },
    [showToast]
  );

  const handleDeleteCustomerReturn = useCallback(
    async (id) => {
      const ok = await supabase.deleteCustomerReturn(id);
      if (!ok) {
        showToast('반품 삭제에 실패했습니다', 'error');
      }
      return ok;
    },
    [showToast]
  );

  // ─── Load saved cart into POS ─────────────────────────────────
  const handleLoadSavedCart = useCallback(
    (cartData) => {
      setCartWithHistory(cartData.items || []);
      setPriceType(cartData.price_type || 'wholesale');
      setLoadedCustomer({
        name: cartData.name || '',
        phone: cartData.phone || '',
        address: cartData.address || '',
      });
      setCurrentPage('pos');
      showToast('장바구니를 불러왔습니다', 'success');
    },
    [showToast]
  );

  // ─── AI 학습 데이터 저장 (Codex PII 마스킹 적용) ─────────────
  const handleSaveLearning = useCallback(async (learningItems) => {
    // PII 마스킹 (전화/주민/사업자/이메일/카드/차량)
    const PII = [
      { re: /\b(?:01[016789]|0[2-6][1-5]?)-?\d{3,4}-?\d{4}\b/g, label: '[전화]' },
      { re: /\b\d{6}-?[1-4]\d{6}\b/g, label: '[주민번호]' },
      { re: /\b\d{3}-?\d{2}-?\d{5}\b/g, label: '[사업자번호]' },
      { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, label: '[이메일]' },
      { re: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: '[카드번호]' },
      { re: /\d{2,3}[가-힣]\s?\d{4}/g, label: '[차량]' },
    ];
    const mask = (t) => PII.reduce((s, { re, label }) => s.replace(re, label), String(t || '')).slice(0, 200);
    let successCount = 0;
    for (const item of learningItems) {
      const result = await supabase.upsertAiLearning(
        mask(item.originalText), mask(item.normalizedText), item.productId, item.productName, item.quantity, item.reason || ''
      );
      if (result) {
        successCount++;
        setAiLearningData(prev => {
          const idx = prev.findIndex(l => l.normalized_text === item.normalizedText && l.product_id === item.productId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = result;
            return updated;
          }
          return [...prev, result];
        });
      }
    }
    if (successCount > 0) {
      showToast(`${successCount}건 학습 완료`, 'success');
    } else if (learningItems.length > 0) {
      showToast('학습 저장 실패', 'error');
    }
  }, [showToast]);

  // ─── Add items from TextAnalyze to cart ───────────────────────
  // 절차 간소화: AI 인식 → 담기 → 메인 안 거치고 곧바로 주문서(OrderPage) 자동 오픈
  const [autoOpenOrderConfirmNonce, setAutoOpenOrderConfirmNonce] = useState(0);
  const handleAddToCart = useCallback(
    (newItems) => {
      setCartWithHistory((prev) => {
        const merged = [...prev];
        for (const newItem of newItems) {
          const idx = merged.findIndex(
            (i) => i.id === newItem.id && i.price === newItem.price
          );
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              quantity: merged[idx].quantity + newItem.quantity,
            };
          } else {
            merged.push(newItem);
          }
        }
        return merged;
      });
      setCurrentPage('pos');
      // MainPOS가 mount된 후 OrderPage(주문서)를 자동으로 띄우도록 신호
      setAutoOpenOrderConfirmNonce(Date.now());
      showToast('주문 확인 — 주문서를 띄웠습니다', 'success');
    },
    [showToast]
  );

  // ─── Page renderer ────────────────────────────────────────────
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            orders={orders}
            products={products}
            savedCarts={savedCarts}
            customers={customers}
            supabaseConnected={supabaseConnected}
            setCurrentPage={setCurrentPage}
            onViewOrder={(order) => setSelectedOrder(order)}
            onUpdateOrder={handleUpdateOrder}
            onAiOrder={(text) => { setAiOrderText(text); setCurrentPage('ai-order'); }}
          />
        );

      case 'memos':
        return (
          <MemosPage
            orders={orders}
            products={products}
            onViewOrder={(order) => setSelectedOrder(order)}
            onUpdateOrder={handleUpdateOrder}
            setCurrentPage={setCurrentPage}
          />
        );

      case 'pos':
        return (
          <MainPOS
            products={products}
            cart={cart}
            setCart={setCartWithHistory}
            priceType={priceType}
            setPriceType={setPriceType}
            onOpenOrder={() => setCurrentPage('orders')}
            onOpenTextAnalyze={() => setCurrentPage('ai-order')}
            onOpenQuickCalculator={() => setShowQuickCalc(true)}
            showToast={showToast}
            saveOrder={saveOrder}
            isSaving={isSaving}
            savingStep={savingStep}
            customers={customers}
            orders={orders}
            onSaveCartModal={(customerInfo) => {
              if (customerInfo) setSaveCartCustomerOverride(customerInfo);
              setShowSaveCartModal(true);
            }}
            onBack={() => setCurrentPage('dashboard')}
            loadedCustomer={loadedCustomer}
            onClearLoadedCustomer={() => setLoadedCustomer(null)}
            autoOpenOrderConfirmNonce={autoOpenOrderConfirmNonce}
          />
        );

      case 'orders':
        return (
          <OrderHistory
            orders={orders}
            onBack={() => setCurrentPage('pos')}
            onDeleteOrder={handleDeleteOrder}
            onDeleteMultiple={handleDeleteMultipleOrders}
            onViewOrder={(order) => setSelectedOrder(order)}
            onRefresh={refreshOrders}
            isLoading={false}
            onReorder={(order) => {
              const items = (order.items || []).map(it => ({
                ...it,
                quantity: it.quantity || 1,
                wholesale: it.wholesale || it.price || 0,
                retail: it.retail || it.price || 0,
              }));
              setCartWithHistory(items);
              setPriceType(order.priceType || 'wholesale');
              setLoadedCustomer({
                name: order.customerName || '',
                phone: order.customerPhone || '',
                address: order.customerAddress || '',
              });
              setCurrentPage('pos');
              showToast('재주문 — POS에 담았습니다', 'success');
            }}
            onSaveToCart={async (order) => {
              const customerName = order.customerName || order.customer_name || '';
              const normalizedName = customerName ? customerName.toLowerCase().replace(/\s/g, '') : '';

              // 등록된 업체인 경우 업체 데이터(전화번호, 주소) 가져오기
              let customerPhone = order.customerPhone || order.customer_phone || '';
              let customerAddress = order.customerAddress || order.customer_address || '';
              if (customerName && customers.length > 0) {
                const matched = customers.find(
                  c => c?.name?.toLowerCase().replace(/\s/g, '') === normalizedName
                );
                if (matched) {
                  if (!customerPhone && matched.phone) customerPhone = matched.phone;
                  if (!customerAddress && matched.address) customerAddress = matched.address;
                }
              }

              // 같은 업체의 기존 저장된 장바구니가 있으면 병합 제안
              if (normalizedName) {
                const existingCart = savedCarts.find(
                  c => c.name && c.name.toLowerCase().replace(/\s/g, '') === normalizedName
                );
                if (existingCart) {
                  const confirmed = window.confirm(
                    `"${customerName}"의 저장된 장바구니가 이미 있습니다.\n\n기존 장바구니에 제품을 병합하시겠습니까?\n\n[확인] 기존 장바구니에 추가\n[취소] 별도 장바구니로 생성`
                  );
                  if (confirmed) {
                    // 기존 아이템과 새 아이템 병합
                    const existingItems = existingCart.items || [];
                    const newItems = order.items || [];
                    const mergedMap = new Map();
                    existingItems.forEach(item => {
                      const key = item.name || item.id;
                      mergedMap.set(key, { ...item });
                    });
                    newItems.forEach(item => {
                      const key = item.name || item.id;
                      if (mergedMap.has(key)) {
                        mergedMap.get(key).quantity += item.quantity || 1;
                      } else {
                        mergedMap.set(key, { ...item });
                      }
                    });
                    const mergedItems = Array.from(mergedMap.values());
                    const mergedTotal = mergedItems.reduce(
                      (sum, item) => sum + ((item.price || item.wholesale || 0) * (item.quantity || 1)), 0
                    );
                    const mergedMemo = [existingCart.memo, `주문이력에서 병합 (${order.orderNumber})`].filter(Boolean).join('\n');
                    const result = await handleUpdateSavedCart(existingCart.id, {
                      items: mergedItems,
                      total: mergedTotal,
                      memo: mergedMemo,
                    });
                    if (result) {
                      showToast('기존 장바구니에 병합 완료!', 'success');
                      setCurrentPage('saved-carts');
                    }
                    return;
                  }
                }
              }

              // 신규 장바구니 생성
              const now = new Date();
              await handleSaveCart({
                name: customerName || '주문',
                phone: customerPhone,
                address: customerAddress,
                items: order.items,
                total: order.totalAmount || order.total || order.total_amount || 0,
                price_type: order.priceType || priceType,
                date: now.toLocaleDateString('ko-KR'),
                time: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                created_at: now.toISOString(),
                memo: `주문이력에서 복사 (${order.orderNumber})`,
              });
              showToast('장바구니에 저장되었습니다', 'success');
              setCurrentPage('saved-carts');
            }}
            customers={customers}
            onUpdateOrder={handleUpdateOrder}
          />
        );

      case 'saved-carts':
        return (
          <SavedCarts
            savedCarts={savedCarts}
            onLoad={handleLoadSavedCart}
            onDelete={handleDeleteSavedCart}
            onDeleteAll={handleDeleteAllSavedCarts}
            onUpdate={handleUpdateSavedCart}
            onOrder={async (cartData) => {
              const pt = cartData.price_type || 'wholesale';
              // 🚨 items의 price 필드를 폴백 체인으로 보강해서 저장 (명세서 0원 방지)
              // 저장된 장바구니의 items에 price가 없거나 0이면 wholesale/retail에서 폴백
              const items = (cartData.items || []).map((i) => {
                const fallbackPrice = pt === 'wholesale'
                  ? (Number(i.wholesale) || 0)
                  : (Number(i.retail) || Number(i.wholesale) || 0);
                const price = Number(i.price) > 0 ? Number(i.price) : fallbackPrice;
                return { ...i, price };
              });
              const total = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.quantity || 1), 0);
              // 먼저 장바구니 카드 삭제
              if (cartData.id) {
                await handleDeleteSavedCart(cartData.id);
              }
              await saveOrder({
                customer_name: cartData.name || '일반고객',
                customer_phone: cartData.phone || '',
                customer_address: cartData.address || '',
                items,
                total_amount: total,
                price_type: pt,
              });
            }}
            products={products}
            customers={customers}
            onBack={() => setCurrentPage('pos')}
            onRefresh={refreshSavedCarts}
            isLoading={false}
            showToast={showToast}
          />
        );

      case 'customers':
        return (
          <CustomerList
            customers={customers}
            orders={orders}
            onBack={() => setCurrentPage('pos')}
            onAddCustomer={handleAddCustomer}
            onSaveCustomerReturn={handleSaveCustomerReturn}
            onRefreshOrders={refreshOrders}
            onUpdateOrder={handleUpdateOrder}
            onGoToInvoices={goToInvoices}
            showToast={showToast}
          />
        );

      case 'invoices':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>명세서 로드 중...</div>}>
            <InvoicesContainer customers={customers} initialCustomerId={invoicesInitialCustomerId} />
          </Suspense>
        );

      case 'stock':
        return (
          <StockOverview
            products={products}
            categories={productCategories}
            formatPrice={formatPrice}
            onBack={() => setCurrentPage('pos')}
          />
        );

      case 'burnway-stock':
        return (
          <BurnwayStock
            products={products}
            formatPrice={formatPrice}
            onBack={() => setCurrentPage('dashboard')}
          />
        );

      case 'shipping':
        return (
          <ShippingLabel
            orders={orders}
            customers={customers}
            savedCarts={savedCarts}
            onBack={() => setCurrentPage('pos')}
            refreshCustomers={refreshCustomers}
            showToast={showToast}
          />
        );

      case 'ai-order':
        return (
          <TextAnalyze
            products={products}
            onAddToCart={handleAddToCart}
            formatPrice={formatPrice}
            priceType={priceType}
            onBack={() => setCurrentPage('pos')}
            aiLearningData={aiLearningData}
            onSaveLearning={handleSaveLearning}
            initialText={aiOrderText}
          />
        );

      case 'ai-analytics':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>AI 분석 로드 중...</div>}>
            <AIAnalytics
              orders={orders}
              customers={customers}
              products={products}
              savedCarts={savedCarts}
              aiLearningData={aiLearningData}
              setProducts={setProducts}
              setCustomers={setCustomers}
              setCurrentPage={setCurrentPage}
              showToast={showToast}
              saveOrder={saveOrder}
            />
          </Suspense>
        );

      case 'smartstore':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>스마트스토어 주문 로드 중...</div>}>
            <SmartStoreOrders
              products={products}
              customers={customers}
              showToast={showToast}
              saveOrder={saveOrder}
              setCurrentPage={setCurrentPage}
              refreshCustomers={refreshCustomers}
              onPendingCountChange={setSmartstoreCount}
            />
          </Suspense>
        );

      case 'purchase-orders':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>매입 발주 로드 중...</div>}>
            <PurchaseOrders
              showToast={showToast}
              setCurrentPage={setCurrentPage}
              products={products}
              orders={orders}
            />
          </Suspense>
        );

      case 'supplier-prices':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>매입 단가표 로드 중...</div>}>
            <SupplierPrices
              showToast={showToast}
              setCurrentPage={setCurrentPage}
            />
          </Suspense>
        );

      case 'supplier-ledger':
        return (
          <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>수불 장부 로드 중...</div>}>
            <SupplierLedger
              showToast={showToast}
              setCurrentPage={setCurrentPage}
            />
          </Suspense>
        );

      case 'admin':
        return (
          <AdminPage
            products={products}
            setProducts={setProducts}
            customers={customers}
            setCustomers={setCustomers}
            supabaseConnected={supabaseConnected}
            showToast={showToast}
            supabase={supabase}
            pushUndo={pushUndo}
            aiLearningData={aiLearningData}
            setAiLearningData={setAiLearningData}
          />
        );

      default:
        return (
          <Dashboard
            orders={orders}
            products={products}
            savedCarts={savedCarts}
            customers={customers}
            supabaseConnected={supabaseConnected}
            setCurrentPage={setCurrentPage}
            onViewOrder={(order) => setSelectedOrder(order)}
            onUpdateOrder={handleUpdateOrder}
          />
        );
    }
  };

  // ─── Derive current cart customer for SaveCartModal ───────────
  const cartCustomerName = useMemo(() => {
    return loadedCustomer?.name || '';
  }, [loadedCustomer]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* 전역 스토어 주문 알림 — 어느 페이지에서든 신규주문/취소 시 알림음+팝업+OS알림 */}
      <StoreOrderAlerts />
      <AppLayout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOnline={supabaseConnected}
        orderCount={todayOrderCount}
        savedCartCount={savedCartCount}
        shippingCount={shippingCount}
        smartstoreCount={smartstoreCount}
      >
        {/* 예약일 알림 띠 — 예약일이 됐는데 아직 주문 안 넘긴 저장 장바구니를 상기.
            팝업이 아니라 띠라서 작업을 막지 않고, [30분 뒤에]로 스누즈 가능.
            ⚠️ 제품주문(pos) 화면은 우측 장바구니가 fixed w-[400px]로 떠 있어서(MainPOS:886)
               띠가 그 아래로 깔려 버튼이 가린다 → MainPOS 본문과 동일하게 pr 보정 */}
        <ReservationAlertBar
          onGoToCarts={() => setCurrentPage('saved-carts')}
          reserveRightGutter={currentPage === 'pos'}
        />
        {/* fullScreen 페이지만 flex-1 min-h-0 flex-col 래퍼로 감싼다.
            animate-page-in이 flex-col이라 이 래퍼가 알림바(위 형제)를 뺀 남은 높이를 차지 →
            안쪽 h-full 페이지 루트가 모바일 하단 네비 밑으로 안 넘침 (2026-07-24 전수수정).
            비 fullScreen 페이지는 기존 block 흐름 그대로 두어 포매팅 컨텍스트 변화 없음. */}
        {/* key={currentPage} → 페이지 이동 시 바운더리 리셋 (한 페이지 청크 실패가 다른 페이지로 안 번지게) */}
        {FULLSCREEN_PAGES.has(currentPage) ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ChunkErrorBoundary key={currentPage}>
              {renderPage()}
            </ChunkErrorBoundary>
          </div>
        ) : (
          <ChunkErrorBoundary key={currentPage}>
            {renderPage()}
          </ChunkErrorBoundary>
        )}
      </AppLayout>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          customers={customers}
          onUpdateOrder={async (id, data, opts) => {
            const result = await handleUpdateOrder(id, data, opts);
            if (result) {
              setSelectedOrder((prev) =>
                prev ? {
                  ...prev,
                  ...data,
                  customerName: data.customer_name ?? prev.customerName,
                  customerPhone: data.customer_phone ?? prev.customerPhone,
                  customerAddress: data.customer_address ?? prev.customerAddress,
                  totalAmount: data.total ?? prev.totalAmount,
                  totalReturned: data.total_returned ?? prev.totalReturned,
                  returns: data.returns ?? prev.returns,
                } : prev
              );
            }
            return result;
          }}
          products={products}
          onSaveCustomerReturn={handleSaveCustomerReturn}
          onDeleteCustomerReturn={handleDeleteCustomerReturn}
          showToast={showToast}
        />
      )}

      {/* Save cart modal */}
      {showSaveCartModal && (
        <SaveCartModal
          isOpen={showSaveCartModal}
          onSave={async (data) => {
            const now = new Date();
            const totalAmount = cart.reduce((sum, item) => {
              const price = priceType === 'wholesale' ? (item.wholesale || item.price || item.retail || 0) : (item.retail || item.price || item.wholesale || 0);
              return sum + price * item.quantity;
            }, 0);
            await handleSaveCart({
              name: data.name,
              phone: data.phone,
              address: data.address,
              delivery_date: data.deliveryDate,
              status: data.status,
              priority: data.priority,
              memo: data.memo,
              items: cart.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category,
                wholesale: item.wholesale,
                retail: item.retail,
                quantity: item.quantity,
                // 🚨 비과세 플래그 보존 — 빠뜨리면 저장 카트를 불러왔을 때 택배비가 과세로 돌아감
                ...(item.taxFree === true ? { taxFree: true } : {}),
              })),
              total: totalAmount,
              price_type: priceType,
              date: now.toLocaleDateString('ko-KR'),
              time: now.toLocaleTimeString('ko-KR'),
              created_at: now.toISOString(),
            });
            setShowSaveCartModal(false);
            setSaveCartCustomerOverride(null);
            // 장바구니 초기화 + 메인화면(POS)으로 복귀
            setCart([]);
            setLoadedCustomer(null);
            setSearchTerm('');
            setSelectedCategory('전체');
          }}
          cart={cart}
          priceType={priceType}
          formatPrice={formatPrice}
          customerName={saveCartCustomerOverride?.name || cartCustomerName}
          initialPhone={saveCartCustomerOverride?.phone || loadedCustomer?.phone || ''}
          initialAddress={saveCartCustomerOverride?.address || loadedCustomer?.address || ''}
          customers={customers}
          onBack={() => { setShowSaveCartModal(false); setSaveCartCustomerOverride(null); }}
          onCloseAll={() => { setShowSaveCartModal(false); setSaveCartCustomerOverride(null); setCart([]); setLoadedCustomer(null); setSearchTerm(''); setSelectedCategory('전체'); }}
        />
      )}

      {/* Quick calculator */}
      {showQuickCalc && (
        <QuickCalculator onClose={() => setShowQuickCalc(false)} />
      )}

      {/* ⌘K 스마트 커맨드바 */}
      <CommandBar
        open={showCommandBar}
        onClose={() => setShowCommandBar(false)}
        products={products}
        customers={customers}
        orders={orders}
        onNavigate={(page) => { setCurrentPage(page); setShowCommandBar(false); }}
        onAddToCart={(product) => {
          setCartWithHistory(prev => {
            const existing = prev.find(it => it.id === product.id);
            if (existing) return prev.map(it => it.id === product.id ? { ...it, quantity: it.quantity + 1 } : it);
            return [...prev, { ...product, quantity: 1 }];
          });
          setCurrentPage('pos');
        }}
        onViewOrder={(order) => { setSelectedOrder(order); setShowCommandBar(false); }}
        onViewCustomer={(customer) => { setCurrentPage('customers'); setShowCommandBar(false); }}
        showToast={showToast}
      />

      {/* Notification settings */}
      {showNotificationSettings && (
        <NotificationSettings
          isOpen={showNotificationSettings}
          onClose={() => setShowNotificationSettings(false)}
          settings={notificationSettings}
          onSave={(updated) => {
            setNotificationSettings(updated);
            showToast('알림 설정이 저장되었습니다', 'success');
          }}
        />
      )}

      {/* 주문 저장 로딩 오버레이 (POS 외 페이지용) */}
      {isSaving && currentPage !== 'pos' && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="flex flex-col items-center gap-4 p-8 rounded-2xl shadow-2xl mx-4 animate-pulse"
            style={{ background: 'var(--card)', minWidth: '240px' }}
          >
            <div className="relative w-16 h-16">
              <div
                className="absolute inset-0 rounded-full border-4 animate-spin"
                style={{ borderColor: 'var(--muted)', borderTopColor: 'var(--primary)' }}
              />
              <div
                className="absolute inset-2 rounded-full border-4 animate-spin"
                style={{ borderColor: 'transparent', borderBottomColor: 'var(--primary)', animationDirection: 'reverse', animationDuration: '0.8s' }}
              />
            </div>
            <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              {savingStep || '처리 중...'}
            </p>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              잠시만 기다려주세요
            </p>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'info' })}
        />
      )}

      {/* ↩️ 실행취소 스낵바 — 삭제 등 되돌릴 수 있는 작업 후 노출 (데스크탑 Ctrl+Z + 태블릿/폰 터치 공용) */}
      {undoHint && (
        <div
          className="fixed left-1/2 z-[120] bottom-20 md:bottom-6 w-[calc(100%-2rem)] max-w-sm"
          style={{ transform: 'translateX(-50%)' }}
          role="status"
        >
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <span className="text-lg flex-shrink-0" aria-hidden>🗑️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold break-words leading-snug" style={{ color: 'var(--foreground)' }}>
                {undoHint.label}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                되돌리려면 실행취소 (Ctrl+Z)
              </p>
            </div>
            <button
              onClick={performUndo}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
              style={{ background: 'var(--primary)', color: 'white' }}
            >
              ↩️ 실행취소
            </button>
            <button
              onClick={() => setUndoHint(null)}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-[var(--muted)] text-xs"
              style={{ color: 'var(--muted-foreground)' }}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </>
  );
}
