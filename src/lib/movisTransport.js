// 401은 브리지에서 업무 실행 전 거부된 요청이다. 이 경우에만 인증을 새로 얻어 한 번 재전송한다.
// 네트워크 오류/5xx/이미 시작된 스트림은 중복 업무 방지를 위해 자동 재시도하지 않는다.
export function createMovisTransport(fetcher = (...args) => fetch(...args)) {
  const endpoint='http://127.0.0.1:43127/api/movis';let token,loading;
  async function getToken(){
    if(token)return token;
    if(!loading)loading=(async()=>{const r=await fetcher(endpoint+'/session',{headers:{'X-Movis-Client':'pos'},signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('매장 PC 연결 프로그램을 확인해주세요.');const d=await r.json();if(!d.token)throw new Error('연결 인증을 받지 못했습니다.');return token=d.token})().finally(()=>{loading=null});
    return loading;
  }
  return async function request(route,body,signal){
    for(let attempt=0;attempt<2;attempt++){
      signal?.throwIfAborted();const used=await getToken();signal?.throwIfAborted();
      const r=await fetcher(`${endpoint}/${route}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${used}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
      if(r.status!==401||attempt===1)return r;
      await r.body?.cancel();if(token===used)token=null;
    }
  };
}
export const fetchMovis=createMovisTransport();
