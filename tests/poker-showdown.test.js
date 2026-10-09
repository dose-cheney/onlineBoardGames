'use strict';
const assert=require('node:assert/strict');
global.window=global;require('../js/core.js');require('../js/poker.js');
const P=GameCore.Games.poker,c=(rank,suit)=>suit*13+rank-2;
const seats=html=>Array.from(html.matchAll(/<section class="poker-seat [^"]*"[^>]*>([\s\S]*?)<\/section>/g),m=>m[1]);
const cases=[
  {cards:[[14,0],[13,1],[9,2],[7,3],[5,0],[3,1],[2,2]],name:'高牌',text:'高牌 · A 高；踢脚 K / 9 / 7 / 5'},
  {cards:[[10,0],[10,1],[14,2],[13,3],[9,0],[6,1],[2,2]],name:'一对',text:'一对 · 10 对；踢脚 A / K / 9'},
  {cards:[[14,0],[14,1],[13,2],[13,3],[12,0],[9,1],[3,2]],name:'两对',text:'两对 · A 对 + K 对；踢脚 Q'},
  {cards:[[7,0],[7,1],[7,2],[14,0],[13,3],[5,3],[2,2]],name:'三条',text:'三条 · 7 三条；踢脚 A / K'},
  {cards:[[14,0],[2,1],[3,2],[4,3],[5,0],[13,3],[9,2]],name:'顺子',text:'顺子 · 5 高'},
  {cards:[[14,1],[13,1],[11,1],[9,1],[4,1],[12,0],[2,3]],name:'同花',text:'同花 · A / K / J / 9 / 4'},
  {cards:[[12,0],[12,1],[12,2],[9,0],[9,1],[2,2],[3,0]],name:'葫芦',text:'葫芦 · Q 三条 + 9 对'},
  {cards:[[12,0],[12,1],[12,2],[12,3],[14,0],[13,3],[4,2]],name:'四条',text:'四条 · Q 四条；踢脚 A'},
  {cards:[[5,0],[6,0],[7,0],[8,0],[9,0],[14,1],[14,2]],name:'同花顺',text:'同花顺 · 9 高'},
  {cards:[[10,1],[11,1],[12,1],[13,1],[14,1],[2,3],[3,2]],name:'皇家同花顺',text:'皇家同花顺'}
];
for(const test of cases){const rank=P.evaluate(test.cards.map(([r,s])=>c(r,s)));assert.equal(P.handName(rank),test.name);assert.equal(P.handDescription(rank),test.text)}

{
  const s=P.create(4,{buyin:200,small:1,big:2});
  s.board=[c(2,1),c(7,1),c(11,1),c(11,3),c(9,0)];
  s.players[0].hole=[c(14,1),c(13,1)]; // Ace-high flush.
  s.players[1].hole=[c(11,2),c(9,2)]; // Jacks full of nines.
  s.players[2].hole=[c(14,0),c(14,2)]; // Aces and jacks, nine kicker.
  s.players[3].hole=[c(8,3),c(4,0)];
  s.players.forEach((p,i)=>{p.folded=i===3;p.committed=200;p.stack=0});
  const used=s.board.concat(s.players.flatMap(p=>p.hole));s.deck=Array.from({length:52},(_,id)=>id).filter(id=>!used.includes(id));
  assert.deepEqual(P.showdown(s),[],'no hand strengths revealed during live play');
  assert(!P.render(s).includes('class="seat-hole-cards"'),'opponent hole cards stay hidden while playing');
  P.settle(s);
  assert.deepEqual(P.showdown(s).map(h=>h.name),['同花','葫芦','两对','已弃牌']);
  assert.equal(s.players[1].stack,800,'full house beats flush and two pair');
  assert.equal(s.handHistory[0].players[1].best.length,5,'the settled hand keeps its best five cards');
  assert.equal(s.handHistory[0].players[3].hole,null,'folded computer cards remain hidden in history');
  assert.equal(s.handHistory[0].awards[0].winners[0],1,'the pot distribution is retained');
  assert(s.log.some(t=>t.includes('你 — 同花 · A / K / J / 7 / 2')&&t.includes('电脑 1 — 葫芦')&&t.includes('电脑 3 — 已弃牌')));
  const html=P.render(s);assert(html.includes('本手牌力对照'));assert(html.includes('葫芦 · J 三条 + 9 对'));assert(!html.includes('8♣')&&!html.includes('4♠'),'folded opponent cards stay hidden');
  const renderedSeats=seats(html);assert.equal(renderedSeats.length,4);
  assert(renderedSeats[1].includes('J♦')&&renderedSeats[1].includes('9♦'),'both original hole cards appear in the correct computer seat');
  assert(renderedSeats[2].includes('A♠')&&renderedSeats[2].includes('A♦'));
  for(const i of [1,2])assert.equal((renderedSeats[i].match(/class="card playing-card /g)||[]).length,2,'the seat shows exactly two hole cards');
  assert(!renderedSeats[3].includes('seat-hole-cards'),'folded seat does not reveal cards');
  const restored=JSON.parse(JSON.stringify(s));assert(P.validate(restored,4));assert.deepEqual(P.showdown(restored),P.showdown(s),'save round trip retains hand descriptions');
  delete restored.showdown;assert(P.render(restored).includes('同花 · A / K / J / 7 / 2'),'old ended hands derive strengths from existing cards');
  s.players[0].stack=200;s.players[0].buyins+=200;P.act(s,'p-next',{});assert.deepEqual(P.showdown(s),[]);assert(!P.render(s).includes('<section class="poker-showdown"'),'new hand clears the settlement panel');assert(!P.render(s).includes('class="seat-hole-cards"'),'new hand hides the new computer cards');assert(s.log.some(t=>t.includes('手牌力：')&&t.includes('葫芦')),'previous strengths remain in history');
}
{
  const s=P.create(3,{buyin:200,small:1,big:2});
  s.board=[10,11,12,13,14].map(r=>c(r,2));
  s.players[0].hole=[c(2,0),c(3,1)];s.players[1].hole=[c(4,0),c(5,1)];s.players[2].hole=[c(6,0),c(7,1)];
  s.players.forEach((p,i)=>{p.committed=10;p.stack=190;p.folded=i===2});P.settle(s);
  assert.deepEqual(P.showdown(s).map(h=>h.name),['皇家同花顺','皇家同花顺','已弃牌']);assert.equal(s.players[0].stack,s.players[1].stack,'the public royal flush is an equal split');
  const seat=seats(P.render(s))[1];assert(seat.includes('4♠')&&seat.includes('5♥'),'hole cards are still visible when the best five use only public cards');
}
for(const river of [false,true]){
  const s=P.create(2,{buyin:200,small:1,big:2});
  if(river){s.board=[c(2,0),c(7,1),c(9,2),c(11,3),c(13,0)];s.street='river'}
  P.act(s,'p-fold',{});
  assert.deepEqual(P.showdown(s).map(h=>h.name),['已弃牌','未摊牌获胜']);
  assert(!P.render(s).includes('class="seat-hole-cards"'),'an uncontested win never reveals opponent hole cards, including on the river');
}
{
  const s=P.create(2,{buyin:200,small:1,big:2});
  for(let hand=1;hand<=35;hand++){
    P.act(s,'p-fold',{});
    assert.equal(s.handHistory.length,hand);
    if(hand<35)P.act(s,'p-next',{});
  }
  assert.equal(s.log.length,30,'the short recent-action feed remains bounded');
  assert(!s.log.some(line=>line.includes('第 1 手：')),'the old log has already dropped the first hand');
  assert(s.handHistory[0].events.some(line=>line.includes('第 1 手：')),'per-hand actions remain available');
  assert(s.handHistory[0].players[0].hole?.length===2,'the player can revisit their own cards');
  assert.equal(s.handHistory[0].players[1].hole,null,'an unshown opponent hand stays private');
  const html=P.render(s);
  assert.equal((html.match(/class="poker-history-hand"/g)||[]).length,35);
  assert(html.includes('本轮手牌历史 · 35 手可回看'));
  assert(html.includes('data-detail-id="poker-hand-1"'));
  assert(P.validate(JSON.parse(JSON.stringify(s)),2),'saved history restores with the current table');
}
console.log('Poker showdown checks passed: all hand types, kickers, payout comparison, board ties, saved hands, next hand, hidden cards.');
