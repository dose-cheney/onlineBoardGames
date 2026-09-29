(function(){
  'use strict';
  const C=window.GameCore,suits=['♠','♥','♦','♣'],faces={11:'J',12:'Q',13:'K',14:'A'};
  const face=r=>faces[r]||String(r),card=id=>({rank:id%13+2,suit:Math.floor(id/13)});
  const cardText=id=>{const c=card(id);return face(c.rank)+suits[c.suit]};
  const label=i=>i===0?'你':'电脑 '+i;
  function straightHigh(ranks){const u=[...new Set(ranks)].sort((a,b)=>b-a);if(u.includes(14))u.push(1);for(let i=0;i<=u.length-5;i++)if(u[i]-u[i+4]===4)return u[i];return 0}
  function rank5(ids){
    const cs=ids.map(card),r=cs.map(c=>c.rank),count={};r.forEach(x=>count[x]=(count[x]||0)+1);
    const groups=Object.keys(count).map(x=>[+x,count[x]]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
    const flush=cs.every(c=>c.suit===cs[0].suit),straight=straightHigh(r),sorted=[...r].sort((a,b)=>b-a);
    if(flush&&straight)return [8,straight];
    if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
    if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
    if(flush)return [5,...sorted];
    if(straight)return [4,straight];
    if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
    if(groups[0][1]===2&&groups[1][1]===2)return [2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
    if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
    return [0,...sorted];
  }
  function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return Math.sign(d)}return 0}
  function bestHand(ids){if(ids.length<5)throw Error('不足 5 张牌');let best=null,chosen=[];const n=ids.length;for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){const five=[ids[a],ids[b],ids[c],ids[d],ids[e]],v=rank5(five);if(!best||compare(v,best)>0){best=v;chosen=five}}return {rank:best,cards:chosen}}
  function evaluate(ids){return bestHand(ids).rank}
  function handName(rank){return rank[0]===8&&rank[1]===14?'皇家同花顺':['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'][rank[0]]}
  function handDescription(rank){
    const name=handName(rank),kickers=from=>rank.length>from?'；踢脚 '+rank.slice(from).map(face).join(' / '):'';
    switch(rank[0]){
      case 0:return name+' · '+face(rank[1])+' 高'+kickers(2);
      case 1:return name+' · '+face(rank[1])+' 对'+kickers(2);
      case 2:return name+' · '+face(rank[1])+' 对 + '+face(rank[2])+' 对'+kickers(3);
      case 3:return name+' · '+face(rank[1])+' 三条'+kickers(2);
      case 4:return name+' · '+face(rank[1])+' 高';
      case 5:return name+' · '+rank.slice(1).map(face).join(' / ');
      case 6:return name+' · '+face(rank[1])+' 三条 + '+face(rank[2])+' 对';
      case 7:return name+' · '+face(rank[1])+' 四条'+kickers(2);
      case 8:return rank[1]===14?name:name+' · '+face(rank[1])+' 高';
    }
  }
  function showdown(s){
    if(!s.betweenHands)return [];
    const revealed=active(s).length>1&&s.board.length===5;
    return s.players.map((p,i)=>{
      if(p.folded)return {i,name:'已弃牌',description:'已弃牌 · 不参与摊牌',rank:null};
      if(!revealed)return {i,name:'未摊牌获胜',description:'其余玩家弃牌，直接获胜',rank:null};
      const best=bestHand(p.hole.concat(s.board)),rank=best.rank;return {i,name:handName(rank),description:handDescription(rank),rank,cards:best.cards};
    });
  }
  function logShowdown(s){log(s,'第 '+s.handCount+' 手牌力：'+showdown(s).map(h=>label(h.i)+' — '+h.description).join('；')+'。')}
  function create(n,settings){
    const buyin=+settings.buyin,small=+settings.small,big=+settings.big;
    if(!Number.isSafeInteger(buyin)||!Number.isSafeInteger(small)||!Number.isSafeInteger(big)||small<1||big<=small||buyin<big*20)throw Error('盲注或买入设置无效');
    const s={n,buyin,small,big,players:Array.from({length:n},()=>({stack:buyin,buyins:buyin,hole:[],committed:0,streetBet:0,folded:false,allIn:false,needs:false,acted:false})),button:n-1,sb:0,bb:1,deck:[],board:[],street:'',current:-1,currentBet:0,lastFullRaise:big,betweenHands:false,handCount:0,finished:false,ranks:null,lastResult:'',log:['现金桌开始。']};
    startHand(s);return s;
  }
  function log(s,t){s.log.unshift(t);s.log=s.log.slice(0,30)}
  function actionLog(s,i,t){s.players[i].lastAction=t;log(s,label(i)+t+'。')}
  function pot(s){return C.sum(s.players.map(p=>p.committed))}
  function active(s){return s.players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0)}
  function eligibleToAct(p){return !p.folded&&!p.allIn&&p.stack>0}
  function nextNeeded(s,from){for(let d=1;d<=s.n;d++){const i=(from+d)%s.n,p=s.players[i];if(eligibleToAct(p)&&p.needs)return i}return -1}
  function deal(s,n){const x=[];for(let i=0;i<n;i++)x.push(s.deck.pop());return x}
  function burn(s){s.deck.pop()}
  function commit(p,n){const v=Math.min(n,p.stack);p.stack-=v;p.streetBet+=v;p.committed+=v;if(p.stack===0)p.allIn=true;return v}
  function startHand(s){
    if(s.players[0].stack<=0)throw Error('请先补充筹码或离桌结算');
    for(let i=1;i<s.n;i++)if(s.players[i].stack<=0){s.players[i].stack=s.buyin;s.players[i].buyins+=s.buyin;log(s,label(i)+'补买 '+s.buyin+'。')}
    s.button=(s.button+1)%s.n;s.sb=s.n===2?s.button:(s.button+1)%s.n;s.bb=(s.sb+1)%s.n;
    s.deck=C.shuffle(Array.from({length:52},(_,i)=>i));s.board=[];s.street='preflop';s.currentBet=s.big;s.lastFullRaise=s.big;s.betweenHands=false;s.lastResult='';
    s.players.forEach(p=>{p.hole=[];p.committed=0;p.streetBet=0;p.folded=false;p.allIn=false;p.needs=true;p.acted=false;p.lastAction='等待行动'});
    commit(s.players[s.sb],s.small);commit(s.players[s.bb],s.big);
    s.players[s.sb].lastAction='小盲 '+s.players[s.sb].streetBet;s.players[s.bb].lastAction='大盲 '+s.players[s.bb].streetBet;
    for(let k=0;k<2;k++)for(let d=1;d<=s.n;d++){const i=(s.button+d)%s.n;s.players[i].hole.push(s.deck.pop())}
    s.players.forEach(p=>{if(p.allIn)p.needs=false});
    s.current=nextNeeded(s,s.n===2?(s.button+s.n-1)%s.n:s.bb);
    log(s,'第 '+(s.handCount+1)+' 手：庄位 '+label(s.button)+'，盲注 '+s.small+'/'+s.big+'。');
    if(s.current<0)settle(s);
  }
  function beginStreet(s){
    if(s.street==='preflop'){burn(s);s.board.push(...deal(s,3));s.street='flop'}
    else if(s.street==='flop'){burn(s);s.board.push(...deal(s,1));s.street='turn'}
    else if(s.street==='turn'){burn(s);s.board.push(...deal(s,1));s.street='river'}
    else {settle(s);return}
    s.players.forEach(p=>{p.streetBet=0;p.needs=eligibleToAct(p);p.acted=false});
    s.currentBet=0;s.lastFullRaise=s.big;s.current=nextNeeded(s,s.button);
    log(s,({flop:'翻牌',turn:'转牌',river:'河牌'})[s.street]+'：'+s.board.map(cardText).join(' '));
    if(s.current<0)advance(s);
  }
  function advance(s){
    if(active(s).length===1){settle(s);return}
    const needed=nextNeeded(s,s.current<0?s.button:s.current);
    if(needed>=0){s.current=needed;return}
    if(s.players.filter(eligibleToAct).length<=1){settle(s);return}
    if(s.street==='river'){settle(s);return}
    beginStreet(s);
  }
  function distribute(s,amount,winners){
    const each=Math.floor(amount/winners.length);winners.forEach(i=>s.players[i].stack+=each);
    let left=amount%winners.length;for(let d=1;left&&d<=s.n;d++){const i=(s.button+d)%s.n;if(winners.includes(i)){s.players[i].stack++;left--}}
  }
  function awards(s){
    if(active(s).length===1)return [{amount:pot(s),winners:active(s)}];
    const levels=[...new Set(s.players.map(p=>p.committed).filter(x=>x>0))].sort((a,b)=>a-b),out=[];let prev=0;
    for(const level of levels){
      const contributors=s.players.map((p,i)=>p.committed>=level?i:-1).filter(i=>i>=0),amount=(level-prev)*contributors.length,candidates=contributors.filter(i=>!s.players[i].folded);
      if(!candidates.length){out.push({amount,winners:contributors,refund:true});prev=level;continue}
      let best=null,winners=[];for(const i of candidates){const hand=evaluate(s.players[i].hole.concat(s.board)),cmp=best?compare(hand,best):1;if(cmp>0){best=hand;winners=[i]}else if(cmp===0)winners.push(i)}
      out.push({amount,winners});prev=level;
    }
    return out;
  }
  function payoutTotals(s,distribution){
    const totals=Array(s.n).fill(0);distribution.forEach(a=>{const each=Math.floor(a.amount/a.winners.length);a.winners.forEach(i=>totals[i]+=each);let left=a.amount%a.winners.length;for(let d=1;left&&d<=s.n;d++){const i=(s.button+d)%s.n;if(a.winners.includes(i)){totals[i]++;left--}}});return totals;
  }
  function settle(s){
    while(s.board.length<5&&active(s).length>1){burn(s);s.board.push(...deal(s,s.board.length===0?3:1))}
    const distribution=awards(s);distribution.forEach(a=>distribute(s,a.amount,a.winners));
    s.handCount++;s.betweenHands=true;s.current=-1;
    s.lastResult='第 '+s.handCount+' 手结算：'+distribution.map(a=>a.amount+' → '+(a.refund?'返还未争议投入':a.winners.map(label).join('、'))).join('；')+(active(s).length===1?'（其余玩家弃牌）':'')+'。';
    if(s.players[0].stack<s.big*5)s.hadLowStack=true;
    logShowdown(s);log(s,s.lastResult);
  }
  function act(s,a,v){
    if(s.finished)throw Error('牌桌已结束');
    if(a==='p-next'){if(!s.betweenHands)throw Error('当前手牌尚未结束');startHand(s);return}
    if(s.betweenHands)throw Error('请开始下一手或离桌');
    const i=s.current;if(i<0)throw Error('当前无人行动');
    const p=s.players[i],toCall=Math.max(0,s.currentBet-p.streetBet);
    if(a==='p-fold'){p.folded=true;p.needs=false;p.acted=true;actionLog(s,i,'弃牌')}
    else if(a==='p-call'){
      const n=commit(p,toCall);p.needs=false;p.acted=true;actionLog(s,i,n===0?'过牌':'跟注 '+n+(p.allIn?'（全下）':''));
    }else if(a==='p-bet'||a==='p-allin'){
      const target=a==='p-allin'?p.streetBet+p.stack:+v.amount;
      if(!Number.isSafeInteger(target)||target<=s.currentBet||target>p.streetBet+p.stack)throw Error('加注额无效');
      const full=target-s.currentBet>=s.lastFullRaise,min=s.currentBet+s.lastFullRaise;
      if(target<min&&target!==p.streetBet+p.stack)throw Error('最低加注至 '+min+'；不足额时只能全下');
      if(p.acted)throw Error('不足额加注没有重新开放加注权');
      const old=s.currentBet,paid=commit(p,target-p.streetBet);s.currentBet=target;
      if(full){s.lastFullRaise=target-old;s.players.forEach((x,j)=>{if(j!==i&&eligibleToAct(x)){x.needs=true;x.acted=false}})}
      else s.players.forEach((x,j)=>{if(j!==i&&eligibleToAct(x)&&x.streetBet<target)x.needs=true});
      p.needs=false;p.acted=true;actionLog(s,i,'加注至 '+target+(p.allIn?'（全下）':''));
    }else throw Error('未知行动');
    advance(s);
  }
  function equity(s,i,samples){
    const p=s.players[i],opponents=active(s).filter(j=>j!==i),known=p.hole.concat(s.board),unknown=Array.from({length:52},(_,x)=>x).filter(x=>!known.includes(x));
    if(!opponents.length)return 1;
    let total=0;
    for(let t=0;t<samples;t++){
      const pick=unknown.slice();for(let k=0;k<opponents.length*2+5-s.board.length;k++){const j=k+Math.floor(Math.random()*(pick.length-k));[pick[k],pick[j]]=[pick[j],pick[k]]}
      const board=s.board.concat(pick.slice(opponents.length*2,opponents.length*2+5-s.board.length));
      const hero=evaluate(p.hole.concat(board));let beat=0,ties=1;
      for(let q=0;q<opponents.length;q++){const v=evaluate([pick[q*2],pick[q*2+1]].concat(board)),cmp=compare(v,hero);if(cmp>0){beat=1;break}if(cmp===0)ties++}
      if(!beat)total+=1/ties;
    }
    return total/samples;
  }
  function preflopStrength(ids){
    const a=card(ids[0]),b=card(ids[1]),hi=Math.max(a.rank,b.rank),lo=Math.min(a.rank,b.rank);
    if(hi===lo)return .48+hi/33;
    return .13+(hi-2)/31+(lo-2)/55+(a.suit===b.suit?.06:0)+(hi-lo<=2?.05:0);
  }
  function bot(s,difficulty){
    if(s.betweenHands||s.current<=0)return;
    const i=s.current,p=s.players[i],toCall=Math.max(0,s.currentBet-p.streetBet),potOdds=toCall/(pot(s)+toCall||1);
    const strength=s.street==='preflop'?preflopStrength(p.hole):equity(s,i,difficulty==='hard'?150:difficulty==='medium'?70:20);
    const pos=((i-s.button+s.n)%s.n)/s.n,noise=(Math.random()-.5)*(difficulty==='easy'?.34:difficulty==='medium'?.16:.08);
    const adjusted=strength+noise+(difficulty==='hard'?pos*.035:0);
    if(toCall>0&&adjusted<potOdds+(difficulty==='easy'?.06:.015)&&toCall>p.stack*.08){act(s,'p-fold',{});return}
    const aggressive=adjusted>(difficulty==='easy'?.63:difficulty==='medium'?.55:.49);
    const raiseAllowed=!p.acted||s.currentBet===0;
    if(aggressive&&raiseAllowed&&p.stack>toCall&&Math.random()<(difficulty==='easy'?.23:difficulty==='medium'?.38:.52)){
      const min=s.currentBet+s.lastFullRaise,max=p.streetBet+p.stack,target=Math.min(max,Math.max(min,s.currentBet+Math.max(s.big,Math.round(pot(s)*(difficulty==='hard'?.65:.4)))));
      if(target>s.currentBet){act(s,'p-bet',{amount:target});return}
    }
    act(s,'p-call',{});
  }
  function endSession(s){
    if(!s.betweenHands||s.handCount<1)throw Error('至少完成一手牌并在两手之间离桌');
    s.finished=true;s.ranks=C.ranks(s.players.map(p=>p.stack-p.buyins));return s.ranks;
  }
  function render(s,ui={}){
    const me=s.players[0],turn=s.current===0&&!s.betweenHands,toCall=Math.max(0,s.currentBet-me.streetBet),min=s.currentBet+s.lastFullRaise,max=me.streetBet+me.stack,canRaise=turn&&me.stack>toCall&&!me.acted;
    const hands=showdown(s),distribution=s.betweenHands?awards(s):[],payouts=s.betweenHands?payoutTotals(s,distribution):[],winners=[...new Set(distribution.filter(a=>!a.refund).flatMap(a=>a.winners))];
    const net=me.stack+(s.betweenHands?0:me.committed)-me.buyins;
    const street=({preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌'})[s.street];
    let html='<div class="poker-tabletop"><div class="table-status"><strong>现金桌 · 第 '+(s.handCount+(s.betweenHands?0:1))+' 手</strong><span>盲注 '+s.small+' / '+s.big+'</span><span class="latest-action" aria-live="polite">'+C.escape(s.log[0])+'</span></div><div class="poker-arena"><div class="poker-felt" aria-hidden="true"></div>';
    const positions={2:[[50,86],[50,16]],3:[[50,86],[22,22],[78,22]],4:[[50,86],[10,50],[50,16],[90,50]],5:[[50,86],[12,65],[28,20],[72,20],[88,65]],6:[[50,86],[12,70],[22,22],[50,16],[78,22],[88,70]],7:[[50,86],[12,75],[12,30],[36,16],[64,16],[88,30],[88,75]],8:[[50,86],[25,82],[8,50],[25,18],[50,16],[75,18],[92,50],[75,82]],9:[[50,86],[25,82],[8,67],[8,33],[25,17],[75,17],[92,33],[92,67],[75,82]],10:[[50,86],[25,82],[8,67],[8,33],[25,17],[50,16],[75,17],[92,33],[92,67],[75,82]]}[s.n];
    html+=s.players.map((p,i)=>{
      const [x,y]=positions[i],roles=(i===s.button?'<span class="dealer-button">D</span>':'')+(i===s.sb?'<span>小盲</span>':'')+(i===s.bb?'<span>大盲</span>':'');
      const result=hands[i],revealed=i>0&&result&&result.rank,action=result?(winners.includes(i)?'获胜 · ':'')+result.name:p.lastAction||(p.folded?'弃牌':p.allIn?'全下':'本轮已下注 '+p.streetBet);
      const holeCards=revealed?'<div class="seat-hole-cards" aria-label="'+label(i)+'的两张底牌"><span>底牌</span><div class="hand">'+p.hole.map(id=>showCard(id)).join('')+'</div></div>':'';
      return '<section class="poker-seat '+(i===s.current?'current ':'')+(i===0?'hero-seat ':'')+(p.folded?'folded ':'')+(revealed?'revealed ':'')+(winners.includes(i)?'winner':'')+'" style="--seat-x:'+x.toFixed(2)+'%;--seat-y:'+y.toFixed(2)+'%"><div class="seat-name"><strong>'+label(i)+'</strong><div class="seat-roles">'+roles+'</div></div><div class="seat-stack">'+C.formatMoney(p.stack)+' <small>筹码</small></div><div class="seat-action '+(result&&result.rank?'hand-strength':'')+'" '+(result?'title="'+C.escape(result.description)+'"':'')+'>'+C.escape(action)+'</div><div class="seat-bet">'+(i===s.current?'正在行动 · ':'')+(s.betweenHands?'本手共下注 ':'本轮已下注 ')+(s.betweenHands?p.committed:p.streetBet)+'</div>'+holeCards+'</section>';
    }).join('');
    html+='<div class="poker-center"><div class="community-cards" aria-label="公共牌">'+Array.from({length:5},(_,i)=>s.board[i]!==undefined?showCard(s.board[i],hands.some(h=>winners.includes(h.i)&&h.cards&&h.cards.includes(s.board[i]))):'<div class="card playing-card empty-card">'+(i<3?'翻牌':i===3?'转牌':'河牌')+'</div>').join('')+'</div><div class="pot-total"><span class="pot-label">'+(s.betweenHands?'本手底池已分配':'底池')+'</span><strong class="pot-value">'+C.formatMoney(pot(s))+'</strong></div><div class="street-label">'+street+' · '+(s.betweenHands?'本手结束':turn?'轮到你':label(s.current)+'正在行动')+'</div></div></div>';
    html+='<section class="poker-action-dock"><div class="hero-cards"><span class="mat-label">你的底牌</span><div class="hand">'+me.hole.map(id=>showCard(id)).join('')+'</div></div><div class="poker-controls">';
    if(s.betweenHands){
      const rebuy=ui.rebuyAmount||0,hasWallet=Number.isSafeInteger(ui.wallet);
      html+='<div class="turn-prompt" aria-live="polite">'+C.escape(winners.map(i=>label(i)+' · '+hands[i].description+' · 获得 '+payouts[i]).join('；'))+'</div><div class="hand-net">你本手净变化：'+(payouts[0]-me.committed>0?'+':'')+(payouts[0]-me.committed)+'</div>';
      if(hasWallet)html+='<div class="poker-wallet">桌面筹码 '+C.formatMoney(me.stack)+' · 钱包可用 '+C.formatMoney(ui.wallet)+'</div>';
      html+='<div class="actions">'+(me.stack<=0&&rebuy>0?'<button class="primary" data-action="app-rebuy-next">用钱包买入 '+rebuy+'，继续下一手 →</button>':me.stack<=0&&hasWallet?'<button class="primary" data-action="app-funding">打开银行 / 借款</button>':'<button class="primary" data-action="p-next" '+(me.stack<=0?'disabled':'')+'>下一手 →</button>');
      if(me.stack>0&&rebuy>0)html+='<button data-action="app-rebuy">钱包补买 +'+rebuy+'</button>';
      html+='<button data-action="p-end">离桌结算…</button></div><p class="action-hint">'+(me.stack<=0?(rebuy>0?'本次从钱包扣除 '+rebuy+'，'+(rebuy<s.buyin?'按现有余额买入。':'补至初始买入。')+'仍有筹码的电脑保留余额。':hasWallet?'桌面筹码和钱包均为 0，可向银行借款后补买，或离桌结算。':'桌面筹码已用完，可用钱包补买后继续。'):'下一手轮换庄位，继续使用当前筹码；补买只增加你的筹码。')+'</p>';
    }
    else if(turn){html+='<div class="turn-prompt your-turn">你的回合 · '+(toCall?'需要跟注 '+Math.min(toCall,me.stack):'可以过牌')+' · 当前下注 '+s.currentBet+'</div><div class="actions"><button data-action="p-fold">弃牌</button><button class="primary" data-action="p-call">'+(toCall?'跟注 '+Math.min(toCall,me.stack)+(toCall>=me.stack?'（全下）':''):'过牌')+'</button>';
      if(canRaise){const amount=ui.pokerAmount!==undefined?ui.pokerAmount:Math.min(min,max),invalid=!Number.isSafeInteger(Number(amount))||Number(amount)<=s.currentBet||Number(amount)>max||(Number(amount)<min&&Number(amount)!==max);html+='<div class="bet-field"><label for="poker-amount">'+(s.currentBet?'本轮加注总额':'下注金额')+'</label><div class="row"><input id="poker-amount" type="number" min="'+Math.min(min,max)+'" max="'+max+'" value="'+C.escape(amount)+'" aria-describedby="poker-range poker-error"><button data-action="p-bet" '+(invalid?'disabled':'')+'>'+(s.currentBet?'加注至 ':'下注 ')+C.escape(amount)+'</button><button data-action="p-allin">全下 '+me.stack+'</button></div><small id="poker-range">'+(max<min?'仅可全下至 '+max:'最低 '+min+'，最高 '+max)+' · <span id="poker-paid">本次再付 '+Math.max(0,Number(amount)-me.streetBet)+'</span></small><div id="poker-error" class="field-error" role="alert">'+C.escape(ui.error||'')+'</div></div>';}html+='</div>';if(me.acted&&me.stack>toCall)html+='<small class="muted">不足额全下未重新开放加注权，可跟注或弃牌。</small>';
    }else html+='<div class="turn-prompt">'+(me.folded?'你已弃牌，等待本手结算。':me.allIn?'你已全下，等待本手结算。':'轮到 '+label(s.current)+'行动。')+'</div><p class="muted">对手的行动显示在各自座位下方。</p>';
    if(ui.error&&(!turn||!canRaise))html+='<div class="notice error" role="alert">'+C.escape(ui.error)+'</div>';
    html+='</div><div class="hero-finance"><span>已结算净收益</span><strong class="'+(net>=0?'positive':'')+'">'+(net>0?'+':'')+net+'</strong><small>累计买入 '+me.buyins+'</small></div></section>';
    if(hands.length)html+='<section class="poker-showdown" aria-label="本手牌力对照"><div class="showdown-heading"><h3>本手结果与最佳五张</h3><span>座位显示两张底牌；这里是底牌与公共牌组成的最佳五张，亮边公共牌用于赢家组合。</span></div><div class="showdown-grid">'+hands.map(h=>'<div class="showdown-result '+(h.rank?'':'not-revealed ')+(winners.includes(h.i)?'winner':'')+'"><strong>'+label(h.i)+(winners.includes(h.i)?' · '+(winners.length>1?'分池获奖':'获胜'):'')+' · 获得 '+payouts[h.i]+'</strong><span>'+C.escape(h.description)+'</span>'+(h.cards?'<div class="best-five" aria-label="'+label(h.i)+'的最佳五张">'+h.cards.map(id=>showCard(id,true)).join('')+'</div>':'')+'<small>本手净变化 '+(payouts[h.i]-s.players[h.i].committed>0?'+':'')+(payouts[h.i]-s.players[h.i].committed)+'</small></div>').join('')+'</div><details><summary>底池分配明细</summary>'+distribution.map((a,i)=>'<p>'+(i===0?'主池':'边池 '+i)+' '+a.amount+' → '+a.winners.map(label).join('、')+(a.refund?'（返还未争议投入）':'')+'</p>').join('')+'</details></section>';
    html+='<div class="poker-recent"><strong>最近行动</strong>'+s.log.filter(t=>!/^第 \d+ 手牌力：/.test(t)).slice(0,3).map(t=>'<span>'+C.escape(t)+'</span>').join('')+'</div><details class="table-details game-record"><summary>完整对局记录 · 高级策略使用胜率模拟，非 GTO 最优解</summary><div class="log">'+s.log.map(x=>'<div>'+C.escape(x)+'</div>').join('')+'</div></details></div>';
    return html;
  }
  function showCard(id,highlight=false){const c=card(id);return '<div class="card playing-card '+(c.suit===1||c.suit===2?'red-suit':'black-suit')+(highlight?' best-card':'')+'">'+cardText(id)+'</div>'}
  function validate(s,n){
    if(!s||s.n!==n||!Array.isArray(s.players)||s.players.length!==n||!Array.isArray(s.board)||s.board.length>5||!Array.isArray(s.deck)||!Array.isArray(s.log)||!Number.isInteger(s.button)||s.button<0||s.button>=n||!Number.isInteger(s.handCount)||s.handCount<0||!Number.isSafeInteger(s.buyin)||s.buyin<1||!Number.isSafeInteger(s.small)||s.small<1||!Number.isSafeInteger(s.big)||s.big<=s.small)return false;
    const used=s.board.concat(s.deck);for(const p of s.players){if(!p||!Array.isArray(p.hole)||p.hole.length!==2||!Number.isSafeInteger(p.stack)||p.stack<0||!Number.isSafeInteger(p.buyins)||p.buyins<0||!Number.isSafeInteger(p.committed)||p.committed<0||!Number.isSafeInteger(p.streetBet)||p.streetBet<0)return false;used.push(...p.hole)}
    return used.every(id=>Number.isInteger(id)&&id>=0&&id<52)&&new Set(used).size===used.length;
  }
  C.Games.poker={create,act,bot,render,validate,evaluate,compare,rank5,settle,startHand,endSession,pot,equity,handName,handDescription,showdown,bestHand,awards,payoutTotals};
})();
