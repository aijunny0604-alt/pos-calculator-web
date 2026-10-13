export function validateCoreData(orders, products, customers, carts) {
  if (![orders, products, customers, carts].every(Array.isArray)) {
    throw new Error('주문·상품·거래처·장바구니 자료를 모두 받지 못했습니다.');
  }
}

// A read timeout is safe to retry. Never retry or time out writes here:
// a disconnected write can already have committed on the server.
export async function fetchPosJSON(url, options = {}, fetcher = fetch) {
  const isRead = !options.method || options.method.toUpperCase() === 'GET';
  const controller = isRead && !options.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const response = await fetcher(url, controller ? { ...options, signal: controller.signal } : options);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API error: ${response.status} - ${body}`);
    }
    return await response.json();
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
