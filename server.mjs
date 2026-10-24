import http from 'node:http';
import fs from 'node:fs';
import worker from './dist/server/index.js';
import {localDatabase} from './scripts/local-db.mjs';
fs.mkdirSync(new URL('./.local/',import.meta.url),{recursive:true});
const DB=localDatabase(new URL('./.local/preview.sqlite',import.meta.url));
const port=Number(process.env.PORT||4179);
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];let length=0;
    for await(const chunk of req){length+=chunk.length;if(length>65536){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,{DB});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Preview error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
process.on('SIGINT',()=>server.close(()=>{DB.close();process.exit(0);}));
