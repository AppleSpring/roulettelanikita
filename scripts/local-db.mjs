import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function localDatabase(filename=':memory:'){
  const sqlite=new DatabaseSync(filename);
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
    if(sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name))continue;
    sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
    sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
  }
  return {
    prepare(sql){const statement=sqlite.prepare(sql);let args=[];return{bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return statement.run(...args);}};},
    close(){sqlite.close();}
  };
}
