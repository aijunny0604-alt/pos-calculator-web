import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{width: 1920, height: 1080}, {width: 1440, height: 900}, {width: 390, height: 844}, {width: 360, height: 800}]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?historyCheck=1');
    await page.getByRole('button', {name: '상세보기'}).first().click();
    const modal = page.getByRole('dialog', {name:'주문 상세'});
    await modal.waitFor();
    const nav = modal.getByRole('navigation', {name:'주문 상세 이동'});
    if (viewport.width > 1200) {
      const peek = page.getByRole('button', {name:'다음 주문 미리보기'});
      await peek.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
      assert.equal(await peek.getByText('스텐 플랜지 FL 63',{exact:true}).count(), 1);
      assert.equal(await peek.getByText('자바라 SF 63 S 길이 120',{exact:true}).count(), 1);
      assert.equal(await peek.getByText('2개',{exact:true}).count(), 1);
      const modalRect = await modal.boundingBox();
      const idlePeek = await peek.boundingBox();
      await page.mouse.move(Math.min(viewport.width - 3, modalRect.x + modalRect.width + 6), idlePeek.y + idlePeek.height / 2);
      await page.waitForTimeout(350);
      assert.equal(await peek.evaluate(el => el.matches(':hover')), true);
      const hoveredPeek = await peek.boundingBox();
      assert.ok(Math.abs(hoveredPeek.y - idlePeek.y) < 12, '호버 시 미리보기 위치가 갑자기 이동하면 안 됨');
      assert.match(await peek.evaluate(el => getComputedStyle(el).transform), /^matrix3d/);
      await page.mouse.move(modalRect.x + 100, modalRect.y + 25);
      await page.waitForTimeout(350);
      const before = await peek.boundingBox();
      const header = await modal.locator('.detail-refined-header').boundingBox();
      await page.mouse.move(header.x + 100, header.y + 25);
      await page.mouse.down(); await page.mouse.move(header.x + 120, header.y + 25, {steps:4}); await page.mouse.up();
      const after = await peek.boundingBox();
      assert.ok(Math.abs((after.x - before.x) - 20) < 2);
      await modal.getByRole('button', {name:'전체화면'}).click();
      await peek.waitFor({state:'hidden'});
      await modal.getByRole('button', {name:'원래 크기'}).click();
      assert.equal(await peek.isVisible(), true);
    }
    if (process.env.ORDER_DETAIL_SCREENSHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({path:`${process.env.ORDER_DETAIL_SCREENSHOT_DIR}/order-detail-${viewport.width}.png`}); }
    assert.equal(await nav.locator('.order-detail-position strong').innerText(), '1');
    assert.match(await nav.locator('.order-detail-position').textContent(), /2/);
    assert.equal(await nav.getByRole('button',{name:'이전 주문'}).isDisabled(), true);
    await modal.evaluate(el => { el.dataset.navigationTest = 'old-window'; el.parentElement.dataset.navigationTest = 'same-backdrop'; });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await modal.getByText('SAMPLE-2').waitFor();
    const outgoing = page.locator('.order-detail-carousel-ghost');
    assert.equal(await outgoing.count(), 1);
    assert.equal(await outgoing.getAttribute('aria-hidden'), 'true');
    assert.equal(await outgoing.getAttribute('inert'), '');
    assert.match(await outgoing.textContent(), /SAMPLE-1/);
    assert.equal(await outgoing.evaluate(el => el.getAnimations().some(animation => animation.playState === 'running')), true);
    const endingOpacity = await outgoing.evaluate(el => {
      const animation = el.getAnimations()[0];
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) * .95;
      const opacity = Number(getComputedStyle(el).opacity);
      animation.play();
      return opacity;
    });
    assert.ok(endingOpacity < .05, '이전 창은 제거 직전까지 충분히 투명해져야 함');
    if (viewport.width > 1200) {
      const disappearingPeek = page.locator('.order-detail-ambient-exit');
      await disappearingPeek.waitFor({state:'attached'});
      assert.equal(await disappearingPeek.getAttribute('aria-hidden'), 'true');
      assert.equal(await disappearingPeek.getAttribute('inert'), '');
      assert.equal(await disappearingPeek.evaluate(el => el.getAnimations().some(animation => animation.playState === 'running')), true);
      await disappearingPeek.waitFor({state:'detached'});
    }
    assert.equal(await modal.evaluate(el => getComputedStyle(el).animationName), 'order-detail-next');
    assert.equal(await modal.evaluate(el => el.dataset.navigationTest), undefined);
    assert.equal(await modal.evaluate(el => el.parentElement.dataset.navigationTest), 'same-backdrop');
    if (viewport.width > 1200) assert.equal(await page.getByRole('button', {name:'이전 주문 미리보기'}).evaluate(el => getComputedStyle(el).animationName), 'order-detail-peek-in-left');
    if (viewport.width > 1200) {
      const peek = page.getByRole('button', {name:'이전 주문 미리보기'});
      await peek.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const idle = await peek.boundingBox(), current = await modal.boundingBox();
      await page.mouse.move(Math.max(3, current.x - 6), idle.y + idle.height / 2);
      await page.waitForTimeout(350);
      assert.equal(await peek.evaluate(el => el.matches(':hover')), true);
      assert.ok(Math.abs((await peek.boundingBox()).y - idle.y) < 12, '이전 미리보기도 호버 시 제자리에 유지되어야 함');
      assert.match(await peek.evaluate(el => getComputedStyle(el).transform), /^matrix3d/);
    }
    assert.equal(await nav.getByRole('button',{name:'다음 주문'}).isDisabled(), true);
    await nav.getByRole('button',{name:'이전 주문'}).click();
    await modal.getByText('SAMPLE-1').waitFor();
    await page.waitForFunction(() => !document.querySelector('.order-detail-carousel-ghost'));
    const content = modal.locator('.modal-scroll-area');
    await content.evaluate(el => {
      const fire = (name,x,y) => { const touch = new Touch({identifier:1,target:el,clientX:x,clientY:y}); el.dispatchEvent(new TouchEvent(name,{bubbles:true,cancelable:true,touches:name==='touchstart'?[touch]:[],changedTouches:[touch]})); };
      fire('touchstart', 250, 150); fire('touchend', 90, 155);
    });
    await modal.getByText('SAMPLE-2').waitFor();
    await page.waitForFunction(() => !document.querySelector('.order-detail-carousel-ghost'));
    if (viewport.width < 600) {
      const cdp = await page.context().newCDPSession(page);
      const box = await content.boundingBox();
      const y = Math.round(box.y + Math.min(100, box.height / 2));
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:80,y}]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:200,y}]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
      await modal.getByText('SAMPLE-1').waitFor();
      await nav.getByRole('button',{name:'다음 주문'}).click();
      await modal.getByText('SAMPLE-2').waitFor();
      await cdp.detach();
    }
    await content.evaluate(el => {
      const fire = (name,x,y) => { const touch = new Touch({identifier:2,target:el,clientX:x,clientY:y}); el.dispatchEvent(new TouchEvent(name,{bubbles:true,cancelable:true,touches:name==='touchstart'?[touch]:[],changedTouches:[touch]})); };
      fire('touchstart', 150, 90); fire('touchend', 130, 240);
    });
    assert.equal(await modal.getByText('SAMPLE-2').count(),1);
    await modal.getByRole('button',{name:/주문 수정|^수정$/}).first().click();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await modal.getByText('SAMPLE-2').count(),1);
    assert.equal(await nav.getByRole('button',{name:'이전 주문'}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}: 버튼·키보드·스와이프·세로 스크롤·편집 보호 확인`);
    await page.close();
  }
  const fallback = await browser.newPage({viewport:{width:1440,height:900}});
  await fallback.goto('http://127.0.0.1:5191/pos-calculator-web/design-preview.html?historyCheck=1');
  await fallback.getByRole('button',{name:'상세보기'}).first().click();
  await fallback.evaluate(() => { Element.prototype.animate = () => { throw new Error('animation unavailable'); }; });
  await fallback.keyboard.press('ArrowRight');
  await fallback.getByRole('dialog',{name:'주문 상세'}).getByText('SAMPLE-2').waitFor();
  assert.equal(await fallback.locator('.order-detail-carousel-ghost').count(), 0);
  await fallback.close();
  console.log('애니메이션 미지원 시 주문 이동과 임시 화면 정리 확인');
} finally { await browser.close(); }
