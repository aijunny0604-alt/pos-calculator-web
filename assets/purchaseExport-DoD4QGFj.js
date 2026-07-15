const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/exceljs.min-CbWwrN1t.js","assets/sentry-CsY0hej4.js","assets/exceljs-CGKvNPZI.js"])))=>i.map(i=>d[i]);
import{_ as C}from"./index-CbwlHe6I.js";const a=t=>{const e=Number(t);return Number.isFinite(e)?e:0},y=t=>`₩${a(t).toLocaleString("ko-KR")}`,b=t=>{if(t?.status_override)return t.status_override;const e=a(t?.qty),o=a(t?.received_qty);return e<0?"차감":e===0?"-":o<=0?"미입고":o<e?"부분 입고":"완료"},g=t=>a(t?.unit_price)*a(t?.qty),u=t=>a(t?.qty)-a(t?.received_qty);function S(t){if(!t)return 0;const e=new Date(`${t}T00:00:00Z`).getTime();if(!Number.isFinite(e))return 0;const o=new Date,n=Date.UTC(o.getUTCFullYear(),o.getUTCMonth(),o.getUTCDate());return Math.max(0,Math.round((n-e)/864e5))}const R=t=>t>=90?"critical":t>=30?"warn":"ok",w=t=>(t?.items||[]).reduce((e,o)=>e+g(o),0),E=t=>(t?.items||[]).filter(e=>!e.status_override&&a(e.qty)>0&&u(e)>0),T=t=>{const e=(t?.items||[]).filter(o=>!o.status_override&&a(o.qty)>0);return e.length===0||e.every(o=>u(o)<=0)?"완료":e.every(o=>a(o.received_qty)<=0)?"미입고":"부분 입고"},x=t=>{const e=t==null?"":String(t);return/[",\n]/.test(e)?`"${e.replace(/"/g,'""')}"`:e};function j(t){const o=[["발주번호","매입처","발주일","품명","규격명","단가","수량","입고수량","남은수량","공급가액","비고","상태"]];for(const n of t){for(const r of n.items||[])o.push([n.po_number,n.supplier_name,n.order_date,r.name,r.spec,a(r.unit_price),a(r.qty),a(r.received_qty),u(r),g(r),r.note||"",b(r)]);o.push(["","","","","","","","","합계",w(n),"",""])}return o.push([]),o.push(["총 발주액",t.reduce((n,r)=>n+w(r),0)]),"\uFEFF"+o.map(n=>n.map(x).join(",")).join(`\r
`)}function U(t){const o=[["발주번호","발주일","매입처","품명","규격명","단가","수량","입고","남은","미입고금액","상태"]];for(const{po:r,item:s}of t)o.push([r.po_number,r.order_date,r.supplier_name,s.name,s.spec,a(s.unit_price),a(s.qty),a(s.received_qty),u(s),a(s.unit_price)*u(s),b(s)]);const n=t.reduce((r,{item:s})=>r+a(s.unit_price)*u(s),0);return o.push([]),o.push(["미입고 합계",n]),"\uFEFF"+o.map(r=>r.map(x).join(",")).join(`\r
`)}function D(t,e){const o=new Blob([t],{type:"text/csv;charset=utf-8;"}),n=URL.createObjectURL(o),r=document.createElement("a");r.href=n,r.download=e,document.body.appendChild(r),r.click(),document.body.removeChild(r),setTimeout(()=>URL.revokeObjectURL(n),1e3)}function O(t,{supplier:e=""}={}){if(!t.length)return"";const o=new Map;for(const{po:l,item:m}of t)o.has(l.po_number)||o.set(l.po_number,{po:l,items:[]}),o.get(l.po_number).items.push(m);const n=[],r=e?`[${e} 미입고 현황]`:"[미입고 현황]";n.push(r),n.push(`(${new Date().toLocaleDateString("ko-KR")} 기준)`),n.push("");let s=0;const d=[...o.values()].sort((l,m)=>String(l.po.order_date).localeCompare(String(m.po.order_date)));for(const{po:l,items:m}of d){const c=S(l.order_date),i=R(c),h=i==="critical"?"🚨":i==="warn"?"⚠️":"📌";n.push(`${h} ${l.order_date} 발주 — ${c}일 경과 (${l.quote_no||l.po_number})`);for(const f of m){const _=u(f),$=a(f.unit_price)*_;s+=$;const v=a(f.received_qty),q=v>0?`${a(f.qty)}개 중 ${v}개만 입고 → 잔여 ${_}개`:`${a(f.qty)}개 전량 미입고`;n.push(`  · ${f.name}${f.spec?` / ${f.spec}`:""}`),n.push(`    ${q} (${y($)})`)}n.push("")}return n.push(`합계 미입고 금액: ${y(s)}`),n.join(`
`)}async function P(t){if(!t)return!1;try{if(navigator.clipboard&&window.isSecureContext)return await navigator.clipboard.writeText(t),!0;const e=document.createElement("textarea");e.value=t,e.style.position="fixed",e.style.left="-9999px",e.style.opacity="0",document.body.appendChild(e),e.focus(),e.select();const o=document.execCommand("copy");return document.body.removeChild(e),o}catch{return!1}}const p=t=>String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),L=`
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', -apple-system, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 14px; }
  .po { margin-bottom: 18px; page-break-inside: avoid; }
  .po-head { display: flex; align-items: baseline; gap: 8px; border-bottom: 2px solid #111; padding-bottom: 4px; margin-bottom: 6px; }
  .po-no { font-weight: 700; font-size: 13px; font-family: monospace; }
  .po-date { font-size: 13px; font-weight: 700; }
  .po-sup { margin-left: auto; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
  th { background: #f1f1f1; font-weight: 700; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .bad { color: #c00; font-weight: 700; }
  .sum { margin-top: 10px; border-top: 2px solid #111; padding-top: 6px; font-size: 13px; font-weight: 700; text-align: right; }
`;function k(t,e){const o=window.open("","_blank");return o?(o.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${p(t)}</title><style>${L}</style></head><body>${e}</body></html>`),o.document.close(),o.focus(),setTimeout(()=>{o.print()},300),!0):!1}function z(t,{title:e="매입 발주 내역"}={}){const o=new Date().toLocaleDateString("ko-KR"),n=t.reduce((s,d)=>s+w(d),0),r=`
    <h1>${p(e)}</h1>
    <div class="meta">출력일 ${p(o)} · 발주 ${t.length}건</div>
    ${t.map(s=>`
      <div class="po">
        <div class="po-head">
          <span class="po-no">${p(s.po_number)}</span>
          <span class="po-date">${p(s.order_date)} 발주</span>
          <span class="po-sup">${p(s.supplier_name)} · ${p(T(s))}</span>
        </div>
        <table>
          <thead><tr>
            <th>품명</th><th>규격명</th><th>단가</th><th>수량</th><th>입고</th><th>남은</th><th>공급가액</th><th>비고</th><th>상태</th>
          </tr></thead>
          <tbody>
            ${(s.items||[]).map(d=>`<tr>
              <td>${p(d.name)}</td>
              <td>${p(d.spec)}</td>
              <td class="n">${y(d.unit_price)}</td>
              <td class="n">${a(d.qty)}</td>
              <td class="n">${a(d.received_qty)}</td>
              <td class="n${u(d)>0?" bad":""}">${u(d)}</td>
              <td class="n">${y(g(d))}</td>
              <td>${p(d.note||"")}</td>
              <td>${p(b(d))}</td>
            </tr>`).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="6" class="n">합계</td><td class="n">${y(w(s))}</td><td colspan="2"></td>
          </tr></tfoot>
        </table>
      </div>`).join("")}
    <div class="sum">총 발주액 ${y(n)}</div>
  `;return k(e,r)}function M(t,{title:e="미입고 현황"}={}){const o=new Date().toLocaleDateString("ko-KR"),n=t.reduce((s,{item:d})=>s+a(d.unit_price)*u(d),0),r=`
    <h1>${p(e)}</h1>
    <div class="meta">출력일 ${p(o)} · 미입고 ${t.length}품목</div>
    <table>
      <thead><tr>
        <th>발주번호</th><th>발주일</th><th>품명</th><th>규격명</th><th>단가</th><th>수량</th><th>입고</th><th>남은</th><th>미입고 금액</th><th>상태</th>
      </tr></thead>
      <tbody>
        ${t.map(({po:s,item:d})=>`<tr>
          <td>${p(s.po_number)}</td>
          <td>${p(s.order_date)}</td>
          <td>${p(d.name)}</td>
          <td>${p(d.spec)}</td>
          <td class="n">${y(d.unit_price)}</td>
          <td class="n">${a(d.qty)}</td>
          <td class="n">${a(d.received_qty)}</td>
          <td class="n bad">${u(d)}</td>
          <td class="n bad">${y(a(d.unit_price)*u(d))}</td>
          <td>${p(b(d))}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <div class="sum">미입고 합계 ${y(n)}</div>
  `;return k(e,r)}async function K(t){const e=(await C(async()=>{const{default:c}=await import("./exceljs.min-CbWwrN1t.js").then(i=>i.e);return{default:c}},__vite__mapDeps([0,1,2]))).default,o=new e.Workbook;o.creator="MOVE MOTORS POS";const n=o.addWorksheet("매입 발주");n.columns=[{header:"발주번호",key:"po",width:14},{header:"매입처",key:"sup",width:10},{header:"발주일",key:"date",width:12},{header:"품명",key:"name",width:22},{header:"규격명",key:"spec",width:18},{header:"단가",key:"price",width:12},{header:"수량",key:"qty",width:8},{header:"입고수량",key:"recv",width:10},{header:"남은수량",key:"rem",width:10},{header:"공급가액",key:"supply",width:14},{header:"비고",key:"note",width:20},{header:"상태",key:"status",width:12}],n.getRow(1).font={bold:!0},n.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEEEEEE"}};for(const c of t)for(const i of c.items||[]){const h=u(i),f=n.addRow({po:c.po_number,sup:c.supplier_name,date:c.order_date,name:i.name,spec:i.spec,price:a(i.unit_price),qty:a(i.qty),recv:a(i.received_qty),rem:h,supply:g(i),note:i.note||"",status:b(i)});h>0&&!i.status_override&&(f.getCell("rem").font={color:{argb:"FFCC0000"},bold:!0})}["price","supply"].forEach(c=>{n.getColumn(c).numFmt="#,##0"}),n.autoFilter={from:"A1",to:"L1"},n.views=[{state:"frozen",ySplit:1}];const r=[];for(const c of t)for(const i of E(c))r.push({po:c,it:i});if(r.length){const c=o.addWorksheet("미입고 현황");c.columns=[{header:"발주번호",key:"po",width:14},{header:"발주일",key:"date",width:12},{header:"품명",key:"name",width:22},{header:"규격명",key:"spec",width:18},{header:"단가",key:"price",width:12},{header:"수량",key:"qty",width:8},{header:"입고",key:"recv",width:8},{header:"남은",key:"rem",width:8},{header:"미입고금액",key:"amt",width:14}],c.getRow(1).font={bold:!0},c.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFE0E0"}};for(const{po:i,it:h}of r)c.addRow({po:i.po_number,date:i.order_date,name:h.name,spec:h.spec,price:a(h.unit_price),qty:a(h.qty),recv:a(h.received_qty),rem:u(h),amt:a(h.unit_price)*u(h)});["price","amt"].forEach(i=>{c.getColumn(i).numFmt="#,##0"}),c.views=[{state:"frozen",ySplit:1}]}const s=await o.xlsx.writeBuffer(),d=new Blob([s],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),l=URL.createObjectURL(d),m=document.createElement("a");m.href=l,m.download=`매입발주_${new Date().toISOString().slice(0,10)}.xlsx`,document.body.appendChild(m),m.click(),document.body.removeChild(m),setTimeout(()=>URL.revokeObjectURL(l),1e3)}export{w as a,T as b,R as c,S as d,b as e,g as f,O as g,P as h,u as i,D as j,U as k,j as l,K as m,M as n,z as o,E as p};
