// 디자인 검증용 가상 주문. 운영 주문을 저장하거나 수정하지 않는다.
const base = {createdAt:new Date().toISOString(),priceType:'wholesale',returns:[]};
const orders = [
  {customerName:'예성모터스 · 샘플',totalAmount:3750000,items:[{name:'링롱 플래시 히어로 265 35 18 EP01',quantity:30,price:125000,originalPrice:132000,discountType:'fixed',discountValue:125000}]},
  {customerName:'일반 주문 · 샘플',totalAmount:138600,items:[{name:'스텐 단엘보',quantity:10,price:13860}]},
  {customerName:'소매 할인 · 샘플',priceType:'retail',totalAmount:198000,items:[{name:'브레이크 호스',quantity:2,price:99000,originalPrice:110000,discountType:'percent',discountValue:10}]},
  {customerName:'할인·일반 혼합 · 샘플',totalAmount:285000,items:[{name:'일반 상품',price:100000,quantity:1},{name:'할인 상품',price:90000,originalPrice:100000,quantity:1,discountType:'percent',discountValue:10},{name:'정액 할인 상품',price:95000,originalPrice:100000,quantity:1,discountType:'amount',discountValue:5000}]},
  {customerName:'무상 할인 · 샘플',totalAmount:0,items:[{name:'무상 제공',price:0,originalPrice:10000,quantity:1,discountType:'percent',discountValue:100}]},
  {customerName:'할인 전 가격 없음 · 샘플',totalAmount:100000,items:[{name:'과거 할인 정보',price:100000,quantity:1,discountType:'fixed',discountValue:100000}]},
];
export const discountOrders = orders.map((order,i)=>({...base,...order,id:`DISCOUNT-${i}`,orderNumber:`SAMPLE-DISCOUNT-${i}`}));
