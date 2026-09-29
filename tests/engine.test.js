'use strict';
const assert=require('node:assert/strict');
global.window=global;
require('../js/core.js');require('../js/splendor.js');require('../js/scout.js');require('../js/poker.js');
const {Games}=GameCore;

assert.equal(Games.splendor.cards.length,90);
assert.deepEqual([1,2,3].map(t=>Games.splendor.cards.filter(c=>c.tier===t).length),[40,30,20]);
assert.equal(Games.splendor.nobles.length,10);
for(const n of [2,3,4]){
  for(let repeat=0;repeat<8;repeat++){
    const s=Games.splendor.create(n);let steps=0;
    while(!s.finished&&steps++<600){assert(Games.splendor.validate(s,n));Games.splendor.bot(s,'medium')}
    assert(s.finished,'Splendor '+n+' players must finish');
    assert(Games.splendor.validate(s,n));
  }
}

assert.equal(Games.scout.deck.length,45);
{
  const G=Games.scout,shuffle=GameCore.shuffle,random=Math.random;
  try{
    GameCore.shuffle=ids=>ids.slice();
    for(const n of [2,3,4,5]){
      let draws=0;Math.random=()=>draws++%2===0?.25:.75;
      const s=G.create(n),per=({2:11,3:12,4:11,5:9})[n],original=s.hands[0].map(c=>({...c}));
      assert.deepEqual(original.map(c=>c.flip),Array.from({length:per},(_,i)=>i%2===0),'each dealt card independently uses its random orientation');
      const dealtIds=G.deck.filter(c=>n!==3||c.b!==10).slice(0,per).map(c=>c.id);
      assert.deepEqual(original.map(c=>c.id),dealtIds,'random orientation does not rearrange the dealt hand');
      for(const hand of s.hands)assert(hand.some(c=>c.flip)&&hand.some(c=>!c.flip),'computer hand choice preserves the mixed orientations');
      G.act(s,'c-flip',{});assert.deepEqual(s.hands[0],original.slice().reverse().map(c=>({id:c.id,flip:!c.flip})),'whole-hand flip reverses order and toggles every orientation');
      G.act(s,'c-flip',{});assert.deepEqual(s.hands[0],original,'flipping twice restores the original mixed hand');
      const restored=JSON.parse(JSON.stringify(s));assert(G.validate(restored,n));assert.deepEqual(restored.hands,s.hands,'save/restore preserves all orientations');
      G.act(restored,'c-confirm',{});assert.throws(()=>G.act(restored,'c-flip',{}),'individual or whole-hand orientation cannot change after confirmation');
      const firstIds=s.hands.flat().map(c=>c.id);draws=1;s.round=1;s.roundPending=true;G.act(s,'c-next-round',{});
      assert.deepEqual(s.hands[0].map(c=>c.flip),Array.from({length:per},(_,i)=>i%2!==0),'the next round receives fresh random orientations');
      if(n===2){assert(!s.hands.flat().some(c=>firstIds.includes(c.id)),'second two-player round uses the reserved cards');assert.equal(new Set(firstIds.concat(s.hands.flat().map(c=>c.id))).size,44)}
    }
  }finally{GameCore.shuffle=shuffle;Math.random=random}
}
for(const n of [2,3,4,5]){
  for(let repeat=0;repeat<10;repeat++){
    const s=Games.scout.create(n);let steps=0;
    assert.equal(s.hands[0].length,({2:11,3:12,4:11,5:9})[n]);
    if(n>2)assert(s.hands[s.firstPlayer].some(c=>c.id===0),'holder of 1/2 opens the match');
    while(!s.finished&&steps++<700){assert(Games.scout.validate(s,n));if(s.roundPending)Games.scout.act(s,'c-next-round',{});else if(s.orientationPending)Games.scout.act(s,'c-confirm',{});else Games.scout.bot(s,'hard')}
    assert(s.finished,'SCOUT '+n+' players must finish');
    assert.equal(s.roundScores.length,n);
  }
}

const P=Games.poker,card=(r,s)=>s*13+r-2;
assert(P.compare(P.evaluate([card(14,0),card(2,1),card(3,2),card(4,3),card(5,0)]),P.evaluate([card(13,0),card(12,1),card(11,2),card(9,3),card(7,0)]))>0,'wheel straight beats high card');
assert.equal(P.evaluate([card(10,1),card(11,1),card(12,1),card(13,1),card(14,1)])[0],8,'straight flush');
assert.equal(P.evaluate([card(8,0),card(8,1),card(8,2),card(8,3),card(2,0)])[0],7,'quads');

{
  const s=P.create(3,{buyin:200,small:1,big:2});
  s.players[0].hole=[card(14,0),card(14,2)];
  s.players[1].hole=[card(13,0),card(13,2)];
  s.players[2].hole=[card(12,0),card(12,2)];
  s.board=[card(2,3),card(3,3),card(4,1),card(5,2),card(9,0)];
  [20,50,50].forEach((v,i)=>{s.players[i].committed=v;s.players[i].stack=0;s.players[i].folded=false});
  P.settle(s);
  assert.deepEqual(s.players.map(p=>p.stack),[60,60,0],'main and side pots pay distinct winners');
}
{
  const s=P.create(2,{buyin:200,small:1,big:2});
  s.players[0].hole=[card(2,0),card(3,1)];
  s.players[1].hole=[card(4,0),card(5,1)];
  s.board=[card(10,2),card(11,2),card(12,2),card(13,2),card(14,2)];
  s.players.forEach(p=>{p.committed=5;p.stack=0;p.folded=false});
  P.settle(s);
  assert.deepEqual(s.players.map(p=>p.stack),[5,5],'tied board splits pot');
}
{
  const s=P.create(3,{buyin:200,small:1,big:2});
  s.players[0].hole=[card(2,0),card(3,1)];
  s.players[1].hole=[card(4,0),card(5,1)];
  s.players[2].hole=[card(6,0),card(7,1)];
  s.board=[card(10,2),card(11,2),card(12,2),card(13,2),card(14,2)];
  s.players.forEach((p,i)=>{p.committed=1;p.stack=0;p.folded=i===2});
  P.settle(s);
  assert.deepEqual(s.players.map(p=>p.stack),[1,2,0],'odd chip goes clockwise from dealer');
}
{
  const s=P.create(2,{buyin:200,small:1,big:2});
  s.players[0].stack=1;s.players[1].stack=200;
  P.startHand(s);
  assert.equal(s.players[s.bb].committed,1,'short big blind posts its remaining chip');
  assert.equal(s.currentBet,2,'nominal big blind remains the price to call');
  P.act(s,'p-call',{});
  assert.equal(s.handCount,1,'all-in blind runs out and settles');
  assert.equal(s.players.reduce((v,p)=>v+p.stack,0),201,'short blind conserves chips');
}
{
  const s=P.create(3,{buyin:200,small:1,big:2});
  P.act(s,'p-bet',{amount:10});
  s.players[1].stack=11;
  P.act(s,'p-allin',{});
  P.act(s,'p-call',{});
  assert.equal(s.current,0);
  assert.throws(()=>P.act(s,'p-bet',{amount:20}),/重新开放/,'short all-in does not reopen raising');
}
for(const n of [2,4,10]){
  for(let repeat=0;repeat<6;repeat++){
    const s=P.create(n,{buyin:200,small:1,big:2});let steps=0;
    while(s.handCount<6&&steps++<1500){
      assert(P.validate(s,n));
      if(s.betweenHands){assert.equal(s.players.reduce((v,p)=>v+p.stack,0),s.players.reduce((v,p)=>v+p.buyins,0),'chips conserved after payout');if(s.players[0].stack<=0)break;P.act(s,'p-next',{});}
      else if(s.current===0)P.act(s,'p-call',{});
      else P.bot(s,'medium');
    }
    assert(steps<1500,'poker must not stall');
  }
}
console.log('All engine checks passed.');

{
  const G=Games.scout,s=G.create(3);
  s.orientationPending=false;s.current=0;s.hands[0]=s.hands[0].slice(0,1);
  s.captured=[3,2,1];s.tokens=[2,1,0];
  const remaining=s.hands.map(h=>h.length);
  G.act(s,'c-show',{start:0,end:0});
  assert(s.roundPending,'round waits for the player to acknowledge its score');
  assert.equal(s.roundSummary.rows[0].score,5);
  assert.equal(s.roundSummary.rows[1].score,3-remaining[1]);
  assert.equal(s.roundSummary.rows[0].penalty,0);
  const saved=JSON.stringify(s);G.bot(s,'hard');assert.equal(JSON.stringify(s),saved,'bots cannot skip the round summary');
  const restored=JSON.parse(saved);assert(G.validate(restored,3));
  G.act(restored,'c-next-round',{});assert(restored.orientationPending);assert(!restored.roundPending);
  assert.equal(restored.round,1);assert(restored.roundSummary,'previous recap remains available');
}
{
  const P=Games.poker,c=(r,s)=>s*13+r-2,ids=[[14,1],[13,1],[11,1],[9,1],[4,1],[12,0],[2,3]].map(([r,s])=>c(r,s));
  const best=P.bestHand(ids);assert.equal(best.cards.length,5);assert.deepEqual(P.rank5(best.cards),P.evaluate(ids));assert(best.cards.every(id=>ids.includes(id)));
  const s=P.create(3,{buyin:200,small:1,big:2});
  s.board=[10,11,12,13,14].map(r=>c(r,2));s.players.forEach((p,i)=>{p.hole=[c(2+i,0),c(5+i,1)];p.committed=1;p.stack=0;p.folded=i===2});
  const before=s.players.map(p=>p.stack);P.settle(s);
  assert.deepEqual(P.payoutTotals(s,P.awards(s)),s.players.map((p,i)=>p.stack-before[i]),'displayed awards include the actual odd-chip allocation');
}
console.log('Experience regressions passed: round recap, save/restore, paused bots, best five, exact payouts.');
