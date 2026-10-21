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

// PostgREST 기본 응답 상한으로 오래된 거래/입금이 조용히 빠지지 않게 페이지를 끝까지 읽는다.
export async function fetchPosRows(url, options = {}, fetcher = fetch) {
  const parsed = new URL(url);
  const requestedLimit = Number(parsed.searchParams.get('limit')) || Infinity;
  let offset = Number(parsed.searchParams.get('offset')) || 0;
  const rows = [];
  while (rows.length < requestedLimit) {
    const size = Math.min(500, requestedLimit - rows.length);
    parsed.searchParams.set('limit', String(size));
    parsed.searchParams.set('offset', String(offset));
    let total = null;
    const page = await fetchPosJSON(parsed.toString(), options, async (...args) => {
      const response = await fetcher(...args);
      const suffix = response.headers.get('content-range')?.split('/')[1];
      if (suffix && suffix !== '*') total = Number(suffix);
      return response;
    });
    if (!Array.isArray(page)) throw new Error('거래 자료 응답 형식이 올바르지 않습니다.');
    if (!page.length) {
      if (total != null && offset < total) throw new Error('거래 자료 일부를 받지 못했습니다. 다시 조회해주세요.');
      break;
    }
    rows.push(...page); offset += page.length;
    if (total != null ? offset >= total : page.length < size) break;
  }
  return rows;
}
