'use strict';
const assert=require('node:assert/strict');global.window=global;
for(const f of ['core','achievements','splendor','scout','poker'])require('../js/'+f+'.js');
const C=GameCore,A=C.Achievements;
assert.equal(A.items.length,37);assert.equal(new Set(A.items.map(a=>a.id)).size,37);
{
  const p=C.createProfile();p.stats.splendor.completed=4;p.stats.scout.completed=3;p.stats.poker.completed=3;
  for(const s of Object.values(p.stats))s.wins=1;
  const unlocked=A.check(p);for(const id of ['first_win','explorer','regular','triple_winner','splendor_win','scout_win'])assert(unlocked.includes(id));
  assert(!p.achievements.includes('veteran'));assert.deepEqual(A.check(p),[],'checking twice does not award twice');
  p.stats.poker.completed=43;assert(A.check(p).includes('veteran'));assert.equal(A.progress(p,'explorer'),'3 / 3 款');
  const restored=JSON.parse(JSON.stringify(p));assert(C.validProfile(restored));assert.deepEqual(restored.achievements,p.achievements,'achievements survive backup/restore');
}
{
  const p=C.createProfile(),g=C.Games.splendor.create(2),me=g.players[0];
  me.cards=[0,1,2,3,4].map(color=>C.Games.splendor.cards.find(c=>c.bonus===color).id);me.nobles=[0,1];
  const a={type:'splendor',game:g};assert(A.check(p,a).includes('splendor_colors'));assert(p.achievements.includes('splendor_nobles'));
  me.cards=C.Games.splendor.cards.filter(c=>c.points===5).map(c=>c.id);g.finished=true;g.ranks=[1,2];
  assert(A.check(p,a).includes('splendor_20'));assert(p.achievements.includes('splendor_clean'));
}
{
  const G=C.Games.scout;
  for(const actor of [1,0]){
    const p=C.createProfile(),g=G.create(3),five=G.deck.slice(0,5).map(c=>({id:c.id,flip:false}));
    g.hands=g.hands.map(h=>h.filter(c=>c.id>=5));g.hands[actor]=five;g.orientationPending=false;g.current=actor;
    G.act(g,'c-show',{start:0,end:4});A.check(p,{type:'scout',game:g});
    assert.equal(g.maxCombo,5);assert.equal(p.achievements.includes('scout_combo'),actor===0,'only a human show earns the combo achievement');
  }
  const p=C.createProfile(),g=G.create(3);g.maxCombo=5;delete g.maxHumanCombo;A.check(p,{type:'scout',game:g});assert(!p.achievements.includes('scout_combo'),'old global combo records are not attributed to the human');
  g.roundScores=[[10,4,2],[5,5,0],[2,1,-1]];assert(A.check(p,{type:'scout',game:g}).includes('scout_round10'));assert(!p.achievements.includes('scout_sweep'));
  g.finished=true;g.ranks=[1,2,3];assert(A.check(p,{type:'scout',game:g}).includes('scout_sweep'));
}
{
  const p=C.createProfile(99999),g=C.Games.poker.create(2,{buyin:200,small:1,big:2}),a={type:'poker',game:g};
  g.handCount=10;g.players[0].buyins=400;g.players[0].stack=400;g.finished=true;g.ranks=[1,2];
  assert(A.check(p,a).includes('poker_ten_hands'));assert(!p.achievements.includes('poker_profit'));assert(!p.achievements.includes('poker_double'),'additional buyins or wallet funds are not profit');
  g.finished=false;g.players[0].stack=800;A.check(p,a);assert(!p.achievements.includes('poker_double'),'double requires cashing out');
  g.finished=true;g.hadLowStack=true;A.check(p,a);for(const id of ['poker_profit','poker_double','poker_comeback'])assert(p.achievements.includes(id));
}
{
  const p=C.createProfile();p.history=[{type:'poker',mode:'cash',rank:1,players:10,difficulty:'hard',buyin:200,peakStack:2000,lowStack:true}];
  A.check(p);assert(!p.achievements.some(id=>id.startsWith('tournament_')),'cash history cannot award tournament achievements');
  p.history.push({type:'poker',mode:'tournament',rank:2});assert(A.check(p).includes('tournament_finish'));
  p.history.push({type:'poker',mode:'tournament',rank:1});assert(A.check(p).includes('tournament_win'));
  assert.deepEqual(p.achievements.filter(id=>id.startsWith('tournament_')),['tournament_finish','tournament_win'],'old history only grants achievements supported by recorded fields');
  p.history.push({type:'poker',mode:'tournament',rank:1,players:9,difficulty:'hard',buyin:200,peakStack:1800,lowStack:true});
  A.check(p);for(const id of A.items.filter(a=>a.mode==='tournament').map(a=>a.id))assert(p.achievements.includes(id));
  const restored=C.attachSlots(JSON.parse(JSON.stringify(p)));assert(C.validProfile(restored));assert.deepEqual(A.check(restored),[],'restoring history never grants duplicates');
}
function tournamentResult(n,difficulty,rank,extra={}){
  const p=C.createProfile(),g=C.Games.poker.create(n,{mode:'tournament',buyin:200,small:1,big:2});
  g.finished=true;g.ranks=Array.from({length:n},(_,i)=>i===0?rank:i===rank-1?1:i+1);g.players[0].stack=rank===1?n*200:0;g.tournamentPeakStack=Math.max(200,g.players[0].stack);
  Object.assign(g,extra);return {p,g,session:{type:'poker',difficulty,game:g}};
}
for(const [n,difficulty,rank] of [[5,'hard',2],[6,'hard',2],[8,'medium',1],[9,'hard',1]]){
  const {p,g,session}=tournamentResult(n,difficulty,rank,{hadLowStack:true});A.check(p,session);
  assert(p.achievements.includes('tournament_finish'));assert.equal(p.achievements.includes('tournament_win'),rank===1);
  assert.equal(p.achievements.includes('tournament_finalist'),n>=6&&rank<=2);
  assert.equal(p.achievements.includes('tournament_full_table'),n>=9&&rank===1);
  assert.equal(p.achievements.includes('tournament_hard'),difficulty==='hard'&&rank===1);
  assert(!p.achievements.includes('tournament_comeback'),'the old all-in-sensitive flag is not evidence of a short tournament stack');
  for(const id of ['poker_profit','poker_double','poker_comeback'])assert(!p.achievements.includes(id));
  g.tournamentLowStack=true;A.check(p,session);assert.equal(p.achievements.includes('tournament_comeback'),rank===1);
}
{
  const p=C.createProfile(),g=C.Games.poker.create(4,{mode:'tournament',buyin:200,small:1,big:2}),session={type:'poker',difficulty:'hard',game:g};
  g.handCount=1;g.players[0].stack=600;A.check(p,session);assert(!p.achievements.includes('tournament_triple'),'in-flight chips are not counted as a settled peak');
  g.betweenHands=true;g.players[0].stack=599;A.check(p,session);assert(!p.achievements.includes('tournament_triple'));
  g.players[0].stack=600;assert(A.check(p,session).includes('tournament_triple'));
  assert(!p.achievements.includes('tournament_finish'),'an unfinished match is not completion');
  p.active=session;g.tournamentPeakStack=600;g.players[0].stack=100;
  assert.equal(A.progress(p,'tournament_triple'),'本场最高 600 / 600 筹码');
  g.tournamentLowStack=true;assert(A.progress(p,'tournament_comeback').includes('等待夺冠'));
}
console.log('Achievement checks passed: 37 unique achievements, tournament milestones, historical backfill, thresholds, cash separation, idempotence and save compatibility.');
