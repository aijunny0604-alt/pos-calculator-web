import { useEffect, useRef, useState } from 'react';
import ChatPanel from '../components/analytics/ChatPanel';
import '../components/analytics/movis-v2.css';

// 화면 모션 전용: 실제 AI 요청이나 업무 변경을 실행하지 않는다.
export default function MovisMotionPreview() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState('');
  const timer = useRef(null);
  const sequence = useRef(0);
  const stop = () => { clearInterval(timer.current); setLoading(false); setStream(''); };
  useEffect(() => () => clearInterval(timer.current), []);
  const send = content => {
    if (loading) return;
    setMessages(rows => [...rows, {id:`preview-user-${++sequence.current}`,role:'user',content,ts:Date.now()}]);
    setLoading(true);
    const answer = '요청을 확인했습니다.\n\n이 화면은 **대화 모션 미리보기**입니다. 실제 주문과 고객 정보는 변경하지 않습니다.\n\n입력창의 은은한 강조와 말풍선 등장, 답변이 이어지는 흐름을 확인해보세요.';
    let length = -24;
    timer.current = setInterval(() => {
      length += 8;
      setStream(answer.slice(0, Math.max(0,length)));
      if (length >= answer.length) {
        clearInterval(timer.current);
        setMessages(rows => [...rows, {id:`preview-answer-${++sequence.current}`,role:'assistant',content:answer,ts:Date.now()}]);
        setLoading(false); setStream('');
      }
    }, 110);
  };
  return <div className="movis-v2" style={{height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
    <div style={{padding:'12px 20px',color:'#8aaebe',fontSize:12,flexShrink:0}}>MOVIS · 대화 모션 미리보기 · 샘플 응답</div>
    <ChatPanel messages={messages} isLoading={loading} streamingText={stream} loadingStep="샘플 답변 준비 중"
      onSend={send} onCancel={stop} onClear={() => { stop();setMessages([]); }} connection={{connected:false}}/>
  </div>;
}
