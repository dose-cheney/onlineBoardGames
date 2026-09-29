'use strict';
const assert=require('node:assert/strict');global.window=global;
for(const f of ['core','achievements','splendor','scout','poker'])require('../js/'+f+'.js');
const C=GameCore,A=C.Achievements;
assert.equal(A.items.length,30);assert.equal(new Set(A.items.map(a=>a.id)).size,30);
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
console.log('Achievement checks passed: 30 unique achievements, milestones, per-game conditions, human-only combos, cumulative buyins, idempotence and save compatibility.');
