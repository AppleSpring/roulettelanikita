import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3);
scripts.forEach(code=>new vm.Script(code));
const context=vm.createContext({crypto:webcrypto});
vm.runInContext(scripts[0],context);
const C=context.RouletteCore;
const state=C.newState();
assert.equal(state.items.length,16);
assert.equal(state.items.filter(i=>i.kind==='task').length,10);
assert.deepEqual(Array.from(state.items.filter(i=>i.kind==='friend'),i=>i.title),['Толик','Дима','Стас','Саня','Кирилл']);
assert.equal(C.validateItems(state.items),'');
const zero=state.items.find(i=>i.kind==='zero');
assert.equal(zero.id,'zero');
assert.ok(zero.description.includes('Выполняют все пятеро'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const initial=C.sectorLayout(state.items);
for(const s of initial)close(s.chance,s.item.kind==='zero'?.03:s.item.kind==='friend'?.04:.077);
close(initial.reduce((sum,s)=>sum+s.chance,0),1);
assert.equal(initial.at(-1).end,360);
const fake=(...values)=>({getRandomValues(a){assert.ok(values.length,'Unexpected random draw');a[0]=values.shift();return a;}});
// Enumerate every gate value: exactly three of 100 draws select zero.
for(let gate=0;gate<100;gate++)assert.equal(state.items[C.pickWeightedIndex(state.items,fake(gate,0))].kind==='zero',gate<3);
// Enumerate every non-zero ticket: each friend gets 40, each task 77.
const tickets=Array(16).fill(0);
for(let ticket=0;ticket<970;ticket++)tickets[C.pickWeightedIndex(state.items,fake(99,ticket))]++;
assert.deepEqual(tickets,Array.from(state.items,i=>i.kind==='zero'?0:i.kind==='friend'?40:77));
assert.equal(C.pickIndex(100,fake(4294967295,2)),2,'Rejection sampling avoids modulo bias');
for(let n=1;n<=30;n++){
 const items=Array.from({length:n},(_,i)=>({id:String(i),kind:i%3===0?'friend':'task',enabled:true}));
 for(const pool of [items,[...items,zero]]){
 const segments=C.sectorLayout(pool);
 for(let index=0;index<pool.length;index++)for(const current of [0,13,359,1503,38900]){
  const target=C.rotationForIndex(index,segments,current);
  assert.ok(target>current);
  assert.equal(C.indexAtPointer(target,segments),index,`Pointer mismatch n=${pool.length} index=${index}`);
 }
 if(pool.includes(zero)){
  close(segments.at(-1).chance,.03);
  for(let gate=0;gate<100;gate++)assert.equal(pool[C.pickWeightedIndex(pool,fake(gate,0))].kind==='zero',gate<3);
 }
 }
}
const seen=new Set();
while(C.remainingItems(state).length){const pool=C.remainingItems(state);const item=pool[C.pickWeightedIndex(pool,fake(99,0))];assert.ok(!seen.has(item.id));seen.add(item.id);state.used.push(item.id);}
assert.equal(seen.size,15);assert.equal(C.remainingItems(state).length,0);
state.noRepeat=false;assert.equal(C.remainingItems(state).length,16);
assert.throws(()=>C.pickIndex(0));
assert.throws(()=>C.pickWeightedIndex([zero]));
const withoutZero=state.items.filter(i=>i.kind!=='zero');
close(C.sectorLayout(withoutZero).reduce((sum,s)=>sum+s.chance,0),1);
assert.equal(C.pickWeightedIndex(withoutZero,fake(0)),0);
const counts=Array(15).fill(0);for(let i=0;i<30000;i++)counts[C.pickIndex(15)]++;
assert.ok(counts.every(n=>n>1600&&n<2400));
const restored=C.normalizeState(JSON.parse(JSON.stringify(state)));assert.equal(restored.items.length,16);assert.equal(restored.used.length,15);
const pending=C.newState();pending.pending={...pending.items[0],number:1};const p=C.normalizeState(pending);assert.equal(p.pending.id,p.items[0].id);assert.ok(p.used.includes(p.items[0].id));
const old={version:1,items:withoutZero.map(i=>({...i})),used:['wallpaper'],noRepeat:false,history:[{id:'wallpaper',title:'Моя заставка',kind:'task',status:'done'}],pending:{...withoutZero[2],number:2}};
old.items[0].title='Моя заставка';old.items[1].enabled=false;
const upgraded=C.normalizeState(old);assert.equal(upgraded.version,2);assert.equal(upgraded.items.length,16);assert.equal(upgraded.items[0].title,'Моя заставка');assert.equal(upgraded.items[1].enabled,false);assert.equal(upgraded.noRepeat,false);assert.equal(upgraded.history[0].title,'Моя заставка');assert.equal(upgraded.pending.id,'tolik');assert.equal(C.normalizeState(upgraded).items.length,16,'No duplicate zero on reload');
const zeroPending=C.newState();zeroPending.pending={...zero,number:1};const zp=C.normalizeState(zeroPending);assert.equal(zp.pending.kind,'zero');assert.equal(zp.used.length,0);assert.ok(C.remainingItems(zp).some(i=>i.id==='zero'));
zp.history.push({id:zero.id,title:zero.title,kind:zero.kind,status:'done'});zp.pending=null;assert.equal(C.normalizeState(zp).history[0].kind,'zero');assert.equal(C.remainingItems(zp).length,16,'Zero does not consume a normal sector');
const removed=C.newState();removed.items=removed.items.filter(i=>i.kind!=='zero');assert.equal(C.normalizeState(removed).items.length,15,'Explicitly removed zero stays removed');
assert.equal(C.normalizeState({version:1,items:[]}).items.length,16);
assert.equal(C.normalizeState({version:1,items:[{id:'a'}]}).items.length,16);
assert.notEqual(C.validateItems(C.defaults().map(i=>({...i,enabled:false}))), '');
assert.notEqual(C.validateItems([zero]),'');
assert.ok(!/(?:src|href)=["']https?:\/\//.test(html),'Unexpected external dependency');
// Ratchet: sector crossings follow the actual easing, not a separate loop.
for(let n=1;n<=30;n++)for(const withZero of [false,true]){
  const items=Array.from({length:n},()=>({kind:'task'}));if(withZero)items.push(zero);
  const layout=C.sectorLayout(items),target=C.rotationForIndex(0,layout),times=Array.from(C.spinTickTimes(layout,0,target,4300));
  assert.ok(times.length>=layout.length*6);
  const bezier=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  assert.ok(times.every((t,i)=>t>0&&t<4300&&(!i||t>times[i-1])));
  // Independently turn tick timestamps back into angles and check real boundaries.
  for(const t of times){let lo=0,hi=1;for(let j=0;j<45;j++){const mid=(lo+hi)/2;if(bezier(mid,.12,.12)<t/4300)lo=mid;else hi=mid;}const angle=(360-target*bezier((lo+hi)/2,.68,1)%360)%360;assert.ok(layout.some(s=>Math.min(Math.abs(s.start-angle),360-Math.abs(s.start-angle))<1e-6));}
}
assert.equal(C.spinTickTimes(initial,0,0,4300).length,0);
assert.equal(C.spinTickTimes(initial,0,1800,0).length,0);

let clock=0;const contexts=[];
class Param{constructor(){this.value=0;this.events=[];}setValueAtTime(...v){this.events.push(['set',...v]);}linearRampToValueAtTime(...v){this.events.push(['linear',...v]);}exponentialRampToValueAtTime(...v){this.events.push(['exponential',...v]);}}
class Node{constructor(type){this.type=type;this.gain=new Param();this.frequency=new Param();this.starts=[];this.stops=[];this.connections=[];}connect(n){this.connections.push(n);}disconnect(){this.connections=[];}start(t){this.starts.push(t);}stop(t){this.stops.push(t);}}
class FakeAudioContext{
  constructor(){this.state='suspended';this.currentTime=10;this.sampleRate=48000;this.destination={};this.nodes=[];contexts.push(this);}
  resume(){this.state='running';return Promise.resolve();}
  createGain(){const n=new Node('gain');this.nodes.push(n);return n;}
  createBuffer(channels,length,rate){const data=new Float32Array(length);return{data,channels,length,sampleRate:rate,getChannelData:()=>data};}
  createBufferSource(){const n=new Node('buffer');this.nodes.push(n);return n;}
  createOscillator(){const n=new Node('oscillator');this.nodes.push(n);return n;}
}
context.AudioContext=FakeAudioContext;context.performance={now:()=>clock};
vm.runInContext(scripts[1],context);const Sound=context.RouletteAudio;
const sound=new Sound();assert.equal(contexts.length,0,'No context or autoplay on page load');
await sound.unlock();assert.equal(contexts.length,1);assert.equal(sound.context.state,'running');
assert.ok(sound.master.gain.value<.6);
assert.ok(sound.clickBuffer.data.some(v=>Math.abs(v)>.05));
assert.ok(sound.clickBuffer.data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.55));
sound.startSpin([30,60,120,900]);await new Promise(setImmediate);
assert.equal(sound.sources.size,4);
const initialSources=[...sound.sources];assert.deepEqual(initialSources.map(n=>n.starts[0]),[10.03,10.06,10.12,10.9]);
sound.setEnabled(false);assert.equal(sound.sources.size,0);assert.ok(initialSources.every(n=>n.stops.length));
clock=250;sound.setEnabled(true);await new Promise(setImmediate);
assert.equal(sound.sources.size,1,'Unmute resumes only future clicks');assert.equal([...sound.sources][0].starts[0],10.65);
sound.result();assert.equal(sound.sources.size,2);assert.equal(sound.plan,null);
const notes=[...sound.sources];assert.ok(notes.every(n=>n.stops[0]-n.starts[0]<.6));
sound.setEnabled(false);assert.equal(sound.sources.size,0);assert.ok(notes.every(n=>n.stops.length===2));
sound.result();assert.equal(sound.sources.size,0,'Mute also suppresses result chime');
const muted=new Sound({enabled:false});muted.startSpin([30,900]);await new Promise(setImmediate);assert.equal(contexts.length,1,'Muted spin must not create an audio context');
sound.setEnabled(true);clock=0;sound.startSpin([100,500]);sound.cancel();await new Promise(setImmediate);assert.equal(sound.sources.size,0,'Cancel wins over pending unlock');
context.AudioContext=undefined;let unavailable=0;const unsupported=new Sound({onUnavailable:()=>unavailable++});assert.equal(await unsupported.unlock(),false);assert.equal(await unsupported.unlock(),false);assert.equal(unavailable,1);
context.webkitAudioContext=FakeAudioContext;const legacy=new Sound();assert.equal(await legacy.unlock(),true);legacy.cancel();
assert.ok(html.includes("SOUND_KEY='shtrafnaya-sound-v1'"),'Sound preference stays separate from game progress');
console.log('PASS: 16 sectors, exact 3% zero, 4% per friend / 7.7% per task initially, weighted selection, no-repeat round completion, saved-game migration, pending zero recovery, weighted pointer geometry and sound boundaries, audio controls, offline assets, JS syntax.');
