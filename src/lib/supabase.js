import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://jubzppndcclhnvgbvrxr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_td4p48nPHKjXByMngvyjZQ_AJttp5KU';

// Supabase 클라이언트 (실시간 구독용)
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 공통 헤더
const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

const headersWithReturn = { ...headers, 'Prefer': 'return=representation' };
const headersNoContent = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` };

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) { const body = await response.text(); throw new Error(`API error: ${response.status} - ${body}`); }
  return response.json();
}

// Supabase API
export const supabase = {
  // ===== 주문 =====
  async getOrders() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`, { headers });
    } catch (e) { console.error('getOrders:', e); return null; }
  },
  async saveOrder(order) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(order)
      });
    } catch (e) {
      // customer_address 컬럼 없을 경우 재시도
      try {
        const { customer_address, ...rest } = order;
        return await fetchJSON(`${SUPABASE_URL}/rest/v1/orders`, {
          method: 'POST', headers: headersWithReturn, body: JSON.stringify(rest)
        });
      } catch (e) { console.error('saveOrder:', e); return null; }
    }
  },
  async updateOrder(id, order) {
    try {
      const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(order)
      });
      return result.length > 0 ? result : true;
    } catch (e) { console.error('updateOrder:', e); return null; }
  },
  async deleteOrder(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteOrder:', e); return false; }
  },

  // ===== 제품 =====
  async getProducts() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/products?order=category,name`, { headers });
    } catch (e) { console.error('getProducts:', e); return null; }
  },
  async addProduct(product) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(product)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('addProduct:', e); return null; }
  },
  async updateProduct(id, product) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(product)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('updateProduct:', e); return null; }
  },
  async deleteProduct(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteProduct:', e); return false; }
  },

  // ===== 거래처 =====
  async getCustomers() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/customers?order=name`, { headers });
    } catch (e) { console.error('getCustomers:', e); return null; }
  },
  async addCustomer(customer) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/customers`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(customer)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('addCustomer:', e); return null; }
  },
  async updateCustomer(id, customer) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(customer)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('updateCustomer:', e); return null; }
  },
  async deleteCustomer(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteCustomer:', e); return false; }
  },

  // ===== 고객 반품 =====
  async getCustomerReturns(customerId = null) {
    try {
      let url = `${SUPABASE_URL}/rest/v1/customer_returns?order=returned_at.desc`;
      if (customerId) url += `&customer_id=eq.${customerId}`;
      return await fetchJSON(url, { headers });
    } catch (e) { console.warn('getCustomerReturns:', e); return []; }
  },
  async addCustomerReturn(returnData) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/customer_returns`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(returnData)
      });
    } catch (e) { console.error('addCustomerReturn:', e); return null; }
  },
  async deleteCustomerReturn(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/customer_returns?return_id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteCustomerReturn:', e); return false; }
  },

  // ===== 저장된 장바구니 =====
  async getSavedCarts() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/saved_carts?order=created_at.desc`, { headers });
    } catch (e) { console.error('getSavedCarts:', e); return null; }
  },
  async addSavedCart(cart) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/saved_carts`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(cart)
      });
    } catch (e) {
      // 컬럼 없을 경우 기본 필드만 저장
      try {
        const basic = { name: cart.name, items: cart.items, total: cart.total, price_type: cart.price_type, date: cart.date, time: cart.time, created_at: cart.created_at };
        const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/saved_carts`, {
          method: 'POST', headers: headersWithReturn, body: JSON.stringify(basic)
        });
        return [{ ...result[0], delivery_date: cart.delivery_date, status: cart.status, priority: cart.priority, memo: cart.memo, reminded: cart.reminded, _localOnly: true }];
      } catch (e) { console.error('addSavedCart:', e); return null; }
    }
  },
  async updateSavedCart(id, cart) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/saved_carts?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(cart)
      });
    } catch (e) {
      try {
        const basic = { name: cart.name, items: cart.items, total: cart.total, price_type: cart.price_type };
        const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/saved_carts?id=eq.${id}`, {
          method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(basic)
        });
        return [{ ...result[0], delivery_date: cart.delivery_date, status: cart.status, priority: cart.priority, memo: cart.memo, reminded: cart.reminded, _localOnly: true }];
      } catch (e) { console.error('updateSavedCart:', e); return null; }
    }
  },
  async deleteSavedCart(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_carts?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteSavedCart:', e); return false; }
  },
  async deleteAllSavedCarts() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_carts?id=gt.0`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteAllSavedCarts:', e); return false; }
  },

  // ===== AI 학습 =====
  async getAiLearning() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/ai_learning?order=hit_count.desc,updated_at.desc`, { headers });
    } catch (e) { console.error('getAiLearning:', e); return []; }
  },
  async addAiLearning(data) {
    try {
      const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/ai_learning`, { method: 'POST', headers: headersWithReturn, body: JSON.stringify(data) });
      return Array.isArray(result) ? result[0] : result;
    } catch (e) { console.error('addAiLearning:', e); return null; }
  },
  async updateAiLearning(id, data) {
    try {
      const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/ai_learning?id=eq.${id}`, { method: 'PATCH', headers: headersWithReturn, body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }) });
      return Array.isArray(result) ? result[0] : result;
    } catch (e) { console.error('updateAiLearning:', e); return null; }
  },
  async deleteAiLearning(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_learning?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteAiLearning:', e); return false; }
  },
  async deleteAllAiLearning() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_learning?id=gt.0`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteAllAiLearning:', e); return false; }
  },
  async upsertAiLearning(originalText, normalizedText, productId, productName, quantity, reason = '') {
    try {
      const existing = await fetchJSON(`${SUPABASE_URL}/rest/v1/ai_learning?normalized_text=eq.${encodeURIComponent(normalizedText)}&product_id=eq.${productId}`, { headers });
      if (existing && existing.length > 0) {
        const update = { hit_count: existing[0].hit_count + 1, quantity };
        if (reason) update.reason = reason;
        return await this.updateAiLearning(existing[0].id, update);
      }
      return await this.addAiLearning({ original_text: originalText, normalized_text: normalizedText, product_id: productId, product_name: productName, quantity, reason });
    } catch (e) { console.error('upsertAiLearning:', e); return null; }
  },

  // ===== payment_records (pos-payments 통합) =====
  async getPaymentRecords(filters = {}) {
    try {
      const params = new URLSearchParams({ order: 'created_at.desc' });
      if (filters.customerId) params.append('customer_id', `eq.${filters.customerId}`);
      if (filters.orderId) params.append('order_id', `eq.${filters.orderId}`);
      if (filters.status) params.append('payment_status', `eq.${filters.status}`);
      if (filters.hasBalance) params.append('balance', 'gt.0');
      if (filters.invoiceIssued === true) params.append('invoice_issued', 'eq.true');
      if (filters.invoiceIssued === false) params.append('invoice_issued', 'eq.false');
      if (filters.invoiceDate) params.append('invoice_date', `eq.${filters.invoiceDate}`);
      if (filters.invoiceDateFrom) params.append('invoice_date', `gte.${filters.invoiceDateFrom}`);
      if (filters.invoiceDateTo) params.append('invoice_date', `lte.${filters.invoiceDateTo}`);
      if (filters.limit) params.append('limit', String(filters.limit));
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records?${params.toString()}`, { headers });
    } catch (e) { console.error('getPaymentRecords:', e); return []; }
  },
  async getPaymentRecord(id) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records?id=eq.${id}`, { headers });
      return r[0] || null;
    } catch (e) { console.error('getPaymentRecord:', e); return null; }
  },
  async addPaymentRecord(record) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(record),
      });
    } catch (e) { console.error('addPaymentRecord:', e); return null; }
  },
  async updatePaymentRecord(id, patch) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(patch),
      });
      return r[0] || null;
    } catch (e) { console.error('updatePaymentRecord:', e); return null; }
  },
  async deletePaymentRecord(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/payment_records?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return true;
    } catch (e) { console.error('deletePaymentRecord:', e); return false; }
  },

  // ===== payment_history (pos-payments 통합) =====
  async getPaymentHistory(filters = {}) {
    try {
      const params = new URLSearchParams({ order: 'paid_at.desc' });
      if (filters.recordId) params.append('payment_record_id', `eq.${filters.recordId}`);
      if (filters.paidFrom) params.append('paid_at', `gte.${filters.paidFrom}`);
      if (filters.paidTo) params.append('paid_at', `lte.${filters.paidTo}`);
      if (filters.limit) params.append('limit', String(filters.limit));
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_history?${params.toString()}`, { headers });
    } catch (e) { console.error('getPaymentHistory:', e); return []; }
  },
  async addPaymentHistory(entry) {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_history`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(entry),
      });
    } catch (e) { console.error('addPaymentHistory:', e); return null; }
  },
  async updatePaymentHistory(id, patch) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_history?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(patch),
      });
      return r[0] || null;
    } catch (e) { console.error('updatePaymentHistory:', e); return null; }
  },
  async deletePaymentHistory(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/payment_history?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return true;
    } catch (e) { console.error('deletePaymentHistory:', e); return false; }
  },

  // ===== 대시보드 집계 (pos-payments 통합) =====
  async getTodayPaidTotal() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await fetchJSON(
        `${SUPABASE_URL}/rest/v1/payment_history?paid_at=gte.${today}T00:00:00&paid_at=lt.${today}T24:00:00&select=amount`,
        { headers }
      );
      return rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    } catch (e) { console.error('getTodayPaidTotal:', e); return 0; }
  },
  async getOutstandingTotal() {
    try {
      const rows = await fetchJSON(
        `${SUPABASE_URL}/rest/v1/payment_records?balance=gt.0&select=balance`,
        { headers }
      );
      return rows.reduce((s, r) => s + Number(r.balance || 0), 0);
    } catch (e) { console.error('getOutstandingTotal:', e); return 0; }
  },
  async getOverdueRecords(limit = 10) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      return await fetchJSON(
        `${SUPABASE_URL}/rest/v1/payment_records?due_date=lt.${today}&balance=gt.0&order=due_date.asc&limit=${limit}`,
        { headers }
      );
    } catch (e) { console.error('getOverdueRecords:', e); return []; }
  },
  async getRecentPayments(limit = 10) {
    try {
      return await fetchJSON(
        `${SUPABASE_URL}/rest/v1/payment_history?order=paid_at.desc&limit=${limit}`,
        { headers }
      );
    } catch (e) { console.error('getRecentPayments:', e); return []; }
  },

  // ===== 앱 설정 (회사 정보) =====
  async getAppSettings() {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/app_settings?id=eq.1`, { headers });
      return r[0] || null;
    } catch (e) { console.error('getAppSettings:', e); return null; }
  },
  async updateAppSettings(patch) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/app_settings?id=eq.1`, {
        method: 'PATCH', headers: headersWithReturn,
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      });
      return r[0] || null;
    } catch (e) { console.error('updateAppSettings:', e); return null; }
  },
  async nextInvoiceNumber() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/next_invoice_number`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify({}),
      });
      if (!r.ok) return null;
      const text = await r.text();
      return text.replace(/^"|"$/g, '');
    } catch (e) { console.error('nextInvoiceNumber:', e); return null; }
  },

  // ===== 주문 → 결제 레코드 동기화 =====
  async syncOrdersToPaymentRecords() {
    try {
      const [orders, customers, existingRecords] = await Promise.all([
        this.getOrders(),
        this.getCustomers(),
        this.getPaymentRecords({}),
      ]);

      const existingOrderIds = new Set(existingRecords.map((r) => r.order_id).filter(Boolean));
      const customerByName = new Map();
      const customerByPhone = new Map();
      for (const c of customers) {
        if (c.name) customerByName.set(c.name.trim(), c);
        if (c.phone) customerByPhone.set(c.phone.trim(), c);
      }

      const toInsert = [];
      let skippedNoCustomer = 0;
      let skippedAlreadySynced = 0;

      for (const o of orders) {
        if (existingOrderIds.has(o.id)) { skippedAlreadySynced++; continue; }

        const name = (o.customer_name || '').trim();
        const phone = (o.customer_phone || '').trim();
        let cust = null;
        if (name) cust = customerByName.get(name);
        if (!cust && phone) cust = customerByPhone.get(phone);
        if (!cust) { skippedNoCustomer++; continue; }

        const total = Number(o.total || 0) - Number(o.total_returned || 0);
        if (total <= 0) continue;

        toInsert.push({
          order_id: o.id,
          customer_id: cust.id,
          total_amount: total,
          invoice_date: (o.created_at || '').slice(0, 10) || null,
          memo: o.memo || null,
        });
      }

      // 배치 INSERT (500건씩)
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500);
        const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records`, {
          method: 'POST', headers: headersWithReturn, body: JSON.stringify(batch),
        });
        inserted += (result?.length || 0);
      }

      return { total: orders.length, inserted, skippedAlreadySynced, skippedNoCustomer };
    } catch (e) { console.error('syncOrdersToPaymentRecords:', e); throw e; }
  },

  // ===== 저장된 장바구니 → 결제 레코드 동기화 =====
  async syncSavedCartsToPaymentRecords() {
    try {
      const [carts, customers, existingRecords] = await Promise.all([
        this.getSavedCarts().then((r) => r || []),
        this.getCustomers(),
        this.getPaymentRecords({}),
      ]);

      const existingCartKeys = new Set(
        existingRecords.map((r) => r.order_id).filter((id) => id && String(id).startsWith('CART-'))
      );

      const byName = new Map();
      const byPhone = new Map();
      for (const c of customers) {
        if (c.name) byName.set(c.name.trim(), c);
        if (c.phone) byPhone.set(c.phone.trim(), c);
      }

      const toInsert = [];
      let skippedNoCustomer = 0;
      let skippedAlreadySynced = 0;

      for (const cart of carts) {
        const cartKey = `CART-${cart.id}`;
        if (existingCartKeys.has(cartKey)) { skippedAlreadySynced++; continue; }

        const name = (cart.name || '').trim();
        const phone = (cart.phone || '').trim();
        let cust = null;
        if (name) cust = byName.get(name);
        if (!cust && phone) cust = byPhone.get(phone);
        if (!cust) { skippedNoCustomer++; continue; }

        const total = Number(cart.total || 0);
        if (total <= 0) continue;

        const supply = Math.round(total / 1.1);
        toInsert.push({
          order_id: cartKey,
          customer_id: cust.id,
          total_amount: total,
          supply_amount: supply,
          vat_amount: total - supply,
          is_vat_exempt: false,
          category: 'sales',
          invoice_date: cart.date || (cart.created_at || '').slice(0, 10) || null,
          due_date: cart.delivery_date || null,
          memo: cart.memo ? `[예약] ${cart.memo}` : '[예약 장바구니]',
        });
      }

      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500);
        const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records`, {
          method: 'POST', headers: headersWithReturn, body: JSON.stringify(batch),
        });
        inserted += (result?.length || 0);
      }

      return { total: carts.length, inserted, skippedAlreadySynced, skippedNoCustomer };
    } catch (e) { console.error('syncSavedCartsToPaymentRecords:', e); throw e; }
  },

  async syncAllToPaymentRecords() {
    const orderResult = await this.syncOrdersToPaymentRecords();
    const cartResult = await this.syncSavedCartsToPaymentRecords();
    return {
      orders: orderResult,
      carts: cartResult,
      totalInserted: orderResult.inserted + cartResult.inserted,
    };
  },

  // ===== 수동 완불 체크 (멀티 기기 동기화) =====
  async getManualPaidAll() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/manual_paid_orders`, { headers });
    } catch (e) { console.error('getManualPaidAll:', e); return []; }
  },
  async upsertManualPaid(orderId, method) {
    if (!orderId || !method) return null;
    try {
      const now = new Date().toISOString();
      const payload = {
        order_id: String(orderId),
        method,
        paid_at: now,
        updated_at: now,
        updated_by_device: (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '').slice(0, 200),
      };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/manual_paid_orders`, {
        method: 'POST',
        headers: {
          ...headersWithReturn,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const body = await r.text(); throw new Error(`upsertManualPaid ${r.status}: ${body}`); }
      const data = await r.json();
      return Array.isArray(data) ? (data[0] || null) : data;
    } catch (e) { console.error('upsertManualPaid:', e); return null; }
  },
  async deleteManualPaid(orderId) {
    if (!orderId) return false;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/manual_paid_orders?order_id=eq.${encodeURIComponent(String(orderId))}`,
        { method: 'DELETE', headers: headersNoContent }
      );
      return r.ok;
    } catch (e) { console.error('deleteManualPaid:', e); return false; }
  },

  // ===== 편의 래퍼 =====
  async saveProduct(product) {
    if (product.id) return await this.updateProduct(product.id, product);
    return await this.addProduct(product);
  },
  async saveCustomer(customer) {
    if (customer.id) return await this.updateCustomer(customer.id, customer);
    return await this.addCustomer(customer);
  },
};
