const clean = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function partMatch(text, part) {
  if (text.includes(part)) return true;
  if (part.length < 3 || /\d/.test(part)) return false;
  let i = 0;
  for (const ch of text) if (ch === part[i]) { i++; if (i === part.length) return true; }
  return false;
}
export function flexibleSearch(text, query) {
  const normalized = clean(text), q = clean(query);
  if (!q) return true;
  if (normalized.includes(q)) return true;
  const parts = String(query).normalize('NFKC').toLowerCase().match(/[a-z]+|[가-힣]+|[ㄱ-ㅎ]+|[0-9]+/g) || [q];
  return parts.every(part => partMatch(normalized, part));
}
export function customerMatches(customer, query) {
  if (!clean(query)) return true;
  return flexibleSearch(`${customer.name || ''} ${customer.address || ''}`, query)
    || clean(customer.phone).includes(clean(query));
}
export function orderProductMatches(order, query) {
  if (!clean(query)) return true;
  return (Array.isArray(order.items) ? order.items : []).some(item => flexibleSearch(item.name || item.product_name, query));
}
