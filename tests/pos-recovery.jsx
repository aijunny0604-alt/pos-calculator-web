import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';

// Install isolation BEFORE importing App, including its Supabase client.
const localFetch = window.fetch.bind(window);
let healthy = false, requests = 0;
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin === location.origin) return localFetch(input, options);
  requests++;
  document.querySelector('#requests').textContent = `요청 ${requests} · 서버 ${healthy ? '정상' : '중단'}`;
  if (!url.hostname.endsWith('.supabase.co')) throw new Error('Fixture blocks external services');
  if (options.method && options.method !== 'GET' && options.method !== 'HEAD') throw new Error('Fixture blocks writes');
  if (!healthy) return new Response('simulated outage', {status: 503});
  return new Response('[]', {status: 200, headers: {'Content-Type':'application/json', 'Content-Range':'*/0'}});
};
window.WebSocket = class extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  send() {}
  close() { this.readyState = 3; }
};
sessionStorage.setItem('pos_current_page', 'dashboard');
document.querySelector('#recover').onclick = () => {
  healthy = true;
  document.querySelector('#requests').textContent = `요청 ${requests} · 서버 정상 · 자동 재시도 대기`;
  window.dispatchEvent(new Event('online'));
};
const {default: App} = await import('../src/App.jsx');
createRoot(document.getElementById('root')).render(<App />);
