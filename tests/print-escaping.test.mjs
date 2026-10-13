import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml} from '../src/lib/utils.js';
test('print values preserve numbers and render stored HTML as text', () => {
  assert.equal(escapeHtml(0),'0');
  assert.equal(escapeHtml(null),'');
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
