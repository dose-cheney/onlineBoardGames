(function () {
  'use strict';
  const C = window.GameCore, esc = C.escape;
  const names = ['一万','二万','三万','四万','五万','六万','七万','八万','九万','一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒','一条','二条','三条','四条','五条','六条','七条','八条','九条','东风','南风','西风','北风','红中','发财','白板'];
  const type = id => Math.floor(id / 4), label = i => C.onlineLabels?.[i] || (i === 0 ? '你' : '电脑 ' + i);
  const next = i => (i + 3) % 4;
  const money = cents => (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const defaultPrices = { 1:100, 2:100, 4:200, 8:400, 16:800, silver:1000, gold:1500 };
  const now = () => Date.now();
  function prices(input = {}) {
    const out = { ...defaultPrices, ...input };
    for (const key of Object.keys(defaultPrices)) if (!Number.isSafeInteger(out[key]) || out[key] < 1 || out[key] > 100000000) throw Error('金额需为有效的正数，最多 1,000,000 元');
    if (![1,2,4,8,16].every((v,i,a) => !i || out[v] >= out[a[i-1]]) || out.silver < out[16] || out.gold < out.silver) throw Error('金额档位须递增，银顶不低于普通封顶，金顶不低于银顶');
    return out;
  }
  function specialTiles(t) {
    if (t === 30) return { special:[30,32], joker:31 };
    if (t === 31) return { special:[31,33], joker:32 };
    return { special:[31,t], joker:t < 27 ? Math.floor(t / 9) * 9 + (t % 9 + 1) % 9 : 27 + (t - 27 + 1) % 7 };
  }
  function log(s, text) { s.log.unshift(text); s.log = s.log.slice(0,80); }
  function opened(p) { return p.melds.some(m => m.kind !== 'concealed'); }
  function units(p) { return p.specials.reduce((n,m) => n + m.units,0) + p.melds.reduce((n,m) => n + (m.kind === 'concealed' ? 2 : ['exposed','added'].includes(m.kind) ? 1 : 0),0); }
  function sort(p) { p.hand.sort((a,b) => a-b); }
  function create(n, options = {}) {
    if (n !== 4) throw Error('武穴麻将固定四个座位，缺位可由电脑补齐');
    const time = now();
    const s = { n:4, online:!!options.online, rulesVersion:1, sessionId:'mj-' + time + '-' + Math.floor(Math.random()*1e9), startedAt:time, endedAt:null,
      participantNames:Array.from({length:4},(_,i) => label(i)), prices:prices(options.prices), totals:[0,0,0,0], ledger:[], round:0, dealer:Math.floor(Math.random()*4),
      players:[], wall:[], discards:[], indicator:null, pending:null, lastDraw:null, current:0, step:0, roundPending:false, finished:false, ranks:null, log:[] };
    startRound(s); return s;
  }
  function startRound(s) {
    const physical = C.shuffle(Array.from({length:136},(_,i) => i));
    const dice = [1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)], sum = dice[0]+dice[1];
    // Four walls of 17 stacks, each stack stored upper tile then lower tile.
    const wallSeat = (s.dealer + sum - 1) % 4, flipStack = wallSeat*17 + Math.max(...dice)-1;
    s.indicator = physical[flipStack*2];
    const skip = type(s.indicator) < 27 ? type(s.indicator)%9+1 : 1;
    const startStack = (flipStack + 1 + skip) % 68;
    s.wall = Array.from({length:136},(_,i) => physical[(startStack*2+i)%136]).filter(id => id !== s.indicator);
    Object.assign(s, specialTiles(type(s.indicator)), { dice, wallSeat, flipStack:flipStack%17+1, skip, startWall:Math.floor(startStack/17), startStack:startStack%17+1,
      round:s.round+1, discards:[], players:Array.from({length:4},() => ({hand:[],melds:[],specials:[]})), pending:null, lastDraw:null,
      roundPending:false, current:s.dealer, roundResult:null });
    for(let batch=0;batch<3;batch++) for(let seat=0;seat<4;seat++) for(let k=0;k<4;k++) s.players[(s.dealer-seat+4)%4].hand.push(s.wall.shift());
    for(let seat=0;seat<4;seat++) s.players[(s.dealer-seat+4)%4].hand.push(s.wall.shift());
    const tile = s.wall.shift(); s.players[s.dealer].hand.push(tile); s.lastDraw={seat:s.dealer,tile,flower:false};
    s.players.forEach(sort); s.step++;
    log(s,'第 '+s.round+' 局：骰子 '+dice.join('＋')+'＝'+sum+'，'+label(wallSeat)+'牌墙第 '+s.flipStack+' 垛上牌翻出 '+names[type(s.indicator)]+'；跳 '+skip+' 垛，从'+label(s.startWall)+'牌墙第 '+s.startStack+' 垛起抓。');
  }
  function groups(counts, wild, left, tripOnly, memo = new Map()) {
    const first = counts.findIndex(v => v > 0);
    if (first < 0) return wild === left*3;
    if (left <= 0) return false;
    const key = counts.join('')+':'+wild+':'+left;
    if (memo.has(key)) return memo.get(key);
    let ok = false, take = Math.min(3,counts[first]);
    if (3-take <= wild) { counts[first]-=take; ok=groups(counts,wild-3+take,left-1,tripOnly,memo); counts[first]+=take; }
    if (!ok && !tripOnly && first < 27) for(let start=Math.max(Math.floor(first/9)*9,first-2);start<=first;start++) {
      if(start%9>6) continue;
      const ids=[start,start+1,start+2], used=ids.map(t=>counts[t]>0?1:0), need=3-C.sum(used);
      if(need>wild)continue;
      ids.forEach((t,i)=>counts[t]-=used[i]); ok=groups(counts,wild-need,left-1,tripOnly,memo); ids.forEach((t,i)=>counts[t]+=used[i]);
      if(ok)break;
    }
    memo.set(key,ok); return ok;
  }
  function shape(types, wild, count, restricted, tripOnly = false) {
    if(types.length+wild !== count*3+2)return false;
    const counts=Array(34).fill(0); types.forEach(t=>counts[t]++);
    for(let t=0;t<34;t++) {
      if(restricted && (t>=27 || ![1,4,7].includes(t%9)))continue;
      // A small hand must actually contain a 2/5/8, rather than two jokers alone.
      for(let take=Math.min(2,counts[t]);take>=1;take--) {
        if(2-take>wild)continue;
        counts[t]-=take;const ok=groups(counts,wild-2+take,count,tripOnly);counts[t]+=take;if(ok)return true;
      }
    }
    return !restricted && wild>=2 && groups(counts,wild-2,count,tripOnly);
  }
  function analyse(s, seat, extra = null, flower = false, self = true) {
    const p=s.players[seat], ids=p.hand.concat(extra===null?[]:[extra]), all=ids.concat(p.melds.flatMap(m=>m.ids));
    if(ids.some(id=>s.special.includes(type(id))) || ids.length !== 14-p.melds.length*3)return null;
    const actualJokers=ids.filter(id=>type(id)===s.joker).length, results=[];
    for(const clean of [true,false]) {
      const tiles=ids.map(type), wild=clean?0:actualJokers, plain=clean?tiles:tiles.filter(t=>t!==s.joker), allPlain=clean?all.map(type):all.map(type).filter(t=>t!==s.joker);
      if(!clean&&!wild)continue;
      const count=4-p.melds.length, seven=p.melds.length===0 && ids.length===14 && (()=>{const c=Array(34).fill(0);plain.forEach(t=>c[t]++);return c.filter(v=>v%2).length<=wild;})();
      const any=shape(plain,wild,count,false), small=shape(plain,wild,count,true);
      const trip=any && p.melds.every(m=>m.kind!=='chi') && shape(plain,wild,count,false,true);
      const same=allPlain.length>0 && allPlain.every(t=>t<27&&Math.floor(t/9)===Math.floor(allPlain[0]/9));
      const jiang=allPlain.length>0&&allPlain.every(t=>t<27&&[1,4,7].includes(t%9));
      const winds=allPlain.length>0&&allPlain.every(t=>t>=27);
      if(!any&&!seven&&!jiang&&!winds)continue;
      const kinds=[];
      if(seven)kinds.push('七对');if(trip)kinds.push('碰碰胡');if(same&&(any||seven))kinds.push('清一色');if(jiang)kinds.push('将一色');if(winds)kinds.push('风一色');
      const intrinsicBig=kinds.length>0, big=intrinsicBig||flower;
      if(!intrinsicBig&&!small)continue;
      if(opened(p)&&actualJokers>=2&&!big)continue;
      if(!self&&!opened(p)&&!seven)continue;
      if(flower)kinds.push(self?'杠上开花':'抢杠（按开花计分）');
      let pairType=null;
      if(!intrinsicBig){const counts=Array(34).fill(0);plain.forEach(t=>counts[t]++);for(let t=0;t<27&&pairType===null;t++){if(![1,4,7].includes(t%9))continue;for(let take=Math.min(2,counts[t]);take>=1;take--){if(2-take>wild)continue;counts[t]-=take;const ok=groups(counts,wild-2+take,count,false);counts[t]+=take;if(ok){pairType=t;break;}}}}
      const base=winds?16:(trip||same||jiang)?4:seven?2:1;
      results.push({name:kinds.join(' · ')||(!opened(p)?'门面清':'屁胡'), kinds, seven, clean, big, flower, base, self, jokerCount:actualJokers, winTile:extra??s.lastDraw?.tile??null, source:!self?(flower?'rob':'discard'):(flower?'flower':'self'), requires258:!intrinsicBig,pairType});
    }
    results.sort((a,b)=>(b.base*(b.clean?2:1))-(a.base*(a.clean?2:1)));
    return results[0]||null;
  }
  function calculate(s, winner, info) {
    const payAll=!opened(s.players[winner])||info.seven;
    const rows=s.players.map((p,i)=>{
      const eligible=i!==winner&&(payAll||opened(p)), gang=units(s.players[winner])+units(p);
      const jin=eligible?Math.min(16,info.base*(info.clean?2:1)*2**Math.min(gang+(info.flower?1:0),8)):0;
      return {seat:i,eligible,opened:opened(p),units:gang,jin,cents:jin?s.prices[jin]:0,reason:i===winner?'胡牌方':eligible?(payAll?'门面清／七对：三家付款':'已开口'): '未开口免付'};
    });
    const full=rows.filter(r=>r.jin===16),top=full.length===3?'金顶':full.length===2?'银顶':'普通';
    if(full.length>=2)full.forEach(r=>r.cents=s.prices[full.length===3?'gold':'silver']);
    const delta=rows.map(r=>-r.cents);delta[winner]=C.sum(rows.map(r=>r.cents));
    return {rows,delta,top};
  }
  function finishRound(s, winner = null, info = null, from = null) {
    const settlement=winner===null?{rows:[],delta:[0,0,0,0],top:'流局'}:calculate(s,winner,info);
    const result={round:s.round,at:now(),winner,from,info, ...settlement};
    s.totals=s.totals.map((v,i)=>v+settlement.delta[i]);s.ledger.push(result);s.roundResult=result;s.roundPending=true;s.pending=null;s.current=-1;s.lastDraw=null;s.step++;
    log(s,winner===null?'牌墙已摸完，本局流局。':label(winner)+' '+(info.clean?'清水':'浑水')+info.name+' · '+settlement.top+' · 本局 +'+money(settlement.delta[winner])+' 元。');
  }
  function draw(s, seat, flower = false) {
    if(!s.wall.length){finishRound(s);return;}
    const tile=flower?s.wall.pop():s.wall.shift();s.players[seat].hand.push(tile);sort(s.players[seat]);s.current=seat;s.lastDraw={seat,tile,flower};s.step++;
    log(s,label(seat)+(flower?'杠后补牌。':'摸牌。'));
  }
  function ownOptions(s, seat) {
    if(s.finished||s.roundPending||s.pending||s.current!==seat)return [];
    const p=s.players[seat], out=[];
    if(s.lastDraw?.seat===seat&&analyse(s,seat,null,!!s.lastDraw?.flower,true))out.push({action:'m-hu',label:'胡牌'});
    if(s.wall.length) {
      for(const id of p.hand)if(s.special.includes(type(id))||type(id)===s.joker)out.push({action:'m-special',tile:id,label:'杠 '+names[type(id)]+(type(id)===s.joker?' · 计两杠':'')});
      for(let t=0;t<34;t++) {
        if(s.special.includes(t)||t===s.joker)continue;
        if(p.hand.filter(id=>type(id)===t).length===4)out.push({action:'m-gang',kind:'concealed',tile:t,label:'暗杠 '+names[t]});
        if(p.hand.some(id=>type(id)===t)&&p.melds.some(m=>m.kind==='peng'&&type(m.ids[0])===t))out.push({action:'m-gang',kind:'added',tile:t,label:'补杠 '+names[t]});
      }
    }
    for(const id of p.hand)if(!s.special.includes(type(id)))out.push({action:'m-discard',tile:id,label:'打出 '+names[type(id)]});
    return out;
  }
  function responseOptions(s, seat, tile, from, kind) {
    const out=[],p=s.players[seat],t=type(tile);
    if(s.special.includes(t)||t===s.joker)return out;
    if(analyse(s,seat,tile,kind==='rob',false))out.push({action:'m-hu',label:kind==='rob'?'抢杠胡（须本来已听此牌）':'胡牌'});
    if(kind==='discard'&&t!==s.joker&&!s.special.includes(t)) {
      const same=p.hand.filter(id=>type(id)===t);
      if(same.length>=2)out.push({action:'m-peng',label:'碰 '+names[t]});
      if(same.length>=3&&s.wall.length)out.push({action:'m-claim-gang',label:'明杠 '+names[t]});
      if(seat===next(from)&&t<27)for(let first=Math.max(Math.floor(t/9)*9,t-2);first<=t;first++) {
        if(first%9>6)continue;
        const others=[first,first+1,first+2].filter(v=>v!==t);
        if(others.every(v=>v!==s.joker&&!s.special.includes(v)&&p.hand.some(id=>type(id)===v)))out.push({action:'m-chi',start:first,label:'吃 '+[first,first+1,first+2].map(v=>names[v]).join(' ')});
      }
    }
    return out;
  }
  function openResponses(s, tile, from, kind) {
    const offers=[];
    for(let k=1;k<4;k++) {const seat=(from-k+4)%4,options=responseOptions(s,seat,tile,from,kind);if(options.length)offers.push({seat,options});}
    s.pending={id:s.step+1,tile,from,kind,offers,answers:{}};s.step++;updateResponder(s);
    if(!offers.length)resolve(s);
  }
  function updateResponder(s) {
    const pending=s.pending,unanswered=pending.offers.filter(o=>!Object.hasOwn(pending.answers,o.seat));
    s.current=(unanswered.find(o=>o.options.some(x=>x.action==='m-hu'))||unanswered[0])?.seat??-1;
  }
  function finishResponses(s) {
    const p=s.pending;
    for(const offer of p.offers.filter(o=>o.options.some(x=>x.action==='m-hu'))) {
      if(!Object.hasOwn(p.answers,offer.seat))return;
      if(p.answers[offer.seat].action==='m-hu'){resolve(s);return;}
    }
    if(p.offers.every(o=>Object.hasOwn(p.answers,o.seat)))resolve(s);
  }
  function removeTypes(p, ts) {
    const ids=[];
    for(const t of ts){const at=p.hand.findIndex(id=>type(id)===t);if(at<0)throw Error('手牌不满足操作条件');ids.push(...p.hand.splice(at,1));}
    return ids;
  }
  function commitAdded(s, seat, id) {
    const p=s.players[seat],m=p.melds.find(m=>m.kind==='peng'&&type(m.ids[0])===type(id));
    p.hand.splice(p.hand.indexOf(id),1);m.ids.push(id);m.kind='added';s.pending=null;draw(s,seat,true);
  }
  function resolve(s) {
    const pending=s.pending;
    const priority={'m-hu':3,'m-claim-gang':2,'m-peng':2,'m-chi':1,'m-pass':0};
    const choices=pending.offers.map((o,index)=>({seat:o.seat,index,...pending.answers[o.seat]})).filter(o=>o.action&&o.action!=='m-pass').sort((a,b)=>priority[b.action]-priority[a.action]||a.index-b.index);
    if(!choices.length) {s.pending=null;if(pending.kind==='rob')commitAdded(s,pending.from,pending.tile);else draw(s,next(pending.from));return;}
    const pick=choices[0],p=s.players[pick.seat],t=type(pending.tile);
    if(pick.action==='m-hu') {
      const info=analyse(s,pick.seat,pending.tile,pending.kind==='rob',false);
      if(pending.kind==='rob'){const hand=s.players[pending.from].hand;hand.splice(hand.indexOf(pending.tile),1);}
      else s.discards.at(-1).taken=true;
      p.hand.push(pending.tile);sort(p);finishRound(s,pick.seat,info,pending.from);return;
    }
    s.discards.at(-1).taken=true;
    const ts=pick.action==='m-chi'?[pick.start,pick.start+1,pick.start+2].filter(v=>v!==t):Array(pick.action==='m-peng'?2:3).fill(t);
    const ids=removeTypes(p,ts).concat(pending.tile);
    if(pick.action==='m-chi')ids.sort((a,b)=>a-b);
    p.melds.push({kind:pick.action==='m-chi'?'chi':pick.action==='m-peng'?'peng':'exposed',ids,from:pending.from});
    s.pending=null;s.lastDraw=null;s.current=pick.seat;s.step++;
    log(s,label(pick.seat)+(pick.action==='m-chi'?'吃':pick.action==='m-peng'?'碰':'明杠')+names[t]+'。');
    if(pick.action==='m-claim-gang')draw(s,pick.seat,true);
  }
  function canAct(s,seat) {
    if(s.finished||s.roundPending)return false;
    return s.pending?s.pending.offers.some(o=>o.seat===seat&&!Object.hasOwn(s.pending.answers,seat)):s.current===seat;
  }
  function act(s,action,data = {},actor = 0) {
    if(s.finished)throw Error('本场已经结束');
    if(data.step!==undefined&&Number(data.step)!==s.step)throw Error('牌桌已更新，请使用当前操作');
    if(action==='m-next'||action==='m-end') {
      if(!s.roundPending)throw Error('请在本局结束后操作');
      if(action==='m-end'){s.finished=true;s.roundPending=false;s.endedAt=now();s.ranks=C.ranks(s.totals);s.step++;return;}
      if(s.roundResult.winner!==null)s.dealer=s.roundResult.winner;
      startRound(s);return;
    }
    if(!canAct(s,actor))throw Error('当前不能进行此操作');
    if(s.pending) {
      if(Number(data.window)!==s.pending.id)throw Error('响应窗口已结束');
      const offer=s.pending.offers.find(o=>o.seat===actor);
      const choice=action==='m-pass'?{action}:offer.options.find(o=>o.action===action&&(o.start===undefined||o.start===Number(data.start)));
      if(!choice)throw Error('不能响应此动作');
      s.pending.answers[actor]={...choice};updateResponder(s);
      finishResponses(s);
      return;
    }
    const choice=ownOptions(s,actor).find(o=>o.action===action&&(o.tile===undefined||o.tile===Number(data.tile))&&(o.kind===undefined||o.kind===data.kind));
    if(!choice)throw Error('请选择合法的出牌、胡牌或杠牌');
    const p=s.players[actor];
    if(action==='m-hu'){finishRound(s,actor,analyse(s,actor,null,!!s.lastDraw?.flower,true));return;}
    if(action==='m-special') {
      const id=choice.tile;p.hand.splice(p.hand.indexOf(id),1);p.specials.push({id,units:type(id)===s.joker?2:1});
      log(s,label(actor)+'杠出 '+names[type(id)]+(type(id)===s.joker?'（赖子杠，计两杠）':'')+'。');draw(s,actor,true);return;
    }
    if(action==='m-gang') {
      if(choice.kind==='added') {const id=p.hand.find(id=>type(id)===choice.tile);openResponses(s,id,actor,'rob');}
      else {p.melds.push({kind:'concealed',ids:removeTypes(p,Array(4).fill(choice.tile)),from:actor});log(s,label(actor)+'暗杠。');draw(s,actor,true);}
      return;
    }
    p.hand.splice(p.hand.indexOf(choice.tile),1);s.discards.push({id:choice.tile,seat:actor,taken:false});s.lastDraw=null;s.step++;
    log(s,label(actor)+'打出 '+names[type(choice.tile)]+'。');openResponses(s,choice.tile,actor,'discard');
  }
  function efficiency(s, seat, discard, difficulty) {
    const p=s.players[seat], counts=Array(34).fill(0);
    p.hand.filter(id=>id!==discard).forEach(id=>counts[type(id)]++);
    let value=0;
    for(let t=0;t<34;t++) {
      const n=counts[t];if(!n)continue;
      if(t===s.joker){value+=8*n;continue;}
      value+=n>=3?5:n===2?3:0;
      if(t<27)for(const offset of [1,2])if(t%9+offset<9)value+=Math.min(n,counts[t+offset])*(offset===1?1.6:.7);
      if(t<27&&[1,4,7].includes(t%9)&&n>=2)value+=1;
    }
    if(difficulty==='hard') {
      const publicCount=s.discards.filter(d=>!d.taken&&type(d.id)===type(discard)).length;
      value+=publicCount*.7;
    }
    return value;
  }
  function bot(s,difficulty='medium',forcedSeat=null) {
    if(s.finished||s.roundPending)return;
    const seat=forcedSeat??s.current;
    if(!canAct(s,seat))return;
    if(s.pending) {
      const offer=s.pending.offers.find(o=>o.seat===seat),hu=offer.options.find(o=>o.action==='m-hu');
      const choice=hu||offer.options.find(o=>o.action==='m-claim-gang')||offer.options.find(o=>o.action==='m-peng')||(difficulty==='easy'?null:offer.options.find(o=>o.action==='m-chi'))||{action:'m-pass'};
      act(s,choice.action,{...choice,window:s.pending.id},seat);return;
    }
    const options=ownOptions(s,seat),win=options.find(o=>o.action==='m-hu'),special=options.find(o=>o.action==='m-special'&&type(o.tile)!==s.joker),gang=options.find(o=>o.action==='m-gang');
    let choice=win||special||gang;
    if(!choice) {
      const discards=options.filter(o=>o.action==='m-discard');
      discards.sort((a,b)=>efficiency(s,seat,b.tile,difficulty)-efficiency(s,seat,a.tile,difficulty));
      choice=discards[0]||options[0];
    }
    act(s,choice.action,choice,seat);
  }
  function summary(s) { return {kind:'tablecorner-mahjong-result',version:1,sessionId:s.sessionId,startedAt:s.startedAt,endedAt:s.endedAt,final:s.finished,participants:s.participantNames.slice(),prices:{...s.prices},totals:s.totals.slice(),ledger:JSON.parse(JSON.stringify(s.ledger))}; }
  function validate(s,n) {
    try {
      if(n!==4||s.n!==4||s.rulesVersion!==1||s.players.length!==4||!Number.isInteger(s.round)||s.round<1||!Number.isInteger(s.step)||s.step<0)return false;
      if(!Number.isInteger(s.dealer)||s.dealer<0||s.dealer>3||!Number.isInteger(s.current)||s.current< -1||s.current>3)return false;
      const ids=[s.indicator,...s.wall,...s.discards.filter(d=>!d.taken).map(d=>d.id),...s.players.flatMap(p=>p.hand.concat(p.specials.map(m=>m.id),p.melds.flatMap(m=>m.ids)))];
      if(ids.length!==136||new Set(ids).size!==136||!ids.every(id=>Number.isInteger(id)&&id>=0&&id<136))return false;
      const special=specialTiles(type(s.indicator));if(s.joker!==special.joker||s.special.join()!==special.special.join())return false;
      if(s.players.some(p=>p.specials.some(m=>!s.special.includes(type(m.id))&&type(m.id)!==s.joker||m.units!==(type(m.id)===s.joker?2:1))||p.melds.length>4||p.melds.some(m=>!['chi','peng','concealed','exposed','added'].includes(m.kind)||m.ids.length!==(['chi','peng'].includes(m.kind)?3:4)|| (m.kind==='chi'?m.ids.map(type).sort((a,b)=>a-b).some((t,i,a)=>t>=27||Math.floor(t/9)!==Math.floor(a[0]/9)||i>0&&t!==a[i-1]+1):m.ids.some(id=>type(id)!==type(m.ids[0]))))))return false;
      for(let i=0;i<4;i++) {
        let hasDraw=false;
        if(s.roundPending||s.finished)hasDraw=s.roundResult?.winner===i;
        else if(s.pending)hasDraw=s.pending.kind==='rob'&&s.pending.from===i;
        else hasDraw=s.current===i;
        if(s.players[i].hand.length!==(hasDraw?14:13)-s.players[i].melds.length*3)return false;
      }
      if(s.totals.length!==4||!s.totals.every(Number.isSafeInteger)||C.sum(s.totals)!==0||s.ledger.length!==s.round-(s.roundPending||s.finished?0:1))return false;
      const tally=[0,0,0,0];for(const r of s.ledger){if(r.delta.length!==4||!r.delta.every(Number.isSafeInteger)||C.sum(r.delta)!==0)return false;r.delta.forEach((v,i)=>tally[i]+=v);}
      if(tally.some((v,i)=>v!==s.totals[i]))return false;
      prices(s.prices);
      if(s.pending){const p=s.pending;if(!['discard','rob'].includes(p.kind)||!Number.isInteger(p.id)||!Number.isInteger(p.from)||p.from<0||p.from>3||p.offers.some(o=>o.seat===p.from||o.seat<0||o.seat>3)||new Set(p.offers.map(o=>o.seat)).size!==p.offers.length)return false;if(p.kind==='discard'&&(s.discards.at(-1)?.id!==p.tile||s.discards.at(-1)?.taken))return false;if(p.kind==='rob'&&!s.players[p.from].hand.includes(p.tile))return false;}
      return typeof s.finished==='boolean'&&typeof s.roundPending==='boolean'&&Array.isArray(s.log)&&s.participantNames.length===4;
    }catch{return false;}
  }
  function tileHtml(id, options={}) {
    if(id===null)return '<span class="mj-tile mj-back" aria-label="背面牌"></span>';
    const t=type(id),rank=t%9+1,suit=Math.floor(t/9),digits=['一','二','三','四','五','六','七','八','九'];
    const positions={1:[[30,32]],2:[[18,16],[42,48]],3:[[15,14],[30,32],[45,50]],4:[[17,16],[43,16],[17,48],[43,48]],5:[[15,14],[45,14],[30,32],[15,50],[45,50]],6:[[17,13],[43,13],[17,32],[43,32],[17,51],[43,51]],7:[[15,12],[30,12],[45,12],[18,32],[42,32],[18,52],[42,52]],8:[[18,10],[42,10],[18,24],[42,24],[18,40],[42,40],[18,54],[42,54]],9:[[14,12],[30,12],[46,12],[14,32],[30,32],[46,32],[14,52],[30,52],[46,52]]};
    const bird='<path d="M15 42 Q4 22 22 18 Q32 5 41 16 L48 15 42 23 Q54 43 33 49 L22 57 24 46Z" fill="#187d55"/><path d="M20 26 Q38 20 40 37 Q30 45 20 26" fill="#e8cc66"/><path d="M23 29 35 37 24 39Z" fill="#286c9e"/><circle cx="35" cy="18" r="2" fill="#fff"/><circle cx="36" cy="18" r="1"/><path d="M13 35 6 51 19 44 M31 48 29 59 M37 47 40 57" fill="none" stroke="#b53d32" stroke-width="3"/>';
    let art;
    if(t>=27)art=t===33?'<rect x="9" y="9" width="42" height="47" rx="2" fill="none" stroke="#294d80" stroke-width="4"/><rect x="15" y="15" width="30" height="35" fill="none" stroke="#294d80"/>':'<text x="30" y="49" text-anchor="middle" font-family="serif" font-weight="bold" font-size="47" fill="'+(t===31?'#b62f28':t===32?'#167340':'#1b3444')+'">'+['東','南','西','北','中','發'][t-27]+'</text>';
    else if(suit===0)art='<text x="30" y="29" text-anchor="middle" font-family="serif" font-size="29" font-weight="bold" fill="#253644">'+digits[rank-1]+'</text><text x="30" y="57" text-anchor="middle" font-family="serif" font-size="27" font-weight="bold" fill="#b62f28">萬</text>';
    else if(suit===2&&rank===1)art=bird;
    else art=positions[rank].map(([x,y],i)=>suit===1?'<circle cx="'+x+'" cy="'+y+'" r="'+(rank===1?18:6)+'" fill="none" stroke="'+(['#294d80','#167340','#b62f28'][i%3])+'" stroke-width="3"/><circle cx="'+x+'" cy="'+y+'" r="'+(rank===1?10:2)+'" fill="'+(['#294d80','#167340','#b62f28'][i%3])+'"/>':'<rect x="'+(x-3)+'" y="'+(y-6)+'" width="6" height="12" rx="2" fill="'+(rank===5&&i===2?'#b62f28':'#167340')+'"/><path d="M'+(x-4)+' '+y+'h8" stroke="#f3deb2" stroke-width="1.5"/>').join('');
    const marks=options.joker?['宝']:options.skin?['皮']:options.gang?['杠']:[];
    const cls='mj-tile mj-suit-'+suit+(options.joker?' is-joker':'')+(options.selected?' is-selected':'')+(options.drawn?' is-drawn':'');
    const body='<svg viewBox="0 0 60 65" aria-hidden="true">'+art+'</svg><span class="mj-tile-name">'+names[t]+'</span>'+(marks.length?'<small class="mj-mark">'+marks.join('·')+'</small>':'');
    return options.button?'<button class="'+cls+'" data-action="m-select" data-tile="'+id+'" data-step="'+options.step+'" aria-label="选择'+names[t]+'" aria-pressed="'+!!options.selected+'" title="'+names[t]+'">'+body+'</button>':'<span class="'+cls+'" role="img" aria-label="'+names[t]+'" title="'+names[t]+'">'+body+'</span>';
  }
  function resultsHtml(s) {
    return '<section class="mj-ledger"><div class="row between"><h2>本场账单'+(s.finished?' · 已结束':'')+'</h2><button data-mj-export="'+s.sessionId+'">下载本场结果</button></div><p class="muted">'+esc(new Date(s.startedAt).toLocaleString('zh-CN'))+' — '+(s.endedAt?esc(new Date(s.endedAt).toLocaleString('zh-CN')):'进行中')+' · '+s.ledger.length+' 局 · 仅本场记账</p><div class="mj-totals">'+s.totals.map((v,i)=>'<div><span>'+esc(s.participantNames[i])+'</span><b class="'+(v>0?'win':'')+'">'+(v>0?'+':'')+money(v)+' 元</b></div>').join('')+'</div><details data-detail-id="mahjong-ledger" '+(s.roundPending?'open':'')+'><summary>逐局明细与付款依据</summary>'+s.ledger.slice().reverse().map(r=>'<article class="mj-bill"><strong>第 '+r.round+' 局 · '+(r.winner===null?'流局':esc(s.participantNames[r.winner])+' · '+(r.info.clean?'清水':'浑水')+esc(r.info.name)+' · '+r.top)+'</strong>'+(r.rows.length?'<ul>'+r.rows.filter(x=>x.seat!==r.winner).map(x=>'<li>'+esc(s.participantNames[x.seat])+'：'+x.jin+' 斤 · '+money(x.cents)+' 元 · '+x.reason+' · 双方 '+x.units+' 杠</li>').join('')+'</ul>':'<p>本局无人收付。</p>')+'</article>').join('')+'</details></section>';
  }
  function render(s,ui={}) {
    const viewer=ui.viewer??0,mine=canAct(s,viewer),host=!s.online||ui.isHost;
    const selection=ui.mjSelected?.step===s.step&&s.players[viewer].hand.includes(ui.mjSelected.tile)?ui.mjSelected.tile:null;
    const tile=(id,opts={})=>tileHtml(id,{skin:id!==null&&type(id)===type(s.indicator),joker:id!==null&&type(id)===s.joker,gang:id!==null&&(s.special.includes(type(id))||type(id)===s.joker),...opts});
    const buttons=choices=>choices.map(o=>'<button '+(o.action==='m-hu'?'class="mj-hu primary" ':'')+'data-action="'+o.action+'" data-step="'+s.step+'" '+(s.pending?'data-window="'+s.pending.id+'" ':'')+(o.tile!==undefined?'data-tile="'+o.tile+'" ':'')+(o.start!==undefined?'data-start="'+o.start+'" ':'')+(o.kind?'data-kind="'+o.kind+'" ':'')+'>'+esc(o.label)+'</button>').join('');
    let controls='';
    if(s.finished)controls='<p class="notice">本场已结束，账单已保存到本浏览器。</p>';
    else if(s.roundPending) {
      const r=s.roundResult,info=r.info;
      controls='<p class="notice">'+(r.winner===null?'本局流局':esc(label(r.winner))+' '+(info.clean?'清水':'浑水')+esc(info.name)+' · '+r.top)+'</p>';
      if(info)controls+='<div class="mj-win-proof">'+tile(info.winTile??null)+'<p>'+({self:'自摸：自己摸进这张牌成胡。',flower:'杠上开花：自己杠后补进这张牌成胡。',discard:'接炮：胡的是'+esc(label(r.from))+'打出的这张牌。',rob:'抢杠：原已听牌，胡的是'+esc(label(r.from))+'碰后补杠的这张牌；按开花计分。'})[info.source|| (info.self?'self':'discard')]+' '+(info.requires258?'将牌：'+names[info.pairType]+'（二五八将，允许宝补足）。':'本手符合牌型大胡条件。')+'</p></div>';
      controls+=host?buttons([{action:'m-next',label:'继续下一局'},{action:'m-end',label:'结束本场并结算'}]):'<p>等待房主继续下一局或结算。</p>';
    } else if(s.pending) {
      const offer=s.pending.offers.find(o=>o.seat===viewer),hu=mine&&offer.options.find(o=>o.action==='m-hu');
      controls='<p class="mj-turn" role="status">'+(hu?'你可以胡 '+names[type(s.pending.tile)]+'，请选择胡牌或放弃。':mine?'可直接吃、碰，或选择过；杠牌先选手牌。':offer?'已提交，等待本次响应结算。':'等待本次出牌结算。')+'</p>';
      if(mine){
        const candidates=offer.options.filter(o=>['m-chi','m-peng'].includes(o.action)||o.action==='m-claim-gang'&&selection!==null&&type(selection)===type(s.pending.tile));
        controls+=buttons([...(hu?[hu]:[]),...candidates,{action:'m-pass',label:selection===null?(hu?'放弃胡牌':'不吃不碰，过'):'继续出牌（先放弃本次响应）'}]);
        if(selection!==null)controls+='<p class="action-hint">已选 '+names[type(selection)]+'；本次不会把它打出，响应结束后才继续行牌。</p>';
      }
    } else {
      const options=mine?ownOptions(s,viewer):[],hu=options.find(o=>o.action==='m-hu');
      controls='<p class="mj-turn" role="status">'+(mine?'先点一张手牌，再确认打出或杠牌。':esc(label(s.current))+'正在行动…')+'</p>';
      if(hu)controls+=buttons([{...hu,label:'可以自摸胡牌'}]);
      if(selection!==null&&mine)controls+=buttons(options.filter(o=>o.action!=='m-hu'&&(o.action==='m-gang'?o.tile===type(selection):o.tile===selection)).map(o=>({...o,label:o.action==='m-discard'?'确认打出 '+names[type(selection)]:o.label})));
    }
    const seatHtml=i=>{
      const p=s.players[i],reveal=i===viewer||s.roundPending||s.finished,relative=(i-viewer+4)%4,last=s.discards.filter(d=>d.seat===i).at(-1);
      return '<section class="mj-seat mj-seat-'+relative+' '+(i===s.current?'current':'')+'"><header><strong>'+C.playerBadge(i,ui)+esc(label(i))+'</strong><span>'+(i===s.dealer?'庄 · ':'')+(opened(p)?'已开口':'未开口')+' · '+units(p)+' 杠 · '+money(s.totals[i])+' 元</span></header><div class="mj-hand '+(i===viewer?'mj-own-hand':'')+'">'+p.hand.map(id=>tile(reveal?id:null,{button:i===viewer&&mine,step:s.step,selected:selection===id,drawn:i===viewer&&!s.pending&&!s.roundPending&&!s.finished&&s.lastDraw?.seat===i&&s.lastDraw.tile===id})).join('')+'</div><div class="mj-melds">'+p.melds.map(m=>'<span class="mj-meld">'+m.ids.map(id=>tile(m.kind==='concealed'&&!reveal?null:id)).join('')+'<small>'+({chi:'吃',peng:'碰',concealed:'暗杠',exposed:'明杠',added:'补杠'})[m.kind]+'</small></span>').join('')+p.specials.map(m=>'<span class="mj-meld">'+tile(m.id)+'<small>'+m.units+' 杠</small></span>').join('')+'</div><div class="mj-seat-discard"><span>最新出牌</span>'+(last?tile(last.id)+'<small>'+(last.taken?'已被取走':'')+'</small>':'<small>尚未出牌</small>')+'</div><details class="mj-seat-history" data-detail-id="mj-river-'+i+'"><summary>本家出牌记录</summary>'+s.discards.filter(d=>d.seat===i).map(d=>tile(d.id)).join('')+'</details></section>';
    };
    return '<section class="mj-game"><div class="mj-toolbar"><div><span class="eyebrow">WUXUE / PRIVATE TABLE</span><h2>第 '+s.round+' 局</h2><span class="muted">牌墙余 '+s.wall.length+' 张</span></div><div class="mj-indicators"><div>皮子'+tile(s.indicator)+'</div><div>宝'+tile(s.joker*4)+'</div><div>可杠'+s.special.map(t=>tile(t*4)).join('')+'</div></div></div><div class="mj-board">'+[2,1,3].map(r=>seatHtml((viewer+r)%4)).join('')+'<div class="mj-center"><span>历史出牌</span><div class="mj-river">'+s.discards.map(d=>'<span class="mj-river-entry '+(d.taken?'is-taken':'')+'" title="'+esc(label(d.seat))+'打出'+names[type(d.id)]+(d.taken?'（已被取走）':'')+'">'+tile(d.id)+'</span>').join('')+'</div></div>'+seatHtml(viewer)+'</div><section class="mj-controls"><div class="actions">'+controls+'</div>'+(ui.error?'<p class="field-error" role="alert">'+esc(ui.error)+'</p>':'')+'</section>'+resultsHtml(s)+'<details class="mj-wall-guide" data-detail-id="mahjong-wall"><summary>骰子 '+s.dice.join(' + ')+' · 翻皮与抓牌位置</summary><p>从庄家起顺时针数 '+C.sum(s.dice)+' 位，选中'+esc(label(s.wallSeat))+'的牌墙；第 '+s.flipStack+' 垛上牌翻出 '+names[type(s.indicator)]+'。从该垛后跳 '+s.skip+' 垛，再从'+esc(label(s.startWall))+'牌墙第 '+s.startStack+' 垛起抓。</p></details><details class="table-details" data-detail-id="mahjong-log"><summary>最近行牌过程</summary><div class="log">'+s.log.map(t=>'<div>'+esc(t)+'</div>').join('')+'</div></details></section>';
  }
  C.Games.mahjong={create,act,bot,validate,render,canAct,ownOptions,analyse,calculate,summary,tileHtml,names,type,specialTiles,opened,units,defaultPrices,prices,money};
})();
