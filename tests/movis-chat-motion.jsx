import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ChatPanel from '../src/components/analytics/ChatPanel';
import '../src/index.css';
import '../src/components/analytics/movis-v2.css';
function Fixture(){
 const [state,setState]=useState({messages:[{id:'history',role:'assistant',content:'필요한 업무를 편하게 말씀해주세요. 함께 확인하겠습니다.',ts:Date.now()}],isLoading:false});
 window.setMovisFixture=update=>setState(s=>({...s,...update}));
 return <div className="movis-v2" style={{height:'100dvh'}}><ChatPanel {...state} connection={{connected:true}} onCancel={()=>setState(s=>({...s,isLoading:false,streamingText:''}))} onSend={text=>setState(s=>({...s,messages:[...s.messages,{id:'new-user',role:'user',content:text,ts:Date.now()}],isLoading:true,loadingStep:'요청 내용 확인'}))}/></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
