'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../js/core.js');require('../js/poker.js');
const P=GameCore.Games.poker;
const make=(n=4,extra={})=>P.create(n,{mode:'tournament',buyin:200,small:1,big:2,blindEvery:10,...extra});
function fixedShowdown(s,stacks,commits,holes){
  s.board=[2,17,32,47,9];s.street='river';
  s.players.forEach((p,i)=>{p.hole=holes[i];p.handStartStack=stacks[i];p.stack=stacks[i]-commits[i];p.committed=commits[i];p.streetBet=commits[i];p.folded=false;p.allIn=p.stack===0;p.needs=false});
  const used=s.board.concat(...holes);s.deck=Array.from({length:52},(_,i)=>i).filter(i=>!used.includes(i));
  P.settle(s);
}
const roundTrip=s=>{const restored=JSON.parse(JSON.stringify(s));assert(P.validate(restored,s.n));return restored};
{
  const s=make(2);P.act(s,'p-allin',{});assert.equal(s.players[0].stack,0);assert.equal(s.tournamentLowStack,false,'committing a full stack is not a short-stack episode');roundTrip(s);
}
for(const chips of [9,10]){
  const s=make(2);P.act(s,'p-fold',{});s.players[0].stack=chips;s.players[1].stack=400-chips;
  P.act(s,'p-next',{});assert.equal(s.tournamentLowStack,chips<10,'short stack is checked before posting blinds, strictly below five big blinds');
  roundTrip(s);
}
{
  const s=make();fixedShowdown(s,[200,200,200,200],[200,200,200,20],[[12,25],[1,15],[0,14],[10,23]]);
  assert.equal(s.players[0].stack,620);assert.equal(s.tournamentPeakStack,620);const restored=roundTrip(s);
  P.act(restored,'p-next',{});assert.equal(restored.tournamentPeakStack,620,'the settled peak survives the next hand');
  delete restored.tournamentPeakStack;delete restored.tournamentLowStack;assert(P.validate(restored,4),'earlier tournament saves without achievement tracking remain valid');
  const bad=roundTrip(s);bad.tournamentPeakStack=801;assert(!P.validate(bad,4));
}
{
  const s=make();assert.equal(s.players.reduce((v,p)=>v+p.stack+p.committed,0),800);
  fixedShowdown(s,[200,200,200,200],[200,200,200,20],[[0,14],[1,15],[12,25],[10,23]]);
  assert.deepEqual(s.players.map(p=>p.stack),[0,0,620,180]);
  assert.deepEqual(s.players.map(p=>p.place),[3,3,null,null],'equal starting stacks share an elimination place');
  assert(!s.finished);assert(P.render(s).includes('你已淘汰 · 第 3 名'));
  for(const text of ['app-rebuy','app-funding','p-end','钱包可用'])assert(!P.render(s,{wallet:2000,rebuyAmount:200}).includes(text));
  assert.throws(()=>P.endSession(s),/锦标赛/);
  const restored=roundTrip(s);P.act(restored,'p-next',{});
  assert.equal(restored.button,2);assert.equal(restored.sb,2);assert.equal(restored.bb,3);assert.equal(restored.current,2,'heads-up dealer acts first preflop');
  assert.deepEqual(restored.players.map(p=>p.hole.length),[0,0,2,2]);
  assert.deepEqual(restored.players.map(p=>p.buyins),[200,200,200,200],'busted computers never rebuy');
  assert.deepEqual(restored.players.slice(0,2).map(p=>p.stack),[0,0]);
  P.act(restored,'p-call',{});P.act(restored,'p-call',{});
  assert.equal(restored.street,'flop');assert.equal(restored.current,3,'heads-up big blind acts first postflop');
  roundTrip(restored);
  P.act(restored,'p-watch',{});assert.equal(restored.autoWatch,false);
}
{
  const s=make();fixedShowdown(s,[100,200,300,200],[100,200,200,20],[[0,14],[1,15],[12,25],[10,23]]);
  assert.deepEqual(s.players.map(p=>p.place),[4,3,null,null],'same-hand busts rank by stacks at hand start');roundTrip(s);
}
for(const heroWins of [true,false]){
  const s=make(2);fixedShowdown(s,[200,200],[200,200],heroWins?[[12,25],[0,14]]:[[0,14],[12,25]]);
  assert(s.finished);assert.deepEqual(s.ranks,heroWins?[1,2]:[2,1]);assert.equal(s.players[heroWins?0:1].stack,400);
  roundTrip(s);assert.throws(()=>P.act(s,'p-next',{}),/结束/);
}
for(const every of [0,2]){
  const s=make(2,{blindEvery:every});
  P.act(s,'p-fold',{});P.act(s,'p-next',{});assert.equal(s.big,2);
  P.act(s,'p-fold',{});assert(P.render(s).includes(every?'下一手升盲':'固定盲注'));P.act(s,'p-next',{});
  assert.equal(s.small,every?2:1);assert.equal(s.big,every?4:2);roundTrip(s);
}
{
  const s=make(2,{buyin:40,blindEvery:1});P.act(s,'p-fold',{});s.handCount=20;
  P.act(s,'p-next',{});if(!s.betweenHands)P.act(s,'p-call',{});assert(s.betweenHands,'short forced blinds settle after the remaining call');
  assert.equal(s.small,40);assert.equal(s.big,80);roundTrip(s);
}
{
  const s=make(),bad=JSON.parse(JSON.stringify(s));bad.players[0].stack++;assert(!P.validate(bad,4),'extra tournament chips are rejected');
  bad.players[0].stack--;bad.players[1].buyins+=200;assert(!P.validate(bad,4),'hidden computer rebuys are rejected');
  assert.throws(()=>make(4,{blindEvery:-1}));assert.throws(()=>make(4,{blindEvery:101}));
  const cash=P.create(4,{buyin:200,small:1,big:2});delete cash.mode;assert(P.validate(cash,4),'legacy cash saves remain valid');
}
let seed=1;const originalRandom=Math.random;
Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
let matches=0,maxHands=0;
try{
  for(const n of [2,3,6,9,10])for(const difficulty of ['easy','hard']){
    seed=n*101+(difficulty==='hard'?1:0);const s=make(n,{blindEvery:2});let actions=0;
    while(!s.finished){
      assert(++actions<10000,'tournament must finish');
      if(s.betweenHands){roundTrip(s);P.act(s,'p-next',{})}
      else if(s.current===0){const p=s.players[0],canRaise=!p.acted&&p.stack>s.currentBet-p.streetBet;P.act(s,canRaise?'p-allin':'p-call',{})}
      else P.bot(s,difficulty);
      assert(P.validate(s,n),'chips and saved states remain valid throughout the match');
      if(!s.betweenHands)assert(!s.players[s.current].eliminated,'eliminated seats never act');
    }
    assert.equal(s.ranks.filter(r=>r===1).length,1);assert.equal(s.players.reduce((v,p)=>v+p.stack,0),n*200);
    assert(s.players.every(p=>p.buyins===200));roundTrip(s);matches++;maxHands=Math.max(maxHands,s.handCount);
  }
}finally{Math.random=originalRandom}
console.log('Tournament checks passed: '+matches+' complete seeded matches (up to '+maxHands+' hands), elimination, tied places, heads-up, blinds, spectator controls, chip conservation and save restoration.');
