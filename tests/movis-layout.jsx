import React from 'react';
import {createRoot} from 'react-dom/client';
import ChatPanel from '../src/components/analytics/ChatPanel';
import JarvisHeader from '../src/components/analytics/JarvisHeader';
import MovisConnection from '../src/components/analytics/MovisConnection';
import '../src/index.css';
import '../src/components/analytics/movis-v2.css';
const messages=[{id:'a',role:'assistant',content:'주문 배송정보를 확인했습니다.\n\n**확인한 주문에만 적용됩니다.**\n- 연락처와 배송지 수정\n- 상품과 금액은 유지',model:'gpt-6.1-sol'}, {id:'b',role:'user',content:'확인했어. 주문 정보에도 반영해줘.'},{id:'c',role:'assistant',content:'주문 연락처·배송지 수정 확인창을 준비했습니다.\n\n승인하시면 저장 후 다시 조회해서 결과를 확인합니다.',verification:{status:'pending',sources:[]}}, {id:'d',role:'system',content:'✅ 테스트 주문 연락처·배송주소 저장 및 재조회 확인 완료. 다른 주문은 변경하지 않았습니다.'}];
createRoot(document.getElementById('root')).render(<div className="movis-v2" style={{height:'100dvh',display:'flex',flexDirection:'column'}}><JarvisHeader rightActions={<><MovisConnection/><button aria-label="AI 설정">⚙</button></>}/><ChatPanel messages={messages} connection={{connected:true}}/></div>);
