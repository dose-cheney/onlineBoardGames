(function () {
  'use strict';
  const C=window.GameCore, M=C.Games.mahjong;
  const {type}=M;
  const isJiang=t=>t<27&&[1,4,7].includes(t%9);
  const anyTile=()=>true;
  const isHonor=t=>t>=27;
  const inSuit=[0,1,2].map(suit=>t=>Math.floor(t/9)===suit&&t<27);
  const suitStarts=[0,9,18,27];

  // Each entry is a possible completed group pattern within one suit.
  function targets(size, suited) {
    const groups=Array.from({length:size},(_,t)=>[t,t,t]);
    if(suited)for(let t=0;t<7;t++)groups.push([t,t+1,t+2]);
    const result=Array.from({length:5},()=>[[],[]]);
    const seen=new Set(), counts=Array(size).fill(0);
    function save(melds,pair,triplets,jiang) {
      const key=[melds,pair,triplets,jiang,...counts].join('');
      if(seen.has(key))return;
      seen.add(key);
      result[melds][pair].push({...tileBits(counts),triplets,jiang});
    }
    function collect(melds,start,triplets) {
      save(melds,0,triplets,false);
      for(let t=0;t<size;t++)if(counts[t]<=2) {
        counts[t]+=2;
        save(melds,1,triplets,suited&&isJiang(t));
        counts[t]-=2;
      }
      if(melds===4)return;
      for(let i=start;i<groups.length;i++) {
        const group=groups[i];
        for(const t of group)counts[t]++;
        if(group.every(t=>counts[t]<=4))collect(melds+1,i,triplets&&i<size);
        for(const t of group)counts[t]--;
      }
    }
    collect(0,0,true);
    return result;
  }
  let suitedTargets, honorTargets;
  const suitCache=[new Map(),new Map()];
  function popcount(value) {
    value-=(value>>>1)&0x55555555;
    value=(value&0x33333333)+((value>>>2)&0x33333333);
    return Math.imul((value+(value>>>4))&0x0f0f0f0f,0x01010101)>>>24;
  }

  function tileBits(counts) {
    // Each of the four copies has its own bit. Overlap counts tiles retained by a target.
    let low=0, high=0;
    for(let t=0;t<counts.length;t++)for(let copy=0;copy<counts[t];copy++) {
      const bit=t+copy*9;
      if(bit<32)low|=1<<bit;
      else high|=1<<(bit-32);
    }
    return {low,high};
  }

  function handEvaluator(s, remaining) {
    suitedTargets??=targets(9,true);
    honorTargets??=targets(7,false);
    const blocked=s.special;

    function suitCosts(counts,suit,groups,shortage) {
      const start=suitStarts[suit], suited=suit!==3;
      const held=counts.slice(start,start+(suited?9:7));
      const allowed=held.map((count,t)=>blocked.includes(t+start)?0:shortage?Math.min(4,count+remaining[t+start]):4);
      // A locked tile may appear in a winning group only when a joker fills that slot.
      const key=held.join('')+groups+allowed.join('');
      const cache=suitCache[suited?0:1], cached=cache.get(key);
      if(cached)return cached;
      const list=suited?suitedTargets:honorTargets, result=[], hand=tileBits(held), available=tileBits(allowed);
      for(let n=0;n<=groups;n++)for(let pair=0;pair<=1;pair++){
        let ordinary=Infinity, trip=Infinity, free=Infinity;
        const size=n*3+pair*2;
        for(const {low,high,triplets,jiang} of list[n][pair]) {
          const unavailable=popcount(low&~available.low)+popcount(high&~available.high);
          const cost=size-popcount(low&hand.low)-popcount(high&hand.high)+.25*unavailable;
          if(!pair||jiang)ordinary=Math.min(ordinary,cost);
          if(triplets)trip=Math.min(trip,cost);
          free=Math.min(free,cost);
        }
        result.push([ordinary,trip,free]);
      }
      if(cache.size>=5000)cache.delete(cache.keys().next().value);
      cache.set(key,result);
      return result;
    }
    function groupCost(suits,groups,route) {
      let costs=Array((groups+1)*2).fill(Infinity);
      costs[0]=0;
      for(const suit of suits) {
        const merged=Array(costs.length).fill(Infinity);
        for(let have=0;have<=groups;have++)for(let n=0;have+n<=groups;n++) {
          const out=(have+n)*2, before=have*2, add=n*2;
          merged[out]=Math.min(merged[out],costs[before]+suit[add][route]);
          merged[out+1]=Math.min(merged[out+1],costs[before+1]+suit[add][route],costs[before]+suit[add+1][route]);
        }
        costs=merged;
      }
      return costs[groups*2+1];
    }
    function pairCost(counts, allowed) {
      const costs=[];
      for(let t=0;t<34;t++)if(allowed(t)&&!blocked.includes(t)){
        const available=counts[t]+remaining[t];
        costs.push(Math.max(0,2-counts[t])+.25*Math.max(0,2-available),
          Math.min(2,4-counts[t])+.25*Math.min(2,4-available));
      }
      return costs.sort((a,b)=>a-b).slice(0,7).reduce((a,b)=>a+b,0);
    }
    return (p,counts,shortage=false)=>{
      const groups=4-p.melds.length, wild=counts[s.joker];
      const natural=counts;
      counts=natural.slice();
      counts[s.joker]=0;
      for(const t of blocked)counts[t]=0;
      const suits=suitStarts.map((_,suit)=>suitCosts(counts,suit,groups,shortage));
      const exposed=p.melds.flatMap(m=>m.ids.map(type));
      const goals=[];
      function add(cost,base,seven=false,limit=wild) {
        goals.push({distance:Math.max(0,cost-limit),base,seven});
      }
      if(!M.opened(p)||wild<2)add(groupCost(suits,groups,0),1);
      else {
        const clean=suitStarts.map((_,suit)=>suitCosts(natural,suit,groups,shortage));
        // An opened hand with two jokers must shed at least one before a small win.
        add(Math.max(2,groupCost(clean,groups,0)),1,false,0);
      }
      if(!p.melds.some(m=>m.kind==='chi'))add(groupCost(suits,groups,1),4);
      if(!exposed.length)add(pairCost(counts,anyTile),2,true);
      for(let suit=0;suit<3;suit++)if(exposed.every(inSuit[suit])){
        const pair=p.melds.length?Infinity:pairCost(counts,inSuit[suit]);
        add(Math.min(suits[suit][groups*2+1][2],pair),4);
      }
      for(const [allowed,base] of [[isJiang,4],[isHonor,16]])if(exposed.every(allowed)) {
        const retained=counts.reduce((sum,count,t)=>sum+(allowed(t)?count:0),0);
        const available=remaining.reduce((sum,count,t)=>sum+(allowed(t)&&!blocked.includes(t)&&t!==s.joker?count:0),0);
        if(retained+available+wild+remaining[s.joker]>=groups*3+2)add(groups*3+2-retained,base);
      }
      return goals;
    };
  }

  function visibleStock(s,seat) {
    const seen=new Set([s.indicator,...s.players[seat].hand,...s.discards.map(d=>d.id)]);
    const opponents=[];
    s.players.forEach((p,i)=>{
      for(const special of p.specials)seen.add(special.id);
      const exposed=p.melds.filter(m=>i===seat||m.kind!=='concealed');
      for(const meld of exposed)for(const id of meld.ids)seen.add(id);
      if(i!==seat)opponents.push({seat:i,opened:M.opened(p),groups:p.melds.length,exposed:exposed.flatMap(m=>m.ids.map(type)),
        discards:s.discards.filter(d=>d.seat===i).map(d=>type(d.id))});
    });
    if(s.pending)seen.add(s.pending.tile);
    const remaining=Array(34).fill(4);
    for(const id of seen)remaining[type(id)]--;
    const drawTiles=remaining.flatMap((count,t)=>{
      if(count<=0||s.special.includes(t))return [];
      const id=[0,1,2,3].map(i=>t*4+i).find(id=>!seen.has(id));
      return [{t,id,count}];
    });
    return {remaining,drawTiles,opponents};
  }

  function discardRisk(s,seat,t,stock,table) {
    const {remaining,opponents}=stock;
    const honor=t>=27, stage=1-Math.min(82,s.wall.length)/82;
    let risk=0;
    for(const {seat:other,groups,exposed,discards} of opponents) {
      const ready=groups>0||discards.length>=8;
      const same=discards.includes(t);
      const pair=remaining[t], wild=remaining[s.joker]+Number(t===s.joker);
      const possibleHonorFlush=groups===0||exposed.length&&exposed.every(isHonor);
      if(honor&&pair===0&&wild===0&&!possibleHonorFlush)continue;
      let runs=0;
      if(!honor)for(let start=Math.max(t-t%9,t-2);start<=t&&start%9<=6;start++) {
        const mates=[start,start+1,start+2].filter(x=>x!==t);
        const missing=mates.filter(x=>remaining[x]===0||s.special.includes(x)).length;
        if(missing===0)runs++;
        else if(missing<=wild)runs+=.35;
      }
      const exposedSuit=inSuit[Math.floor(exposed[0]/9)];
      const flush=exposed.length>=6&&exposedSuit&&exposed.every(exposedSuit);
      const honorFlush=exposed.length>=6&&exposed.every(isHonor);
      const jiangFlush=exposed.length>=6&&exposed.every(isJiang);
      const pattern=honorFlush?(honor?1.7:.55):jiangFlush?(isJiang(t)?1.6:.65):flush?(exposedSuit(t)?1.55:.55):1;
      const threat=(.10+stage*.29+groups*.105+(ready?.08:0))*pattern;
      const fit=.13+pair*.18+runs*.20+(isJiang(t)?.13:0)+(honor&&possibleHonorFlush?.08:0);
      // Previously discarded tiles are evidence of lower risk, with no furiten rule.
      const confidence=same?.48:1;
      const base=honorFlush?16:flush||jiangFlush||groups>=3?4:1;
      const amount=M.calculate(table,other,{base,clean:true,source:'discard'},seat).rows[seat].cents;
      risk+=threat*fit*confidence*Math.log2(1+amount/s.prices[1]);
    }
    return risk;
  }

  function advancedChoice(s,seat,options,project) {
    const stock=visibleStock(s,seat), p=s.players[seat];
    const evaluate=handEvaluator(s,stock.remaining), price=s.prices[1];
    const stage=1-Math.min(82,s.wall.length)/82;
    const countTiles=hand=>{
      const counts=Array(34).fill(0);
      for(const id of hand)counts[type(id)]++;
      return counts;
    };
    const isKong=choice=>['m-gang','m-special','m-claim-gang'].includes(choice.action);
    const winPrices=new Map(), riskPrices=new Map();
    function exposureKey(player) {
      return M.units(player)*2+Number(M.opened(player));
    }
    function exposureCost(player) {
      if(!M.opened(player))return 0;
      const key=exposureKey(player);
      if(riskPrices.has(key))return riskPrices.get(key);
      const paid=stock.opponents.filter(other=>other.opened);
      if(!paid.length)return 0;
      const table=tableFor(player);
      const cost=C.sum(paid.map(({seat:other})=>Math.log2(1+M.calculate(table,other,{
        base:1,clean:true,source:'discard'
      }).rows[seat].cents/price)))/paid.length;
      riskPrices.set(key,cost);
      return cost;
    }
    function tableFor(player) {
      const players=s.players.slice();
      players[seat]=player;
      return {...s,players};
    }
    function payout(table,info) {
      const key=[exposureKey(table.players[seat]),info.base,!!info.clean,!!info.flower].join(':');
      if(!winPrices.has(key))winPrices.set(key,M.calculate(table,seat,info).delta[seat]);
      return winPrices.get(key);
    }
    function assess(player, discard, replacement=false) {
      const hand=discard===undefined?player.hand:player.hand.filter(id=>id!==discard);
      const after={...player,hand}, counts=countTiles(hand), table=tableFor(after);
      const goals=evaluate(after,counts);
      const distance=Math.min(...goals.map(goal=>goal.distance));
      let outs=0, reward=0, flower=0, claims=0;
      const canDraw=s.wall.length>0;
      // Verify actual waits with the same legality and scoring used when a player wins.
      const hasLockedTiles=hand.some(id=>s.special.includes(type(id)));
      if(!hasLockedTiles&&(distance<=1.75||replacement&&distance<=2))for(const {t,id,count} of stock.drawTiles) {
        const win=M.analyse(table,seat,id,false,true);
        if(win){
          const claim=t!==s.joker&&M.analyse(table,seat,id,false,false);
          if(claim)claims+=count;
          if(canDraw||claim){
            outs+=count;
            reward+=count*payout(table,win);
          }
        }
        if(replacement){
          const bloom=win?.big?{...win,flower:true}:M.analyse(table,seat,id,true,true);
          if(bloom)flower+=count*payout(table,bloom);
        }
      }
      const steps=outs?1:Math.max(2,distance);
      let potential=0;
      for(const goal of goals){
        const amount=payout(table,{...goal,clean:!counts[s.joker],self:true});
        potential=Math.max(potential,Math.log2(1+amount/price)/(1+Math.max(0,goal.distance-steps)*2));
      }
      const value=outs?Math.log2(1+reward/(outs*price)):potential;
      const risk=discard===undefined?0:discardRisk(s,seat,type(discard),stock,table);
      const protection=(.30+stage*.65)*Math.min(steps-1,4)+.22+(canDraw?0:1.5);
      const opening=(steps-1)*(.13+stage*.30)*exposureCost(after);
      const lockedPenalty=hand.reduce((sum,id)=>sum+(s.special.includes(type(id))?1:0),0)*.12;
      return {after,counts,steps,outs,score:-3.2*steps+.45*Math.log1p(outs+claims*.5)+
        .52*value-protection*risk-opening-lockedPenalty+(replacement?.2+Math.log1p(flower/(price*45))*.65:0)
        +(discard!==undefined&&type(discard)>=27&&counts[type(discard)]===0?.04:0)};
    }
    function candidates(player) {
      const table=tableFor(player);
      const valid=M.ownOptions({...table,pending:null,current:seat,lastDraw:null},seat);
      const used=new Set(), results=[];
      for(const choice of valid)if(choice.action==='m-discard'&&!used.has(type(choice.tile))){
        used.add(type(choice.tile));
        results.push({...assess(player,choice.tile),choice});
      }
      return results;
    }
    function bestDiscard(player, lookAhead=false) {
      const results=candidates(player).sort((a,b)=>b.score-a.score);
      for(const result of lookAhead?results.slice(0,3):[])if(!result.outs&&result.steps<=4&&s.wall.length) {
        let improvement=0;
        const attainable=Math.min(...evaluate(result.after,result.counts,true).map(goal=>goal.distance));
        result.score-=.65*Math.max(0,attainable-result.steps);
        for(const {t,count} of stock.drawTiles){
          result.counts[t]++;
          const next=Math.min(...evaluate(result.after,result.counts).map(goal=>goal.distance));
          result.counts[t]--;
          if(next<=result.steps-.9)improvement+=count;
        }
        result.score+=.24*Math.log1p(improvement);
      }
      return results.reduce((best,result)=>!best||result.score>best.score?result:best,null);
    }
    if(s.pending) {
      let best={choice:{action:'m-pass'},score:assess(p).score};
      for(const choice of options){
        const after=project(choice);
        const kong=isKong(choice);
        const result=kong?assess(after,undefined,true):bestDiscard(after);
        const openingCost=!M.opened(p)&&result?.steps>1?.35+stage*.4:0;
        if(result&&result.score-openingCost>best.score+.22)best={choice,score:result.score-openingCost};
      }
      return best.choice;
    }
    let best=bestDiscard(p,true);
    const compared=new Set();
    if(s.wall.length)for(const choice of options)if(isKong(choice)){
      const t=choice.action==='m-special'?type(choice.tile):choice.tile;
      if(compared.has(t))continue;
      compared.add(t);
      const after=project(choice), result=assess(after,undefined,true);
      const openingCost=!M.opened(p)&&result.steps>1?.35+stage*.4:0;
      const addedRisk=choice.kind==='added'?.25*discardRisk(s,seat,t,stock,tableFor(after)):0;
      const score=result.score-openingCost-addedRisk;
      if(!best||score>best.score+.18)best={choice,score};
    }
    return best?.choice;
  }
  M.advancedChoice=advancedChoice;
})();
