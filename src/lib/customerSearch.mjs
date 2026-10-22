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
const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const searchText = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[\u1100-\u1112]/g, ch => initials[ch.charCodeAt(0) - 0x1100]);
const compact = value => searchText(value).replace(/[^\p{L}\p{N}]/gu, '');
const toInitials = text => text.replace(/[가-힣]/g, ch => initials[Math.floor((ch.charCodeAt(0) - 0xac00) / 588)]);

// 붙여 쓴 역순 검색도 단어 단위로 확인한다. 임의의 글자를 건너뛰는 유사 매칭은 하지 않는다.
function matchesWords(words, part) {
  if (words.some(word => word.includes(part))) return true;
  if (part.length < 4) return false;
  const reachable = new Set([0]);
  for (let start = 0; start < part.length; start++) {
    if (!reachable.has(start)) continue;
    for (let end = start + 2; end <= part.length; end++) {
      if (words.some(word => word.includes(part.slice(start, end)))) reachable.add(end);
    }
  }
  return reachable.has(part.length);
}

// 화면의 후보 검색 전용. 거래처 ID 연결·장부 집계·AI 자동 선택에는 사용하지 않는다.
export function customerMatches(customer, query) {
  const q = compact(query);
  if (!q) return true;
  if (!customer) return false;
  const fields = [customer.name, customer.address].map(searchText);
  const phones = [customer.phone, customer.customerPhone, customer.mobile].map(compact).filter(Boolean);
  // 전체 전화번호는 조각별로 맞추지 않아 숫자 순서가 다른 번호를 제외한다.
  if (/^\d+$/.test(q)) return phones.some(phone => phone.includes(q)) || fields.some(field => compact(field).includes(q));
  if (fields.some(field => compact(field).includes(q))) return true;
  const words = fields.flatMap(field => field.match(/[a-z]+|[가-힣]+|[ㄱ-ㅎ]+|[0-9]+/g) || []);
  const parts = searchText(query).replace(/(\d)[().-]+(?=\d)/g, '$1')
    .match(/[a-z]+|[가-힣]+|[ㄱ-ㅎ]+|[0-9]+/g) || [q];
  return parts.every(part => {
    if (/^[ㄱ-ㅎ]+$/.test(part)) return fields.some(field => toInitials(compact(field)).includes(part));
    if (/^\d+$/.test(part)) return phones.some(phone => phone.includes(part)) || words.some(word => word.includes(part));
    return matchesWords(words, part);
  });
}
export function orderProductMatches(order, query) {
  if (!clean(query)) return true;
  return (Array.isArray(order.items) ? order.items : []).some(item => flexibleSearch(item.name || item.product_name, query));
}
