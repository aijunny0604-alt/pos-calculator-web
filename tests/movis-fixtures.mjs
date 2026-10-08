export const fixture = {
  products: [{
    id: 1,
    name: '스텐 밴딩 54-30',
    category: '밴딩',
    stock: 4,
    wholesale: 10000,
    retail: 15000
  }, {
    id: 2,
    name: '스텐 밴딩 54-45',
    category: '밴딩',
    stock: 20,
    wholesale: 12000,
    retail: 18000
  }],
  customers: [{
    id: 1,
    name: '검증모터스',
    phone: '010-0000-0000'
  }],
  orders: [{
    id: 101,
    customerName: '검증모터스',
    customer_name: '검증모터스',
    date: new Date().toISOString().slice(0, 10),
    total: 30000,
    items: [{
      id: 1,
      name: '스텐 밴딩 54-30',
      quantity: 3,
      price: 10000
    }]
  }],
  purchaseOrders: [{
    id: 21,
    supplier: 'JSR',
    order_date: '2026-10-07',
    items: [{
      spec: '스텐 밴딩 54-30',
      qty: 10,
      received_qty: 0,
      unit_price: 6000
    }]
  }],
  supplierPrices: [{
    id: 1,
    supplier: 'JSR',
    spec: '스텐 밴딩 54-30',
    unit_price: 6000,
    quoted_at: '2026-10-01'
  }],
  savedCarts: [],
  aiLearningData: [],
  paymentRecords: [],
  paymentHistory: [],
  customerReturns: [],
  externalOrders: [],
  externalProducts: [],
  businessCerts: [],
  purchaseDocs: [],
  defectReturns: [],
  supplierLedger: [],
  statementReconLogs: [],
  orderAuditLog: [],
  orderPacking: [],
  manualPaidOrders: [],
  externalOrderItems: [],
  appSettings: [],
  storageFiles: []
};
fixture.dataState = Object.fromEntries(Object.keys(fixture).map(k => [k, {
  status: 'loaded',
  coverage: 'complete',
  rows: fixture[k].length,
  fetchedAt: new Date().toISOString()
}]));
