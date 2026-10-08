import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChatPanel from '../src/components/analytics/ChatPanel';
import JarvisHeader from '../src/components/analytics/JarvisHeader';
import MovisConnection from '../src/components/analytics/MovisConnection';
import useAIAnalystChat from '../src/hooks/useAIAnalystChat';
import '../src/index.css';
import '../src/components/analytics/ai-analytics.css';
import '../src/components/analytics/movis-v2.css';
import { fixture } from './movis-fixtures.mjs';
function Harness() {
  const [connection, setConnection] = useState(null);
  const chat = useAIAnalystChat({
    loadLibraries: async () => fixture
  });
  return <main className="ai-analytics-root movis-v2" style={{
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column'
  }}><JarvisHeader rightActions={<MovisConnection onChange={setConnection} busy={chat.isLoading} />} /><div style={{
      flex: 1,
      minHeight: 0
    }}><ChatPanel {...chat} onSend={chat.send} onClear={chat.clear} onCancel={chat.cancel} onSendImage={chat.sendImage} connection={connection} /></div></main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
