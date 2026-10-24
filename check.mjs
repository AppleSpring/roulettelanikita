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
// Ratchet: sector crossings follow the actual easing, not a separate loop.
for(let n=1;n<=30;n++){
  const target=C.rotationForIndex(0,n),times=Array.from(C.spinTickTimes(n,0,target,4300));
  assert.equal(times.length,Math.floor(target/(360/n)));
  assert.ok(times.every((t,i)=>t>0&&t<4300&&(!i||t>times[i-1])));
  if(times.length>5)assert.ok(times.at(-1)-times.at(-2)>times[1]-times[0]);
}
assert.equal(C.spinTickTimes(15,0,0,4300).length,0);
assert.equal(C.spinTickTimes(15,0,1800,0).length,0);

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
console.log('PASS: 15 sectors, 5 friends, 2,325 pointer cases, no-repeat, random selection, state recovery, timing and deceleration, silent loading, mute/unmute mid-spin, result chime, cancellation, unsupported/legacy audio, offline assets, JS syntax.');
