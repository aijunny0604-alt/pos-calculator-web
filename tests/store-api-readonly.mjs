// 운영 조회만 수행한다. 인증 값과 주문·고객·금액은 출력하지 않는다.
const origin='https://aijunny0604-alt.github.io', base='http://127.0.0.1:43128';
const session=await fetch(`${base}/session`,{headers:{Origin:origin},signal:AbortSignal.timeout(5000)});
if(!session.ok)throw new Error(`매장 PC 연결 HTTP ${session.status}`);
const {token}=await session.json();
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const [year,month]=today.split('-').map(Number), end=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10), start=`${end.slice(0,7)}-01`;
const checks=[['문의','qnas?days=7&page=1','contents'],['일별 정산',`settlements?start=${start}&end=${end}&page=1`,'elements'],['건별 정산',`settlement-case?date=${end}&page=1`,'elements'],['수수료',`commission-details?date=${end}&page=1`,'elements'],['부가세',`vat-case?start=${start}&end=${end}&page=1`,'elements']];
let failure=false;
for(const [label,path,field] of checks){
 try {const response=await fetch(`${base}/${path}`,{headers:{Origin:origin,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const body=await response.json();const good=response.ok&&Array.isArray(body[field]);console.log(`${label}: ${good?'정상':`실패 HTTP ${response.status}`}`);if(!good)failure=true;}
 catch {console.log(`${label}: 연결 실패`);failure=true;}
}
if(failure)process.exitCode=1;
