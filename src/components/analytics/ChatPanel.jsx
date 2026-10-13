import './movis-chat-motion.css';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip, Square, ArrowUpRight, Plus, ShieldCheck, Database, ScanLine, X, ChevronDown } from 'lucide-react';
import MovisCore from './MovisCore';
import MessageBubble from './MessageBubble';
import MovisMarkdown from './MovisMarkdown';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
const TASKS = [{
  label: '매장 브리핑',
  detail: '지금 확인해야 할 일',
  question: '현재 매장에서 먼저 챙겨야 할 일을 매출, 미수, 재고, 미입고 자료로 확인하고 근거와 함께 우선순위로 정리해줘.',
  icon: ScanLine
}, {
  label: '발주 판단',
  detail: '재고와 미입고 교차 확인',
  question: '재고가 부족한 품목 중 미입고 발주와 최근 판매 속도를 대조해서 실제로 추가 발주가 필요한 것을 찾아줘.',
  icon: Database
}, {
  label: '정산 점검',
  detail: '미수와 입금 기록 대조',
  question: '미수금과 입금 이력을 확인해서 먼저 정산해야 할 거래처와 확인이 필요한 항목을 정리해줘.',
  icon: ShieldCheck
}];
export default function ChatPanel({
  messages = [],
  onSend,
  isLoading,
  loadingStep,
  loadingSteps = [],
  onClear,
  onCancel,
  onSendImage,
  onCertRegister,
  customers = [],
  disabled,
  streamingText = '',
  connection,
  dataState = {},
  awaitingConfirmation
}) {
  const [text, setText] = useState(''),
    [clearConfirm, setClearConfirm] = useState(false),
    [showTrace, setShowTrace] = useState(false),
    [attached, setAttached] = useState(null),
    [preview, setPreview] = useState(''),
    [attachmentError, setAttachmentError] = useState(''),
    [dragging, setDragging] = useState(false),
    [reading, setReading] = useState(false);
  const dragDepth = useRef(0), sending = useRef(false);
  const messageKey = (m, i) => m.id || `${m.role}:${m.ts ?? i}`;
  const seenMessages = useRef(new Set(messages.map(messageKey)));
  useEffect(() => { messages.forEach((m, i) => seenMessages.current.add(messageKey(m, i))); }, [messages]);
  const input = useRef(null),
    scroll = useRef(null),
    file = useRef(null),
    follow = useRef(true);
  const populated = messages.length > 0,
    latest = messages.filter(m => m.verification).at(-1)?.verification;
  const libraries = Object.values(dataState),
    loaded = libraries.filter(s => s.status === 'loaded').length;
  const state = awaitingConfirmation ? 'review' : streamingText ? 'responding' : isLoading ? 'thinking' : 'standby';
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages.length, streamingText, loadingStep, isLoading]);
  useEffect(() => {
    if (!attached) { setPreview(''); return; }
    const url = URL.createObjectURL(attached);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attached]);
  const submit = async () => {
    if (disabled || isLoading || sending.current || !text.trim() && !attached) return;
    sending.current = true;
    setReading(true);
    setAttachmentError('');
    follow.current = true;
    const value = text.trim();
    try {
      if (attached) {
        const image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다시 첨부해주세요.'));
          reader.onabort = () => reject(new Error('이미지 읽기가 취소되었습니다.'));
          reader.readAsDataURL(attached);
        });
        onSend?.(value || '이 이미지의 내용을 정확히 읽고 POS 자료와 대조해 정리해줘. 불명확한 글자는 확인해줘. 변경은 내가 명시적으로 요청한 경우에만 미리보기를 만들어줘.', { image });
      } else onSend?.(value);
      setAttached(null);
      setText('');
      input.current?.focus();
    } catch (error) { setAttachmentError(error.message); }
    finally { sending.current = false; setReading(false); }
  };
  const attach = files => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (disabled || isLoading || sending.current) { setAttachmentError('현재 요청이 끝난 뒤 이미지를 첨부해주세요.'); return; }
    if (list.length > 1) { setAttachmentError('이미지는 한 번에 1장씩 첨부해주세요.'); return; }
    const f = list[0];
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) {
      setAttachmentError('5MB 이하의 JPG·PNG·WebP 이미지를 첨부해주세요.');
      return;
    }
    setAttachmentError('');
    setAttached(f);
  };
  const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
  return <div className={`movis-workspace ${populated ? 'has-conversation' : ''} ${dragging ? 'is-file-dragging' : ''} chat-state-${state}`} 
    onDragEnter={e => { if (hasFiles(e)) { e.preventDefault(); dragDepth.current++; setDragging(true); } }}
    onDragOver={e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = disabled || isLoading || reading ? 'none' : 'copy'; } }}
    onDragLeave={e => { if (hasFiles(e)) { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); } }}
    onDrop={e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDragging(false); attach(e.dataTransfer.files); }}
    onPaste={e => {
      const files = Array.from(e.clipboardData?.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
      if (!files.length) return; // 일반 텍스트 붙여넣기는 브라우저 기본 동작 유지
      e.preventDefault();
      attach(files);
      const pasted = e.clipboardData.getData('text/plain');
      if (pasted && e.target === input.current) {
        const start = input.current.selectionStart, end = input.current.selectionEnd;
        setText(current => (current.slice(0, start) + pasted + current.slice(end)).slice(0, 16000));
      }
    }}>
    {dragging && <div className="movis-drop-hint" role="status">여기에 이미지를 놓으세요 · JPG / PNG / WebP · 최대 5MB</div>}
    <div className="movis-workspace-top"><span><i /> OPERATIONS / INTELLIGENCE</span><button onClick={() => setClearConfirm(true)} disabled={isLoading || !populated}><Plus size={15} /> 새 대화</button></div>
    {!populated && <div className="movis-hero">
      <div className="movis-hero-copy"><span className="movis-eyebrow">YOUR OPERATIONAL INTELLIGENCE</span><h1>판단을 돕고.<br /> 일을 연결하다.</h1><p>매장의 모든 자료를 연결해<br /> 질문의 맥락부터 다음 행동까지.</p><div className="movis-hero-engine"><span className="movis-status-dot" />{connection?.connected ? 'CODEX · ACCOUNT LINKED' : 'LOCAL ENGINE · 연결 대기'}</div></div>
      <div className="movis-hero-core"><MovisCore state={state} /><div className="movis-core-caption"><span>MOVIS</span><small>INTELLIGENCE SYSTEM / 02</small></div></div>
      <div className="movis-hero-telemetry"><div className="movis-telemetry-heading">SYSTEM CAPABILITIES<span>01 — 03</span></div>
        <div className="movis-capability"><span>01</span><div><h3>Context aware</h3><p>대화의 맥락을 이어서 이해</p></div></div>
        <div className="movis-capability"><span>02</span><div><h3>Connected knowledge</h3><p>상품 · 주문 · 매입 · 이미지</p></div></div>
        <div className="movis-capability"><span>03</span><div><h3>Verified actions</h3><p>근거 점검 후 확인하고 실행</p></div></div>
        <div className="movis-telemetry-footer"><ShieldCheck size={14} /><span>변경 전 확인 · 구독 사용량 기반</span></div>
      </div>
    </div>}
    {populated && <div className="movis-session-strip"><MovisCore compact state={state} /><div><span>{awaitingConfirmation ? '실행 확인 대기' : streamingText ? '답변 작성 중' : isLoading ? 'MOVIS 작업 중' : '대화를 이어가세요'}</span><small>{isLoading ? loadingStep : '맥락을 유지하며 필요한 자료를 다시 확인합니다.'}</small></div><div className="movis-session-data"><Database size={13} />{loaded ? `${loaded}개 자료 연결` : '요청 시 자료 확인'}</div></div>}
    {!populated && <div className="movis-task-grid">{TASKS.map(({
        label,
        detail,
        question,
        icon: Icon
      }) => <button key={label} disabled={disabled || isLoading} onClick={() => onSend?.(question)}><div className="movis-task-top"><Icon size={18} /><ArrowUpRight size={16} /></div><strong>{label}</strong><span>{detail}</span></button>)}</div>}
    {populated && <div className="movis-conversation" ref={scroll} onScroll={() => {
      const el = scroll.current;
      follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }}>
      <div className="movis-conversation-inner">{messages.map((m, i) => <MessageBubble key={messageKey(m, i)} animateEntrance={!seenMessages.current.has(messageKey(m, i))} message={m} enableTypewriter={false} customers={customers} onCertRegister={onCertRegister} onFollowUpClick={q => !isLoading && !disabled && onSend?.(q)} userQuery={[...messages.slice(0, i)].reverse().find(x => x.role === 'user')?.content} />)}
      {isLoading && <div className={`movis-live-answer ${streamingText ? 'is-streaming' : 'is-thinking'}`} aria-busy="true"><div className="movis-live-header"><span className="movis-answer-orbit" aria-hidden="true" /> MOVIS <span className="movis-answer-phase" role="status">{streamingText ? '답변 작성 중' : '생각 정리 중'}</span><button onClick={() => setShowTrace(v => !v)}>{loadingStep}<ChevronDown size={13} /></button></div>{showTrace && <ol className="movis-trace">{loadingSteps.map(s => <li key={s.id} className={s.status}>{s.status === 'done' ? '✓' : '•'} {s.label}</li>)}</ol>}{streamingText ? <div className="movis-stream-content"><MovisMarkdown content={streamingText} /><span className="movis-stream-cursor" aria-hidden="true" /></div> : <div className="movis-thinking-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>}</div>}
      </div>
    </div>}
    <div className="movis-composer-wrap">
      {awaitingConfirmation && <div className="movis-confirm-hint">확인창에서 변경 내용을 적용하거나 취소하면 대화를 이어갈 수 있습니다.</div>}
      {attachmentError && <div className="movis-attachment-error" role="alert">{attachmentError}</div>}
      {attached && <div className="movis-attachment">{preview && <img src={preview} alt="첨부 이미지 미리보기" />}<span>{attached.name || '붙여넣은 이미지'}</span><button disabled={reading} onClick={() => { setAttached(null); setAttachmentError(''); }} aria-label="첨부 취소"><X size={14} /></button></div>}
      <div className="movis-composer"><textarea ref={input} aria-label="무비스에게 요청" value={text} maxLength={16000} onChange={e => setText(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          }
        }} placeholder="매장 업무를 편하게 말씀해주세요." rows={2} />
        <div className="movis-composer-toolbar"><div><button onClick={() => file.current?.click()} disabled={disabled || isLoading || reading} aria-label="이미지 첨부" title="이미지 첨부"><Paperclip size={19} /></button><input type="file" accept="image/png,image/jpeg,image/webp" ref={file} hidden onChange={e => {
              attach(e.target.files);
              e.target.value = '';
            }} /><span>이미지 드롭 · Ctrl+V 붙여넣기</span></div><div><span className="movis-key-hint">Shift + Enter 줄바꿈</span>{isLoading ? <button className="movis-send" onClick={onCancel} aria-label="응답 중지"><Square size={16} /></button> : <button className="movis-send" onClick={submit} disabled={disabled || reading || !text.trim() && !attached} aria-label="전송"><ArrowUp size={21} /></button>}</div></div>
      </div><div className="movis-composer-foot"><span><ShieldCheck size={12} /> 변경은 확인 후 적용됩니다</span><span>{latest ? `최근 점검 · ${latest.status === 'checked' ? '조회 조건 확인' : '추가 확인 필요'}` : 'MOVIS · CONNECTED INTELLIGENCE'}</span></div>
    </div>
    <ConfirmDialog isOpen={clearConfirm} title="새 대화를 시작할까요?" message="현재 화면의 대화와 실행 대기를 지우고 새 엔진 대화를 시작합니다. POS 자료는 유지됩니다." confirmText="새 대화" cancelText="취소" onConfirm={() => {
      onClear?.();
      setClearConfirm(false);
    }} onCancel={() => setClearConfirm(false)} />
  </div>;
}
