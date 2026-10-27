import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
test('실시간 확인 후에만 1회 적용되고 같은 확인 요청은 재사용할 수 없다',async()=>{
 const child=spawn(process.execPath,['--import','./tests/store-product-mock-fetch.mjs','bridge/store-care.mjs'],{env:{...process.env,MOVIS_CARE_PORT:'43130',NAVER_CLIENT_ID:'sample',NAVER_CLIENT_SECRET:'$2a$10$abcdefghijklmnopqrstuu'},stdio:'ignore',windowsHide:true});
 try {
  const base='http://127.0.0.1:43130',origin='https://aijunny0604-alt.github.io';let session;
  for(let i=0;i<40;i++){try{session=await fetch(`${base}/session`,{headers:{Origin:origin}});break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(session?.ok);const {token}=await session.json();
  const headers={Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const snapshot=await fetch(`${base}/product-snapshot?channel=10&origin=20`,{headers}).then(r=>r.json());
  const input={channel:'10',origin:'20',fingerprint:JSON.stringify(snapshot),change:{kind:'option',optionId:'30',optionType:'combination',stock:5}};
  const prepare=await fetch(`${base}/product-change/prepare`,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(prepare.status,200);const {preview}=await prepare.json();
  const submit=()=>fetch(`${base}/product-change/confirm`,{method:'POST',headers,body:JSON.stringify({preview})});
  const done=await submit();assert.equal(done.status,200);assert.equal((await done.json()).snapshot.options[0].stock,5);
  assert.equal((await submit()).status,409);
  const stale=await fetch(`${base}/product-change/prepare`,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(stale.status,409);
  const unauth=await fetch(`${base}/product-snapshot?channel=10&origin=20`,{headers:{Origin:origin}});assert.equal(unauth.status,401);
 }finally{child.kill();}
});
