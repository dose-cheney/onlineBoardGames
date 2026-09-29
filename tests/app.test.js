'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function harness(saved){
  let raw=saved?JSON.stringify(saved):null,accept=true,downloads=[],confirmations=[],clock=10000;
  const events={},timers=new Map(),delays=new Map(),elements={app:{innerHTML:''},'import-file':{value:'',addEventListener(name,fn){events['file-'+name]=fn},click(){}}};
  const context={console,Math,Date:class extends Date{static now(){return clock}},localStorage:{getItem(){return raw},setItem(k,v){raw=v},removeItem(){raw=null}},
    document:{hidden:false,body:{dataset:{},appendChild(){}},getElementById(id){return elements[id]},querySelector(){return null},addEventListener(name,fn){events[name]=fn},createElement(){return {click(){downloads.push({name:this.download,data:context.blob})},remove(){}}}},
    setTimeout(fn,delay){const id=timers.size+1;timers.set(id,fn);delays.set(id,delay);return id},clearTimeout(id){timers.delete(id);delays.delete(id)},setInterval(fn){events.tick=fn},
    Blob:class{constructor(parts){context.blob=parts.join('')}},URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},
    FileReader:class{readAsText(file){this.result=file.text;this.onload()}},confirm(message){confirmations.push(message);return accept},addEventListener(){}};
  context.window=context;vm.createContext(context);
  for(const file of ['core','achievements','splendor','scout','poker','athlete-data','athlete','flip7','save-files','app'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+file+'.js','utf8'),context,{filename:file+'.js'});
  return {C:context.GameCore,click(action,data={}){events.click({target:{closest(){return {dataset:{action,...data}}}}})},field(id,value){elements[id]={value:String(value)}},get(){return JSON.parse(raw)},html(){return elements.app.innerHTML},accept(v){accept=v},confirmations,downloads,
    save(game){this.click('app-save',game?{game}:{});this.click('app-save-copy')},import(data,game){this.click('app-load',game?{game}:{});events['file-change']({target:{files:[{text:JSON.stringify(data)}]}})},tick(ms){clock+=ms;events.tick()},hide(){context.document.hidden=true;events.visibilitychange()},delays(){return [...delays.values()]},run(delay){const id=[...delays].find(([id,d])=>d===delay)?.[0];if(id===undefined)return false;const fn=timers.get(id);timers.delete(id);delays.delete(id);clock+=delay;fn();return true}};
}
const fixture=harness(),C=fixture.C;
const poker=C.Games.poker.create(2,{buyin:200,small:1,big:2});
C.Games.poker.act(poker,'p-fold',{});
const old={...JSON.parse(JSON.stringify(C.createProfile())),version:1,active:{type:'poker',players:2,difficulty:'easy',elapsedMs:100,paused:false,game:poker}};
delete old.games;delete old.activeType;

{
  const h=harness(old);
  h.click('app-resume');
  assert.equal(h.get().version,3,'old saves migrate');
  assert.equal(h.get().games.poker.game.current,-1);
  h.click('p-next');
  assert.equal(h.get().games.poker.game.betweenHands,false,'next hand must bypass the normal player-turn guard');
  assert.equal(h.get().games.poker.game.button,1,'dealer advances');
  assert(!h.html().includes('尚未轮到你'));
}
{
  const h=harness(old);h.click('app-resume');const before=h.get();
  h.accept(false);h.click('p-end');
  assert.deepEqual(h.get(),before,'cancel cashout preserves the entire profile');
  assert(h.confirmations[0].includes('确认离桌结算'));
  h.accept(true);h.click('p-end');
  const after=h.get();assert.equal(after.wallet,before.wallet+before.games.poker.game.players[0].stack);assert.equal(after.games.poker,null);assert.equal(after.stats.poker.completed,1);
  h.click('p-end');assert.equal(h.get().wallet,after.wallet,'cannot cash out twice');
}
{
  const h=harness(old);h.click('app-resume');h.click('app-home');
  for(const game of ['splendor','scout']){
    h.click('app-select',{game});h.field('players',2);h.field('difficulty','medium');h.click('app-start');h.tick(500);h.click('app-home');
  }
  const three=h.get();assert([three.games.splendor,three.games.scout,three.games.poker].every(Boolean),'all three games coexist');assert(Object.values(three.games).every(a=>!a||a.paused));
  const splendorBefore=JSON.stringify(three.games.splendor),scoutBefore=JSON.stringify(three.games.scout);
  h.click('app-resume',{game:'poker'});h.tick(500);h.save('poker');
  const independent=JSON.parse(h.downloads.at(-1).data);assert.equal(independent.type,'poker');assert(!Object.hasOwn(independent,'games'));assert.equal(independent.wallet,three.wallet);
  h.click('p-end');assert.equal(JSON.stringify(h.get().games.splendor),splendorBefore);assert.equal(JSON.stringify(h.get().games.scout),scoutBefore,'ending poker retains other tables');
  h.import(independent,'poker');assert.equal(JSON.stringify(h.get().games.splendor),splendorBefore);assert.equal(h.get().wallet,independent.wallet);assert(h.get().games.poker.paused);
  const before=h.get();h.accept(false);h.import(independent,'poker');assert.deepEqual(h.get(),before,'cancel importing does not pause or replace live state');h.accept(true);
  h.import({...independent,wallet:-1},'poker');assert.deepEqual(h.get(),before,'invalid funds do not replace state');
  h.import(independent,'scout');assert.deepEqual(h.get(),before,'wrong game file is rejected');
  h.click('app-resume',{game:'splendor'});h.tick(1000);h.save('splendor');
  const gemSave=JSON.parse(h.downloads.at(-1).data);assert(!Object.hasOwn(gemSave,'wallet'));
  h.click('app-home');const money=h.get().wallet;h.import(gemSave,'splendor');assert.equal(h.get().wallet,money,'board game import preserves poker funds');
  h.hide();assert(Object.values(h.get().games).every(a=>!a||a.paused));
  h.save();const full=JSON.parse(h.downloads.at(-1).data);assert.equal(full.version,3);assert([full.games.splendor,full.games.scout,full.games.poker].every(Boolean));
  const restored=harness(full);restored.click('app-resume',{game:'scout'});assert.equal(restored.get().activeType,'scout');assert(restored.get().games.poker.paused);assert(restored.get().games.splendor.paused);
}
{
  const h=harness(old);h.click('app-resume');h.click('p-next');h.click('app-home');h.field('bank-amount',100);const money=h.get().wallet;h.click('app-borrow');assert.equal(h.get().wallet,money,'paused poker cannot bypass bank restriction through home');
}
{
  const s=C.Games.splendor.create(2);s.selection=[0,1,2];C.Games.splendor.act(s,'s-take',{});assert(s.log[0].includes('白 1、蓝 1、绿 1'));
  const html=C.Games.splendor.render(s);assert(html.includes('永久折扣'));assert(html.includes('gem-opponents'));assert(html.includes('折扣后'));
  const p=C.Games.poker.create(10,{buyin:200,small:1,big:2});assert.equal((C.Games.poker.render(p).match(/class="poker-seat /g)||[]).length,10);
}
console.log('App checks passed: next hand, confirmation, migration, independent slots/files, funds, pause, tabletop rendering.');

{
  const g=C.Games.scout.create(3);g.orientationPending=false;g.current=0;
  const p=C.createProfile();p.active={type:'scout',players:3,difficulty:'medium',elapsedMs:0,paused:false,game:g};
  const h=harness(p);h.click('app-resume');const before=h.get(),show=C.Games.scout.legalShows(g,0)[0];
  h.click('c-select-show',{start:show.start,end:show.end});
  assert.deepEqual(h.get(),before,'previewing a show does not consume cards or advance the turn');
  assert(h.html().includes('表演这 '+show.rank.length+' 张'));
  h.click('c-show',{start:show.start,end:show.end});
  assert.equal(h.get().games.scout.game.hands[0].length,before.games.scout.game.hands[0].length-show.rank.length);
}
{
  const G=C.Games.scout,g=G.create(3),picked=g.hands[1].shift();picked.flip=true;
  g.orientationPending=false;g.current=0;g.owner=1;g.active=[picked];g.activeRank=G.combo(g.active,0,0);
  const p=C.createProfile();p.active={type:'scout',players:3,difficulty:'medium',elapsedMs:0,paused:false,game:g};
  const h=harness(p);h.click('app-resume');const d=G.deck[picked.id];
  assert(h.html().includes('value="true" selected>以 '+d.b+' 朝上'),'initial preview preserves the visibly active direction');
  h.field('scout-position',2);h.field('scout-flip','false');h.click('c-scout',{end:'left'});
  const recruited=h.get().games.scout.game.hands[0][2];assert.equal(recruited.id,picked.id);assert.equal(recruited.flip,false,'explicit number direction is used for the actual inserted card');
}
{
  const h=harness(old);h.click('app-resume');const before=h.get().games.poker.elapsedMs;
  h.click('app-help');h.tick(1000);h.save();assert.equal(h.get().games.poker.elapsedMs,before,'help pauses the effective game clock');
  h.click('app-close-help');h.tick(500);h.save();assert.equal(h.get().games.poker.elapsedMs,before+500,'closing help resumes the clock');
}
console.log('Experience app checks passed: previews do not play cards, explicit recruitment direction, help pauses/resumes.');

function bustedTable(wallet){
  const P=C.Games.poker,g=P.create(4,{buyin:200,small:1,big:2});
  g.board=[2,17,32,47,9];
  const holes=[[0,14],[1,15],[12,25],[10,23]];
  g.players.forEach((p,i)=>{p.hole=holes[i];p.committed=i===3?20:200;p.streetBet=p.committed;p.stack=200-p.committed;p.folded=false;p.allIn=p.stack===0;p.needs=false});
  const used=g.board.concat(...holes);g.deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.includes(i));
  P.settle(g);assert.deepEqual(Array.from(g.players,p=>p.stack),[0,0,620,180]);
  const p=C.createProfile(wallet);p.active={type:'poker',players:4,difficulty:'medium',elapsedMs:0,paused:false,game:g};return p;
}
for(const wallet of [500,75,1]){
  const h=harness(bustedTable(wallet));h.click('app-resume');const before=h.get(),n=Math.min(200,wallet),g=before.games.poker.game;
  assert(h.html().includes('用钱包买入 '+n+'，继续下一手'));
  assert(!h.html().includes('data-action="p-next" disabled'),'a funded player has an enabled continuation');
  h.click('app-rebuy-next');const after=h.get(),next=after.games.poker.game;
  assert.equal(after.wallet,wallet-n);assert.equal(next.players[0].buyins,200+n);
  assert.equal(next.players[0].stack+next.players[0].committed,n,'human rebuy is funded exactly once');
  assert.equal(next.betweenHands,false);assert.equal(next.handCount,g.handCount);assert.equal(next.button,(g.button+1)%4);
  assert.equal(next.players[1].buyins,400,'a busted computer automatically rebuys the table buyin');
  assert.equal(next.players[1].stack+next.players[1].committed,200);
  for(const i of [2,3]){assert.equal(next.players[i].buyins,g.players[i].buyins);assert.equal(next.players[i].stack+next.players[i].committed,g.players[i].stack,'funded computers retain their chips apart from blinds')}
  assert(next.log.some(x=>x.includes('电脑 1补买 200')));assert(next.log.some(x=>x.includes('你用钱包补买 '+n)));
  assert.deepEqual(after.bank,before.bank,'rebuy does not borrow');
  assert.equal(next.players.reduce((v,p)=>v+p.stack+p.committed,0),next.players.reduce((v,p)=>v+p.buyins,0),'chips conserved across human and computer rebuys');
  h.click('app-rebuy-next');assert.deepEqual(h.get(),after,'repeated continuation cannot charge again during a hand');
  const played=JSON.parse(JSON.stringify(next));for(let i=0;i<80&&!played.betweenHands;i++)C.Games.poker.act(played,'p-call',{});
  assert(played.betweenHands,'a short rebuy can play through the next hand without getting stuck');
  assert.equal(played.players.reduce((v,p)=>v+p.stack,0),played.players.reduce((v,p)=>v+p.buyins,0),'chips conserved after the rebought hand settles');
}
{
  const h=harness(bustedTable(75));h.click('app-resume');const before=h.get();h.click('app-rebuy');const after=h.get(),g=after.games.poker.game;
  assert.equal(after.wallet,0);assert.equal(g.players[0].stack,75);assert.equal(g.players[0].buyins,275);assert(g.betweenHands);
  assert.deepEqual(g.players.slice(1),before.games.poker.game.players.slice(1),'a standalone rebuy leaves all computer state unchanged');
  h.click('app-rebuy');assert.deepEqual(h.get(),after,'empty wallet cannot be charged');
  h.click('p-end');assert.equal(h.get().wallet,75,'cashout returns the partial rebuy');
}
{
  const h=harness(bustedTable(0));h.click('app-resume');const before=h.get();
  assert(h.html().includes('data-action="app-funding"'));assert(h.html().includes('桌面筹码和钱包均为 0'));
  h.click('app-rebuy-next');assert.deepEqual(h.get(),before,'zero wallet cannot create chips');
  h.field('bank-amount',100);h.click('app-borrow');h.click('app-rebuy-next');
  assert.equal(h.get().wallet,0);assert.equal(h.get().bank.outstanding,100);assert.equal(h.get().games.poker.game.players[0].buyins,300);
}
{
  const h=harness(bustedTable(500));h.click('app-resume');h.click('app-pause');const before=h.get();h.click('app-rebuy-next');assert.deepEqual(h.get(),before,'paused tables cannot rebuy');
}
{
  const p=bustedTable(75);p.active.game.players[0].stack=150;p.active.game.players[2].stack-=150;
  const h=harness(p);h.click('app-resume');h.click('app-rebuy');const after=h.get();
  assert.equal(after.wallet,25);assert.equal(after.games.poker.game.players[0].stack,200);assert.equal(after.games.poker.game.players[0].buyins,250,'topup only fills the gap to the initial buyin');
  h.click('app-rebuy');assert.deepEqual(h.get(),after,'a full stack cannot be topped up again');
}
console.log('Poker funding checks passed: full/partial/short rebuy, wallet and bank accounting, preserved computer stacks, automatic computer funding, no repeated charges.');

for(const onTable of [false,true]){
  const p=onTable?bustedTable(75):C.createProfile(75);p.bank.totalBorrowed=50;p.bank.outstanding=50;
  const h=harness(p);if(onTable)h.click('app-resume');h.field('bank-amount',137);const before=h.get();h.click('app-repay');
  const message='还款不能超过钱包余额或未还欠款',html=h.html();
  assert.deepEqual(h.get(),before,'failed bank operations do not change funds');
  assert(html.includes('id="bank-error" class="field-error bank-feedback" role="alert">'+message),'repay error appears next to the bank controls');
  assert.equal(html.split(message).length,2,'bank error is not duplicated in the page header or poker action dock');
  assert(html.indexOf('data-action="app-repay"')<html.indexOf('id="bank-error"'));
  assert(html.includes('value="137" aria-describedby="bank-error"'),'failed amount remains available to edit');
  if(onTable)assert(html.includes('id="poker-funding" class="panel poker-funding" open'),'the funding panel remains open after an error');
  h.field('bank-amount',50);h.click('app-repay');assert.equal(h.get().wallet,25);assert.equal(h.get().bank.outstanding,0);
  assert(!h.html().includes(message),'a successful retry clears the local error');
  h.field('bank-amount',3000);const paid=h.get();h.click('app-borrow');assert.deepEqual(h.get(),paid);
  assert(h.html().includes('id="bank-error" class="field-error bank-feedback" role="alert">借款超过总额度'));
  h.field('bank-amount',0);h.click('app-repay');assert(h.html().includes('id="bank-error" class="field-error bank-feedback" role="alert">请输入正整数金额'));
}
{
  const p=C.createProfile();p.bank.totalBorrowed=50;p.bank.outstanding=50;const h=harness(p);h.field('bank-limit',20);const before=h.get();h.click('app-bank-limit');
  assert.deepEqual(h.get(),before);assert(h.html().includes('id="bank-limit-error" class="field-error bank-feedback" role="alert">额度不能低于未还欠款'));
  assert.equal(h.html().split('额度不能低于未还欠款').length,2);
}
console.log('Bank feedback checks passed: errors stay beside controls, funds remain unchanged, inputs and open panel are retained, successful retries clear errors.');

{
  const h=harness(old);h.click('app-resume');const before=h.get();h.click('app-save',{game:'poker'});
  assert(h.html().includes('id="save-dialog"'));assert(h.html().includes('下载副本'));
  h.tick(2000);h.click('p-next');assert.deepEqual(h.get(),before,'save dialog blocks gameplay and pauses the clock');
  h.click('app-save-copy');assert.equal(JSON.parse(h.downloads.at(-1).data).session.elapsedMs,before.games.poker.elapsedMs);
  h.tick(500);h.save('poker');assert.equal(JSON.parse(h.downloads.at(-1).data).session.elapsedMs,before.games.poker.elapsedMs+500);
}
{
  const p=C.createProfile(),g=C.Games.poker.create(2,{buyin:200,small:1,big:2});C.Games.poker.act(g,'p-call',{});C.Games.poker.act(g,'p-fold',{});
  p.stats.scout.completed=9;p.active={type:'poker',players:2,difficulty:'easy',elapsedMs:0,paused:false,game:g};
  const h=harness(p);h.click('app-resume');h.click('p-end');const after=h.get();
  for(const id of ['regular','first_win','poker_profit'])assert(after.achievements.includes(id));
  assert(h.html().includes('本场新成就'));assert(h.html().includes('盈利离桌'));assert(h.html().includes('桌边常客'));
  h.save();const backup=JSON.parse(h.downloads.at(-1).data);assert(backup.achievements.includes('regular'));
}
console.log('Save and achievement app checks passed: modal pause, gameplay guard, downloads, completion feedback and backups.');

for(const type of ['athlete','flip7']){
  const p=C.createProfile(),g=C.Games[type].create(4,{draftMode:'random'});
  if(type==='athlete')C.Games.athlete.act(g,'a-lineup',{id:g.teams[0][0]});
  p.active={type,players:4,difficulty:'medium',elapsedMs:0,paused:false,game:g};
  const h=harness(p);h.click('app-resume');
  if(type==='athlete'){
    h.click('a-speed',{speed:'step'});assert.equal(h.get().games.athlete.game.speed,'step','speed works during automatic turns');
    const before=h.get().games.athlete.game.tasks.length;h.click('a-step');assert(h.get().games.athlete.game.tasks.length<before,'manual step bypasses human turn guard');
    h.click('app-help');const frozen=h.get();h.click('a-step');assert.deepEqual(h.get(),frozen,'help blocks manual steps');h.click('app-close-help');
  }
  h.save(type);const file=JSON.parse(h.downloads.at(-1).data);assert.equal(file.type,type);assert(!Object.hasOwn(file,'wallet'));
  h.click('app-home');h.import(file,type);assert(h.get().games[type].paused);assert(C.Games[type].validate(h.get().games[type].game,4));
  h.click('app-resume',{game:type});assert(!h.html().includes('undefined'),'new games have complete names and descriptions');
}
console.log('New game app checks passed: automatic turn controls, help guard, independent files and restored progress.');

{
  const G=C.Games.athlete,g=G.create(4,{draftMode:'random'});G.act(g,'a-lineup',{id:g.teams[0][0]});
  const p=C.createProfile();p.active={type:'athlete',players:4,difficulty:'medium',elapsedMs:0,paused:false,game:g};
  const h=harness(p);h.click('app-resume');assert(h.delays().includes(1200),'normal playback leaves time to read each event');
  h.click('a-speed',{speed:'step'});assert(!h.delays().includes(1200));assert(!h.delays().includes(180),'step mode stops automatic playback');
  assert(h.html().includes('data-detail-id="athlete-record" open'));assert(h.html().includes('class="athlete-score-value"'));
}

{
  const h=harness(C.createProfile(0));h.click('app-select',{game:'poker'});
  h.field('players',9);h.field('difficulty','hard');h.field('small',5);h.field('big',10);h.field('buyin',500);
  h.click('app-poker-mode',{mode:'tournament'});assert(h.html().includes('每人初始比赛筹码'));assert(h.html().includes('value="500"'));assert(!h.html().includes('银行借款'));
  h.field('blind-every',5);h.click('app-start');const p=h.get(),g=p.games.poker.game;
  assert.equal(g.mode,'tournament');assert.equal(g.buyin,500);assert.equal(g.big,10);assert.equal(g.blindEvery,5);assert.equal(p.wallet,0,'tournament can start with an empty wallet');
  assert(h.html().includes('剩余 9 / 9 人'));assert(!h.html().includes('poker-funding'));
  h.click('app-help');assert(h.html().includes('同手淘汰'));assert(!h.html().includes('下一手自动补买'));h.click('app-close-help');
  h.save('poker');const file=JSON.parse(h.downloads.at(-1).data);assert.equal(file.session.game.mode,'tournament');
  h.import(file,'poker');assert(h.get().games.poker.paused);assert.equal(h.get().wallet,0);h.click('app-resume');
  h.click('p-end');assert.equal(h.get().wallet,0);assert(h.get().games.poker,'cannot cash out tournament chips');
  h.click('app-abandon');assert.equal(h.get().games.poker,null);assert.equal(h.get().wallet,0);assert.equal(h.get().stats.poker.completed,0);
}
function tournamentProfile(n,heroWins){
  const g=C.Games.poker.create(n,{mode:'tournament',buyin:200,small:1,big:2,blindEvery:10});
  g.board=[2,17,32,47,9];g.street='river';
  const holes=n===2?(heroWins?[[12,25],[0,14]]:[[0,14],[12,25]]):[[0,14],[1,15],[12,25],[10,23]];
  g.players.forEach((p,i)=>{p.hole=holes[i];p.handStartStack=200;p.committed=n===4&&i===3?20:200;p.streetBet=p.committed;p.stack=200-p.committed;p.folded=false;p.allIn=p.stack===0;p.needs=false});
  const used=g.board.concat(...holes);g.deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.includes(i));C.Games.poker.settle(g);
  const p=C.createProfile(75);p.active={type:'poker',players:n,difficulty:'medium',elapsedMs:100,paused:false,game:g};return p;
}
{
  const h=harness(tournamentProfile(4));h.click('app-resume');assert(h.delays().includes(1600),'eliminated human can automatically watch the remaining match');
  const before=h.get();h.click('app-rebuy-next');assert.deepEqual(h.get(),before,'wallet cannot fund tournament rebuys');
  h.click('p-watch');assert.equal(h.get().games.poker.game.autoWatch,false);assert(!h.delays().includes(1600));
  h.click('p-next');assert(!h.get().games.poker.game.betweenHands);assert(h.get().games.poker.game.players[0].eliminated);assert(h.delays().includes(650));
  h.click('p-watch');assert(h.get().games.poker.game.autoWatch,'spectator controls work during a computer turn');
  h.click('app-pause');assert(!h.delays().includes(650));h.click('app-resume');
  h.click('app-help');assert(!h.delays().includes(650));h.click('app-close-help');assert(h.delays().includes(650));
}
{
  const h=harness(tournamentProfile(4));h.click('app-resume');assert(h.run(1600));const g=h.get().games.poker.game;
  assert(!g.betweenHands);assert.deepEqual(g.players.slice(0,2).map(p=>p.stack),[0,0],'automatic spectator continuation does not refill chips');assert.equal(h.get().wallet,75);
}
for(const heroWins of [true,false]){
  const h=harness(tournamentProfile(2,heroWins));h.click('app-resume');const p=h.get();
  assert.equal(p.games.poker,null);assert.equal(p.wallet,75,'tournament completion never credits chips to the wallet');
  assert.equal(p.stats.poker.completed,1);assert.equal(p.stats.poker.wins,heroWins?1:0);assert.equal(p.history[0].mode,'tournament');assert.equal(p.history[0].rank,heroWins?1:2);
  assert(h.html().includes(heroWins?'你获得锦标赛冠军':'电脑 1获得锦标赛冠军'));
  assert(p.achievements.includes('tournament_finish'));assert.equal(p.achievements.includes('tournament_win'),heroWins);
  assert.equal(p.history[0].players,2);assert.equal(p.history[0].difficulty,'medium');assert.equal(p.history[0].buyin,200);assert.equal(p.history[0].lowStack,false);
  for(const id of ['poker_profit','poker_double','poker_comeback'])assert(!p.achievements.includes(id),'tournament chips do not award cash profit achievements');
  h.click('app-select',{game:'poker',mode:'tournament'});assert(h.html().includes('开始锦标赛'),'replay retains the tournament mode');
}
console.log('Tournament app checks passed: setup, free entry, independent bankroll, saves, rejected rebuys/cashouts, spectator timers, pause/help, rankings, wins and mode-aware achievements.');

{
  const p=tournamentProfile(2,true),g=p.active.game;p.active.difficulty='hard';
  g.finished=false;g.ranks=null;g.betweenHands=false;g.handCount=0;g.current=0;g.currentBet=200;
  g.players.forEach((player,i)=>{player.eliminated=false;player.place=null;player.stack=i===0?1:0;player.committed=i===0?199:200;player.streetBet=player.committed;player.allIn=i===1;player.needs=i===0});
  const h=harness(p);h.click('app-resume');h.click('p-call');const after=h.get();
  for(const title of ['锦标赛初体验','最后的赢家','高手擂台'])assert(h.html().includes(title),'newly played tournament milestones appear on the result screen');
  assert(h.html().includes('本场新成就'));assert.equal(after.history[0].difficulty,'hard');assert.equal(after.history[0].peakStack,400);
}

{
  const g=C.Games.poker.create(4,{mode:'tournament',buyin:200,small:1,big:2});g.board=[2,17,32,47,9];g.street='river';g.current=0;g.currentBet=200;
  const holes=[[12,25],[1,15],[0,14],[10,23]],commits=[199,200,200,20];
  g.players.forEach((player,i)=>{player.hole=holes[i];player.committed=commits[i];player.streetBet=commits[i];player.stack=200-commits[i];player.folded=i===3;player.allIn=player.stack===0;player.needs=i===0});
  const used=g.board.concat(...holes);g.deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.includes(i));
  const p=C.createProfile();p.active={type:'poker',players:4,difficulty:'hard',elapsedMs:100,paused:true,game:g};
  const h=harness(p);h.click('app-resume');h.click('p-call');const after=h.get();
  assert(after.games.poker);assert(after.achievements.includes('tournament_triple'));assert(h.html().includes('解锁成就：筹码登峰'),'a mid-match milestone gets immediate feedback');
  assert.equal(after.games.poker.game.tournamentPeakStack,620);assert.equal(after.games.poker.game.tournamentLowStack,false);
  h.save('poker');const file=JSON.parse(h.downloads.at(-1).data);h.import(file,'poker');assert.equal(h.get().games.poker.game.tournamentPeakStack,620);assert(h.get().achievements.includes('tournament_triple'));
}

{
  const p=C.createProfile();p.history=[{type:'poker',mode:'tournament',rank:1,elapsedMs:100,date:'测试记录'}];
  const h=harness(p);assert(h.get().achievements.includes('tournament_finish'));assert(h.get().achievements.includes('tournament_win'));
  assert(h.html().includes('achievement-section">锦标赛'));assert(h.html().includes('现金桌与通用'));assert(h.html().includes('满桌称王'));
  h.save();const backup=JSON.parse(h.downloads.at(-1).data);const restored=harness(backup);
  assert.deepEqual(restored.get().achievements,backup.achievements,'new tournament achievements survive JSON and repeated historical checks');
}
