import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const core=html.match(/<script id="roulette-core">([\s\S]*?)<\/script>/)?.[1];
if(!core)throw Error('Missing roulette core');
const source=fs.readFileSync(path.join(root,'worker/index.js'),'utf8')
  .replace('/*__CORE__*/','const coreScope={crypto:globalThis.crypto};\n'+core.replace('})(globalThis);','})(coreScope);'))
  .replace('/*__PAGE__*/',JSON.stringify(html));
fs.mkdirSync(path.join(root,'dist/server'),{recursive:true});
fs.mkdirSync(path.join(root,'dist/.openai'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/server/index.js'),source);
fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
if(typeof module.default?.fetch!=='function')throw Error('Invalid Worker export');
console.log('Built Worker with embedded UI and shared D1 settings');
