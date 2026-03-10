import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://icqxomltplewrhopafpq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YB9UnUwuMql8hUGHgC0bsg_DhrAxpji';

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
  if (!response.ok) throw new Error(`API error: ${response.status}`);
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
      } catch { console.error('saveOrder:', e); return null; }
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/customer_returns?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
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
      } catch { console.error('addSavedCart:', e); return null; }
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
      } catch { console.error('updateSavedCart:', e); return null; }
    }
  },
  async deleteSavedCart(id) {
    try {
      console.log('[supabase.deleteSavedCart] id:', id, 'type:', typeof id);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_carts?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      console.log('[supabase.deleteSavedCart] status:', r.status, 'ok:', r.ok);
      return r.ok;
    } catch (e) { console.error('deleteSavedCart:', e); return false; }
  },
  async deleteAllSavedCarts() {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_carts?id=gt.0`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteAllSavedCarts:', e); return false; }
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

export const ADMIN_PASSWORD = '1234';
