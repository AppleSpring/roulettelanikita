import http from 'node:http';
import fs from 'node:fs';
const page=new URL('./dist/index.html',import.meta.url);
http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(page));}else{res.writeHead(404);res.end('Not found');}}).listen(4179,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4179'));
