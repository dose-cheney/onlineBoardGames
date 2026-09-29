'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function database(records){
  const db={transaction(){const tx={};tx.objectStore=()=>({
    openCursor(){const req={},entries=[...records];let i=0;const next=()=>queueMicrotask(()=>{const entry=entries[i++];req.result=entry?{key:entry[0],value:entry[1],continue:next}:null;req.onsuccess()});next();return req},
    put(handle,key){records.set(key,handle);queueMicrotask(()=>tx.oncomplete())}
  });return tx}};
  return {open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req}};
}
function handle(name){return {kind:'file',name,content:'original',permission:'granted',requested:'granted',writes:0,aborted:0,
  async queryPermission(){return this.permission},async requestPermission(){return this.requested},
  async createWritable(){const file=this;let pending='';return {async write(data){file.writes++;pending=data;if(file.failWrite)throw Error('disk write failed')},async close(){if(file.failClose)throw Error('disk close failed');file.content=pending},async abort(){file.aborted++}}}
}}
async function harness(selected,records=new Map()){
  let picks=0;const context={Math,indexedDB:database(records),showSaveFilePicker:async options=>{picks++;assert(options.suggestedName.endsWith('.json'));const picked=selected.shift();if(picked instanceof Error)throw picked;return picked}};context.window=context;vm.createContext(context);
  for(const f of ['core','save-files'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),context);
  const saves=context.GameCore.SaveFiles;await saves.ready;return {saves,picks:()=>picks,records};
}
(async()=>{
  const poker=handle('poker.json'),scout=handle('scout.json'),all=handle('all.json'),other=handle('another-poker.json'),records=new Map();
  const h=await harness([poker,scout,all,other],records),S=h.saves;
  await S.write('poker','{"wallet":1000,"long":"abcdef"}');await S.write('poker','{"wallet":50}');
  assert.equal(h.picks(),1,'repeated saves reuse the same chosen file');assert.equal(poker.content,'{"wallet":50}','overwrite replaces the entire file, including shorter content');
  await S.write('scout','{"round":2}');await S.write(null,'{"version":2}');assert.equal(h.picks(),3,'each scope has its own file');assert.equal(poker.content,'{"wallet":50}');
  await S.write('poker','{"wallet":70}',true);assert.equal(poker.content,'{"wallet":50}','save as preserves the previous file');assert.equal(S.targetName('poker'),'another-poker.json');
  await S.write('poker','{"wallet":80}');assert.equal(h.picks(),4);assert.equal(other.content,'{"wallet":80}');
  const restored=await harness([],records);assert.equal(restored.saves.targetName('poker'),'another-poker.json');await restored.saves.write('poker','{"wallet":90}');assert.equal(restored.picks(),0,'reopening restores the chosen file');
  other.permission='prompt';other.requested='denied';const old=other.content;
  await assert.rejects(restored.saves.write('poker','denied'),/写入权限/);assert.equal(other.content,old,'permission denial preserves the file');
  other.requested='granted';other.failWrite=true;await assert.rejects(restored.saves.write('poker','failed'),/disk write failed/);assert.equal(other.content,old);assert.equal(other.aborted,1,'failed writes are aborted');
  other.failWrite=false;other.failClose=true;await assert.rejects(restored.saves.write('poker','failed'),/disk close failed/);assert.equal(other.content,old);other.failClose=false;
  const cancelled=Object.assign(Error('cancelled'),{name:'AbortError'}),bad=handle('bad.json');bad.failWrite=true;
  const failures=await harness([cancelled,bad],records);await assert.rejects(failures.saves.write('poker','cancelled',true),{name:'AbortError'});assert.equal(failures.saves.targetName('poker'),'another-poker.json');
  await assert.rejects(failures.saves.write('poker','bad',true),/disk write failed/);assert.equal(failures.saves.targetName('poker'),'another-poker.json','failed save as does not replace the remembered target');
  const imported=handle('loaded.json');await failures.saves.remember('scout',imported);await failures.saves.write('scout','updated imported save');assert.equal(imported.content,'updated imported save','loaded files can become the overwrite target');
  console.log('Save file checks passed: overwrite, shorter content, independent scopes, save as, restart, permission denial, cancelled picker, failed writes, imported targets.');
})().catch(error=>{console.error(error);process.exitCode=1});
