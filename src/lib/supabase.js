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
