import { supabaseClient } from './supabase';
export const TABLES = {
  products: 'products',
  customers: 'customers',
  orders: 'orders',
  savedCarts: 'saved_carts',
  aiLearningData: 'ai_learning',
  paymentRecords: 'payment_records',
  paymentHistory: 'payment_history',
  customerReturns: 'customer_returns',
  externalOrders: 'external_orders',
  externalProducts: 'external_products',
  purchaseOrders: 'purchase_orders',
  supplierPrices: 'supplier_prices',
  businessCerts: 'business_certs',
  purchaseDocs: 'purchase_docs',
  defectReturns: 'defect_returns',
  supplierLedger: 'supplier_ledger',
  statementReconLogs: 'statement_recon_logs',
  orderAuditLog: 'order_audit_log',
  orderPacking: 'order_packing',
  manualPaidOrders: 'manual_paid_orders',
  externalOrderItems: 'external_order_items',
  appSettings: 'app_settings'
};
export async function loadMovisLibraries(signal) {
  const data = {},
    dataState = {};
  await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
    try {
      const rows = [];
      let offset = 0,
        complete = false;
      while (offset < 50000) {
        const orderKey = key === 'externalProducts' ? 'channel_product_no' : ['orderPacking', 'manualPaidOrders'].includes(key) ? 'order_id' : 'id';
        const query = supabaseClient.from(table).select('*').order(orderKey, {
          ascending: true
        }).range(offset, offset + 499);
        const {
          data: page,
          error
        } = await query.abortSignal(signal);
        if (error) throw new Error(error.message);
        rows.push(...(page || []));
        if (!page?.length || page.length < 500) {
          complete = true;
          break;
        }
        offset += page.length;
      }
      data[key] = key === 'appSettings' ? rows.map(sanitizeSettings) : rows;
      dataState[key] = {
        status: 'loaded',
        rows: rows.length,
        coverage: complete ? 'complete' : 'partial',
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      if (signal?.aborted) throw new DOMException('중지됨', 'AbortError');
      data[key] = [];
      dataState[key] = {
        status: 'error',
        coverage: 'unavailable',
        error: error.message
      };
    }
  }));
  dataState.storageFiles = {
    status: 'on-demand',
    coverage: 'on-demand'
  };
  return {
    ...data,
    dataState
  };
}
function sanitizeSettings(value) {
  if (Array.isArray(value)) return value.map(sanitizeSettings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/api.?key|token|password|secret|credential|admin.?pin|auth/i.test(key)).map(([key, v]) => [key, sanitizeSettings(v)]));
}
export async function listMovisImages({
  prefix = '',
  offset = 0,
  query = ''
}, signal) {
  if (prefix.includes('..') || prefix.startsWith('/') || prefix.length > 500) return {
    ok: false,
    error: '올바른 POS 이미지 폴더를 지정하세요.'
  };
  if (signal?.aborted) throw new DOMException('중지됨', 'AbortError');
  const bucket = supabaseClient.storage.from('product-images');
  const {
    data,
    error
  } = await bucket.list(prefix, {
    limit: 50,
    offset,
    sortBy: {
      column: 'name',
      order: 'asc'
    },
    ...(query ? {
      search: query
    } : {})
  });
  if (error) return {
    ok: false,
    error: error.message
  };
  const records = (data || []).map(item => {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const folder = !item.id;
    const image = !folder && (/^image\//.test(item.metadata?.mimetype || '') || /\.(png|jpe?g|webp|gif)$/i.test(item.name));
    return {
      name: item.name,
      path,
      folder,
      size: item.metadata?.size || 0,
      ...(image ? {
        imageUrl: bucket.getPublicUrl(path).data.publicUrl
      } : {})
    };
  });
  return {
    ok: true,
    data: {
      library: 'storageFiles',
      prefix,
      records,
      nextOffset: records.length === 50 ? offset + 50 : null,
      coverage: 'folder-page'
    }
  };
}
