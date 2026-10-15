import { toDateKST } from './utils.js';
export const MATCH_WINDOW_DAYS = 7;
export function statementNumber(value) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).normalize('NFKC').replace(/[,₩\s]/g, '').replace(/원$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text); return Number.isFinite(number) ? number : null;
}
const text = s => String(s ?? '').normalize('NFKC').toLowerCase().trim();
function tokens(s) {
  return (text(s).replace(/스테인리스|스테인레스|스텐레스|stainless|\bsts\b/g,'스텐')
    .replace(/(\d)(?:mm|파이|도)(?=\s|$|[^a-z가-힣])/g,'$1')
    .match(/[가-힣a-z]+|\d+(?:\.\d+)?/g) || []).map(t => /^\d/.test(t) ? String(Number(t)) : t);
}
export function sameProduct(a,b) {
  const left=tokens(a), right=tokens(b);
  if(!left.length || !right.length || !left.some(t=>!/^\d/.test(t))) return false;
  // 숫자의 순서와 개수는 규격의 일부다. 54-30과 30-54를 임의로 동일시하지 않는다.
  const numbers = ts => ts.filter(t=>/^\d/.test(t)).join('|');
  if(numbers(left)!==numbers(right)) return false;
  const words = ts => ts.filter(t=>!/^\d/.test(t));
  const l=words(left),r=words(right);
  return l.join('')===r.join('') || l.slice().sort().join('|')===r.slice().sort().join('|');
}
function sameCustomer(a,b) {
  const parts=s=>text(s).replace(/[()[\]·]/g,' ').split(/\s+/).filter(Boolean);
  const l=parts(a),r=parts(b);
  return l.length>0&&r.length>0&&(l.join('')===r.join('')||l.sort().join('|')===r.sort().join('|'));
}
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=5;
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function normalizeStatement(p) {
  const date=String(p.issue_date||'').trim().replace(/[./]/g,'-');
  const items=(Array.isArray(p.items)?p.items:[]).filter(it=>it&&typeof it==='object').map(it=>({
    name:String(it.name||'').trim(),spec:it.spec?String(it.spec).trim():null,
    qty:statementNumber(it.qty),unit_price:statementNumber(it.unit_price),supply:statementNumber(it.supply),tax:statementNumber(it.tax),
    note:it.note?String(it.note).trim():null,uncertain:it.uncertain===true||it.uncertain==='true',
  }));
  const issues=[];
  if(!String(p.customer||'').trim()) issues.push('거래처 미판독');
  if(!validDate(date)) issues.push('발행일 확인 필요');
  if(!items.length) issues.push('품목이 판독되지 않았습니다');
  const total=statementNumber(p.stated_total);
  if(total===null) issues.push('명세서 합계 미판독');
  for(const it of items) if(!it.name||it.qty===null||it.qty<=0||it.supply===null||it.tax===null||it.uncertain) issues.push(`${it.name||'미판독 품목'}: 원본 확인 필요`);
  const linesTotal=items.reduce((s,it)=>s+(it.supply??0)+(it.tax??0),0);
  if(total!==null&&!near(linesTotal,total)) issues.push('판독한 품목 합계와 명세서 합계가 다릅니다');
  return {customer:String(p.customer||'').trim(),issue_date:validDate(date)?date:null,stated_total:total,items,issues:[...new Set(issues)]};
}
function uniqueSubset(items, qty, total) {
  // 같은 제품만 들어온 후보를 수량과 금액 모두로 검증. 후보가 너무 많으면 추정하지 않는다.
  if(items.length>16) return null;
  const found=[];
  function visit(start,acc,q,s) {
    if(acc.length>=2&&q===qty&&near(s,total)) found.push(acc);
    if(acc.length===4||found.length>1) return;
    for(let i=start;i<items.length;i++) visit(i+1,[...acc,items[i]],q+items[i].qty,s+items[i].total);
  }
  visit(0,[],0,0);return found.length===1?found[0]:null;
}
export function reconcile(input,orders=[],windowDays=MATCH_WINDOW_DAYS) {
  const stmt=normalizeStatement(input),target=stmt.issue_date;
  const issues=[...stmt.issues];
  const available=orders.filter(o=>!['cancelled','canceled','취소'].includes(o.status));
  const byCust=available.filter(o=>sameCustomer(stmt.customer,o.customerName));
  const inWindow=o=>target&&Math.abs(Date.parse(toDateKST(o.createdAt))-Date.parse(target))/86400000<=windowDays;
  let matchedOrders=target?byCust.filter(o=>toDateKST(o.createdAt)===target):[];
  let dateFuzzy=false,matchBy='customer',candidateOrders=[];
  if(!matchedOrders.length&&target){
    candidateOrders=byCust.filter(inWindow);
    if(new Set(candidateOrders.map(o=>toDateKST(o.createdAt))).size===1){matchedOrders=candidateOrders;dateFuzzy=true;issues.push('발행일과 주문일이 달라 주문 확인이 필요합니다');}
    else if(candidateOrders.length) issues.push('여러 날짜의 주문 후보가 있습니다. 자동으로 합치지 않았습니다');
  }
  if(!matchedOrders.length&&!candidateOrders.length&&target&&stmt.stated_total>0){
    candidateOrders=available.filter(o=>inWindow(o)&&near(statementNumber(o.totalAmount),stmt.stated_total));
    if(candidateOrders.length===1){matchedOrders=candidateOrders;matchBy='amount';dateFuzzy=true;issues.push('거래처가 일치하지 않는 금액 후보입니다. 거래처를 확인하세요');}
    else if(candidateOrders.length) issues.push('같은 금액의 주문 후보가 여러 건입니다. 자동으로 합치지 않았습니다');
  }
  const posLines=matchedOrders.flatMap(o=>(o.items||[]).map(it=>({name:it.name||'',qty:statementNumber(it.quantity),total:(statementNumber(it.price??it.discountedPrice??it.wholesale)??NaN)*(statementNumber(it.quantity)??NaN),orderId:o.id,used:false})));
  if(posLines.some(p=>!Number.isFinite(p.total)||!(p.qty>0))) issues.push('주문 품목의 금액 또는 수량을 확인하세요');
  if(matchedOrders.some(o=>(o.totalReturned||0)>0||(o.returns||[]).length)) issues.push('반품 내역이 있는 주문입니다. 원본 명세서와 반품 기준을 확인하세요');
  const posTotal=matchedOrders.reduce((s,o)=>s+(statementNumber(o.totalAmount)??0),0);
  if(matchedOrders.length&&!near(posLines.reduce((s,p)=>s+p.total,0),posTotal)) issues.push('주문 품목 합계와 주문 총액이 다릅니다. 전체 할인·부대비용을 확인하세요');
  const stmtRows=stmt.items.map(it=>{
    const name=[it.name,it.spec].filter(Boolean).join(' '),total=it.supply===null||it.tax===null?NaN:it.supply+it.tax;
    return {name:it.name,spec:it.spec,qty:it.qty,lineTotal:total,identity:name,matched:false,combo:false,refs:[],uncertain:it.uncertain,reason:''};
  });
  for(const row of stmtRows){
    const same=posLines.filter(p=>!p.used&&sameProduct(row.identity,p.name));
    const eligible=!row.uncertain&&row.qty>0&&Number.isFinite(row.lineTotal);
    const hits=eligible?same.filter(p=>p.qty===row.qty&&near(row.lineTotal,p.total)):[];
    // 동일한 제품·수량·금액이 반복된 경우에만 한 줄씩 소비한다.
    const hit=hits[0];
    if(hit){hit.used=true;row.matched=true;row.refs=[{name:hit.name,qty:hit.qty}];continue;}
    const combo=eligible?uniqueSubset(same,row.qty,row.lineTotal):null;
    if(combo){combo.forEach(p=>p.used=true);row.matched=true;row.combo=true;row.refs=combo.map(p=>({name:p.name,qty:p.qty}));continue;}
    row.reason=row.uncertain?'판독 불확실':!eligible?'수량·금액 판독 확인':same.length?'제품명 일치 · 수량/금액 확인':'제품명·규격 확인';
    row.refs=same.slice(0,3).map(p=>({name:p.name,qty:p.qty}));
  }
  const posOnly=posLines.filter(p=>!p.used);
  return {matchedOrders,candidateOrders,matchedDates:[...new Set(matchedOrders.map(o=>toDateKST(o.createdAt)))],matchedCustomers:[...new Set(matchedOrders.map(o=>o.customerName))],dateFuzzy,matchBy,custFound:byCust.length,posTotal,totalDiff:stmt.stated_total===null?NaN:stmt.stated_total-posTotal,totalOk:near(stmt.stated_total,posTotal),stmtRows,posOnly,issues:[...new Set(issues)],missingCount:stmtRows.filter(r=>!r.matched).length};
}
export function statusOf(rec) {
  if(!rec) return '확인필요';
  if(!rec.matchedOrders.length) return rec.candidateOrders?.length?'확인필요':'주문내역없음';
  if(rec.issues?.length) return '확인필요';
  if(rec.totalOk&&rec.missingCount===0&&rec.posOnly.length===0) return '일치';
  return rec.totalOk?'합계일치':'확인필요';
}
