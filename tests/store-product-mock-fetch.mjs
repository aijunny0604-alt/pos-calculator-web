// 서버 프로세스 전용 네이버 가짜 응답. 외부 네트워크로 전송하지 않는다.
let optionStock=3;
const realFetch=globalThis.fetch;
globalThis.fetch=async (url, options={})=>{
 const address=String(url);
 if(address.startsWith('http://127.0.0.1:'))return realFetch(url,options);
 if(!address.startsWith('https://api.commerce.naver.com/'))throw new Error('외부 요청 차단');
 if(address.includes('/oauth2/token'))return Response.json({access_token:'sample',expires_in:3600});
 if(address.endsWith('/products/search'))return Response.json({contents:[{originProductNo:20,channelProducts:[{channelProductNo:10}]}]});
 if(address.endsWith('/channel-products/10'))return Response.json({originProduct:{name:'샘플',statusType:'SALE',stockQuantity:optionStock,detailAttribute:{optionInfo:{useStockManagement:true,optionCombinations:[{id:30,stockQuantity:optionStock,price:100,usable:true,optionName1:'기본'}]}}}});
 if(address.endsWith('/origin-products/20/option-stock') && options.method==='PUT') {const body=JSON.parse(options.body);optionStock=body.optionInfo.optionCombinations[0].stockQuantity;return Response.json({ok:true});}
 throw new Error('미지원 모의 요청');
};
