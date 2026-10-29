// 제품 주문 화면 전용: 쓰기 도구의 자동 상품 매칭과 분리한다.
const initial = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const normalize = s => String(s || '').normalize('NFC').toLowerCase().replace(/[０-９Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248));
const parts = s => normalize(s).match(/[가-힣ㄱ-ㅎa-z]+|\d+(?:\.\d+)?/g) || [];
const initials = s => [...s].map(c=>c>='가'&&c<='힣'?initial[Math.floor((c.charCodeAt(0)-44032)/588)]:c).join('');
export function catalogMatch(query, name) {
 const q=parts(query), p=parts(name), compact=p.join('');
 if(!q.length) return false;
 const nums=p.filter(t=>/^\d/.test(t)).map(Number);
 return q.every(t=>{
  if(/^\d/.test(t)) return nums.includes(Number(t));
  if(/^[ㄱ-ㅎ]+$/.test(t)) return initials(compact).includes(t);
  if(compact.includes(t)) return true;
  // 띄어쓰기 없는 역순 입력도 제품명 단어로 분리 가능한 경우 허용한다.
  const words=p.filter(w=>/^[가-힣a-z]+$/.test(w)&&w.length>=2);
  const reach=new Set([0]);
  for(let i=0;i<t.length;i++) if(reach.has(i)) for(const w of words) if(t.startsWith(w,i)) reach.add(i+w.length);
  return reach.has(t.length);
 });
}
export function catalogDimensionsMatch(query,name) {
 const q=parts(query).filter(t=>/^\d/.test(t)).map(Number);
 const p=parts(name).filter(t=>/^\d/.test(t)).map(Number);
 return q.every(n=>p.includes(n));
}
// 검색 후보 안내 전용. 제품명과 함께 입력한 첫 구경만 ±1 허용한다.
// 길이·각도·SKU와 소수 규격에는 보정을 적용하지 않는다.
export function catalogNearbyDiameterMatch(query, name) {
 const qText=normalize(query), pText=normalize(name);
 if (/[a-z]\d/i.test(qText)) return false;
 const letters=qText.replace(/\d+(?:\.\d+)?/g,'').replace(/(?:mm|파이|cm|인치|inch|도)/gi,'').replace(/[^가-힣ㄱ-ㅎa-z]/g,'');
 if(letters.length<2) return false;
 const q=parts(query).filter(t=>/^\d/.test(t)).map(Number);
 if(q.length===1 && /(?:길이|각도|도수)\s*\d/i.test(qText)) return false;
 const p=parts(name).filter(t=>/^\d/.test(t)).map(Number).filter(n=>n>=20 && n<=200);
 if(!q.length || !p.length || !Number.isInteger(p[0])) return false;
 return q.some((n,index)=>Number.isInteger(n) && Math.abs(n-p[0])===1 &&
   q.every((other,i)=>i===index || p.slice(1).includes(other)));
}
export function repeatOrderItems(order, products) {
 const missing=[],items=[];
 for(const item of order.items || []) {
  const product=products.find(p=>String(p.id)===String(item.id ?? item.product_id));
  const quantity=Number(item.quantity);
  if(!product || !Number.isSafeInteger(quantity)||quantity<1) {missing.push(item.name || '미확인 상품');continue;}
  items.push({...product,quantity});
 }
 return {items,missing};
}
