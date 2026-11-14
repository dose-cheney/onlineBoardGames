'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../server/engines'),M=C.Games.mahjong,{Hub,settings}=require('../server/rooms');
const plain=x=>JSON.parse(JSON.stringify(x));

function fixture(hands, melds = [[],[],[],[]], current=0, indicator=4) {
  const s=M.create(4),pool=Array.from({length:136},(_,i)=>i);
  const take=t=>{const index=pool.findIndex(id=>M.type(id)===t);assert(index>=0,'too many copies of tile '+t);return pool.splice(index,1)[0];};
  s.indicator=take(indicator);Object.assign(s,M.specialTiles(indicator));s.discards=[];s.pending=null;s.roundPending=false;s.roundResult=null;s.lastDraw=null;s.current=current;
  s.players=Array.from({length:4},(_,i)=>({hand:(hands[i]||[]).map(take),melds:(melds[i]||[]).map(m=>({...m,ids:m.types.map(take)})),specials:[]}));
  for(let i=0;i<4;i++)if(hands[i]===undefined)s.players[i].hand=pool.splice(0,13);
  s.wall=pool;return s;
}
const small=[0,1,2,6,7,8,9,10,11,18,19,20,13,13];
const openSmall=[0,1,2,9,10,11,18,19,20,13,13];
const peng={kind:'peng',types:[6,6,6],from:1};
function peer(){return {packets:[],send(p){this.packets.push(plain(p));},close(){}};}
function online(bots=true,people=2) {
  const hub=new Hub(),users=Array.from({length:people},(_,i)=>hub.identity('麻友'+i));users.forEach(u=>hub.connect(u,peer()));
  const room=hub.create(users[0],{type:'mahjong',seats:4,bots,difficulty:'medium',turnSeconds:120});
  users.slice(1).forEach(u=>hub.join(u,room.id));users.forEach(u=>hub.prepare(room,u));hub.start(room,users[0]);return {hub,users,room};
}

test('physical wall, dice 4+6, upper indicator, skip, and all 136 unique tiles',()=>{
  let calls=0;const math=Object.create(Math);math.random=()=>{const call=calls++;return call===137?.5:call===138?.99:.2;};
  const context={Math:math,Date};context.window=context;vm.createContext(context);
  for(const file of ['core','mahjong'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+file+'.js','utf8'),context);
  const s=context.GameCore.Games.mahjong.create(4);
  assert.deepEqual(plain(s.dice),[4,6]);assert.equal(s.wallSeat,(s.dealer+9)%4);assert.equal(s.flipStack,6);
  const expected=(s.wallSeat*17+5+1+s.skip)%68;
  assert.equal(s.startWall,Math.floor(expected/17));assert.equal(s.startStack,expected%17+1);
  assert.equal(s.players.reduce((n,p)=>n+p.hand.length,0),53);assert.equal(s.wall.length,82);assert(!s.wall.includes(s.indicator));
  assert(M.validate(s,4));assert.equal(s.skip,M.type(s.indicator)<27?M.type(s.indicator)%9+1:1);
});

test('special tiles use the agreed red/north/green exceptions',()=>{
  assert.deepEqual(plain(M.specialTiles(30)),{special:[30,32],joker:31});
  assert.deepEqual(plain(M.specialTiles(31)),{special:[31,33],joker:32});
  assert.deepEqual(plain(M.specialTiles(32)),{special:[31,32],joker:33});
  assert.deepEqual(plain(M.specialTiles(8)),{special:[31,8],joker:0});
  assert.deepEqual(plain(M.specialTiles(33)),{special:[31,33],joker:27});
});

test('advanced Mahjong keeps a seven-pairs route closed when a beginner would pong',()=>{
  const s=fixture([[0,0,1,1,2,2,9,9,10,10,11,12,27],[0],[],[]],undefined,1,6);
  M.act(s,'m-discard',{tile:s.players[1].hand[0]},1);
  assert(s.pending.offers.find(o=>o.seat===0).options.some(o=>o.action==='m-peng'));
  const beginner=plain(s);
  M.bot(beginner,'easy',0);
  M.bot(s,'hard',0);
  assert.equal(beginner.players[0].melds[0].kind,'peng');
  assert.equal(M.opened(s.players[0]),false);
});

test('advanced Mahjong chi opens when it gives the hand a legal wait',()=>{
  const s=fixture([[0,1,9,10,11,12,13,18,19,20,22,22,27],[2],[],[]],undefined,1,6);
  M.act(s,'m-discard',{tile:s.players[1].hand[0]},1);
  const beginner=plain(s);
  M.bot(beginner,'easy',0);
  M.bot(s,'hard',0);
  assert.equal(M.opened(beginner.players[0]),false);
  assert.equal(s.players[0].melds[0].kind,'chi');
  M.bot(s,'hard',0);
  assert.equal(M.type(s.discards.at(-1).id),27);
});

test('advanced Mahjong keeps a useful joker and kongs it when the replacement has good waits',()=>{
  const common=[0,1,2,9,10,11,18,19,20,13,13,12,7];
  const keep=fixture([[...common,27],undefined,undefined,undefined],undefined,0,6);
  const kong=fixture([[...common,14],[],[],[]],undefined,0,6);
  const hidden=plain(keep);
  // Swap hidden tiles while preserving the number left in the wall.
  [hidden.players[1].hand[0],hidden.wall[0]]=[hidden.wall[0],hidden.players[1].hand[0]];
  hidden.wall.reverse();
  M.bot(keep,'hard');
  M.bot(hidden,'hard');
  M.bot(kong,'hard');
  assert.equal(M.type(keep.discards[0].id),27);
  assert.equal(hidden.discards[0].id,keep.discards[0].id);
  assert.equal(M.units(kong.players[0]),2);
});

test('old medium Mahjong rooms resolve to beginner without changing other games',()=>{
  assert.equal(settings({type:'mahjong',seats:4,difficulty:'medium'}).difficulty,'easy');
  assert.equal(settings({type:'mahjong',seats:4,difficulty:'hard'}).difficulty,'hard');
  assert.equal(settings({type:'splendor',seats:4,difficulty:'medium'}).difficulty,'medium');
});

test('advanced Mahjong changes its late defensive discard with the public river',()=>{
  const types=[0,1,3,5,8,9,12,15,17,19,22,24,27,28];
  const play=honor=>{
    const melds=[[],[{kind:'peng',types:[14,14,14]},{kind:'chi',types:[9,10,11]}],[],[]];
    const s=fixture([types,[],[],[]],melds,0,6);
    const take=t=>s.wall.splice(s.wall.findIndex(id=>M.type(id)===t),1)[0];
    s.players[1].specials=[{id:take(31),units:1},{id:take(7),units:2}];
    s.discards=[honor,honor,honor,1,4,5,18,20].map(t=>({id:take(t),seat:1,taken:false}));
    s.wall.length=15;
    M.bot(s,'hard');
    return M.type(s.discards.at(-1).id);
  };
  assert.equal(play(27),27);
  assert.equal(play(28),28);
});

test('clear/turbid, 258 pair, closed self only, and big multi-joker hands',()=>{
  let s=fixture([small]);let info=M.analyse(s,0);assert(info.clean);assert.equal(info.base,1);assert.equal(info.name,'门面清');
  assert.equal(M.analyse(s,0,null,false,false),null,'closed ordinary hand cannot claim a discard');
  s=fixture([[...small.slice(0,12),12,12]]);assert.equal(M.analyse(s,0),null,'small hand requires 258 pair');
  s=fixture([[...openSmall.slice(0,9),5,5]],[[peng],[],[],[]]);assert.equal(M.analyse(s,0),null,'two jokers never rescue an opened small hand');
  assert.equal(M.analyse(s,0,null,true)?.flower,true,'flower permits multiple jokers when the hand still has a valid 258 pair decomposition');
  s=fixture([[0,1,2,6,7,8,9,10,5,18,19,20,13,13]]);info=M.analyse(s,0);assert(info&&!info.clean);assert.equal(info.name,'门面清');
  s=fixture([[0,0,1,1,2,2,9,9,10,10,18,18,5,5]]);info=M.analyse(s,0);assert(info.seven&&info.big);assert(M.analyse(s,0,null,false,false),'seven pairs may win by discard');
  s=fixture([[0,0,0,9,9,9,18,18,5,13,5]],[[peng],[],[],[]]);info=M.analyse(s,0);assert(info?.kinds.includes('碰碰胡'));assert.equal(info.jokerCount,2);
  s.players[0].hand.push(s.wall.pop());assert.equal(M.analyse(s,0),null,'wrong hand count rejected');
});

test('all 2, 5 and 8 tiles win as 将一色 without four groups and a pair',()=>{
  const s=fixture([[1,1,1,7,7,10,10,13,16,16,19,22,22,25]]);
  s.lastDraw={seat:0,tile:s.players[0].hand.at(-1),flower:false};
  M.act(s,'m-hu',{},0);
  assert.deepEqual(plain(s.roundResult.info.kinds),['将一色']);
  assert.equal(s.roundResult.info.base,4);
  assert(M.validate(s,4));
});

test('price tiers, no dealer bonus, unopened exemptions, seven/closed exceptions and silver/gold',()=>{
  let s=fixture([small]);const base={base:1,clean:false,seven:false,flower:false};
  s.players[0].melds=[{kind:'peng',ids:[24,25,26],from:1}];
  let r=M.calculate(s,0,base);assert.deepEqual(plain(r.delta),[0,0,0,0]);
  s.players[1].melds=[{kind:'peng',ids:[28,29,30],from:0}];
  r=M.calculate(s,0,base);assert.equal(r.rows[1].jin,1);assert.equal(r.rows[1].cents,100);
  r=M.calculate(s,0,{...base,clean:true});assert.equal(r.rows[1].jin,2);assert.equal(r.rows[1].cents,100);
  const original=plain(r);s.dealer=0;assert.deepEqual(plain(M.calculate(s,0,{...base,clean:true})),original,'dealer does not add jin');
  s.players[0].melds=[];r=M.calculate(s,0,base);assert(r.rows.slice(1).every(r=>r.cents===100),'closed winner receives from all three');
  s.players[0].melds=[{kind:'peng',ids:[24,25,26],from:1}];r=M.calculate(s,0,{...base,base:2,seven:true});assert(r.rows.slice(1).every(r=>r.cents===100),'seven exception applies to each unopened payer');
  s.players[0].specials=[{id:20,units:2}];s.players[1].specials=[{id:21,units:2}];s.players[2].melds=[{kind:'peng',ids:[32,33,34],from:1}];s.players[2].specials=[{id:22,units:2}];
  r=M.calculate(s,0,base);assert.equal(r.top,'银顶');assert.deepEqual(plain(r.delta),[2000,-1000,-1000,0]);
  s.players[3].melds=[{kind:'peng',ids:[36,37,38],from:1}];r=M.calculate(s,0,base);assert.equal(r.rows[3].jin,4);assert.deepEqual(plain(r.delta),[2200,-1000,-1000,-200]);
  s.players[3].specials=[{id:23,units:2}];r=M.calculate(s,0,base);assert.equal(r.top,'金顶');assert.deepEqual(plain(r.delta),[4500,-1500,-1500,-1500]);
  s.players[0].melds=[];s.players[1].melds=[];s.players[2].melds=[];s.players[3].melds=[];
  r=M.calculate(s,0,{...base,base:4});assert.equal(r.top,'金顶','special gangs are opening and count for gold');assert.equal(C.sum(r.delta),0);
  assert.throws(()=>M.prices({1:0}),/金额/);assert.throws(()=>M.prices({gold:500}),/金额/);
});

test('all three opponents pay for an opened self draw or kong replacement win',()=>{
  for(const [flower,meld,jin,cents,reason] of [
    [false,peng,2,100,'自摸：三家付款'],
    [true,{kind:'exposed',types:[6,6,6,6],from:1},8,400,'杠上开花：三家付款']
  ]) {
    const s=fixture([openSmall],[[meld],[],[],[]]);
    s.lastDraw={seat:0,tile:s.players[0].hand.at(-1),flower};
    assert(M.opened(s.players[0]));
    M.act(s,'m-hu',{},0);
    const {info,rows,delta}=s.roundResult;
    assert.equal(info.source,flower?'flower':'self');
    assert(rows.slice(1).every(row=>!row.opened&&row.eligible&&row.jin===jin&&row.cents===cents&&row.reason===reason));
    assert.deepEqual(plain(delta),[cents*3,-cents,-cents,-cents]);
    assert(M.validate(s,4));
  }
});

test('simultaneous discard responses wait, win beats peng, and duplicates are rejected',()=>{
  const a=fixture([[9,0,1,2,6,7,8,18,19,20,13,13,21,22],[9,9,0,3,6,10,14,17,18,22,25,27,29],[9,10,11,12,13,14,18,19,20,23,23,23,13],[10,11,0,3,6,12,15,18,21,24,27,28,29]]);
  const tile=a.players[0].hand.find(id=>M.type(id)===9);M.act(a,'m-discard',{tile},0);assert(a.pending);
  const offers=a.pending.offers,window=a.pending.id;
  const pengOffer=offers.find(o=>o.seat===1);assert(pengOffer.options.some(o=>o.action==='m-peng'));
  M.act(a,'m-peng',{window},1);assert(a.pending,'one response cannot immediately consume the discard');
  assert.throws(()=>M.act(a,'m-peng',{window},1),/当前不能/);
  for(const o of offers)if(o.seat!==1&&a.pending)M.act(a,'m-pass',{window},o.seat);
  assert.equal(a.current,1);assert(M.opened(a.players[1]));assert(M.validate(a,4));
  assert(!M.ownOptions(a,1).some(o=>o.action==='m-hu'),'cannot count a peng/chi as self draw');
  assert.throws(()=>M.act(a,'m-pass',{window},0),/当前不能/);
  const b=fixture([[9,0,1,2,6,7,8,18,19,20,16,16,21,22],[9,9,0,3,6,10,14,17,18,22,25,27,29],[10,11,12,13,14,18,19,20,13,13],[10,11,0,3,6,12,15,18,21,24,27,28,29]],[[],[],[{kind:'peng',types:[23,23,23],from:0}],[]]);
  M.act(b,'m-discard',{tile:b.players[0].hand.find(id=>M.type(id)===9)},0);
  const windowB=b.pending.id;
  assert(b.pending.offers.find(o=>o.seat===2).options.some(o=>o.action==='m-hu'));
  M.act(b,'m-peng',{window:windowB},1);M.act(b,'m-hu',{window:windowB},2);
  if(b.pending&&M.canAct(b,3))M.act(b,'m-pass',{window:windowB},3);
  assert(b.roundPending);assert.equal(b.roundResult.winner,2,'hu beats a previously submitted peng');assert(M.validate(b,4));
});

test('single joker gang opens the hand, counts twice and draws from the tail',()=>{
  const s=fixture([[...small.slice(0,13),5]]);s.lastDraw={seat:0,tile:s.players[0].hand.at(-1),flower:false};
  const tile=s.players[0].hand.find(id=>M.type(id)===5),tail=s.wall.at(-1),length=s.wall.length;
  assert.throws(()=>M.act(s,'m-discard',{tile},0),/请选择合法/);
  M.act(s,'m-special',{tile},0);assert.equal(M.units(s.players[0]),2);assert(M.opened(s.players[0]));assert(s.players[0].hand.includes(tail));assert.equal(s.wall.length,length-1);assert(s.lastDraw.flower);assert(M.validate(s,4));
  assert.throws(()=>M.act(s,'m-special',{tile,step:s.step-1},0),/已更新/);
});

test('concealed and added gang tiles cannot be discarded',()=>{
  const s=fixture([[6,6,6,6,9,0,1,2,18,19,20]],[[{kind:'peng',types:[9,9,9],from:1}],[],[],[]]);
  for(const id of s.players[0].hand.filter(id=>[6,9].includes(M.type(id)))) {
    assert.throws(()=>M.act(s,'m-discard',{tile:id},0),/请选择合法/);
  }
  M.act(s,'m-gang',{tile:6,kind:'concealed'},0);
  assert.equal(s.players[0].melds.at(-1).kind,'concealed');
  assert(M.opened({melds:[s.players[0].melds.at(-1)],specials:[]}));
  assert(M.validate(s,4));
});

test('an unopened discarder pays for the win and the board shows only round amounts',()=>{
  const s=fixture([[9,0,1,2,6,7,8,18,19,20,16,16,21,22],undefined,[10,11,12,13,14,18,19,20,13,13],undefined],[[],[],[{kind:'peng',types:[23,23,23],from:0}],[]]);
  const discard=s.players[0].hand.find(id=>M.type(id)===9);
  s.totals=[9000,-9000,0,0];
  M.act(s,'m-discard',{tile:discard},0);
  const window=s.pending.id;
  for(const offer of s.pending.offers.slice()) {
    if(s.pending)M.act(s,offer.seat===2?'m-hu':'m-pass',{window},offer.seat);
  }
  assert.equal(s.roundResult.rows[0].opened,false);
  assert.equal(s.roundResult.rows[0].reason,'点炮付款');
  assert.deepEqual(plain(s.roundResult.delta),[-100,0,100,0]);
  const html=M.render(s);
  assert.equal((html.match(/class="mj-round-amount"/g)||[]).length,4);
  assert.match(html,/<section class="mj-winning-hand" aria-label="赢家牌面"><strong>电脑 2/);
  assert.match(html,/class="mj-tile [^"]*is-winning"/);
  assert.match(html,/未开口 · 0 杠<\/span><b class="mj-round-amount">0 元/);
  assert.doesNotMatch(html,/class="mj-round-amount">[^<]*(89|90) 元/);
});

test('added gang can be robbed, is scored as flower, and never commits its fourth tile twice',()=>{
  const s=fixture([[9,0,1,2,6,7,8,18,19,20,13],undefined,[10,11,12,13,14,18,19,20,13,13]],[[{kind:'peng',types:[9,9,9],from:1}],[],[{kind:'peng',types:[23,23,23],from:0}],[]]);
  const id=s.players[0].hand.find(id=>M.type(id)===9);
  M.act(s,'m-gang',{tile:9,kind:'added'},0);assert.equal(s.pending.kind,'rob');assert(s.players[0].hand.includes(id));assert.equal(s.players[0].melds[0].kind,'peng');
  const window=s.pending.id,offers=s.pending.offers.slice();assert(offers.find(o=>o.seat===2).options.some(o=>o.action==='m-hu'));
  for(const offer of offers)M.act(s,offer.seat===2?'m-hu':'m-pass',{window},offer.seat);
  assert.equal(s.roundResult.winner,2);assert(s.roundResult.info.flower);assert(s.roundResult.info.big);assert(s.players[2].hand.includes(id));assert(!s.players[0].hand.includes(id));assert.equal(s.players[0].melds[0].ids.length,3);assert(M.validate(s,4));
});

test('response timeout passes unanswered human seats without resetting the response window',()=>{
  const {hub,users,room}=online(false,4),s=room.game;
  let steps=0;while(!s.pending&&steps++<100&&!s.roundPending)M.bot(s);
  if(!s.pending){hub.closeRoom(room,users[0]);return;}
  hub.touch(room);const deadline=room.turnDeadline,window=s.pending.id,key=room.turnKey;
  hub.emote(room,users[0],'好牌！');assert.equal(room.turnDeadline,deadline,'chat does not extend a response window');
  const originalTimeout=global.setTimeout,originalNow=Date.now;let callback;
  try{
    global.setTimeout=fn=>{callback=fn;return {unref(){}};};hub.schedule(room);assert(callback);Date.now=()=>deadline+1;callback();
    assert(!room.game.pending||room.game.pending.id!==window);assert(room.turnKey!==key||room.game.roundPending);assert(M.validate(room.game,4));
  }finally{global.setTimeout=originalTimeout;Date.now=originalNow;hub.closeRoom(room,users[0]);}
});

test('many complete games and JSON resumes preserve cards, ledger, and zero-sum cents',()=>{
  for(let game=0;game<40;game++){
    let s=M.create(4);for(let round=0;round<3;round++){
      let steps=0;while(!s.roundPending&&steps++<1200){M.bot(s,game%2?'hard':'easy');assert(M.validate(s,4),'valid state after action');if(steps%13===0)s=plain(s);}
      assert(s.roundPending,'round finishes');assert.equal(C.sum(s.totals),0);assert.equal(s.ledger.length,round+1);
      if(round<2)M.act(s,'m-next');
    }
    M.act(s,'m-end');assert(M.validate(s,4));assert(s.finished&&s.endedAt>=s.startedAt);const result=M.summary(s);assert(result.final);assert.equal(result.ledger.length,3);
    const tamper=plain(s);tamper.wall.push(tamper.indicator);assert(!M.validate(tamper,4));
    const bad=plain(s);bad.totals[0]++;assert(!M.validate(bad,4));
  }
});

test('online fixed four seats, authenticated simultaneous seats, secrecy, session close and caches',()=>{
  assert.throws(()=>settings({type:'mahjong',seats:3,difficulty:'easy'}),/四个座位/);
  const ctx=online(),{hub,users,room}=ctx;assert.equal(room.seats.length,4);assert(M.validate(room.game,4));
  const viewer=users[0].peer.packets.filter(p=>p.type==='state').at(-1);assert(viewer.mahjongResult);assert.equal(viewer.mahjongResult.participants[0],'麻友0');assert(!viewer.mahjongResult.wall);assert(!viewer.mahjongResult.players);
  const html=viewer.gameHtml;
  const covered=[...html.matchAll(/class="mj-covered" role="img" aria-label="手牌 \d+ 张">(.*?)<\/div>/g)]
    .map(match=>[...match[1].matchAll(/<span><\/span>/g)].length);
  assert.deepEqual(covered.sort((a,b)=>a-b),Array.from(room.game.players.slice(1),p=>p.hand.length).sort((a,b)=>a-b));
  const wall=html.match(/class="mj-wall-tiles" role="img" aria-label="牌墙余牌 \d+ 张">(.*?)<\/div>/);
  assert.equal([...wall[1].matchAll(/<span><\/span>/g)].length,room.game.wall.length);
  assert(!html.includes('mj-winning-hand'));
  assert(!html.includes('undefined'));assert(!html.includes('NaN'));assert(room.turnDeadline>Date.now());
  assert.throws(()=>hub.gameAction(room,users[1],{action:'m-end',data:{}}),/房主/);
  for(let k=0;k<1200&&!room.game.roundPending;k++)M.bot(room.game,'hard');hub.touch(room);assert(room.game.roundPending);
  const result=users[0].peer.packets.filter(p=>p.type==='state').at(-1).mahjongResult;assert.equal(result.ledger.length,1);
  hub.leave(users[1]);assert.equal(room.phase,'finished');assert(room.game.finished);assert(users[1].peer.packets.some(p=>p.type==='mahjongResult'&&p.result.final));
  hub.closeRoom(room,users[0]);assert(!hub.rooms.has(room.id));
  const full=online(false,4);assert(M.validate(full.room.game,4));full.hub.closeRoom(full.room,full.users[0]);
  const h=new Hub(),a=h.identity('甲'),b=h.identity('乙');h.connect(a,peer());h.connect(b,peer());const r=h.create(a,{type:'mahjong',seats:4,bots:false,difficulty:'easy'});h.join(b,r.id);h.prepare(r,a);h.prepare(r,b);assert.throws(()=>h.start(r,a),/四名真人/);h.closeRoom(r,a);
});

test('old version-3 five-game profiles migrate without losing money or games',()=>{
  const p=plain(C.createProfile());delete p.games.mahjong;delete p.stats.mahjong;assert(C.validProfile(p));C.attachSlots(p);assert.equal(p.games.mahjong,null);assert.equal(p.wallet,2000);assert(C.validProfile(p));
});

test('room revision changes cannot invalidate a still-open mahjong response step',()=>{
  const {hub,users,room}=online(false,4);
  room.game=fixture([[9,0,1,2,6,7,8,18,19,20,16,16,21,22],[9,9,0,3,6,10,14,17,18,22,25,27,29],[10,11,12,13,14,18,19,20,13,13],[10,11,0,3,6,12,15,18,21,24,27,28,29]],[[],[],[{kind:'peng',types:[23,23,23],from:0}],[]]);
  const s=room.game;M.act(s,'m-discard',{tile:s.players[0].hand.find(id=>M.type(id)===9)},0);hub.touch(room);
  const revision=room.revision,step=s.step,window=s.pending.id;
  hub.handle(users[1],{kind:'gameAction',revision,action:'m-peng',data:{step,window}});
  assert(room.revision>revision);
  hub.handle(users[2],{kind:'gameAction',revision,action:'m-hu',data:{step,window}});
  assert(s.roundPending,'a confirmed hu need not wait for lower-priority chi');
  const before=JSON.stringify(s);
  assert.throws(()=>hub.handle(users[2],{kind:'gameAction',revision,action:'m-hu',data:{step,window}}),/游戏未运行|尚未轮到|当前不能|已更新/);
  assert.equal(JSON.stringify(s),before,'duplicate response preserves the pending responses');
  if(M.canAct(s,3))hub.handle(users[3],{kind:'gameAction',revision,action:'m-pass',data:{step,window}});
  assert(s.roundPending);assert.equal(s.roundResult.winner,2);assert(M.validate(s,4));hub.closeRoom(room,users[0]);
});

test('result cache survives recreation, prefers final/latest, escapes names and downloads JSON',()=>{
  let raw=null;const events={},downloads=[];
  function harness(){const c={localStorage:{getItem(){return raw},setItem(k,v){raw=v}},document:{addEventListener(n,fn){events[n]=fn},body:{appendChild(){}},createElement(){return {click(){downloads.push(this.download)},remove(){}}}},Blob,URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},setTimeout(){}};c.window=c;vm.runInNewContext(fs.readFileSync(__dirname+'/../js/mahjong-results.js','utf8'),c);return c.MahjongResults;}
  const api=harness(),s=M.create(4);while(!s.roundPending)M.bot(s);M.act(s,'m-end');const result=plain(M.summary(s));result.participants[0]='<script>alert(1)</script>';
  assert(api.save(result));assert.equal(harness().read().length,1);assert(!api.html().includes('<script>'));assert(api.html().includes('&lt;script&gt;'));
  const older={...result,final:false,ledger:[]};assert(!api.save(older));assert(api.read()[0].final);
  api.download(result);assert(downloads[0].endsWith('.json'));
});

test('a full localStorage still leaves the current result available for download',()=>{
  const context={localStorage:{getItem(){return null;},setItem(){throw Error('QuotaExceeded');}},document:{addEventListener(){}}};context.window=context;
  vm.runInNewContext(fs.readFileSync(__dirname+'/../js/mahjong-results.js','utf8'),context);
  const s=M.create(4);while(!s.roundPending)M.bot(s);M.act(s,'m-end');
  assert.equal(context.MahjongResults.save(M.summary(s)),false);assert.equal(context.MahjongResults.read()[0].sessionId,s.sessionId);
});

test('flower scoring never bypasses a non-258 pair, and does not invent rob eligibility',()=>{
  const s=fixture([[...small.slice(0,12),12,12]]);
  assert.equal(M.analyse(s,0,null,true,true),null);
  const ready=fixture([[...openSmall.slice(0,9),12]],[[peng],[],[],[]]);
  assert.equal(M.analyse(ready,0,12*4+1,true,false),null);
});

test('two hu notices are private and later hu waits for earlier decline without discarding',()=>{
  const build=()=>{const s=fixture([[29,3,3,12,12,14,14,15,15,16,16,21,21,22],undefined,[9,9,10,10,11,11,18,18,19,19,20,20,29],[0,0,1,1,2,2,6,6,7,7,8,8,29]]);M.act(s,'m-discard',{tile:s.players[0].hand.find(id=>M.type(id)===29)},0);return s;};
  let s=build(),window=s.pending.id;
  assert(M.render(s,{viewer:3}).includes('你可以胡'));assert(M.render(s,{viewer:2}).includes('你可以胡'));
  M.act(s,'m-hu',{window},2);assert(s.pending&&!s.roundPending);assert.equal(s.current,3);
  const before=s.discards.length,hand=s.players[3].hand.slice();
  assert(!M.render(s,{viewer:3}).includes('后面也有人'));
  M.act(s,'m-pass',{window},3);assert(s.roundPending);assert.equal(s.roundResult.winner,2);assert.equal(s.discards.length,before);assert.deepEqual(s.players[3].hand,hand);assert(M.validate(s,4));
  s=build();window=s.pending.id;M.act(s,'m-hu',{window},2);M.act(s,'m-hu',{window},3);assert.equal(s.roundResult.winner,3);
});

test('selection is a preview, latest discards belong to seats and special faces are marked',()=>{
  const {hub,users,room}=online(false,4),s=room.game,seat=s.current,tile=s.players[seat].hand[0],before=JSON.stringify(s);
  hub.preview(room,users[seat],{action:'m-select',data:{tile,step:s.step}});assert.equal(JSON.stringify(s),before);
  const html=users[seat].peer.packets.filter(p=>p.type==='state').at(-1).gameHtml;
  assert(html.includes('is-selected'));assert(!html.includes('庄家不加斤'));assert(html.includes('class="mj-river"'));
  assert.equal((html.match(/class="mj-river-zone/g)||[]).length,4);assert(html.includes('data-action="m-select"'));
  assert(M.tileHtml(33*4).includes('<rect'));assert(M.tileHtml(18*4).includes('<path'));assert(!M.tileHtml(33*4).includes('▱'));
  hub.closeRoom(room,users[0]);
});
