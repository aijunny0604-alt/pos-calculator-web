import {build} from 'esbuild';
await build({entryPoints:['src/lib/supabase.js'],bundle:true,platform:'node',format:'esm',outfile:'tests/.artifacts/store-db.mjs',logLevel:'silent'});
const {supabaseClient:db}=await import('./.artifacts/store-db.mjs');
for(const flag of ['needs_naver_confirm','needs_naver_dispatch','needs_naver_cancel']){
 const {count,error}=await db.from('external_orders').select('id',{head:true,count:'exact'}).eq(flag,true);
 console.log(JSON.stringify({flag,count,error:error?.code||null}));
}
const {data,error}=await db.from('external_sync_cursors').select('provider,last_synced_at');
console.log(JSON.stringify({sync:data,error:error?.code||null}));
