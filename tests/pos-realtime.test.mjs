import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribePosChanges, mergePosChange, POS_REALTIME_TABLES} from '../src/lib/posRealtime.js';

test('all core tables subscribe to Postgres changes and remove only their own channel', () => {
  const registrations = []; let subscribed = false, removed;
  const channel = {on: (...args) => {registrations.push(args); return channel;}, subscribe: () => {subscribed = true;}};
  const received = [];
  const cleanup = subscribePosChanges({channel: () => channel, removeChannel: value => {removed = value;}}, (...args) => received.push(args));
  assert.equal(subscribed, true);
  assert.deepEqual(registrations.map(([event,filter]) => [event,filter.table]), POS_REALTIME_TABLES.map(table => ['postgres_changes',table]));
  const payload = {eventType:'INSERT',new:{id:1}};
  registrations[0][2](payload);
  assert.deepEqual(received, [['orders',payload]]);
  cleanup(); assert.equal(removed, channel);
});

test('own inserts and replayed events cannot duplicate saved orders', () => {
  const row={id:1,total:100};
  const update=mergePosChange([row],{eventType:'INSERT',new:{id:1,total:200}},r=>({...r,totalAmount:r.total}),true);
  assert.equal(update.length,1); assert.equal(update[0].totalAmount,200);
  assert.deepEqual(mergePosChange(update,{eventType:'DELETE',old:{id:1}}),[]);
  assert.equal(mergePosChange(update,{eventType:'UPDATE',new:{id:2}}).length,2);
});
