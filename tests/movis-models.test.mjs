import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMovisModel} from '../src/lib/movisModels.js';
const models = [{model:'first'}, {model:'recommended',isDefault:true}, {model:'hidden',hidden:true,isDefault:true}];
test('자동 모델은 계정 기본값을 선택하고 직접 선택은 유지한다', () => {
  assert.equal(selectMovisModel(models).model, 'recommended');
  assert.equal(selectMovisModel(models, 'first').model, 'first');
});
test('직접 선택한 모델이 사라지면 다른 모델을 몰래 사용하지 않는다', () => {
  assert.equal(selectMovisModel(models, 'removed'), null);
  assert.equal(selectMovisModel(models, 'hidden'), null);
});
test('기본값이 없는 목록과 빈 목록을 처리한다', () => {
  assert.equal(selectMovisModel([{model:'only'}]).model, 'only');
  assert.equal(selectMovisModel([]), null);
  assert.equal(selectMovisModel([{model:'hidden',hidden:true}]), null);
});
