import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import { enableAppMotion, shouldReduceMotion } from '../src/lib/appMotion.mjs';

test('프로그램 모션 상시 정책은 OS 동작 줄이기를 재정의한다', () => {
 const previousDocument = globalThis.document, previousWindow = globalThis.window;
 try {
  globalThis.document = {documentElement:{dataset:{}}};
  globalThis.window = {matchMedia:()=>({matches:true})};
  assert.equal(shouldReduceMotion(),true);
  enableAppMotion();
  assert.equal(shouldReduceMotion(),false);
  globalThis.window.matchMedia = ()=>({matches:false});
  assert.equal(shouldReduceMotion(),false);
 } finally {
  if(previousDocument===undefined) delete globalThis.document; else globalThis.document=previousDocument;
  if(previousWindow===undefined) delete globalThis.window; else globalThis.window=previousWindow;
 }
});

test('동작 줄이기 CSS가 상시 모션 정책을 다시 차단하지 않는다', () => {
 const css=postcss.parse(fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8'));
 let count=0;
 css.walkAtRules('media',rule=>{
  if(!rule.params.includes('prefers-reduced-motion'))return;
  rule.walkRules(child=>{
   count++;
   for(const selector of child.selectors) assert.ok(selector.startsWith(':root:not([data-move-motion="always"]) '),selector);
  });
 });
 assert.ok(count>0);
});
