import { useState, useEffect, useMemo, useCallback } from 'react';
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
import TextAnalyze from '@/pages/TextAnalyze';
import AdminPage from '@/pages/AdminPage';
import SaveCartModal from '@/pages/SaveCartModal';
import QuickCalculator from '@/pages/QuickCalculator';
import NotificationSettings from '@/pages/NotificationSettings';

import { supabase } from '@/lib/supabase';
import { priceData } from '@/lib/priceData';
import { formatPrice } from '@/lib/utils';

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
  const [priceType, setPriceType] = useState('retail');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  // ─── Modal / overlay state ────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);
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
      const { customer_name, items, total_amount, price_type } = orderData;
      const totalVal = total_amount || 0;

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

      const today = new Date().toISOString().split('T')[0];

      // Check for same-customer same-day order to merge (skip for 일반고객)
      if (customer_name && customer_name !== '일반고객') {
        const existingOrder = orders.find((o) => {
          const orderDate = o.createdAt
            ? new Date(o.createdAt).toISOString().split('T')[0]
            : '';
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
            setCart([]);
            showToast('기존 주문에 합산되었습니다', 'success');
            return updated;
          }
        }
      }

      // New order
      const created = await supabase.saveOrder({
        customer_name,
        customer_phone: orderData.customer_phone || '',
        customer_address: orderData.customer_address || '',
        price_type: price_type || 'wholesale',
        items,
        total: totalVal,
        subtotal: Math.round(totalVal / 1.1),
        vat: totalVal - Math.round(totalVal / 1.1),
        memo: orderData.memo || null,
        status: 'completed',
        created_at: new Date().toISOString(),
      });

      if (created) {
        await refreshOrders();
        setCart([]);
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
      const ok = await supabase.deleteOrder(id);
      if (ok) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        showToast('주문이 삭제되었습니다', 'success');
      } else {
        showToast('삭제에 실패했습니다', 'error');
      }
    },
    [showToast]
  );

  const handleDeleteMultipleOrders = useCallback(
    async (ids) => {
      await Promise.all(ids.map((id) => supabase.deleteOrder(id)));
      setOrders((prev) => prev.filter((o) => !ids.includes(o.id)));
      showToast(`${ids.length}건 삭제되었습니다`, 'success');
    },
    [showToast]
  );

  const handleUpdateOrder = useCallback(
    async (id, data) => {
      const result = await supabase.updateOrder(id, data);
      if (result) {
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, ...data } : o))
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
      const ok = await supabase.deleteSavedCart(id);
      if (ok) {
        setSavedCarts((prev) => prev.filter((c) => c.id !== id));
        showToast('삭제되었습니다', 'success');
      } else {
        showToast('삭제에 실패했습니다', 'error');
      }
    },
    [showToast]
  );

  const handleDeleteAllSavedCarts = useCallback(async () => {
    const ok = await supabase.deleteAllSavedCarts();
    if (ok) {
      setSavedCarts([]);
      showToast('전체 삭제되었습니다', 'success');
    } else {
      showToast('삭제에 실패했습니다', 'error');
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
      setCart(cartData.items || []);
      setPriceType(cartData.price_type || 'wholesale');
      setCurrentPage('pos');
      showToast('장바구니를 불러왔습니다', 'success');
    },
    [showToast]
  );

  // ─── Add items from TextAnalyze to cart ───────────────────────
  const handleAddToCart = useCallback(
    (newItems) => {
      setCart((prev) => {
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
            setCart={setCart}
            priceType={priceType}
            setPriceType={setPriceType}
            onOpenOrder={() => setCurrentPage('orders')}
            onOpenTextAnalyze={() => setCurrentPage('ai-order')}
            onOpenQuickCalculator={() => setShowQuickCalc(true)}
            showToast={showToast}
            saveOrder={saveOrder}
            customers={customers}
            onSaveCartModal={() => setShowSaveCartModal(true)}
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
              await handleSaveCart({
                name: order.customer_name || '주문',
                items: order.items,
                total: order.total || order.total_amount || 0,
                price_type: priceType,
                date: new Date().toLocaleDateString('ko-KR'),
                time: new Date().toLocaleTimeString('ko-KR'),
                created_at: new Date().toISOString(),
              });
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
              const total = items.reduce(
                (sum, i) => sum + (i.price || 0) * (i.quantity || 1),
                0
              );
              await saveOrder({
                customer_name: cartData.name || '일반고객',
                items,
                total_amount: total,
                price_type: cartData.price_type || 'wholesale',
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
    // Future: derive from a selected customer in cart context
    return '';
  }, []);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <>
      <AppLayout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOnline={supabaseConnected}
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
                prev ? { ...prev, ...data } : prev
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
            await handleSaveCart(data);
            setShowSaveCartModal(false);
          }}
          cart={cart}
          priceType={priceType}
          formatPrice={formatPrice}
          customerName={cartCustomerName}
          onBack={() => setShowSaveCartModal(false)}
          onCloseAll={() => setShowSaveCartModal(false)}
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
