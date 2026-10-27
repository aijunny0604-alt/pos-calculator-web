import {useMemo} from 'react';
import qrcode from '@/vendor/qrcode-generator.mjs';

export function storePairUrl(code,origin='https://aijunny0604-alt.github.io',base='/pos-calculator-web/'){
 if(!/^[0-9a-f]{32}$/.test(code))throw new Error('연결 코드를 확인해주세요.');
 const url=new URL(base,origin);url.hash=`store-pair=${code}`;return url.href;
}
export default function StorePairQr({code}){
 const qr=useMemo(()=>{const value=storePairUrl(code),generator=qrcode(0,'M');generator.addData(value,'Byte');generator.make();return generator;},[code]);
 const size=qr.getModuleCount(),quiet=4;let path='';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.isDark(y,x))path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
 return <svg role="img" aria-label="휴대폰 연결 QR코드" viewBox={`0 0 ${size+quiet*2} ${size+quiet*2}`} width="232" height="232" shapeRendering="crispEdges" style={{maxWidth:'100%',height:'auto',background:'#fff',borderRadius:8}}><rect width="100%" height="100%" fill="#fff"/><path d={path} fill="#0f172a"/></svg>;
}
