/*__CORE__*/
const C = coreScope.RouletteCore;
const page = /*__PAGE__*/;
const quizPage = /*__QUIZ__*/;
const shoeAsset = /*__SHOE__*/;
const quizDefaults = /*__QUIZ_DATA__*/;
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const unpack = row => ({...JSON.parse(row.payload),items:JSON.parse(row.payload).items.map(({chance,...i})=>i),revision:row.revision,updatedAt:row.updated_at});
// shared_settings: row 1 is the wheel; row 2 is the shared quiz question bank.
const unpackQuiz = row => ({questions:JSON.parse(row.payload).questions,revision:row.revision,updatedAt:row.updated_at});

function cleanSettings(body) {
  if(!body||!Number.isSafeInteger(body.baseRevision)||body.baseRevision<1||typeof body.noRepeat!=='boolean'||!Array.isArray(body.items)||body.items.length<1||body.items.length>31)return null;
  if(C.validateItems(body.items))return null;
  const ids=new Set(),items=[];
  for(const item of body.items){
    if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(item.id)||ids.has(item.id)||!['task','friend','zero'].includes(item.kind)||typeof item.enabled!=='boolean')return null;
    if((item.kind==='zero')!==(item.id==='zero'))return null;
    if(typeof item.title!=='string'||typeof item.description!=='string'||item.title.length>70||item.description.length>900)return null;
    ids.add(item.id);items.push({id:item.id,title:item.title.trim(),short:String(item.short||item.title).slice(0,70),description:item.description.trim(),kind:item.kind,enabled:item.enabled,...(item.kind==='zero'?{}:{weight:C.weight(item)})});
  }
  if(C.validateItems(items))return null;
  return {items,noRepeat:body.noRepeat};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/assets/anime-shoe.webp'){
      if(!['GET','HEAD'].includes(request.method))return json({error:'Метод не поддерживается'},405);
      return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(shoeAsset),c=>c.charCodeAt(0)),{headers:{'content-type':'image/webp','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
    }
    if(['/', '/index.html', '/quiz', '/quiz/', '/quiz.html'].includes(url.pathname)){
      if(!['GET','HEAD'].includes(request.method))return json({error:'Метод не поддерживается'},405);
      return new Response(request.method==='HEAD'?null:url.pathname.startsWith('/quiz')?quizPage:page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
    }
    const quiz=url.pathname==='/api/quiz',deferred=url.pathname==='/api/deferred',completion=url.pathname.match(/^\/api\/deferred\/([a-zA-Z0-9_-]{1,90})$/);
    if(url.pathname!=='/api/settings'&&!quiz&&!deferred&&!completion)return json({error:'Не найдено'},404);
    const allowed=deferred?['GET','POST']:completion?['PATCH']:['GET','PUT'];
    if(!allowed.includes(request.method))return json({error:'Метод не поддерживается'},405);
    if(!env.DB)return json({error:'Общий список временно недоступен'},503);
    try{
      if(request.method==='GET'){
        if(quiz){
          await env.DB.prepare('INSERT INTO shared_settings (id, revision, payload, updated_at) VALUES (2, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify({questions:quizDefaults}),new Date().toISOString()).run();
          return json(unpackQuiz(await env.DB.prepare('SELECT revision, payload, updated_at FROM shared_settings WHERE id = 2').first()));
        }
        if(deferred){const rows=await env.DB.prepare('SELECT id, title, description, kind, created_at FROM deferred_tasks WHERE completed_at IS NULL ORDER BY created_at, id').all();return json({items:rows.results});}
        await env.DB.prepare('INSERT INTO shared_settings (id, revision, payload, updated_at) VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify({items:C.defaults(),noRepeat:true}),new Date().toISOString()).run();
        const row=await env.DB.prepare('SELECT revision, payload, updated_at FROM shared_settings WHERE id = 1').first();
        return json(unpack(row));
      }
      const origin=request.headers.get('origin');
      if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Открой настройки на сайте рулетки'},403);
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Нужен JSON'},415);
      if(Number(request.headers.get('content-length'))>65536)return json({error:'Список слишком большой'},413);
      const text=await request.text();if(new TextEncoder().encode(text).length>65536)return json({error:'Список слишком большой'},413);
      let body;try{body=JSON.parse(text);}catch{return json({error:'Не удалось прочитать список'},400);}
      if(quiz){
        if(!body||!Number.isSafeInteger(body.baseRevision)||body.baseRevision<1||!quizDefaults.some(q=>q.id===body.id)||typeof body.q!=='string'||!body.q.trim()||body.q.length>600||typeof body.a!=='string'||!body.a.trim()||body.a.length>800||typeof body.accept!=='string'||body.accept.length>1000)return json({error:'Заполни вопрос и ответ. Лимиты: 600 и 800 знаков; пояснение — до 1000.'},400);
        const current=await env.DB.prepare('SELECT revision, payload, updated_at FROM shared_settings WHERE id = 2').first();
        if(!current||current.revision!==body.baseRevision)return json({error:'Вопросы уже изменились. Загрузи свежую версию и повтори правку.'},409);
        const bank=unpackQuiz(current).questions.map(q=>q.id===body.id?{...q,q:body.q.trim(),a:body.a.trim(),accept:body.accept.trim()}:q);
        const row=await env.DB.prepare('UPDATE shared_settings SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 2 AND revision = ? RETURNING revision, payload, updated_at').bind(JSON.stringify({questions:bank}),new Date().toISOString(),body.baseRevision).first();
        if(!row)return json({error:'Кто-то сохранил правку раньше. Загрузи свежую версию.'},409);
        return json(unpackQuiz(row));
      }
      if(completion){
        const row=await env.DB.prepare('UPDATE deferred_tasks SET completed_at = COALESCE(completed_at, ?) WHERE id = ? RETURNING id').bind(new Date().toISOString(),completion[1]).first();
        return row?json({id:row.id,done:true}):json({error:'Это задание уже удалено'},404);
      }
      if(deferred){
        if(!body||typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(body.id)||typeof body.title!=='string'||!body.title.trim()||body.title.length>70||typeof body.description!=='string'||!body.description.trim()||body.description.length>900||!['task','friend','zero'].includes(body.kind))return json({error:'Некорректное задание'},400);
        await env.DB.prepare('INSERT INTO deferred_tasks (id, title, description, kind, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(body.id,body.title.trim(),body.description.trim(),body.kind,new Date().toISOString()).run();
        return json({id:body.id,saved:true});
      }
      const payload=cleanSettings(body);if(!payload)return json({error:'Проверь названия, описания и включенные сектора'},400);
      const updatedAt=new Date().toISOString();
      const row=await env.DB.prepare('UPDATE shared_settings SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision, payload, updated_at').bind(JSON.stringify(payload),updatedAt,body.baseRevision).first();
      if(!row)return json({error:'Кто-то уже изменил список. Загрузи свежую версию перед сохранением.'},409);
      return json(unpack(row));
    }catch(error){console.error('Shared settings failed:',error.message);return json({error:'Не удалось сохранить общий список. Попробуй еще раз.'},503);}
  }
};
