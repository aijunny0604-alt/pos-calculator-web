import React from 'react';
import {createRoot} from 'react-dom/client';
import ChatPanel from '../src/components/analytics/ChatPanel';
import MovisConnection from '../src/components/analytics/MovisConnection';
import '../src/index.css';
import '../src/components/analytics/movis-v2.css';
window.testSends=[];
createRoot(document.getElementById('root')).render(<div className="movis-v2" style={{height:'100vh'}}>{location.search.includes('connection')?<MovisConnection/>:<ChatPanel onSend={(text,options)=>window.testSends.push({text,...options})}/>}</div>);
