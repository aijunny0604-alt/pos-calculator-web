const groups = [[['getTopCustomers', 'getCustomerTrend', 'getCustomerSegments', 'getDormantCustomers', 'getCustomerLifetimeValue', 'getCollectionPlan'], ['orders', 'customers', 'paymentRecords']], [['getTopProducts', 'getProductTrend', 'getRepeatPurchaseGap', 'getCustomerProductAffinity', 'getNextBestOffers', 'getProductBundleSuggestions', 'getRevenueVolatility', 'getCompositeSummary', 'getDailyClose', 'detectAnomalies'], ['orders', 'products', 'customers']], [['getProductInfo', 'searchProducts', 'getPriceHistory', 'getLowStockProducts', 'getStockSummary', 'getProductsByStockStatus', 'getDeadStock', 'simulatePriceChange'], ['products']], [['getRestockRecommendations', 'getStockCoverageForecast', 'simulateRestock', 'getMarginLeakage'], ['products', 'orders']], [['getPurchaseStatus'], ['purchaseOrders']], [['getSupplierPrices'], ['supplierPrices']], [['getCustomerInfo', 'searchCustomers'], ['customers']], [['searchOrders'], ['orders']], [['searchNaverCatalog'], ['externalProducts']], [['getSmartstoreOrders'], ['externalOrders']], [['getPaymentSummary', 'getOverdueCustomers'], ['paymentRecords', 'customers']], [['getPaymentInflow'], ['paymentHistory']], [['getReturnAnalysis'], ['customerReturns']], [['getPendingCarts'], ['savedCarts']], [['getLearningStats'], ['aiLearningData']]];
export function checkToolData(name, context) {
  const required = groups.find(([names]) => names.includes(name))?.[1] || [];
  const failed = required.filter(key => context.dataState?.[key]?.status === 'error');
  return failed.length ? {
    ok: false,
    error: `필요한 자료 조회 실패: ${failed.join(', ')}. 빈 자료/0원으로 해석하지 말고 접근 상태를 알려주세요.`
  } : null;
}
