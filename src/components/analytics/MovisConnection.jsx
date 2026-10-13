import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, X } from 'lucide-react';
import { movisRequest, getMovisModel, setMovisModel } from '@/lib/codexAnalyst';
import { usageWindows } from '@/lib/movisUsage';
import { selectMovisModel } from '@/lib/movisModels';
export default function MovisConnection({onChange,busy}) {
 const dialogRef=useRef(null), pending=useRef(false), mounted=useRef(true);
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[open,setOpen]=useState(false),[checking,setChecking]=useState(false),[model,setModel]=useState(getMovisModel),[loginUrl,setLoginUrl]=useState(''),[updated,setUpdated]=useState(null),[loggingIn,setLoggingIn]=useState(false);
 const refresh=useCallback(async()=>{
  if(pending.current)return;pending.current=true;setChecking(true);
  try {const s=await movisRequest('status');if(!mounted.current)return;setStatus(s);setUpdated(new Date());setError('');onChange?.(s);}
  catch(e){if(mounted.current){setError(e.message);onChange?.(null);}}
  finally{pending.current=false;if(mounted.current)setChecking(false);}
 },[onChange]);
 useEffect(()=>{mounted.current=true;refresh();const t=setInterval(()=>{if(!document.hidden)refresh()},10000);const visible=()=>{if(!document.hidden)refresh()};document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);return()=>{mounted.current=false;clearInterval(t);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible)}},[refresh]);
 useEffect(()=>{if(!busy)refresh()},[busy,refresh]);
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement;dialogRef.current?.querySelector('button')?.focus();
  const key=e=>{if(e.key==='Escape')setOpen(false);if(e.key==='Tab'){const ns=[...dialogRef.current.querySelectorAll('button:not(:disabled),select:not(:disabled),a[href]')];const a=ns[0],b=ns.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();b?.focus()}else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()};
 },[open]);
 const limits=usageWindows(status?.rateLimits),connected=status?.connected&&!error;
 const recommended=selectMovisModel(status?.models);
 const select=<label className="movis-model-select"><span>GPT 모델</span><select aria-label="GPT 모델 선택" value={model} disabled={busy||!connected||!status?.models?.length} onChange={e=>{setModel(e.target.value);setMovisModel(e.target.value)}}>
 <option value="auto">자동 선택{recommended?` · ${recommended.displayName||recommended.model}`:''}</option>
 {model!=='auto'&&!status?.models?.some(m=>m.model===model)&&<option value={model}>{model}</option>}
 {status?.models?.map(m=><option key={m.model} value={m.model}>{m.displayName||m.model}</option>)}
 </select></label>;
 const gauges=<div className="movis-live-gauges">{limits.length?limits.map(w=><div key={w.id} className={`movis-live-gauge ${w.used>=90?'is-high':''}`} title={`${w.bucket} · ${w.resetsAt?'초기화 '+new Date(w.resetsAt*1000).toLocaleString('ko-KR'):'초기화 시각 미제공'}`}>
 <div><span>{w.bucket} · {w.label}</span><strong>{w.used===null?'확인 불가':`${w.used}% 사용`}</strong></div>
 {w.used!==null&&<progress aria-label={`${w.bucket} ${w.label} 사용률`} max="100" value={w.used}/>}
 <small>{w.remaining===null?'사용량 정보 미제공':`${w.remaining}% 남음`}{error?' · 갱신 실패': ''}</small>
 </div>):<span className="movis-fineprint">{checking?'사용량 확인 중…':'사용량 정보 미제공'}</span>}</div>;
 return <>

 <div className="movis-live-control">{select}<div className="movis-plan-card"><span>구독 플랜</span><strong>{connected?`ChatGPT ${status.plan||'확인 중'}`:'연결 대기'}</strong></div>{gauges}<div className="movis-live-actions"><button className={`movis-link ${connected?'is-connected':''}`} onClick={()=>setOpen(true)} aria-label="Codex 연결 설정"><span className="movis-status-dot"/><span>{connected?'연결됨':'연결 확인'}</span><Link2 size={13}/></button><button onClick={refresh} disabled={checking} aria-label="사용량 새로고침"><RefreshCw size={14}/></button><small>{error?'갱신 실패 · 연결 확인':updated?`${updated.toLocaleTimeString('ko-KR',{hour12:false})} · 10초 자동 갱신`:'연결 확인 중'}</small></div></div>
 {open&&<div className="movis-modal-backdrop" onClick={()=>setOpen(false)}><section ref={dialogRef} className="movis-settings" role="dialog" aria-modal="true" aria-label="Codex 연결 설정" onClick={e=>e.stopPropagation()}><div className="movis-settings-title"><div><small>ENGINE CONNECTION</small><h2>GPT 연결 · 설치</h2></div><button onClick={()=>setOpen(false)} aria-label="닫기"><X size={20}/></button></div><div className="movis-install-options"><strong>원하는 방식으로 연결하세요</strong><p>이미 설치했다면 연결 새로고침, 처음 사용하는 Windows PC라면 설치 파일을 선택하세요. 설치와 로그인은 직접 선택할 때만 진행됩니다.</p><a href="https://github.com/aijunny0604-alt/pos-calculator-web/releases/download/movis-windows-2026.10.13/MOVIS-Intelligence.zip" target="_blank" rel="noreferrer">Windows 설치 파일 다운로드 ↗</a><details><summary>설치 방법 · 다른 PC에서 사용하기</summary><ol><li>Node.js LTS와 Codex 데스크톱 앱을 준비합니다.</li><li>ZIP 전체를 풀고 Install-MOVIS.cmd를 실행합니다.</li><li>Windows 시작 시 자동 연결은 설치 중 선택할 수 있습니다. 기본값은 사용 안 함입니다.</li><li>MOVE POS를 열고 본인의 ChatGPT 계정으로 연결합니다.</li></ol><p>모바일에서 각자 구독을 연결하는 기능은 아직 준비 중입니다. 현재 설치 파일은 Windows 전용입니다.</p></details></div><p>요금제는 로그인한 계정에서 자동 확인합니다. 자동 선택은 계정의 권장 기본 모델을 사용하며, 원하면 상단에서 직접 모델을 선택할 수 있습니다. 응답 중에는 모델 변경이 잠깐 잠깁니다. 모델을 변경하면 새 엔진 대화에 최근 문맥을 전달합니다.</p><p>사용률은 계정 전체의 구독 한도입니다. 모델별 대응 정보가 없는 한도를 임의로 연결하지 않습니다. 10초마다 조회하고, 응답 완료와 화면 복귀 때 즉시 갱신합니다.</p>{error&&<p role="alert" className="movis-error-text">{error}</p>}{status?.needsLogin&&!error&&<p role="status" className="movis-error-text">PC 연결은 정상입니다. 무비스용 ChatGPT 인증이 필요합니다. 아래 로그인 버튼으로 연결을 완료해주세요.</p>}{error&&<p><a href="http://127.0.0.1:43127/pos-calculator-web/" target="_blank" rel="noreferrer">PC용 무비스 열기 →</a></p>}{gauges}<p className="movis-fineprint">{status?.plan?`계정 요금제: ${status.plan} · `:''}API 키 과금으로 자동 전환하지 않습니다.</p><div className="movis-settings-actions"><button onClick={refresh} disabled={checking}><RefreshCw size={15}/> 연결 새로고침</button>{!connected&&<button disabled={busy||loggingIn} onClick={async()=>{
 setLoggingIn(true);setError('');
 const popup=window.open('about:blank','_blank');
 if(popup)popup.opener=null;
 try{
  const s=await movisRequest('login',{});
  const url=new URL(s.authUrl);
  if(url.protocol!=='https:'||url.hostname!=='auth.openai.com')throw new Error('인증 주소를 확인하지 못했습니다. 다시 시도해주세요.');
  setLoginUrl(url.href);
  if(popup)popup.location.replace(url.href);
 }catch(e){popup?.close();setError(e.message)}finally{setLoggingIn(false)}
}}>{loggingIn?'로그인 창 준비 중…':'ChatGPT 로그인'}</button>}</div>{loginUrl&&<a href={loginUrl} target="_blank" rel="noreferrer">로그인 창 열기 → 완료 후 연결 새로고침</a>}</section></div>}
 </>;
}
