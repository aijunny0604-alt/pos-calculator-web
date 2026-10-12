import test from 'node:test';
import assert from 'node:assert/strict';
import {usageWindows} from '../src/lib/movisUsage.js';
test('사용률은 0~100으로 제한하고 남은 비율과 구분한다',()=>{const r=usageWindows({rateLimitsByLimitId:{codex:{primary:{usedPercent:34,windowDurationMins:300},secondary:{usedPercent:130,windowDurationMins:10080}}}});assert.equal(r[0].remaining,66);assert.equal(r[0].label,'5시간');assert.equal(r[1].used,100);assert.equal(r[1].label,'주간')});
test('사용률 정보 미제공을 0%로 표시하지 않는다',()=>{assert.equal(usageWindows({rateLimits:{primary:{}}})[0].used,null);assert.deepEqual(usageWindows(null),[])});
