(function(){
  'use strict';
  const C=window.GameCore, colors=['white','blue','green','red','black'], labels=['白','蓝','绿','红','黑','金'];
  // tier, bonus colour, points, then white/blue/green/red/black costs.
  const rows=[
    [1,4,0,1,1,1,1,0],[1,4,0,1,1,1,2,0],[1,4,0,2,0,1,2,0],[1,4,0,0,1,0,3,1],[1,4,0,0,0,2,1,0],[1,4,0,2,0,2,0,0],[1,4,0,0,0,3,0,0],[1,4,1,0,4,0,0,0],
    [1,1,0,1,0,1,1,1],[1,1,0,1,0,1,2,1],[1,1,0,1,0,2,2,0],[1,1,0,0,1,3,1,0],[1,1,0,1,2,0,0,0],[1,1,0,2,0,2,0,0],[1,1,0,0,3,0,0,0],[1,1,1,0,0,0,4,0],
    [1,0,0,0,1,1,1,1],[1,0,0,0,1,2,1,1],[1,0,0,0,2,2,0,1],[1,0,0,1,1,0,0,3],[1,0,0,0,1,0,2,0],[1,0,0,2,2,0,0,0],[1,0,0,0,0,3,0,0],[1,0,1,0,0,4,0,0],
    [1,2,0,1,1,0,1,1],[1,2,0,1,1,0,1,2],[1,2,0,2,1,0,2,0],[1,2,0,1,0,3,1,0],[1,2,0,0,0,1,0,2],[1,2,0,0,2,0,2,0],[1,2,0,0,0,0,3,0],[1,2,1,0,0,0,0,4],
    [1,3,0,1,1,1,0,1],[1,3,0,2,1,1,0,1],[1,3,0,2,0,1,0,2],[1,3,0,1,3,0,0,1],[1,3,0,0,0,2,1,0],[1,3,0,0,2,0,0,2],[1,3,0,0,0,0,0,3],[1,3,1,0,0,0,0,4],
    [2,4,1,3,2,2,0,0],[2,4,1,3,2,0,0,2],[2,4,2,0,1,4,2,0],[2,4,2,0,0,5,3,0],[2,4,2,5,0,0,0,0],[2,4,3,0,0,0,0,6],
    [2,1,1,0,2,2,3,0],[2,1,1,0,3,2,0,3],[2,1,2,5,0,3,0,0],[2,1,2,2,4,0,1,0],[2,1,2,0,0,5,0,0],[2,1,3,0,0,0,6,0],
    [2,0,1,0,0,3,2,2],[2,0,1,2,0,0,3,3],[2,0,2,0,0,1,4,2],[2,0,2,0,3,0,5,0],[2,0,2,0,0,0,0,5],[2,0,3,0,0,0,0,6],
    [2,2,1,3,0,0,3,2],[2,2,1,2,3,0,0,2],[2,2,2,0,2,0,0,4],[2,2,2,0,0,5,3,0],[2,2,2,0,5,0,0,0],[2,2,3,0,0,6,0,0],
    [2,3,1,2,0,0,2,3],[2,3,1,2,0,3,0,3],[2,3,2,1,0,0,4,2],[2,3,2,0,0,0,3,5],[2,3,2,0,0,0,0,5],[2,3,3,0,0,0,6,0],
    [3,4,3,3,3,5,3,0],[3,4,4,0,0,0,7,0],[3,4,4,3,0,0,6,3],[3,4,5,3,0,0,7,0],
    [3,1,3,3,0,3,3,5],[3,1,4,7,0,0,0,0],[3,1,4,6,3,0,0,3],[3,1,5,7,0,0,0,3],
    [3,0,3,0,3,3,3,5],[3,0,4,0,0,0,0,7],[3,0,4,3,6,0,0,3],[3,0,5,0,7,0,0,3],
    [3,2,3,5,3,0,3,3],[3,2,4,0,7,0,0,0],[3,2,4,3,3,6,0,0],[3,2,5,0,0,7,3,0],
    [3,3,3,3,3,3,0,5],[3,3,4,0,0,7,0,0],[3,3,4,3,0,3,6,0],[3,3,5,0,3,7,0,0]
  ];
  const cards=rows.map((r,id)=>({id,tier:r[0],bonus:r[1],points:r[2],cost:r.slice(3)}));
  const nobles=[
    [0,0,4,4,0],[0,4,4,0,0],[4,4,0,0,0],[4,0,0,0,4],[0,0,0,4,4],
    [0,3,3,3,0],[3,0,3,3,0],[3,3,0,0,3],[0,0,3,3,3],[3,3,3,0,0]
  ];
  function create(n){
    const decks=[1,2,3].map(t=>C.shuffle(cards.filter(c=>c.tier===t).map(c=>c.id)));
    const market=decks.map(d=>Array.from({length:4},()=>d.pop()));
    return {decks,market,nobles:C.shuffle(nobles.map((_,i)=>i)).slice(0,n+1),bank:[n===2?4:n===3?5:7,n===2?4:n===3?5:7,n===2?4:n===3?5:7,n===2?4:n===3?5:7,n===2?4:n===3?5:7,5],players:Array.from({length:n},()=>({gems:[0,0,0,0,0,0],cards:[],reserved:[],nobles:[],turns:0})),current:0,selection:[],pending:null,triggered:false,finished:false,ranks:null,log:['新对局开始。'],reserveCount:0};
  }
  function bonus(p){const b=[0,0,0,0,0];p.cards.forEach(id=>b[cards[id].bonus]++);return b}
  function points(p){return p.cards.reduce((v,id)=>v+cards[id].points,0)+p.nobles.length*3}
  function due(p,c){const b=bonus(p);return c.cost.map((v,i)=>Math.max(0,v-b[i]))}
  function affordable(p,c){const d=due(p,c);return d.reduce((v,x,i)=>v+Math.max(0,x-p.gems[i]),0)<=p.gems[5]}
  function log(s,t){s.log.unshift(t);s.log=s.log.slice(0,20)}
  function label(i){return i===0?'你':'电脑 '+i}
  function eligible(s,p){const b=bonus(p);return s.nobles.filter(id=>nobles[id].every((x,i)=>b[i]>=x))}
  function next(s){
    const p=s.players[s.current];p.turns++;
    if(points(p)>=15)s.triggered=true;
    s.current=(s.current+1)%s.players.length;
    if(s.triggered&&s.current===0){
      const ps=s.players.map(points),cs=s.players.map(p=>p.cards.length);
      s.ranks=C.ranks(ps.map((v,i)=>v*100-cs[i]));s.finished=true;log(s,'对局结束。');
    }
  }
  function afterAction(s){
    s.selection=[];
    const p=s.players[s.current],overflow=C.sum(p.gems)-10;
    if(overflow>0){s.pending='return';return}
    const e=eligible(s,p);
    if(e.length){s.pending='noble';return}
    next(s);
  }
  function replace(s,t,slot){s.market[t][slot]=s.decks[t].length?s.decks[t].pop():null}
  function act(s,a,v){
    if(s.finished)throw Error('对局已经结束');
    const p=s.players[s.current];
    if(s.pending==='return'){
      if(a!=='s-return')throw Error('请先归还超过 10 枚的筹码');
      const i=+v.color;if(!(i>=0&&i<6&&p.gems[i]>0))throw Error('无可归还的筹码');
      p.gems[i]--;s.bank[i]++;log(s,label(s.current)+'归还 1 枚'+labels[i]+'宝石。');if(C.sum(p.gems)<=10){s.pending=null;afterAction(s)}return;
    }
    if(s.pending==='noble'){
      if(a!=='s-noble')throw Error('请先选择贵族');
      const id=+v.id;if(!eligible(s,p).includes(id))throw Error('未满足该贵族要求');
      p.nobles.push(id);s.nobles=s.nobles.filter(x=>x!==id);s.pending=null;log(s,label(s.current)+'获得贵族。');next(s);return;
    }
    if(a==='s-toggle'){
      const i=+v.color;if(i<0||i>4)throw Error('颜色无效');
      s.selection=s.selection.includes(i)?s.selection.filter(x=>x!==i):s.selection.concat(i);
      return;
    }
    if(a==='s-take'){
      const chosen=s.selection;
      if(chosen.length<1||chosen.length>3||new Set(chosen).size!==chosen.length||chosen.some(i=>s.bank[i]<1))throw Error('请选择 1 至 3 种有库存的不同宝石');
      const available=s.bank.slice(0,5).filter(x=>x>0).length;
      if(chosen.length!==Math.min(3,available))throw Error('必须取得可用的 3 种不同宝石');
      chosen.forEach(i=>{p.gems[i]++;s.bank[i]--});s.selection=[];log(s,label(s.current)+'拿取 '+chosen.map(i=>labels[i]+' 1').join('、')+'。');afterAction(s);return;
    }
    if(a==='s-double'){
      const i=+v.color;if(i<0||i>4||s.bank[i]<4)throw Error('同色筹码至少要有 4 枚才可拿 2 枚');
      s.bank[i]-=2;p.gems[i]+=2;log(s,label(s.current)+'拿取 2 枚'+labels[i]+'宝石。');afterAction(s);return;
    }
    if(a==='s-buy'){
      const id=+v.id,c=cards[id],t=c&&c.tier-1;
      if(!c)throw Error('卡牌无效');
      const slot=s.market[t].indexOf(id),res=p.reserved.indexOf(id);
      if(slot<0&&res<0)throw Error('该卡牌不可购买');
      if(!affordable(p,c))throw Error('筹码不足');
      const d=due(p,c);let gold=0;d.forEach((x,i)=>{const spend=Math.min(x,p.gems[i]);p.gems[i]-=spend;s.bank[i]+=spend;gold+=x-spend});
      p.gems[5]-=gold;s.bank[5]+=gold;p.cards.push(id);
      if(slot>=0)replace(s,t,slot);else p.reserved.splice(res,1);
      log(s,label(s.current)+'购买'+c.tier+'级卡牌：永久'+labels[c.bonus]+' +1，'+c.points+' 分。');afterAction(s);return;
    }
    if(a==='s-reserve'){
      if(p.reserved.length>=3)throw Error('最多预留 3 张');
      let id;
      if(v.tier!==undefined){const t=+v.tier;if(t<0||t>2||!s.decks[t].length)throw Error('该牌堆已空');id=s.decks[t].pop()}
      else {id=+v.id;const t=cards[id]&&cards[id].tier-1,slot=t!==undefined?s.market[t].indexOf(id):-1;if(slot<0)throw Error('该卡牌不可预留');replace(s,t,slot)}
      p.reserved.push(id);if(s.bank[5]){s.bank[5]--;p.gems[5]++}s.reserveCount+=s.current===0?1:0;
      log(s,label(s.current)+'预留卡牌。');afterAction(s);return;
    }
    throw Error('未知行动');
  }
  function chooseBot(s,difficulty){
    const p=s.players[s.current],b=bonus(p);
    if(s.pending==='return'){let i=p.gems.reduce((best,n,j)=>n>0&&(best<0||n>p.gems[best])?j:best,-1);act(s,'s-return',{color:i});return}
    if(s.pending==='noble'){act(s,'s-noble',{id:eligible(s,p)[0]});return}
    const choices=[];
    const candidateCards=s.market.flat().concat(p.reserved).filter(id=>id!==null&&id!==undefined);
    for(const id of candidateCards)if(affordable(p,cards[id])){
      const c=cards[id],need=nobles.reduce((v,n)=>v+(s.nobles.includes(nobles.indexOf(n))&&n[c.bonus]>b[c.bonus]?1:0),0);
      choices.push({a:'s-buy',v:{id},score:6+c.points*3+(difficulty==='hard'?need*.7:0)+(difficulty==='easy'?Math.random()*3:0)});
    }
    const available=s.bank.slice(0,5).map((v,i)=>v>0?i:-1).filter(i=>i>=0);
    const combos=[];
    for(let i=0;i<available.length;i++)for(let j=i+1;j<available.length;j++)for(let k=j+1;k<available.length;k++)combos.push([available[i],available[j],available[k]]);
    if(available.length<3&&available.length)combos.push(available);
    const needByColor=[0,0,0,0,0];
    for(const id of candidateCards){const d=due(p,cards[id]);d.forEach((x,i)=>{needByColor[i]+=Math.max(0,x-p.gems[i])/(cards[id].tier+1)})}
    for(const combo of combos)choices.push({a:'s-take',v:{combo},score:2+combo.reduce((v,i)=>v+(difficulty==='easy'?Math.random()*2:Math.min(3,needByColor[i])),0)});
    for(let i=0;i<5;i++)if(s.bank[i]>=4)choices.push({a:'s-double',v:{color:i},score:2+(difficulty==='easy'?Math.random()*3:Math.min(5,needByColor[i]*1.5))});
    if(p.reserved.length<3){for(const id of s.market.flat().filter(x=>x!==null)){
      const c=cards[id],d=due(p,c),distance=C.sum(d.map((x,i)=>Math.max(0,x-p.gems[i])));
      choices.push({a:'s-reserve',v:{id},score:(s.bank[5]?2:0)+c.points*1.2-distance*.5+(difficulty==='hard'?1:Math.random())});
    }}
    choices.sort((x,y)=>y.score-x.score);
    const ch=choices[0];if(!ch){s.finished=true;s.ranks=C.ranks(s.players.map(points));return}
    if(ch.a==='s-take'){s.selection=ch.v.combo;act(s,'s-take',{})}else act(s,ch.a,ch.v);
  }
  function token(i,n){return '<span class="token '+(colors[i]||'gold')+'">'+labels[i]+' '+n+'</span>'}
  function payment(p,c){const d=due(p,c),paid=d.map((n,i)=>Math.min(n,p.gems[i])),gold=C.sum(d)-C.sum(paid);return {paid:paid.concat(gold),gaps:d.map((n,i)=>Math.max(0,n-p.gems[i])),missing:Math.max(0,gold-p.gems[5])}}
  function cardHtml(id,p,enabled,reserved=false,owned=false){
    const c=cards[id],can=enabled&&affordable(p,c),cost=due(p,c),pay=payment(p,c),gaps=pay.gaps.map((n,i)=>n?labels[i]+' '+n:'').filter(Boolean).join('、');
    return '<article class="card gem-card '+(owned?'owned ':'')+(affordable(p,c)?'affordable':'')+'" data-card-id="'+id+'"><div class="gem-card-head"><strong class="bonus-label '+colors[c.bonus]+'">'+labels[c.bonus]+' +1</strong><b>'+c.points+'<small> 分</small></b></div><div class="card-caption">'+(owned?'已购 · #'+(id+1):'折扣后费用')+'</div><div class="cost">'+cost.map((n,i)=>n?token(i,n):'').join('')+(C.sum(cost)?'':'免费')+'</div>'+(owned?'':'<div class="resource-gap">'+(pay.missing?(p.gems[5]?'还缺 '+pay.missing+' 枚（缺 '+gaps+'，金可抵 '+p.gems[5]+'）':'还缺 '+gaps):'可以购买'+(pay.paid[5]?' · 使用金 '+pay.paid[5]:''))+'</div><div class="actions"><button class="'+(can?'primary':'')+'" data-action="s-review" data-id="'+id+'" '+(can?'':'disabled')+'>'+(affordable(p,c)?'购买预览':'暂不可买')+'</button>'+(reserved?'':'<button data-action="s-reserve" data-id="'+id+'" '+(enabled&&p.reserved.length<3?'':'disabled')+'>预留</button>')+'</div>')+'</article>';
  }
  function inventory(values){return values.map((n,i)=>token(i,n)).join('')}
  function render(s,ui={}){
    const p=s.players[0],myTurn=s.current===0&&!s.finished,enabled=myTurn&&!s.pending,b=bonus(p);
    let html='<div class="gem-tabletop"><div class="gem-opponents">'+s.players.slice(1).map((pl,j)=>'<section class="opponent-mat '+(s.current===j+1?'current':'')+'"><div class="row between"><strong>'+label(j+1)+'</strong><span>'+points(pl)+' 分 · 预留 '+pl.reserved.length+' · 贵族 '+pl.nobles.length+'</span></div><div class="inventory-line"><span>筹码</span>'+inventory(pl.gems)+'</div><div class="inventory-line bonuses"><span>折扣</span>'+inventory(bonus(pl))+'</div><details class="mobile-opponent-detail" data-detail-id="opponent-'+(j+1)+'"><summary>筹码 / 折扣</summary><div class="inventory-line"><span>筹码</span>'+inventory(pl.gems)+'</div><div class="inventory-line bonuses"><span>折扣</span>'+inventory(bonus(pl))+'</div></details></section>').join('')+'</div>';
    html+='<div class="table-status"><strong>'+(s.triggered?'最后一轮':'目标 15 分')+'</strong><span class="latest-action" aria-live="polite">'+C.escape(s.log[0])+'</span></div><div class="gem-mobile-resources"><strong>你 '+points(p)+' / 15 分</strong><div>筹码 '+inventory(p.gems)+'</div><div>折扣 '+inventory(b)+'</div><a href="#gem-actions">拿筹码 / 操作 ↓</a></div><div class="gem-workspace"><section class="gem-market"><div class="row between market-heading"><h2>宝石市场</h2><div class="bank-stock"><span class="muted">库存</span>'+inventory(s.bank)+'</div></div><div class="gem-tier-tabs" role="group" aria-label="市场等级">'+[0,1,2].map(t=>'<button class="'+((ui.gemTier||0)===t?'primary':'')+'" data-action="s-tier" data-tier="'+t+'" aria-pressed="'+((ui.gemTier||0)===t)+'">'+['Ⅰ 级','Ⅱ 级','Ⅲ 级'][t]+'</button>').join('')+'</div>';
    for(let t=2;t>=0;t--)html+='<div class="market-tier '+((ui.gemTier||0)===t?'active-tier':'')+'"><div class="tier-label"><b>'+['Ⅰ','Ⅱ','Ⅲ'][t]+'</b><small>余 '+s.decks[t].length+'</small><button data-action="s-reserve" data-tier="'+t+'" '+(enabled&&p.reserved.length<3&&s.decks[t].length?'':'disabled')+' title="预留此等级牌堆顶">盲留</button></div><div class="market">'+s.market[t].map(id=>id===null?'<div class="card face-down">已售罄</div>':cardHtml(id,p,enabled)).join('')+'</div></div>';
    html+='<div class="noble-strip"><span class="muted">贵族<br>每位 3 分</span>'+s.nobles.map(id=>'<div class="noble-tile" title="永久折扣达到以下数量即可获得"><strong>#'+(id+1)+'</strong><div class="cost">'+nobles[id].map((n,i)=>n?token(i,n):'').join('')+'</div></div>').join('')+'</div></section>';
    html+='<section class="gem-player-mat" id="gem-actions"><div class="row between"><h2>你的商会</h2><strong class="score-pill">'+points(p)+' / 15 分</strong></div><div class="mat-label">持有筹码 <span>'+C.sum(p.gems)+' / 10</span></div><div class="inventory own-gems">'+inventory(p.gems)+'</div><div class="mat-label">永久折扣 <span>每次购买都生效</span></div><div class="inventory own-bonuses">'+inventory(b)+'</div><p class="mat-summary">已购 '+p.cards.length+' 张 · 贵族 '+p.nobles.length+' 位 · 金筹码可替代任意颜色</p>';
    let prompt=!myTurn?'轮到 '+label(s.current)+'，请稍候。':s.pending==='return'?'筹码超出上限，请归还 '+(C.sum(p.gems)-10)+' 枚。':s.pending==='noble'?'满足贵族条件，请选择一位。':'你的回合 · 拿筹码、购买或预留，任选一项。';
    html+='<div class="turn-prompt '+(myTurn?'your-turn':'')+'" aria-live="polite">'+prompt+'</div>';
    if(ui.error)html+='<div class="notice error" role="alert">'+C.escape(ui.error)+'</div>';
    if(ui.gemReview!==undefined&&enabled){const id=ui.gemReview,c=cards[id];if(c&&(s.market.flat().includes(id)||p.reserved.includes(id))){const pay=payment(p,c);html+='<div class="action-preview purchase-preview"><strong>购买预览 · '+labels[c.bonus]+' +1 / '+c.points+' 分</strong><span>本次支付：'+(pay.paid.map((n,i)=>n?labels[i]+' '+n:'').filter(Boolean).join('、')||'免费')+'</span><span>购买后：永久'+labels[c.bonus]+'折扣 '+(b[c.bonus]+1)+' · 总分 '+(points(p)+c.points)+'</span><button class="primary" data-action="s-buy" data-id="'+id+'" '+(pay.missing?'disabled':'')+'>确认购买</button></div>';}}
    if(myTurn&&s.pending==='return')html+='<div class="actions">'+p.gems.map((n,i)=>n?'<button data-action="s-return" data-color="'+i+'">归还 '+labels[i]+'</button>':'').join('')+'</div>';
    else if(myTurn&&s.pending==='noble')html+='<div class="actions">'+eligible(s,p).map(id=>'<button class="primary" data-action="s-noble" data-id="'+id+'">贵族 #'+(id+1)+'</button>').join('')+'</div>';
    else {
      html+='<div class="gem-pick-grid">'+s.bank.slice(0,5).map((n,i)=>'<div><button class="pick-color '+colors[i]+' '+(s.selection.includes(i)?'selected':'')+'" data-action="s-toggle" data-color="'+i+'" aria-pressed="'+s.selection.includes(i)+'" '+(enabled&&n>0?'':'disabled')+'>'+labels[i]+'<small>'+(s.selection.includes(i)?'已选':'余 '+n)+'</small></button><button class="pick-double" data-action="s-double" data-color="'+i+'" '+(enabled&&n>=4?'':'disabled')+' title="需库存至少 4 枚，当前 '+n+' 枚">拿 2 枚</button></div>').join('')+'</div><button class="primary take-gems" data-action="s-take" '+(enabled&&s.selection.length===Math.min(3,s.bank.slice(0,5).filter(n=>n>0).length)&&s.selection.length>0?'':'disabled')+'>拿取所选宝石（'+s.selection.length+' / '+Math.min(3,s.bank.slice(0,5).filter(n=>n>0).length)+'）</button>';
    }
    const target=Math.min(3,s.bank.slice(0,5).filter(n=>n>0).length),remaining=target-s.selection.length;
    if(enabled)html+='<p class="action-hint" aria-live="polite">'+(target===0?'没有可拿取的普通宝石，请购买或预留卡牌。':remaining>0?'再选 '+remaining+' 种颜色即可拿取。':remaining<0?'最多选 '+target+' 种颜色，请取消多选。':'已选齐，可以拿取。')+' 同色拿 2 枚需库存至少 4 枚。</p>';
    html+='<div class="mat-label">预留卡 <span>'+p.reserved.length+' / 3</span></div><div class="reserved-cards">'+(p.reserved.length?p.reserved.map(id=>cardHtml(id,p,enabled,true)).join(''):'<span class="empty-note">暂未预留</span>')+'</div><details class="table-details"><summary>已购买卡牌（'+p.cards.length+'）与贵族（'+p.nobles.length+'）</summary><div class="card-row">'+p.cards.map(id=>cardHtml(id,p,false,false,true)).join('')+'</div>'+p.nobles.map(id=>'<p>贵族 #'+(id+1)+' · 3 分</p>').join('')+'</details></section></div><details class="table-details game-record"><summary>对局记录</summary><div class="log">'+s.log.map(x=>'<div>'+C.escape(x)+'</div>').join('')+'</div></details></div>';
    return html;
  }
  function validate(s,n){
    if(!s||!Array.isArray(s.players)||s.players.length!==n||!Array.isArray(s.decks)||s.decks.length!==3||!Array.isArray(s.market)||s.market.length!==3||!Array.isArray(s.bank)||s.bank.length!==6||!s.bank.every(x=>Number.isSafeInteger(x)&&x>=0)||!Number.isInteger(s.current)||s.current<0||s.current>=n||!Array.isArray(s.nobles)||!Array.isArray(s.log))return false;
    const ids=[];s.decks.forEach(a=>{if(!Array.isArray(a))return;ids.push(...a)});s.market.forEach(a=>{if(!Array.isArray(a)||a.length!==4)return;ids.push(...a.filter(x=>x!==null))});
    for(const p of s.players){if(!p||!Array.isArray(p.gems)||p.gems.length!==6||!p.gems.every(x=>Number.isSafeInteger(x)&&x>=0)||!Array.isArray(p.cards)||!Array.isArray(p.reserved)||!Array.isArray(p.nobles))return false;ids.push(...p.cards,...p.reserved)}
    if(ids.length!==90||new Set(ids).size!==90||ids.some(id=>!Number.isInteger(id)||id<0||id>=90))return false;
    for(let i=0;i<6;i++)if(s.bank[i]+C.sum(s.players.map(p=>p.gems[i]))!==(i===5?5:n===2?4:n===3?5:7))return false;
    const nobleIds=s.nobles.concat(...s.players.map(p=>p.nobles));return new Set(nobleIds).size===nobleIds.length&&nobleIds.every(id=>Number.isInteger(id)&&id>=0&&id<10);
  }
  C.Games.splendor={create,act,bot:chooseBot,render,validate,cards,nobles,points};
})();
