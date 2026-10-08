import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, X, ShieldCheck } from 'lucide-react';
import { movisRequest, getMovisModel, setMovisModel } from '@/lib/codexAnalyst';
export default function MovisConnection({
  onChange,
  busy
}) {
  const dialogRef = useRef(null);
  const [status, setStatus] = useState(null),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [checking, setChecking] = useState(false),
    [model, setModel] = useState(getMovisModel),
    [loginUrl, setLoginUrl] = useState('');
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const s = await movisRequest('status');
      setStatus(s);
      setError('');
      onChange?.(s);
    } catch (e) {
      setError(e.message);
      setStatus(null);
      onChange?.(null);
    } finally {
      setChecking(false);
    }
  }, [onChange]);
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!document.hidden && !busy) refresh();
    }, 60000);
    return () => clearInterval(t);
  }, [refresh, busy]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const first = dialogRef.current?.querySelector('button');
    first?.focus();
    const key = e => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        const nodes = [...dialogRef.current.querySelectorAll('button:not(:disabled),select:not(:disabled),a[href]')];
        const a = nodes[0],
          b = nodes.at(-1);
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b?.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [open]);
  const login = async () => {
    try {
      const s = await movisRequest('login', {});
      setLoginUrl(s.authUrl || '');
    } catch (e) {
      setError(e.message);
    }
  };
  const limits = status?.rateLimits?.rateLimitsByLimitId || (status?.rateLimits?.rateLimits ? {
    main: status.rateLimits.rateLimits
  } : {});
  return <>
    <button className={`movis-link ${status?.connected ? 'is-connected' : ''}`} onClick={() => setOpen(true)} aria-label="Codex 연결 설정"><span className="movis-status-dot" /><span>{status?.connected ? 'CODEX 연결' : 'PC 연결 확인'}</span><Link2 size={13} /></button>
    {open && <div className="movis-modal-backdrop" onClick={() => setOpen(false)}><section ref={dialogRef} className="movis-settings" role="dialog" aria-modal="true" aria-label="Codex 연결 설정" onClick={e => e.stopPropagation()}>
      <div className="movis-settings-title"><div><small>ENGINE CONNECTION</small><h2>무비스의 지능을 연결하세요</h2></div><button onClick={() => setOpen(false)} aria-label="닫기"><X size={20} /></button></div>
      <p>매장 PC에서 실행되는 Codex와 연결합니다. ChatGPT 구독 한도를 사용하며, 유료 API로 자동 전환하지 않습니다.</p>
      <div className="movis-connection-state"><ShieldCheck size={19} /><span>{status?.connected ? `계정 연결됨 · ${status.plan || 'ChatGPT'}` : checking ? '연결 확인 중…' : 'PC 연결 또는 로그인이 필요합니다'}</span></div>
      {error && <p role="alert" className="movis-error-text">{error}</p>}
      <label className="movis-field">판단 모델<select value={model} disabled={busy || !status?.models?.length} onChange={e => {
            setModel(e.target.value);
            setMovisModel(e.target.value);
          }}>
        {!status?.models?.length && <option value={model}>{model}</option>}
        {status?.models?.map(m => <option key={m.model} value={m.model}>{m.displayName || m.model}</option>)}
      </select></label>
      <p className="movis-fineprint">모델을 바꾸면 새로운 엔진 대화로 시작합니다. 화면의 이전 대화는 배경 자료로 전달됩니다. 선택 모델의 실제 사용 가능 여부는 요청 실행 시 확인됩니다.</p>
      {Object.entries(limits).map(([key, bucket]) => <div key={key} className="movis-usage"><small>{key}</small>{['primary', 'secondary'].map(k => bucket?.[k] && <div key={k}><span>{bucket[k].windowDurationMins === 10080 ? '주간' : '사용 한도'} · {typeof bucket[k].usedPercent === 'number' ? `${Math.max(0, 100 - bucket[k].usedPercent)}% 남음` : '확인 불가'}</span>{typeof bucket[k].usedPercent === 'number' && <progress max="100" value={Math.max(0, 100 - bucket[k].usedPercent)} />}</div>)}</div>)}
      {!Object.keys(limits).length && <p className="movis-fineprint">남은 사용량: 아직 확인되지 않음</p>}
      <div className="movis-settings-actions"><button onClick={refresh} disabled={checking || busy}><RefreshCw size={15} /> 연결 새로고침</button>{!status?.connected && <button onClick={login} disabled={busy}>ChatGPT 로그인</button>}</div>
      {loginUrl && <a href={loginUrl} target="_blank" rel="noreferrer" className="movis-login-link">로그인 창 열기 → 완료 후 연결 새로고침</a>}
    </section></div>}
  </>;
}
