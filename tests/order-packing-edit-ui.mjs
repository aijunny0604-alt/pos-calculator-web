import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try {
 for (const failure of [false,true]) {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?packingEditCheck=1');
  await page.getByText('📦✅ 포장완료',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'상세보기'}).first().click();
  const modal=page.getByRole('dialog',{name:'주문 상세'});
  await modal.getByRole('button',{name:'✅ 포장완료',exact:true}).waitFor();
  await modal.getByRole('button',{name:'주문 수정',exact:true}).first().click();
  await modal.getByRole('button',{name:'제품 추가'}).click();
  await modal.getByPlaceholder('제품명 검색...').fill('브레이크');
  await modal.getByRole('button',{name:/브레이크 호스 세트/}).first().click();
  await modal.getByRole('button',{name:'저장',exact:true}).first().click();
  if(failure) await page.evaluate(()=>{window.previewPackingFailure=true;});
  await page.getByRole('button',{name:'변경 내용 적용'}).click();
  if(failure) {
   await page.getByRole('alert').filter({hasText:'저장하지 못했습니다'}).waitFor();
   assert.equal(await page.getByText('주문 수정 확인').count(),1);
   assert.equal(await modal.getByRole('button',{name:'저장',exact:true}).first().isVisible(),true);
  } else {
   await page.getByText('주문 수정 확인').waitFor({state:'hidden'});
   await modal.getByRole('button',{name:'📦 포장 체크',exact:true}).waitFor();
   assert.equal(await page.getByText('📦✅ 포장완료',{exact:true}).count(),0);
   await modal.getByRole('button',{name:'📦 포장 체크',exact:true}).click();
   await modal.getByRole('button',{name:/스텐 밴딩 54-30/}).first().click();
   assert.equal(await page.getByText('📦✅ 포장완료',{exact:true}).count(),0);
   await modal.getByRole('button',{name:/브레이크 호스 세트/}).first().click();
   await page.getByText('📦✅ 포장완료',{exact:true}).first().waitFor();
   await modal.getByRole('button',{name:'닫기',exact:true}).first().click();
   await modal.waitFor({state:'hidden'});
   assert.equal(await page.getByText('📦✅ 포장완료',{exact:true}).count(),1);
  }
  assert.deepEqual(errors,[]);
  console.log(failure?'초기화 실패 시 저장 중단과 오류 표시':'제품 추가 시 완료 해제 및 전 품목 재확인 후 완료');
  await page.close();
 }
} finally {await browser.close();}
