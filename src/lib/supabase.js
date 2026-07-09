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

// 마이그레이션 006(제품 메모/색상/초기금액/단가이력) 컬럼 미적용 대비 — 컬럼없음 에러 감지 + 필드 제거
const PRODUCT_006_RE = /PGRST204|column .* does not exist|could not find/i;
const PRODUCT_006_FIELDS = ['note', 'flag_color', 'initial_wholesale', 'initial_retail', 'initial_set_at', 'price_history'];
function stripProduct006(product) {
  const out = { ...product };
  for (const f of PRODUCT_006_FIELDS) delete out[f];
  return out;
}

// ===== 주문 감사 로그 (order_audit_log) — 혹시 모를 사고 대비, 누가·언제·뭘 바꿨는지 =====
// 단일 매장 앱이라 "누가"는 기기 식별자(localStorage). 마이그007 미적용/실패해도 주문 흐름은 절대 막지 않음(조용히 무시).
function getAuditActor() {
  try {
    let name = localStorage.getItem('pos_device_name');
    if (name) return name;
    let id = localStorage.getItem('pos_device_id');
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2, 8); localStorage.setItem('pos_device_id', id); }
    return id;
  } catch { return 'pos-web'; }
}
// 두 주문 객체의 바뀐 필드만 추출 → { field: { from, to } }
function diffOrderFields(before, after) {
  const changes = {};
  const keys = new Set([...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === 'created_at' || k === 'id') continue;
    const a = before ? before[k] : undefined;
    const b = after[k];
    const norm = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    if (norm(a) !== norm(b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}
async function postAudit(entry) {
  // fire-and-forget — 주문 작업 지연/실패에 영향 X
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/order_audit_log`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        order_id: entry.orderId ?? null,
        action: entry.action,
        changes: entry.changes ?? null,
        actor: entry.actor ?? getAuditActor(),
        source: entry.source ?? null,
      }),
    });
  } catch { /* 테이블 미생성 등 — 무시 */ }
}

// Supabase API
export const supabase = {
  // 주문 변경 이력 조회 (최신순) — 특정 주문 또는 전체
  async getOrderAuditLog(orderId, limit = 100) {
    try {
      const q = orderId ? `order_id=eq.${encodeURIComponent(orderId)}&` : '';
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/order_audit_log?${q}order=created_at.desc&limit=${limit}`, { headers });
    } catch (e) { return []; }
  },
  logOrderAudit: postAudit,
  // ===== 주문 =====
  async getOrders() {
    try {
      return await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`, { headers });
    } catch (e) { console.error('getOrders:', e); return null; }
  },
  // 단건 주문 조회 — CustomerDetailModal에서 payment_record.order_id가 캐시에 없을 때 호출.
  // 이전엔 미정의 상태로 호출 → 런타임 크래시 위험. 2026-05-11 code-review Critical #1 fix.
  async getOrderById(orderId) {
    if (!orderId) return null;
    try {
      const result = await fetchJSON(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&limit=1`,
        { headers }
      );
      return Array.isArray(result) && result.length > 0 ? result[0] : null;
    } catch (e) { console.error('getOrderById:', e); return null; }
  },
  async saveOrder(order) {
    const _audit = (res) => {
      const row = Array.isArray(res) ? res[0] : res;
      if (row?.id) postAudit({ orderId: row.id, action: 'create', changes: { 거래처: order.customer_name, 금액: order.total ?? order.total_amount, 품목수: (order.items || []).length } });
    };
    try {
      const res = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(order)
      });
      _audit(res); return res;
    } catch (e) {
      // customer_address 컬럼 없을 경우 재시도
      try {
        const { customer_address, ...rest } = order;
        const res = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders`, {
          method: 'POST', headers: headersWithReturn, body: JSON.stringify(rest)
        });
        _audit(res); return res;
      } catch (e) { console.error('saveOrder:', e); return null; }
    }
  },
  async updateOrder(id, order) {
    try {
      // 감사 로그용 변경 전 스냅샷 (PATCH에 포함된 필드만 비교)
      let before = null;
      try {
        const sel = Object.keys(order).filter((k) => k !== 'id').join(',');
        const rows = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=${sel || '*'}&limit=1`, { headers });
        before = Array.isArray(rows) ? rows[0] : rows;
      } catch { /* 조회 실패해도 PATCH는 진행 */ }
      const result = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(order)
      });
      const changes = diffOrderFields(before, order);
      if (Object.keys(changes).length > 0) postAudit({ orderId: id, action: 'update', changes, source: order.__auditSource });
      return result.length > 0 ? result : true;
    } catch (e) { console.error('updateOrder:', e); return null; }
  },
  async deleteOrder(id) {
    try {
      // 삭제 전 전체 스냅샷 보존 (복구 단서)
      let snapshot = null;
      try {
        const rows = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&limit=1`, { headers });
        snapshot = Array.isArray(rows) ? rows[0] : rows;
      } catch {}
      const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      if (r.ok) postAudit({ orderId: id, action: 'delete', changes: { snapshot } });
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
    // 신규 등록 시 초기 설정 금액 기준선 기록 (마이그레이션 006). 단가 변경 모니터링 기준점.
    const enriched = {
      ...product,
      initial_wholesale: product.initial_wholesale ?? (product.wholesale ?? null),
      initial_retail: product.initial_retail ?? (product.retail ?? null),
      initial_set_at: new Date().toISOString(),
      price_history: product.price_history ?? [],
    };
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products`, {
        method: 'POST', headers: headersWithReturn, body: JSON.stringify(enriched)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      // 마이그레이션 006 미적용(컬럼 없음) → 006 필드 제거하고 재시도 (편집 무중단)
      if (PRODUCT_006_RE.test(String(e?.message || ''))) {
        try {
          const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products`, {
            method: 'POST', headers: headersWithReturn, body: JSON.stringify(stripProduct006(product))
          });
          return Array.isArray(data) ? data[0] : data;
        } catch (e2) { console.error('addProduct(fallback):', e2); return null; }
      }
      console.error('addProduct:', e); return null;
    }
  },
  async updateProduct(id, product) {
    // 단가(도매/소매) 변경 시 price_history에 기록 + 초기금액 미설정이면 백필
    let payload = { ...product };
    try {
      const hasPriceField = product.wholesale !== undefined || product.retail !== undefined;
      if (hasPriceField) {
        const rows = await fetchJSON(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=wholesale,retail,price_history,initial_wholesale,initial_retail`, { headers });
        const old = Array.isArray(rows) ? rows[0] : rows;
        if (old) {
          const now = new Date().toISOString();
          const entries = [];
          if (product.wholesale !== undefined && Number(product.wholesale) !== Number(old.wholesale ?? 0)) {
            entries.push({ field: 'wholesale', old: Number(old.wholesale ?? 0), new: Number(product.wholesale), at: now });
          }
          if (product.retail !== undefined && Number(product.retail) !== Number(old.retail ?? 0)) {
            entries.push({ field: 'retail', old: Number(old.retail ?? 0), new: Number(product.retail), at: now });
          }
          if (entries.length > 0) {
            const prevHist = Array.isArray(old.price_history) ? old.price_history : [];
            payload.price_history = [...prevHist, ...entries].slice(-50); // 최근 50건 유지
          }
          // 초기금액 미설정 제품이면 변경 직전 값으로 기준선 백필
          if (old.initial_wholesale == null && old.wholesale != null) payload.initial_wholesale = Number(old.wholesale);
          if (old.initial_retail == null && old.retail != null) payload.initial_retail = Number(old.retail);
        }
      }
    } catch (e) { /* 조회 실패해도 본 업데이트는 진행 */ console.warn('updateProduct price-history skip:', e?.message); }
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      // 마이그레이션 006 미적용 → 006 필드 제거 후 재시도 (편집 무중단)
      if (PRODUCT_006_RE.test(String(e?.message || ''))) {
        try {
          const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
            method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(stripProduct006(product))
          });
          return Array.isArray(data) ? data[0] : data;
        } catch (e2) { console.error('updateProduct(fallback):', e2); return null; }
      }
      console.error('updateProduct:', e); return null;
    }
  },
  async deleteProduct(id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, { method: 'DELETE', headers: headersNoContent });
      return r.ok;
    } catch (e) { console.error('deleteProduct:', e); return false; }
  },

  // ===== 🧠 pgvector 의미 검색 (제품) =====
  async updateProductEmbedding(id, embedding) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn,
        body: JSON.stringify({ embedding, embedding_updated_at: new Date().toISOString() }),
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('updateProductEmbedding:', e); return null; }
  },
  async getProductsWithoutEmbedding() {
    try {
      // embedding_updated_at이 NULL이거나 updated_at보다 오래된 제품
      return await fetchJSON(
        `${SUPABASE_URL}/rest/v1/products?embedding_updated_at=is.null&select=id,name,category&limit=5000`,
        { headers }
      );
    } catch (e) { console.error('getProductsWithoutEmbedding:', e); return []; }
  },
  async searchProductsByVector(queryEmbedding, { threshold = 0.5, limit = 10 } = {}) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/rpc/search_products_by_vector`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_limit: limit,
        }),
      });
      return Array.isArray(data) ? data : [];
    } catch (e) { console.error('searchProductsByVector:', e); return []; }
  },
  async updateCustomerEmbedding(id, embedding) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn,
        body: JSON.stringify({ embedding, embedding_updated_at: new Date().toISOString() }),
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (e) { console.error('updateCustomerEmbedding:', e); return null; }
  },
  async getCustomersWithoutEmbedding() {
    try {
      return await fetchJSON(
        `${SUPABASE_URL}/rest/v1/customers?embedding_updated_at=is.null&select=id,name,address&limit=5000`,
        { headers }
      );
    } catch (e) { console.error('getCustomersWithoutEmbedding:', e); return []; }
  },
  async searchCustomersByVector(queryEmbedding, { threshold = 0.5, limit = 10 } = {}) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/rpc/search_customers_by_vector`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_limit: limit,
        }),
      });
      return Array.isArray(data) ? data : [];
    } catch (e) { console.error('searchCustomersByVector:', e); return []; }
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
  // 사업자등록증 URL/경로 저장 (business_cert_url, business_cert_path 컬럼). 컬럼 미존재 시 needsMigration=true
  async setCustomerCert(id, url, path) {
    try {
      const data = await fetchJSON(`${SUPABASE_URL}/rest/v1/customers?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn,
        body: JSON.stringify({ business_cert_url: url ?? null, business_cert_path: path ?? null }),
      });
      return { ok: true, data: Array.isArray(data) ? data[0] : data };
    } catch (e) {
      const msg = String(e?.message || e);
      if (/business_cert|PGRST204|42703|column .* does not exist|schema cache/i.test(msg)) {
        return { ok: false, needsMigration: true, error: msg };
      }
      console.error('setCustomerCert:', e);
      return { ok: false, error: msg };
    }
  },
  // 상호(거래처명) 변경 시 과거 이력 이전 — orders/saved_carts/customer_returns의 customer_name을 새 이름으로 일괄 PATCH.
  // ⚠️ 주문·이력이 customer_name '텍스트'로 연결돼 있어서, 이걸 안 하면 이름 변경 즉시 과거 주문이 거래처에서 끊긴다.
  // payment_records는 customer_id(UUID) 연결이라 이름 변경 무관. 반환: { orders, carts, returns } 이전 건수.
  async renameCustomerCascade(oldName, newName) {
    const out = { orders: 0, carts: 0, returns: 0 };
    const from = String(oldName || '').trim();
    const to = String(newName || '').trim();
    if (!from || !to || from === to) return out;
    const enc = encodeURIComponent(from);
    const patch = async (table, col) => {
      try {
        const rows = await fetchJSON(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${enc}`, {
          method: 'PATCH', headers: headersWithReturn, body: JSON.stringify({ [col]: to })
        });
        return Array.isArray(rows) ? rows.length : 0;
      } catch (e) { console.error(`renameCascade ${table}:`, e); return 0; }
    };
    out.orders = await patch('orders', 'customer_name');
    out.carts = await patch('saved_carts', 'name'); // ⚠️ saved_carts는 거래처명이 name 컬럼
    out.returns = await patch('customer_returns', 'customer_name');
    return out;
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
  // sandbox 호환 별칭 (pos-payments 파일 이식 시 호환 유지)
  async getSettings() { return this.getAppSettings(); },
  async updateSettings(patch) { return this.updateAppSettings(patch); },
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

  // ===== 단일 주문 → payment_records + payment_history 동기화 =====
  // 완불 체크 (수동) 시 호출. 거래처 관리/명세서/미수 통계 일관성 확보.
  // 반환: { success, reason?, record? } — 호출부에서 결과 검사 가능
  // customersHint: 호출부가 이미 customers 배열을 보유한 경우 전달하면 추가 fetch 회피 (M1)
  async syncOrderPaidRecord(orderId, methodKey, orderHint = null, customersHint = null) {
    if (!orderId || !methodKey) return { success: false, reason: 'invalid_args' };
    try {
      // 1. 해당 주문 정보 확보 (orderHint가 없으면 fetch)
      let order = orderHint;
      if (!order) {
        const list = await fetchJSON(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(String(orderId))}`, { headers });
        order = (list && list[0]) || null;
      }
      if (!order) return { success: false, reason: 'no_order' };
      const total = Number(order.total || 0) - Number(order.total_returned || 0);
      if (total <= 0) return { success: false, reason: 'zero_total' };

      // 2. 거래처 매핑 (이름/전화번호) — 호출부 캐시 우선 사용
      const customers = (Array.isArray(customersHint) && customersHint.length > 0)
        ? customersHint
        : await this.getCustomers();
      const name = (order.customer_name || order.customerName || '').trim();
      const phone = (order.customer_phone || order.customerPhone || '').trim();
      const cust = (customers || []).find((c) =>
        (name && c.name && c.name.trim() === name) || (phone && c.phone && c.phone.trim() === phone)
      );
      if (!cust) return { success: false, reason: 'no_customer', customerName: name, customerPhone: phone };

      // 3. payment_records 있는지 확인
      const existing = await this.getPaymentRecords({ orderId });
      let record = (existing && existing[0]) || null;

      const supply = Math.round(total / 1.1);
      const recordPayload = {
        order_id: orderId,
        customer_id: cust.id,
        total_amount: total,
        supply_amount: supply,
        vat_amount: total - supply,
        is_vat_exempt: false,
        category: 'sales',
        invoice_date: (order.created_at || '').slice(0, 10) || null,
        memo: order.memo || null,
        // balance, payment_status는 generated columns (DB 자동 계산). 직접 INSERT/UPDATE 금지
        paid_amount: 0,
      };
      if (!record) {
        const created = await this.addPaymentRecord(recordPayload);
        record = Array.isArray(created) ? created[0] : created;
        if (!record) return { success: false, reason: 'create_failed' };
      }

      // 4. 자동 입금 history (memo로 식별)
      const methodLabel = ({ card: '카드', cash: '현금', transfer: '계좌이체', other: '기타' }[methodKey] || methodKey);
      const remaining = Math.max(0, Number(record.balance ?? total) - 0);
      if (remaining > 0) {
        await this.addPaymentHistory({
          payment_record_id: record.id,
          amount: remaining,
          method: methodKey,
          paid_at: new Date().toISOString(),
          memo: `[자동] 완불체크 (${methodLabel})`,
        });
        // payment_records 갱신 — balance/payment_status는 generated columns이라 paid_amount만 갱신
        const newPaid = Number(record.paid_amount || 0) + remaining;
        await this.updatePaymentRecord(record.id, {
          paid_amount: newPaid,
        });
      }
      return { success: true, record };
    } catch (e) {
      console.error('syncOrderPaidRecord:', e);
      return { success: false, reason: 'exception', error: e?.message || String(e) };
    }
  },

  // 자동 완불체크 history만 회수 (다른 입금은 보존)
  async revokeAutoPaidHistory(orderId) {
    if (!orderId) return false;
    try {
      const records = await this.getPaymentRecords({ orderId });
      const record = (records && records[0]) || null;
      if (!record) return false;
      const histories = await this.getPaymentHistory({ recordId: record.id });
      const autoEntries = (histories || []).filter((h) => (h.memo || '').startsWith('[자동] 완불체크'));
      let revokedAmount = 0;
      for (const h of autoEntries) {
        await this.deletePaymentHistory(h.id);
        revokedAmount += Number(h.amount || 0);
      }
      if (revokedAmount > 0) {
        const newPaid = Math.max(0, Number(record.paid_amount || 0) - revokedAmount);
        await this.updatePaymentRecord(record.id, {
          paid_amount: newPaid,
        });
        // M-NEW: 자동 history 회수 후, payment_record가 빈 껍데기(다른 입금 0건 + paid 0)이면 record 자체 삭제
        if (newPaid === 0) {
          const remaining = await this.getPaymentHistory({ recordId: record.id });
          if ((remaining || []).length === 0) {
            await this.deletePaymentRecord(record.id);
          }
        }
      }
      return true;
    } catch (e) {
      console.error('revokeAutoPaidHistory:', e);
      return false;
    }
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

  // ===== 외부 마켓플레이스 주문 (네이버 스마트스토어 등) =====
  // select 옵션 — 배지 카운트 등 가벼운 용도는 필요한 컬럼만 받아 raw_payload(큰 JSONB) 전송 회피.
  async getExternalOrders({ provider, status, limit = 100, select } = {}) {
    try {
      let url = `${SUPABASE_URL}/rest/v1/external_orders?order=received_at.desc&limit=${limit}`;
      if (select) url += `&select=${select}`;
      if (provider) url += `&provider=eq.${provider}`;
      if (status) url += `&order_status=eq.${status}`;
      return await fetchJSON(url, { headers });
    } catch (e) { console.error('getExternalOrders:', e); return []; }
  },
  // 네이버 스토어(엠파츠) 상품 카탈로그 — sync.js가 채운 external_products (MOVIS 검색용)
  async getExternalProducts({ limit = 5000 } = {}) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/external_products?select=channel_product_no,name,status_type,sale_price,seller_management_code,category_name,options,option_count,product_url&order=name.asc&limit=${limit}`;
      return await fetchJSON(url, { headers });
    } catch (e) { console.error('getExternalProducts:', e); return []; }
  },
  async getExternalOrderItems(externalOrderId) {
    try {
      return await fetchJSON(
        `${SUPABASE_URL}/rest/v1/external_order_items?external_order_id=eq.${externalOrderId}&order=created_at.asc`,
        { headers }
      );
    } catch (e) { console.error('getExternalOrderItems:', e); return []; }
  },
  // 여러 주문의 items를 한 번에 — N+1 제거(주문마다 따로 요청하던 것 → 단일 in.() 쿼리). 반환: { [external_order_id]: items[] }
  async getExternalOrderItemsByOrders(orderIds) {
    const ids = (orderIds || []).filter(Boolean);
    if (ids.length === 0) return {};
    const map = {};
    try {
      // URL 길이 한도 대비 100개씩 청크 (49건 규모면 1번이지만 안전하게)
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const rows = await fetchJSON(
          `${SUPABASE_URL}/rest/v1/external_order_items?external_order_id=in.(${chunk.map(encodeURIComponent).join(',')})&order=created_at.asc`,
          { headers }
        );
        for (const r of (rows || [])) {
          (map[r.external_order_id] ||= []).push(r);
        }
      }
      return map;
    } catch (e) { console.error('getExternalOrderItemsByOrders:', e); return map; }
  },
  // provider_order_id 로 외부주문 단건 조회 (택배 송장 페이지 → 네이버 발송 연동용)
  async getExternalOrderByProviderOrderId(providerOrderId) {
    try {
      const rows = await fetchJSON(
        `${SUPABASE_URL}/rest/v1/external_orders?provider_order_id=eq.${encodeURIComponent(providerOrderId)}&limit=1`,
        { headers }
      );
      return Array.isArray(rows) ? (rows[0] || null) : (rows || null);
    } catch (e) { console.error('getExternalOrderByProviderOrderId:', e); return null; }
  },
  async updateExternalOrder(id, patch) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/external_orders?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(patch),
      });
      return Array.isArray(r) ? r[0] : r;
    } catch (e) { console.error('updateExternalOrder:', e); return null; }
  },
  async updateExternalOrderItem(id, patch) {
    try {
      const r = await fetchJSON(`${SUPABASE_URL}/rest/v1/external_order_items?id=eq.${id}`, {
        method: 'PATCH', headers: headersWithReturn, body: JSON.stringify(patch),
      });
      return Array.isArray(r) ? r[0] : r;
    } catch (e) { console.error('updateExternalOrderItem:', e); return null; }
  },
  async deleteExternalOrder(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/external_orders?id=eq.${id}`, {
        method: 'DELETE', headers: headersNoContent,
      });
      return true;
    } catch (e) { console.error('deleteExternalOrder:', e); return false; }
  },
};
