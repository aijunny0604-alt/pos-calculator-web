import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.MOVIS_MOBILE_RUNTIME||path.join(root,'.movis-runtime');mkdirSync(runtime,{recursive:true});
const configFile=path.join(runtime,'mobile-config.json');
const config=existsSync(configFile)?JSON.parse(readFileSync(configFile,'utf8')):{};
const publicUrl=process.env.MOVIS_MOBILE_ORIGIN||config.origin;
if(!publicUrl||new URL(publicUrl).protocol!=='https:'||new URL(publicUrl).origin!==publicUrl)throw Error('mobile-config.json에 고정 HTTPS origin을 먼저 설정하세요.');
const port=Number(process.env.MOVIS_MOBILE_PORT||43128);
const upstream=process.env.MOVIS_UPSTREAM||'http://127.0.0.1:43127';
const devicesFile=path.join(runtime,'mobile-devices.json');
const devices=existsSync(devicesFile)?JSON.parse(readFileSync(devicesFile,'utf8')):[];
const digest=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const pair=randomBytes(32).toString('base64url');let pairHash=digest(pair),expires=Date.now()+10*60_000;
const pairData=Buffer.from(JSON.stringify({origin:publicUrl,key:pair})).toString('base64url');
writeFileSync(path.join(runtime,'mobile-pairing.txt'),`모바일에서 10분 이내 한 번만 여세요. 타인에게 공유하지 마세요.\nhttps://aijunny0604-alt.github.io/pos-calculator-web/#movis-link=${pairData}\n`);
const save=()=>writeFileSync(devicesFile,JSON.stringify(devices));
const json=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const allowed=new Set(['https://aijunny0604-alt.github.io',publicUrl]);
const routes=new Map([['/api/movis/status','GET'],['/api/movis/turn','POST'],['/api/movis/tool','POST'],['/api/movis/cancel','POST']]);
export const server=http.createServer(async(req,res)=>{
 try{
  const origin=req.headers.origin;
  if(origin&&!allowed.has(origin))return json(res,403,{error:'허용되지 않은 사이트입니다.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end()}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/movis/pair'&&req.method==='POST'){
   let data='';for await(const c of req){data+=c;if(data.length>2048)return json(res,413,{error:'요청 크기 초과'})}
   const b=JSON.parse(data);
   if(Date.now()>expires||!pairHash||typeof b.key!=='string'||!equal(digest(b.key),pairHash))return json(res,401,{error:'연결 코드가 만료되었거나 사용되었습니다. 매장 PC에서 새 연결 코드를 생성하세요.'});
   const token=randomBytes(32).toString('base64url');devices.push({id:randomBytes(8).toString('hex'),hash:digest(token),createdAt:Date.now(),expiresAt:Date.now()+30*86400_000});save();pairHash=null;
   return json(res,200,{token,expiresAt:devices.at(-1).expiresAt});
  }
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  const device=devices.find(d=>d.expiresAt>Date.now()&&equal(d.hash,digest(token)));
  if(!token||!device)return json(res,401,{error:'모바일 기기 연결이 필요합니다. 매장 PC의 연결 링크를 사용하세요.'});
  if(url.pathname==='/api/movis/disconnect'&&req.method==='POST'){devices.splice(devices.indexOf(device),1);save();return json(res,200,{ok:true})}
  if(routes.get(url.pathname)!==req.method)return json(res,404,{error:'모바일에서 지원하지 않는 경로입니다.'});
  let body; if(req.method==='POST'){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>8_000_000)return json(res,413,{error:'요청 크기 초과'});chunks.push(c)}body=Buffer.concat(chunks)}
  const session=await fetch(upstream+'/api/movis/session',{headers:{'X-Movis-Client':'pos'},signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  const abort=new AbortController();res.on('close',()=>abort.abort());
  const response=await fetch(upstream+url.pathname,{method:req.method,headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body,signal:abort.signal});
  res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store','X-Accel-Buffering':'no'});
  for await(const chunk of response.body){if(res.destroyed)break;if(!res.write(chunk))await new Promise(resolve=>{res.once('drain',resolve);res.once('close',resolve)})}res.end();
 }catch(error){if(!res.headersSent)json(res,502,{error:'매장 PC 연결이 끊겼습니다. PC와 MOVIS 실행 상태를 확인하세요.'});else res.end()}
});
server.requestTimeout=60_000;
server.listen(port,'127.0.0.1',()=>console.log(`MOVIS 모바일 게이트웨이: 127.0.0.1:${port}. 연결 링크는 로컬 런타임 파일에 저장됨.`));
