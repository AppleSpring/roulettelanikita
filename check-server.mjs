import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from './dist/server/index.js';
import {localDatabase} from './scripts/local-db.mjs';
fs.mkdirSync(new URL('./.local/',import.meta.url),{recursive:true});
const file=new URL('./.local/test-'+process.pid+'-'+Date.now()+'.sqlite',import.meta.url);
let DB=localDatabase(file);
const get=()=>worker.fetch(new Request('https://roulette.test/api/settings'),{DB});
const put=(body,headers={})=>worker.fetch(new Request('https://roulette.test/api/settings',{method:'PUT',headers:{'content-type':'application/json','origin':'https://roulette.test',...headers},body:JSON.stringify(body)}),{DB});
try{
  const first=await get();assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');const initial=await first.json();assert.equal(initial.items.length,18);assert.equal(initial.revision,1);
  const fromAnotherDevice=await(await get()).json();assert.deepEqual(fromAnotherDevice,initial);
  const custom={id:'custom-test',title:'Общее задание',short:'ОБЩЕЕ',description:'Для всех устройств',kind:'task',enabled:true};
  const payload={baseRevision:1,items:[...initial.items,custom],noRepeat:false};
  const saved=await put(payload);assert.equal(saved.status,200);const updated=await saved.json();assert.equal(updated.revision,2);
  assert.equal((await put({...payload,items:initial.items})).status,409,'Stale editors must not overwrite newer data');
  const read=await(await get()).json();assert.equal(read.items.at(-1).id,'custom-test');assert.equal(read.noRepeat,false);
  // Close and reopen the database: the list must survive a process restart.
  DB.close();DB=localDatabase(file);assert.deepEqual(await(await get()).json(),read);
  const changed=read.items.map(i=>i.id==='custom-test'?{...i,title:'Изменено со второго устройства'}:i);
  const writes=await Promise.all([put({baseRevision:2,items:changed,noRepeat:false}),put({baseRevision:2,items:initial.items,noRepeat:true})]);
  assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);
  const newest=await(await get()).json();assert.equal(newest.revision,3);
  assert.equal((await put({baseRevision:3,items:initial.items,noRepeat:true},{origin:'https://elsewhere.test'})).status,403);
  assert.equal((await put({baseRevision:3,items:[initial.items.at(-1)],noRepeat:true})).status,400,'Zero alone is invalid');
  assert.equal((await put({baseRevision:3,items:[...initial.items,initial.items[0]],noRepeat:true})).status,400,'Duplicate IDs are invalid');
  const deleted=await put({baseRevision:3,items:initial.items,noRepeat:true});assert.equal(deleted.status,200);assert.equal((await(await get()).json()).items.length,18);
  const beforeOdds=await(await get()).json();
  const oddsItems=beforeOdds.items.map(i=>({...i,...(i.kind==='zero'?{chance:17}:{weight:i.kind==='friend'?13:89})}));
  assert.equal((await put({baseRevision:beforeOdds.revision,items:oddsItems,noRepeat:false})).status,200);
  DB.close();DB=localDatabase(file);const savedOdds=await(await get()).json();assert.equal(savedOdds.items.find(i=>i.kind==='zero').chance,17);assert.equal(savedOdds.items.find(i=>i.kind==='friend').weight,13);assert.equal(savedOdds.items[0].weight,89);assert.equal(savedOdds.noRepeat,false);
  for(const value of [0,101,1.5,'99']){const bad=savedOdds.items.map(i=>({...i}));bad[0].weight=value;assert.equal((await put({baseRevision:savedOdds.revision,items:bad,noRepeat:true})).status,400);}
  const badZero=savedOdds.items.map(i=>i.kind==='zero'?{...i,chance:100}:i);assert.equal((await put({baseRevision:savedOdds.revision,items:badZero,noRepeat:true})).status,400);
  assert.equal((await(await get()).json()).revision,savedOdds.revision,'Invalid edits must not change persisted settings');
  const deferredRequest=(method,path='/api/deferred',body)=>worker.fetch(new Request('https://roulette.test'+path,{method,headers:{'content-type':'application/json','origin':'https://roulette.test'},...(body?{body:JSON.stringify(body)}:{})}),{DB});
  const deferredItem={id:'test-deferred-1',title:'Пиво выбирают пацаны',description:'Выполнить в заведении.',kind:'task'};
  assert.equal((await deferredRequest('POST','/api/deferred',deferredItem)).status,200);
  assert.equal((await deferredRequest('POST','/api/deferred',deferredItem)).status,200);
  let queue=await(await deferredRequest('GET')).json();assert.equal(queue.items.length,1,'Retries must not duplicate a deferred result');assert.equal(queue.items[0].title,deferredItem.title);
  DB.close();DB=localDatabase(file);queue=await(await deferredRequest('GET')).json();assert.equal(queue.items.length,1,'Deferred tasks survive a database restart');
  assert.equal((await deferredRequest('PATCH','/api/deferred/test-deferred-1',{})).status,200);
  assert.equal((await deferredRequest('GET')).status,200);assert.equal((await(await deferredRequest('GET')).json()).items.length,0);
  await deferredRequest('POST','/api/deferred',deferredItem);assert.equal((await(await deferredRequest('GET')).json()).items.length,0,'A retried POST must not reopen a completed task');
  const page=await worker.fetch(new Request('https://roulette.test/'),{DB});assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('СОХРАНИТЬ ДЛЯ ВСЕХ'));assert.ok(!html.includes('class="result-note"'));
  console.log('PASS: shared list across clients, add/edit/delete, persistent SQLite storage, revision conflicts, deferred queue, idempotent deferral, shared completion, input validation, origin checks, rendered Worker UI');
}finally{DB.close();fs.unlinkSync(file);}
