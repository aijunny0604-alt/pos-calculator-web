import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Toast from '@/components/ui/Toast';

import Dashboard from '@/pages/Dashboard';
import MainPOS from '@/pages/MainPOS';
import OrderHistory from '@/pages/OrderHistory';
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

import { supabase } from '@/lib/supabase';
import { priceData } from '@/lib/priceData';
import { formatPrice, getTodayKST, toDateKST } from '@/lib/utils';

export default function App() {
  // ─── Navigation ───────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState('dashboard');

  // ─── Core data ────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [savedCarts, setSavedCarts] = useState([]);
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // ─── POS state ────────────────────────────────────────────────
  const [cart, setCart] = useState([]);

  // ─── Global Undo System ──────────────────────────────────────
  // Each undo entry: { type, undo: async () => void, label: string }
  const undoStackRef = useRef([]);
  const MAX_UNDO = 20;

  const pushUndo = useCallback((entry) => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO - 1)),
      entry,
    ];
  }, []);

  // Cart wrapper that auto-pushes undo
  const setCartWithHistory = useCallback((newCartOrUpdater) => {
    setCart((prev) => {
      const next = typeof newCartOrUpdater === 'function'
        ? newCartOrUpdater(prev)
        : newCartOrUpdater;
      const snapshot = prev;
      pushUndo({
        type: 'cart',
        label: '장바구니 변경',
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
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

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

  // ─── Persist notification settings ───────────────────────────
  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // ─── Ctrl+Z Global Undo ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
          return;
        }
        e.preventDefault();
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showToast]);

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
    items: o.items || [],
  }), []);

  // ─── Initial data load ────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [fetchedOrders, fetchedProducts, fetchedCustomers, fetchedCarts] =
          await Promise.all([
            supabase.getOrders(),
            supabase.getProducts(),
            supabase.getCustomers(),
            supabase.getSavedCarts(),
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
      } catch (err) {
        console.error('Data load failed, using local fallback:', err);
        setSupabaseConnected(false);
        setProducts(priceData);
      }
    }

    loadData();
  }, []);

  // ─── Supabase real-time WebSocket ─────────────────────────────
  useEffect(() => {
    if (!supabaseConnected) return;

    // Derive WSS URL from Supabase REST URL
    const supabaseUrl = 'https://icqxomltplewrhopafpq.supabase.co';
    const supabaseKey = 'sb_publishable_YB9UnUwuMql8hUGHgC0bsg_DhrAxpji';
    const wsUrl =
      supabaseUrl.replace('https://', 'wss://') +
      '/realtime/v1/websocket?apikey=' +
      supabaseKey +
      '&vsn=1.0.0';

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ['orders', 'products', 'customers', 'saved_carts'].forEach((table) => {
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
        if (['INSERT', 'UPDATE', 'DELETE'].includes(msg.event)) {
          const table = msg.topic?.split(':')[2];
          if (table === 'orders') {
            supabase.getOrders().then((d) => d && setOrders(d.map(formatOrder)));
          } else if (table === 'products') {
            supabase.getProducts().then((d) => {
              if (d && d.length > 0) setProducts(d);
            });
          } else if (table === 'customers') {
            supabase.getCustomers().then((d) => d && setCustomers(d));
          } else if (table === 'saved_carts') {
            supabase.getSavedCarts().then((d) => d && setSavedCarts(d));
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

    return () => {
      clearInterval(heartbeat);
      ws.close();
    };
  }, [supabaseConnected]);

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

  // ─── Save order (with same-day merge logic) ───────────────────
  const saveOrder = useCallback(
    async (orderData) => {
      const customer_name = orderData.customer_name || orderData.customerName || '일반고객';
      const items = orderData.items || [];
      const price_type = orderData.price_type || orderData.priceType || 'wholesale';
      const totalVal = orderData.total_amount || orderData.totalAmount || 0;

      // Auto-register unknown customers (skip 일반고객)
      if (
        customer_name &&
        customer_name !== '일반고객' &&
        !customers.find(
          (c) => c.name?.toLowerCase() === customer_name?.toLowerCase()
        )
      ) {
        const newCustomer = await supabase.addCustomer({ name: customer_name });
        if (newCustomer) {
          setCustomers((prev) => [...prev, newCustomer]);
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
          // Merge items: match by id + price, accumulate quantities
          const mergedItems = [...(existingOrder.items || [])];
          for (const newItem of items) {
            const idx = mergedItems.findIndex(
              (i) => i.id === newItem.id && i.price === newItem.price
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
          const mergedTotal = mergedItems.reduce(
            (sum, i) => sum + (i.price || 0) * (i.quantity || 1),
            0
          );
          const updated = await supabase.updateOrder(existingOrder.id, {
            items: mergedItems,
            total: mergedTotal,
            subtotal: Math.round(mergedTotal / 1.1),
            vat: mergedTotal - Math.round(mergedTotal / 1.1),
          });
          if (updated) {
            await refreshOrders();
            setCartWithHistory([]);
            showToast('기존 주문에 합산되었습니다', 'success');
            return updated;
          }
        }
      }

      // New order
      const orderId = orderData.orderNumber || orderData.id || `ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*10000)).padStart(4,'0')}`;
      const created = await supabase.saveOrder({
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
      });

      if (created) {
        await refreshOrders();
        setCartWithHistory([]);
        showToast('주문이 저장되었습니다', 'success');
      } else {
        showToast('주문 저장에 실패했습니다', 'error');
      }
      return created;
    },
    [customers, orders, refreshOrders, showToast]
  );

  // ─── Order handlers ───────────────────────────────────────────
  const handleDeleteOrder = useCallback(
    async (id) => {
      // Snapshot before delete for undo
      const deletedOrder = orders.find((o) => o.id === id);
      const ok = await supabase.deleteOrder(id);
      if (ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        showToast('주문이 삭제되었습니다', 'success');
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
              });
              if (restored) await refreshOrders();
            },
          });
        }
      } else {
        showToast('삭제에 실패했습니다', 'error');
      }
    },
    [orders, showToast, pushUndo, refreshOrders]
  );

  const handleDeleteMultipleOrders = useCallback(
    async (ids) => {
      const deletedOrders = orders.filter((o) => ids.includes(o.id));
      await Promise.all(ids.map((id) => supabase.deleteOrder(id)));
      setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      showToast(`${ids.length}건 삭제되었습니다`, 'success');
      if (deletedOrders.length > 0) {
        pushUndo({
          type: 'orders-delete-multiple',
          label: `주문 ${deletedOrders.length}건 삭제`,
          undo: async () => {
            await Promise.all(deletedOrders.map((o) =>
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
              })
            ));
            await refreshOrders();
          },
        });
      }
    },
    [orders, showToast, pushUndo, refreshOrders]
  );

  const handleUpdateOrder = useCallback(
    async (id, data) => {
      const result = await supabase.updateOrder(id, data);
      if (result) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== id) return o;
            const merged = { ...o, ...data };
            // Sync camelCase aliases from snake_case updates
            if (data.total != null) merged.totalAmount = data.total;
            if (data.customer_name != null) merged.customerName = data.customer_name;
            if (data.customer_phone != null) merged.customerPhone = data.customer_phone;
            if (data.customer_address != null) merged.customerAddress = data.customer_address;
            return merged;
          })
        );
      }
      return result;
    },
    []
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

  // ─── Add items from TextAnalyze to cart ───────────────────────
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
      showToast('상품이 추가되었습니다', 'success');
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
            customers={customers}
            onSaveCartModal={(customerInfo) => {
              if (customerInfo) setSaveCartCustomerOverride(customerInfo);
              setShowSaveCartModal(true);
            }}
            onBack={() => setCurrentPage('dashboard')}
            loadedCustomer={loadedCustomer}
            onClearLoadedCustomer={() => setLoadedCustomer(null)}
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
              const items = cartData.items || [];
              const pt = cartData.price_type || 'wholesale';
              const total = items.reduce((sum, i) => {
                const price = i.price || (pt === 'wholesale' ? (i.wholesale || 0) : (i.retail || i.wholesale || 0));
                return sum + price * (i.quantity || 1);
              }, 0);
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
            showToast={showToast}
          />
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
          />
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
      <AppLayout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOnline={supabaseConnected}
        orderCount={todayOrderCount}
        savedCartCount={savedCartCount}
        shippingCount={shippingCount}
      >
        {renderPage()}
      </AppLayout>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
          onUpdateOrder={async (id, data) => {
            const result = await handleUpdateOrder(id, data);
            if (result) {
              setSelectedOrder((prev) =>
                prev ? {
                  ...prev,
                  ...data,
                  customerName: data.customer_name ?? prev.customerName,
                  customerPhone: data.customer_phone ?? prev.customerPhone,
                  customerAddress: data.customer_address ?? prev.customerAddress,
                  totalAmount: data.total ?? prev.totalAmount,
                } : prev
              );
            }
            return result;
          }}
          products={products}
          onSaveCustomerReturn={handleSaveCustomerReturn}
          onDeleteCustomerReturn={handleDeleteCustomerReturn}
        />
      )}

      {/* Save cart modal */}
      {showSaveCartModal && (
        <SaveCartModal
          isOpen={showSaveCartModal}
          onSave={async (data) => {
            const now = new Date();
            const totalAmount = cart.reduce((sum, item) => {
              const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
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

      {/* Toast notifications */}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'info' })}
        />
      )}
    </>
  );
}
