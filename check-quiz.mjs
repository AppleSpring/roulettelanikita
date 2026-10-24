import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const questions=JSON.parse(fs.readFileSync(new URL('./quiz-data.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('./dist/quiz.html',import.meta.url),'utf8').replace('/*__QUESTIONS__*/',JSON.stringify(questions));
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach(s=>new vm.Script(s));
const ctx=vm.createContext({});vm.runInContext(scripts[0],ctx);const C=ctx.QuizCore;
assert.equal(questions.length,30);assert.equal(new Set(questions.map(q=>q.id)).size,30);
for(const[id,counts]of Object.entries({ds:[0,6,4],aot:[0,5,5],op:[3,4,3]})){
  const qs=questions.filter(q=>q.series===id);assert.equal(qs.length,10);
  assert.deepEqual(['easy','medium','hard'].map(level=>qs.filter(q=>q.level===level).length),counts);
}
for(const q of questions)for(const key of ['q','a','accept','episode','source'])assert.ok(typeof q[key]==='string'&&q[key].length>3);
for(let wrong=0;wrong<=30;wrong++){
  let s=C.fresh();assert.equal(C.score(s).final,null);
  questions.forEach((q,i)=>{s=C.grade(s,q.id,i>=wrong);if(i<29)assert.equal(C.score(s).final,null,'No premature rounding');});
  assert.equal(C.score(s).raw,wrong/2);assert.equal(C.score(s).final,Math.ceil(wrong/2));
  assert.equal(C.score(C.normalize(JSON.parse(JSON.stringify(s)))).final,Math.ceil(wrong/2));
  s=C.grade(s,questions[0].id,null);assert.equal(C.score(s).final,null);assert.equal(C.score(s).done,29);
}
let split=C.fresh();questions.forEach(q=>{split=C.grade(split,q.id,!['ds-01','aot-01','op-01'].includes(q.id));});
assert.equal(C.score(split).final,2,'Three errors across three shows round once to two, not three');
split=C.grade(split,'ds-01',true);assert.equal(C.score(split).final,1,'Changing a judgment recalculates');
assert.equal(C.normalize({version:1,index:900,answers:{'ds-01':false,unknown:false,'ds-02':'wrong'},view:'result'}).index,29);
assert.equal(C.score(C.normalize({version:1,answers:{'ds-01':false,unknown:false,'ds-02':'wrong'}})).done,1);
assert.equal(C.normalize({version:1,view:'result'}).view,'game');assert.throws(()=>C.grade(C.fresh(),'bad',true));
const edited=questions.map(q=>({...q}));edited[0].q='Другой вопрос';edited[0].a='Другой ответ';assert.equal(C.applyBank(edited),true);assert.equal(C.questions[0].custom,true);assert.equal(C.questions[0].q,'Другой вопрос');assert.equal(C.defaults[0].q,questions[0].q);assert.equal(C.score(split).final,1,'Question edits preserve judgments');
const invalid=edited.map(q=>({...q}));invalid[1].q='';assert.equal(C.applyBank(invalid),false);assert.equal(C.questions[0].q,'Другой вопрос','Invalid bank cannot partially apply');assert.equal(C.applyBank(questions),true);assert.equal(C.questions[0].custom,false);
console.log('PASS: 30 anime questions, exact difficulty mix, 0–30 errors, final-only rounding, edits, persistence and partial progress.');
