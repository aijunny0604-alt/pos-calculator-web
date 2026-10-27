// 실상품을 변경하지 않는 연결 진단. 상품명·인증 정보는 출력하지 않는다.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
const url = source.match(/SUPABASE_URL = '([^']+)'/)[1], key = source.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const request = await fetch(`${url}/rest/v1/external_products?select=channel_product_no,origin_product_no,status_type&origin_product_no=not.is.null&option_count=gt.0&status_type=eq.SALE&limit=3`, { headers: { apikey:key, Authorization:`Bearer ${key}` } });
if (!request.ok) throw new Error(`상품 연결 정보 조회 실패 ${request.status}`);
const rows = await request.json();
if (!rows.length) throw new Error('실시간 조회를 점검할 옵션 상품이 없습니다.');
const child = spawn(process.execPath, ['bridge/store-care.mjs'], { env: { ...process.env, MOVIS_CARE_PORT:'43129' }, stdio:'ignore', windowsHide:true });
try {
 await new Promise(resolve => setTimeout(resolve, 1500));
 const headers = { Origin:'https://aijunny0604-alt.github.io' };
 const session = await fetch('http://127.0.0.1:43129/session', {headers}).then(r=>r.json());
 let ok=0, compatible=0; const failures=[];
 for (const row of rows) {
  const params = new URLSearchParams({channel:String(row.channel_product_no),origin:String(row.origin_product_no)});
  const response = await fetch(`http://127.0.0.1:43129/product-snapshot?${params}`, {headers:{...headers,Authorization:`Bearer ${session.token}`}});
  const result=await response.json();
  if(response.ok && Array.isArray(result.options)) { ok++; compatible += result.options.filter(o => /^\d{1,15}$/.test(o.id) && Number.isInteger(o.stock) && typeof o.usable==='boolean' && (o.type!=='combination' || Number.isInteger(o.price))).length; } else failures.push(`${row.status_type}: ${result.error||`HTTP ${response.status}`}`);
 }
 console.log(JSON.stringify({tested:rows.length,success:ok,compatibleOptions:compatible,failures}));
 if(ok!==rows.length) process.exitCode=1;
} finally { child.kill(); }
