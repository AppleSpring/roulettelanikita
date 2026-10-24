import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,2);
scripts.forEach(code=>new vm.Script(code));
const context=vm.createContext({crypto:webcrypto});
vm.runInContext(scripts[0],context);
const C=context.RouletteCore;
const state=C.newState();
assert.equal(state.items.length,15);
assert.equal(state.items.filter(i=>i.kind==='task').length,10);
assert.deepEqual(Array.from(state.items.filter(i=>i.kind==='friend'),i=>i.title),['Толик','Дима','Стас','Саня','Кирилл']);
assert.equal(C.validateItems(state.items),'');
for(let n=1;n<=30;n++)for(let index=0;index<n;index++)for(const current of [0,13,359,1503,38900]){
  const target=C.rotationForIndex(index,n,current);
  assert.ok(target>current);
  assert.equal(C.indexAtPointer(target,n),index,`Pointer mismatch n=${n} index=${index}`);
}
const seen=new Set();
while(C.remainingItems(state).length){const pool=C.remainingItems(state);const item=pool[C.pickIndex(pool.length)];assert.ok(!seen.has(item.id));seen.add(item.id);state.used.push(item.id);}
assert.equal(seen.size,15);assert.equal(C.remainingItems(state).length,0);
state.noRepeat=false;assert.equal(C.remainingItems(state).length,15);
assert.throws(()=>C.pickIndex(0));
const counts=Array(15).fill(0);for(let i=0;i<30000;i++)counts[C.pickIndex(15)]++;
assert.ok(counts.every(n=>n>1600&&n<2400));
const restored=C.normalizeState(JSON.parse(JSON.stringify(state)));assert.equal(restored.items.length,15);assert.equal(restored.used.length,15);
const pending=C.newState();pending.pending={...pending.items[0],number:1};const p=C.normalizeState(pending);assert.equal(p.pending.id,p.items[0].id);assert.ok(p.used.includes(p.items[0].id));
assert.equal(C.normalizeState({version:1,items:[]}).items.length,15);
assert.equal(C.normalizeState({version:1,items:[{id:'a'}]}).items.length,15);
assert.notEqual(C.validateItems(C.defaults().map(i=>({...i,enabled:false}))), '');
assert.ok(!/(?:src|href)=["']https?:\/\//.test(html),'Unexpected external dependency');
console.log('PASS: 15 sectors, 5 friends, pointer alignment (2,325 cases), no-repeat cycle, random distribution, persistence recovery, validation, offline dependencies, JS syntax.');
