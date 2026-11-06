'use strict';
const assert=require('node:assert/strict');
global.window=global;
for(const file of ['core','achievements','athlete-data','athlete','flip7'])require('../js/'+file+'.js');
const C=GameCore,A=C.Games.athlete,F=C.Games.flip7;
const random=Math.random;
function seeded(seed){let x=seed;Math.random=()=>((x=x*1664525+1013904223>>>0)/4294967296)}
function race(ids,positions=ids.map(()=>0)){
  const s=A.create(ids.length,{draftMode:'random',trackMode:'mild'});
  s.phase='race';s.round=1;s.current=-1;s.tasks=[];
  s.racers=ids.map((id,owner)=>({id,owner,pos:positions[owner],out:false,tripped:false,place:0,ability:null,prediction:null,predicted:false,turns:0}));
  s.turn={i:0,start:positions[0],die:3,rerolls:0,merchantUsed:false,mainSkipped:false,extra:false,next:null,powers:0};
  return s;
}
function settle(s,max=400){for(let k=0;k<max&&s.tasks.length&&!s.pending&&!s.roundPending;k++)A.step(s);assert(s.tasks.length<max,'no growing unresolved branch');return s}
function drawFixture(cards){
  const s=F.create(3);
  // Pick each physical card once, preserving the full 94-card inventory.
  const picked=[];for(const [kind,value] of cards){const c=F.deck.find(c=>c.kind===kind&&c.value===value&&!picked.includes(c.id));assert(c);picked.push(c.id)}
  s.deck=F.deck.map(c=>c.id).filter(id=>!picked.includes(id)).concat(picked.slice().reverse());s.discard=[];s.roundCards=[];
  s.tasks=cards.map(()=>({kind:'draw',target:0}));s.tasks.push({kind:'turn',target:0});s.current=-1;return s;
}
function fstep(s){F.step(s);assert(F.validate(s,3));return s}

assert.equal(F.deck.length,94);assert.equal(F.deck.filter(c=>c.kind==='number').length,79);
for(let n=0;n<=12;n++)assert.equal(F.deck.filter(c=>c.kind==='number'&&c.value===n).length,n||1);
assert.equal(F.score({status:'active',numbers:[0,1,2,3,4,5,6],modifiers:['times',10],chance:false}),67,'double numbers, then flat bonus and Flip 7 bonus');
{
  const s=drawFixture([['chance',0],['number',12],['number',12]]);
  fstep(s);const protection=s.players[0].chanceCard;fstep(s);fstep(s);
  assert.equal(s.players[0].status,'active');assert.equal(s.players[0].chance,false);assert.equal(s.humanRescues,1);
  assert(s.discard.includes(protection));assert.deepEqual(s.players[0].numbers,[12]);
  fstep(s);assert.equal(s.current,0,'a rescued duplicate does not draw a replacement');
}
{
  const s=drawFixture([['chance',0],['chance',0]]);fstep(s);fstep(s);
  assert.deepEqual(s.pending.candidates,[1,2]);F.act(s,'f-target',{target:1});
  assert.equal(s.players[1].chance,true);assert(F.validate(s,3));
  const restored=JSON.parse(JSON.stringify(s));assert(F.validate(restored,3));fstep(restored);
}
{
  const s=drawFixture([['number',1],['number',2],['number',3],['number',4],['number',5],['number',6],['number',7]]);
  for(let i=0;i<7;i++)fstep(s);assert(s.roundPending);assert.equal(s.players[0].total,43);assert.equal(s.humanFlip7,1);assert.equal(s.tasks.length,0);
}
{
  const s=drawFixture([['three',0],['freeze',0],['number',8],['number',9]]);
  fstep(s);F.act(s,'f-target',{target:0});fstep(s);assert.equal(s.pending,null,'freeze is delayed inside Flip Three');
  fstep(s);fstep(s);assert.deepEqual(s.players[0].numbers,[8,9]);fstep(s);assert.equal(s.pending.kind,'freeze');
  F.act(s,'f-target',{target:0});assert.equal(s.players[0].status,'frozen');assert.equal(F.score(s.players[0]),17);
}
{
  const s=drawFixture([['three',0],['freeze',0],['number',12],['number',12]]);
  fstep(s);F.act(s,'f-target',{target:0});fstep(s);fstep(s);fstep(s);assert.equal(s.players[0].status,'bust');fstep(s);
  assert.equal(s.pending,null,'busting cancels deferred action cards');assert.equal(F.score(s.players[0]),0);
}
{
  const s=drawFixture([['three',0],['three',0],['chance',0],['number',8],['number',8],['number',9],['number',10]]);
  fstep(s);F.act(s,'f-target',{target:0});fstep(s);fstep(s);fstep(s);fstep(s);
  assert.equal(s.pending.kind,'three','nested Flip Three waits for the first three draws');F.act(s,'f-target',{target:0});
  fstep(s);assert.equal(s.humanRescues,1);fstep(s);fstep(s);assert.deepEqual(s.players[0].numbers,[8,9,10]);
}
{
  const s=F.create(3);s.players.forEach((p,i)=>{p.total=i<2?210:100});s.roundPending=true;s.current=0;
  F.act(s,'f-next');assert(!s.finished,'a tie above 200 starts an extra round for everyone');assert.equal(s.round,2);
  s.players[0].total=240;s.roundPending=true;s.current=0;F.act(s,'f-next');assert(s.finished);assert.deepEqual(s.ranks,[1,2,3]);
}
{
  const s=drawFixture([['number',1]]),held=F.deck.find(c=>c.kind==='number'&&c.value===12).id;
  s.deck=s.deck.filter(id=>id!==held);s.roundCards=[held];s.discard=s.deck.slice(0,-1);s.deck=s.deck.slice(-1);
  fstep(s);s.tasks.unshift({kind:'draw',target:1});fstep(s);assert(!s.deck.includes(held),'live round cards do not re-enter an exhausted deck');
}
assert.equal(A.racers.length,36);assert.equal(new Set(A.racers.map(r=>r.id)).size,36);
assert.deepEqual(A.gold,[3,4,4,5]);assert.deepEqual(A.silver,[1,2,2,3]);
assert.equal(Object.values(A.wild).filter(e=>e==='trip').length,3);assert.equal(Object.values(A.wild).filter(e=>e==='star').length,2);assert.equal(Object.values(A.wild).filter(Number.isInteger).length,5);
{
  const s=A.create(2);assert.deepEqual(s.draftOrder,[s.first,1-s.first,1-s.first,s.first,s.first,1-s.first,1-s.first,s.first]);
  while(s.phase==='draft')A.bot(s,'hard');assert.equal(s.teams[0].length,8);assert.equal(s.teams[1].length,8);
}
{
  const s=race(['legs','gunk','coach'],[25,5,25]);assert.equal(A.movementEnd(s,{i:0,amount:9}).end,34);
  s.racers[1].id='stickler';assert.equal(A.movementEnd(s,{i:0,amount:6}).blocked,true);assert.equal(A.movementEnd(s,{i:0,amount:5}).end,30);
}
{
  const s=race(['toad','banana','legs'],[3,4,5]);assert.equal(A.movementEnd(s,{i:0,amount:1}).end,6);
  s.tasks=[{kind:'move',i:0,amount:1}];settle(s);assert(s.racers[0].tripped,'skipping across banana trips the toad');
  assert(!s.log.some(t=>t.includes('检测到相同局面重复')),'independent jump notifications are not movement loops');
}
{
  const s=race(['legs','banana','genius'],[8,6,2]);s.tasks=[{kind:'move',i:0,amount:-4}];settle(s);assert.equal(s.racers[0].pos,4);assert(s.racers[0].tripped,'backward crossing also trips');
}
{
  const s=race(['legs','banana','genius'],[8,6,2]);s.tasks=[{kind:'warp-many',destinations:[{i:0,pos:4}]}];settle(s);assert(!s.racers[0].tripped,'teleportation never crosses banana');
}
{
  const s=race(['legs','fish','romantic']);s.tasks=[{kind:'move',i:0,amount:3}];settle(s);assert.equal(s.pending.kind,'follow');A.act(s,'a-choice',{value:'yes'});settle(s);
  assert.deepEqual(s.racers.map(r=>r.pos),[3,3,0],'simultaneous fish arrival does not trigger Romantic');
}
{
  const s=race(['legs','fish','romantic']);s.tasks=[{kind:'move',i:0,amount:3}];settle(s);A.act(s,'a-choice',{value:'skip'});settle(s);
  assert.deepEqual(s.racers.map(r=>r.pos),[3,0,0],'declining follow resumes the original move');
}
{
  const s=race(['legs','fish','romantic']);s.tasks=[{kind:'group-move',moves:[{i:0,amount:2}]}];settle(s);assert.equal(s.pending.kind,'group-follow');A.act(s,'a-choice',{value:'yes'});settle(s);
  assert.deepEqual(s.racers.map(r=>r.pos),[2,2,0]);
}
{
  const s=race(['mouth','legs','romantic'],[0,4,10]);s.tasks=[{kind:'warp-many',destinations:[{i:0,pos:4}]}];settle(s);assert(s.racers[1].eliminated,'Mouth also eats after teleporting');
}
{
  const s=race(['baby','legs','genius'],[0,0,7]);s.tasks=[{kind:'warp-many',destinations:[{i:1,pos:0}]}];settle(s);assert.equal(s.racers[1].pos,0,'Baby shares Start');
  s.racers[0].pos=8;s.tasks=[{kind:'warp-many',destinations:[{i:1,pos:8}]}];settle(s);assert.equal(s.racers[1].pos,7);
}
{
  const s=race(['legs','heckler','genius'],[0,5,12]);s.turn.start=0;s.tasks=[{kind:'end-turn',i:0}];settle(s);
  assert(s.log.some(x=>x.includes('嘲笑鬣狗从 5 → 7')),'Heckler resolves before the next turn starts');
}
{
  const s=race(['legs','gunk','coach']);s.tasks=[{kind:'main-move',i:0,base:5}];settle(s);assert.equal(s.racers[0].pos,5,'modifiers combine into a single move');
}
{
  const s=race(['magician','worm','lackey']);s.turn.die=1;s.pending={i:0,kind:'rolled',text:'',options:[{value:'reroll',label:''}]};s.current=0;
  Math.random=()=>.5;A.act(s,'a-choice',{value:'reroll'});settle(s);assert.equal(s.racers[1].pos,0,'the discarded 1 does not trigger Worm');assert.equal(s.racers[2].pos,0);
}
{
  const s=race(['sisyphus','legs','genius'],[10,2,4]);s.totals[0]=0;s.turn.die=6;s.tasks=[{kind:'roll-final',i:0,base:6}];settle(s);assert.equal(s.racers[0].pos,0);assert.equal(s.totals[0],0);assert.equal(s.raceScores[0],0,'loss cannot exceed actual remaining points');
}
{
  const s=race(['mastermind','legs','genius'],[29,10,5]);s.racers[0].prediction=0;s.tasks=[{kind:'move',i:0,amount:1}];settle(s);
  assert(s.roundPending);assert.equal(s.totals[0],4,'self prediction earns both prizes');
}
{
  const s=race(['copycat','legs','gunk']);s.tasks=[{kind:'main-prompt',i:0}];A.step(s);assert.equal(s.pending.kind,'leader');
  A.act(s,'a-choice',{value:'1'});assert.equal(A.ability(s,0),'legs');s.racers[0].pos=4;assert.equal(A.ability(s,0),null,'copying itself does not recurse');
}
{
  const s=race(['egg','legs','genius']);s.phase='prepare';s.pool=['twin','gunk','coach'];s.pastWinners=['sisyphus'];s.tasks=[{kind:'prepare',i:0}];A.step(s);A.act(s,'a-choice',{value:'twin'});A.step(s);
  assert.equal(s.pending.kind,'copy','Egg copies the complete before-race instruction of Twin');A.act(s,'a-choice',{value:'sisyphus'});A.step(s);assert.equal(s.totals[0],4);
}
// Replay many complete games, validate every decision, and resume serialized pending choices.
{
  const s=race(['legs','genius','alchemist']);s.phase='prepare';s.turn=null;s.firstRacer=1;
  s.tasks=[{kind:'prepare',i:0},{kind:'prepare',i:1},{kind:'prepare',i:2},{kind:'start-race'}];s.speed='step';
  const before=s.eventCount;A.act(s,'a-step');assert(s.eventCount>before,'a click skips silent setup and reaches a visible event');
  A.act(s,'a-step');assert.equal(s.current,1);assert(s.pending,'computer decision is a visible playback stop');
  const paused=JSON.parse(JSON.stringify(s));assert(A.render(s).includes('点击上方下一步执行电脑行动'));A.act(s,'a-step');
  assert(s.eventCount>paused.eventCount,'manual playback can execute a pending computer choice');
}
{
  const s=race(['legs','genius','alchemist']);s.tasks=[{kind:'main-prompt',i:0}];s.speed='step';
  A.act(s,'a-step');assert.equal(s.pending.kind,'main');const before=JSON.stringify(s);
  assert.throws(()=>A.act(s,'a-step'),/当前选项/);assert.equal(JSON.stringify(s),before,'playback cannot bypass a human decision');
  assert(A.render(s).includes('data-detail-id="athlete-record" open'),'recent events are expanded by default');
}
for(const type of ['athlete','flip7'])for(const n of [C.limits[type][0],6])for(let seed=1;seed<=24;seed++){
  seeded(seed);const G=C.Games[type];let s=G.create(n),steps=0;
  while(!s.finished&&steps++<25000){
    if(s.roundPending)G.act(s,type==='athlete'?'a-next':'f-next');
    else if(type==='athlete'&&s.phase==='lineup')G.act(s,'a-lineup',{id:s.teams[0].find(id=>!s.chosen[0].includes(id))});
    else G.bot(s,'hard');
    assert(G.validate(s,n),type+' state remains valid at step '+steps);
    if(steps%31===0){s=JSON.parse(JSON.stringify(s));assert(G.validate(s,n),'JSON resumes without losing queued effects')}
  }
  assert(s.finished,type+' '+n+' players seed '+seed+' finishes');assert.equal(s.ranks.length,n);
}
for(const n of [2,6]){
  seeded(17);let s=A.create(n,{draftMode:'random'});s.speed='step';let clicks=0;
  while(!s.finished&&clicks++<5000){
    if(s.roundPending)A.act(s,'a-next');
    else if(s.phase==='lineup')A.act(s,'a-lineup',{id:s.teams[0].find(id=>!s.chosen[0].includes(id))});
    else if(s.pending&&s.current===0)A.bot(s,'hard');
    else {const before=s.eventCount;A.act(s,'a-step');assert(s.eventCount!==before||s.pending||s.roundPending,'each click has visible feedback')}
    assert(A.validate(s,n));if(clicks%23===0)s=JSON.parse(JSON.stringify(s));
  }
  assert(s.finished,'manual playback finishes with all computer decisions under button control');
}
Math.random=random;
for(const version of [1,2]){
  const p=JSON.parse(JSON.stringify(C.createProfile()));delete p.games.athlete;delete p.games.flip7;delete p.stats.athlete;delete p.stats.flip7;p.version=version;
  if(version===1){p.active=null;delete p.games;delete p.activeType}
  assert(C.validProfile(p));const restored=C.attachSlots(p);assert.equal(restored.version,3);assert.equal(restored.wallet,2000);assert.equal(Object.keys(restored.games).length,6);assert(C.validProfile(restored));
}
for(const type of ['athlete','flip7']){
  const p=C.createProfile(),g=C.Games[type].create(4);p.active={type,players:4,difficulty:'medium',elapsedMs:0,paused:true,game:g};assert(C.validProfile(p));
  const bad=JSON.parse(JSON.stringify(g));bad.tasks=[{kind:'execute-unknown',target:0}];assert(!C.Games[type].validate(bad,4));
  const a=type==='athlete'?{totals:[20,12,8,3],humanWins:2,humanBestChain:5}:{humanFlip7:1,humanRescues:1,humanBestRound:50};Object.assign(g,a,{finished:true,ranks:[1,2,3,4]});
  const added=C.Achievements.check(p);assert.equal(added.filter(id=>id.startsWith(type)).length,4);assert.deepEqual(C.Achievements.check(p),[]);
}
console.log('New game checks passed: special cards, scores, tie overtime, movement, 36 abilities, grouped arrivals, copying, 96 complete seeded games, JSON resume, old migrations and achievements.');
