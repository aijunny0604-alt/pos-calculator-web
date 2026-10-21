import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
await build({entryPoints:['src/lib/exportExcel.js'],bundle:true,platform:'node',format:'cjs',external:['exceljs'],outfile:'tests/.artifacts/payment-export.cjs',logLevel:'silent',plugins:[{
  name:'capture-download',setup(build){
    build.onResolve({filter:/^file-saver$/},()=>({path:'capture',namespace:'test'}));
    build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function saveAs(blob,name){globalThis.paymentExport={blob,name}}',loader:'js'}));
  }
}]});
const require=createRequire(import.meta.url);
const {exportCustomerReport,exportFilteredExcel,exportPaymentsExcel}=require('./.artifacts/payment-export.cjs');
const customers=[{id:1,name:'동명 업체',phone:'01011111111'},{id:2,name:'동명 업체',phone:'01022222222'}];
const records=[{id:7,customer_id:'1',order_id:'OWN',total_amount:11000,supply_amount:10000,vat_amount:1000,paid_amount:12000,balance:-1000},
  {id:8,customer_id:1,order_id:'OWN-2',total_amount:100,supply_amount:0,vat_amount:100,paid_amount:0,balance:100},
  {id:9,customer_id:2,order_id:'OTHER',total_amount:900,balance:900}];
const history=[{id:1,payment_record_id:'7',amount:13000,type:'income'},{id:2,payment_record_id:'7',amount:1000,type:'expense'},{id:3,payment_record_id:'9',amount:900,type:'income'}];
async function workbook() {
  assert.ok(globalThis.paymentExport.blob.size>1000);
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await globalThis.paymentExport.blob.arrayBuffer());return wb;
}
const rows=sheet=>sheet.getRows(1,sheet.rowCount).map(row=>row.values.slice(1));
test('실제 업체 보고서 xlsx 재개방: 순입금·선입금·출금·다른 업체 제외·반품·0 공급가액 보존',async()=>{
  await exportCustomerReport({customer:customers[0],customers,records,history,orders:[
    {id:'OWN',customer_id:1,total:12000,total_returned:1000,items:[{name:'상품',price:12000,quantity:1}]},
    {id:'OTHER',customer_id:2,customer_name:'동명 업체',total:900},
    {id:'AMBIGUOUS',customer_name:'동명 업체',total:100},
  ]});
  const wb=await workbook();assert.equal(wb.worksheets.length,5);
  const summary=new Map(rows(wb.getWorksheet('요약')).filter(r=>r.length===2));
  assert.equal(summary.get('순입금 (입금−출금)'),12000);assert.equal(summary.get('이월 잔금 (음수=선입금)'),-900);
  const histories=rows(wb.getWorksheet('입금 이력'));assert.equal(histories.length,3);assert.equal(histories[2][1],'출금');assert.equal(histories[2][4],'#7');
  const orders=rows(wb.getWorksheet('주문 품목 상세'));assert.equal(orders.length,2);assert.equal(orders[1][1],'OWN');assert.equal(orders[1][8],11000);
  const all=wb.getWorksheet('전체 결제 레코드');const headers=rows(all)[0];assert.equal(all.getCell(3,headers.indexOf('공급가액')+1).value,0);
});
test('필터/전체 xlsx는 문자열·숫자 ID를 함께 읽고 같은 업체 선입금을 합산한다',async()=>{
  await exportFilteredExcel({records:records.slice(0,2),history,customers});let wb=await workbook();
  assert.equal(wb.getWorksheet('입금 이력').rowCount,3);assert.equal(wb.getWorksheet('결제 레코드').getCell('A2').value,'동명 업체');
  await exportPaymentsExcel({records,history,customers});wb=await workbook();
  const summary=rows(wb.getWorksheet('업체별 미수'));assert.equal(summary.length,3);assert.ok(summary.some(r=>r[2]===-900));
});
