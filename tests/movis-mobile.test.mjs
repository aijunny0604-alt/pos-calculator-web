import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
test('모바일 연결: 일회용 페어링, 허용 경로, Origin 차단 및 기기 철회',async()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'movis-gateway-test-'));
 const backend=http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify(q.url.endsWith('session')?{token:'local-secret'}:{connected:q.headers.authorization==='Bearer local-secret'}))});
 await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
 const port=43139;const base=`http://127.0.0.1:${port}/api/movis`;
 const child=spawn(process.execPath,['bridge/mobile-gateway.mjs'],{env:{...process.env,MOVIS_MOBILE_ORIGIN:'https://mobile.example.test',MOVIS_MOBILE_PORT:String(port),MOVIS_MOBILE_RUNTIME:temp,MOVIS_UPSTREAM:`http://127.0.0.1:${backend.address().port}`},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('gateway timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('exit',()=>{clearTimeout(timer);reject(Error('gateway exited'))})});
 assert.equal((await fetch(base+'/status')).status,401);
 assert.equal((await fetch(base+'/status',{headers:{Origin:'https://evil.test'}})).status,403);
 const link=readFileSync(path.join(temp,'mobile-pairing.txt'),'utf8').match(/movis-link=(\S+)/)[1];
 const {key}=JSON.parse(Buffer.from(link,'base64url'));
 const pair=()=>fetch(base+'/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
 const response=await pair();assert.equal(response.status,200);const {token}=await response.json();assert.equal((await pair()).status,401);
 const headers={Authorization:'Bearer '+token};assert.equal((await fetch(base+'/status',{headers}).then(r=>r.json())).connected,true);
 assert.equal((await fetch(base+'/session',{headers})).status,404);assert.equal((await fetch(base+'/login',{method:'POST',headers})).status,404);
 assert.equal((await fetch(base+'/disconnect',{method:'POST',headers})).status,200);assert.equal((await fetch(base+'/status',{headers})).status,401);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>backend.close(resolve));rmSync(temp,{recursive:true,force:true})}
});
