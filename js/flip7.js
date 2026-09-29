(function(){
  'use strict';
  const C=window.GameCore,label=i=>i===0?'你':'电脑 '+i;
  const deck=[];
  const add=(kind,value,count=1)=>{for(let i=0;i<count;i++)deck.push({id:deck.length,kind,value})};
  add('number',0);for(let n=1;n<=12;n++)add('number',n,n);
  for(const n of [2,4,6,8,10])add('plus',n);add('times',2);
  for(const kind of ['freeze','three','chance'])add(kind,0,3);
  const cardName=c=>c.kind==='number'?String(c.value):c.kind==='plus'?'+'+c.value:c.kind==='times'?'×2':({freeze:'冻结',three:'连翻三张',chance:'第二次机会'})[c.kind];
  function log(s,t){s.log.unshift(t);s.log=s.log.slice(0,40)}
  function score(p){return p.status==='bust'?0:C.sum(p.numbers)*(p.modifiers.includes('times')?2:1)+C.sum(p.modifiers.filter(Number.isInteger))+(p.numbers.length===7?15:0)}
  const active=(s)=>s.players.map((p,i)=>p.status==='active'?i:-1).filter(i=>i>=0);
  function create(n){
    if(!Number.isInteger(n)||n<3||n>6)throw Error('Flip 7 支持 3–6 人');
    const s={n,round:0,dealer:Math.floor(Math.random()*n),players:[],deck:C.shuffle(deck.map(c=>c.id)),discard:[],roundCards:[],tasks:[],pending:null,current:-1,roundPending:false,finished:false,ranks:null,log:[],roundScores:[],humanFlip7:0,humanRescues:0,humanBestRound:0,lastCard:null};
    startRound(s);return s;
  }
  function startRound(s){
    s.round++;s.roundPending=false;s.pending=null;s.lastCard=null;
    s.players=Array.from({length:s.n},(_,i)=>({total:s.players[i]?.total||0,numbers:[],modifiers:[],chance:false,chanceCard:null,status:'active'}));
    s.roundCards=[];s.tasks=Array.from({length:s.n},(_,i)=>({kind:'draw',target:(s.dealer+i)%s.n}));s.tasks.push({kind:'turn',target:s.dealer});s.current=-1;log(s,'第 '+s.round+' 轮开始，'+label(s.dealer)+'先行动。');
  }
  function finishRound(s,reason){
    const scores=s.players.map(score);s.players.forEach((p,i)=>p.total+=scores[i]);s.roundScores.push(scores);
    s.humanBestRound=Math.max(s.humanBestRound,scores[0]);
    s.roundSummary={round:s.round,reason,rows:s.players.map((p,i)=>({name:label(i),score:scores[i],total:p.total,status:p.status}))};
    s.pending=null;s.tasks=[];s.roundPending=true;s.current=0;log(s,reason+'；本轮 '+scores.map((v,i)=>label(i)+' '+v).join('，'));
  }
  function nextActive(s,after){for(let n=1;n<=s.n;n++){const i=(after+n)%s.n;if(s.players[i].status==='active')return i}return -1}
  function draw(s){
    if(!s.deck.length){s.deck=C.shuffle(s.discard);s.discard=[];log(s,'牌堆耗尽，仅重新洗入此前弃牌。')}
    if(!s.deck.length)throw Error('没有可抽取的牌');
    const c=deck[s.deck.pop()];s.roundCards.push(c.id);return c;
  }
  function targets(s,kind){return active(s).filter(i=>kind!=='chance'||!s.players[i].chance)}
  function requestTarget(s,actor,kind,cardId=null){
    const candidates=targets(s,kind);
    if(!candidates.length){if(cardId!==null){const at=s.roundCards.indexOf(cardId);if(at>=0)s.discard.push(...s.roundCards.splice(at,1))}log(s,'没有可接收第二次机会的玩家，弃掉此牌。');return}
    s.pending={actor,kind,candidates,cardId};s.current=actor;
  }
  function receive(s,i,c,context=null){
    const p=s.players[i];s.lastCard={id:c.id,player:i};log(s,label(i)+'翻到 '+cardName(c)+'。');
    if(c.kind==='number'){
      if(p.numbers.includes(c.value)){
        if(p.chance){p.chance=false;s.discard.push(...s.roundCards.splice(s.roundCards.lastIndexOf(c.id),1));const rescue=s.roundCards.indexOf(p.chanceCard);p.chanceCard=null;if(rescue>=0)s.discard.push(...s.roundCards.splice(rescue,1));if(i===0)s.humanRescues++;log(s,'第二次机会抵消重复的 '+c.value+'，'+label(i)+'仍在本轮。')}
        else {p.status='bust';log(s,label(i)+'数字重复，爆牌，本轮 0 分。')}
      }else {p.numbers.push(c.value);if(p.numbers.length===7){if(i===0)s.humanFlip7++;finishRound(s,label(i)+'集齐七个不同数字，额外 +15，全员立即结算');return}}
    }else if(c.kind==='plus')p.modifiers.push(c.value);
    else if(c.kind==='times')p.modifiers.push('times');
    else if(c.kind==='chance'){
      if(!p.chance){p.chance=true;p.chanceCard=c.id}
      else requestTarget(s,i,'chance',c.id);
    }else if(context){context.deferred.push({kind:c.kind,actor:i})}
    else requestTarget(s,i,c.kind);
  }
  function applyTarget(s,i){
    const pending=s.pending;if(!pending||!pending.candidates.includes(i))throw Error('请选择仍在本轮的有效目标');
    s.pending=null;s.current=-1;
    if(pending.kind==='chance'){s.players[i].chance=true;s.players[i].chanceCard=pending.cardId;log(s,label(pending.actor)+'把第二次机会交给'+label(i)+'。')}
    else if(pending.kind==='freeze'){s.players[i].status='frozen';log(s,label(i)+'被冻结，锁定 '+score(s.players[i])+' 分。')}
    else {s.tasks.unshift({kind:'three',target:i,left:3,deferred:[]});log(s,label(i)+'必须连续翻三张。')}
  }
  function step(s){
    if(s.finished||s.roundPending||s.pending||s.current>=0)return;
    if(!active(s).length){finishRound(s,'所有人已收分、被冻结或爆牌');return}
    const t=s.tasks.shift();if(!t)throw Error('缺少轮次任务');
    if(t.kind==='draw'){
      if(s.players[t.target].status==='active')receive(s,t.target,draw(s));
    }else if(t.kind==='turn'){
      let i=t.target;if(s.players[i].status!=='active')i=nextActive(s,i);
      if(i<0)finishRound(s,'本轮结束');else s.current=i;
    }else if(t.kind==='three'){
      if(s.players[t.target].status!=='active')return;
      if(t.left>0){t.left--;s.tasks.unshift(t);receive(s,t.target,draw(s),t)}
      else if(t.deferred.length){const d=t.deferred.shift();s.tasks.unshift(t);requestTarget(s,d.actor,d.kind)}
    }
    if(!s.pending&&s.current<0&&!s.roundPending&&!active(s).length)finishRound(s,'所有人已收分、被冻结或爆牌');
  }
  function act(s,a,v={}){
    if(s.finished)throw Error('游戏已结束');
    if(s.roundPending){
      if(a!=='f-next')throw Error('请先查看本轮结算');
      const totals=s.players.map(p=>p.total),max=Math.max(...totals);
      if(max>=200&&totals.filter(v=>v===max).length===1){s.roundPending=false;s.finished=true;s.ranks=C.ranks(totals);return}
      if(max>=200)log(s,'最高分并列，全员进行加赛。');
      s.discard.push(...s.roundCards);s.dealer=(s.dealer+1)%s.n;startRound(s);return;
    }
    if(s.pending){if(a!=='f-target')throw Error('请先选择特殊牌目标');applyTarget(s,+v.target);return}
    const i=s.current;if(i<0||s.players[i].status!=='active')throw Error('正在处理发牌，请稍候');
    if(a==='f-stay'){
      const p=s.players[i];if(!p.numbers.length&&!p.modifiers.length&&!p.chance)throw Error('至少有一张牌才可收分');
      p.status='stay';log(s,label(i)+'选择收分，锁定 '+score(p)+' 分。');
    }else if(a==='f-hit')s.tasks.unshift({kind:'draw',target:i});else throw Error('未知行动');
    s.tasks.push({kind:'turn',target:(i+1)%s.n});s.current=-1;
    if(!active(s).length)finishRound(s,'所有人已收分、被冻结或爆牌');
  }
  function risk(s,i){const nums=s.players[i].numbers;return s.deck.length?100*s.deck.reduce((n,id)=>n+(deck[id].kind==='number'&&nums.includes(deck[id].value)?1:0),0)/s.deck.length:0}
  function bot(s,difficulty){
    if(s.finished||s.roundPending)return;
    if(s.pending){
      const {actor,kind,candidates}=s.pending;
      const sorted=candidates.slice().sort((a,b)=>kind==='chance'?(a===actor?-1:b===actor?1:s.players[b].total-s.players[a].total):kind==='freeze'?score(s.players[b])-score(s.players[a]):risk(s,b)-risk(s,a));
      applyTarget(s,sorted[0]);return;
    }
    if(s.current<0){step(s);return}
    const i=s.current,p=s.players[i],points=score(p),r=risk(s,i),threshold=difficulty==='easy'?22:difficulty==='hard'?30:26;
    const canStay=p.numbers.length||p.modifiers.length||p.chance;
    const hit=!canStay||p.chance||points<threshold||(p.numbers.length>=5&&r<35)||(s.players.some((q,j)=>j!==i&&q.total>=180)&&p.total+points<200);
    act(s,hit?'f-hit':'f-stay');
  }
  function validate(s,n){
    try{
      const ids=s.deck.concat(s.discard,s.roundCards);
      return s.n===n&&n>=3&&n<=6&&Number.isInteger(s.round)&&s.round>0&&Number.isInteger(s.dealer)&&s.dealer>=0&&s.dealer<n&&s.players.length===n&&ids.length===94&&new Set(ids).size===94&&ids.every(id=>Number.isInteger(id)&&deck[id])&&s.players.every(p=>Number.isSafeInteger(p.total)&&p.total>=0&&p.numbers.length<=7&&new Set(p.numbers).size===p.numbers.length&&p.numbers.every(v=>Number.isInteger(v)&&v>=0&&v<=12)&&p.modifiers.every(v=>v==='times'||[2,4,6,8,10].includes(v))&&typeof p.chance==='boolean'&&['active','stay','frozen','bust'].includes(p.status))&&Array.isArray(s.tasks)&&s.tasks.every(t=>['draw','turn','three'].includes(t.kind)&&Number.isInteger(t.target)&&t.target>=0&&t.target<n)&&Number.isInteger(s.current)&&s.current>=-1&&s.current<n&&typeof s.finished==='boolean'&&typeof s.roundPending==='boolean'&&Array.isArray(s.roundScores)&&Array.isArray(s.log)&&(!s.pending||(s.pending.actor===s.current&&['chance','freeze','three'].includes(s.pending.kind)&&Array.isArray(s.pending.candidates)&&s.pending.candidates.length>0&&s.pending.candidates.every(i=>targets(s,s.pending.kind).includes(i))));
    }catch(e){return false}
  }
  const numberHtml=n=>'<span class="flip-number" style="--card-hue:'+((n*29+20)%360)+'">'+n+'</span>';
  function render(s,ui={}){
    const me=s.players[0],points=score(me),isMine=s.current===0;
    let controls='';
    if(s.roundPending){const top=Math.max(...s.players.map(p=>p.total)),end=top>=200&&s.players.filter(p=>p.total===top).length===1;controls='<div class="round-summary"><h2>第 '+s.round+' 轮结算</h2><p>'+C.escape(s.roundSummary.reason)+'</p><div class="round-score-grid">'+s.roundSummary.rows.map(r=>'<article class="round-score"><strong>'+r.name+' · '+r.score+' 分</strong><span>累计 '+r.total+' / 200</span></article>').join('')+'</div><button class="primary" data-action="f-next">'+(end?'查看最终成绩':top>=200?'最高分并列，继续加赛':'继续下一轮')+'</button></div>'}
    else if(s.pending){controls='<div class="turn-prompt '+(isMine?'your-turn':'')+'">'+(isMine?'选择「'+cardName({kind:s.pending.kind})+'」的目标：':label(s.current)+'正在选择特殊牌目标…')+'</div>'+(isMine?'<div class="actions">'+s.pending.candidates.map(i=>'<button data-action="f-target" data-target="'+i+'">'+label(i)+' · 本轮 '+score(s.players[i])+' 分</button>').join('')+'</div>':'')}
    else controls='<div class="turn-prompt '+(isMine?'your-turn':'')+'">'+(isMine?'轮到你：收下当前分数，或继续翻牌争取七张。':s.current<0?'正在发牌并处理特殊效果…':label(s.current)+'正在决定继续或收分…')+'</div><div class="actions"><button class="primary" data-action="f-hit" '+(!isMine?'disabled':'')+'>继续翻一张</button><button data-action="f-stay" '+(!isMine||(!me.numbers.length&&!me.modifiers.length&&!me.chance)?'disabled':'')+'>收分 '+points+'</button></div>';
    controls='<div class="flip-controls">'+controls+'</div>';
    return '<section class="flip-table"><div class="table-status"><strong>第 '+s.round+' 轮 · 目标 200 分</strong><span>牌堆 '+s.deck.length+' 张 · 弃牌 '+s.discard.length+' 张</span></div><div class="flip-scoreboard">'+s.players.map((p,i)=>'<article class="flip-opponent '+(i===0?'mine':'')+' '+(s.current===i?'current':'')+'"><div class="row between"><strong>'+label(i)+'</strong><b>'+p.total+' / 200</b></div><span class="muted">'+({active:'继续中',stay:'已收分',frozen:'已冻结',bust:'爆牌 · 0 分'})[p.status]+' · 本轮 '+score(p)+' 分'+(p.chance?' · 有第二次机会':'')+'</span><div class="flip-small-hand">'+p.numbers.map(numberHtml).join('')+p.modifiers.map(v=>'<span class="flip-modifier">'+(v==='times'?'×2':'+'+v)+'</span>').join('')+'</div></article>').join('')+'</div><div class="flip-last-inline">'+(s.lastCard?'最近：'+label(s.lastCard.player)+'翻到 <strong>'+cardName(deck[s.lastCard.id])+'</strong>':'正在准备发牌')+' · 下张重复概率 '+risk(s,0).toFixed(1)+'%</div><div class="flip-workspace"><section class="flip-own"><div class="row between"><h2>你的牌 · '+me.numbers.length+' / 7</h2><strong>可收 '+points+' 分</strong></div><div class="flip-hand">'+me.numbers.map(numberHtml).join('')+(me.numbers.length?'':'<span class="muted">数字牌会显示在这里</span>')+'</div><div class="row">'+me.modifiers.map(v=>'<span class="flip-modifier">'+(v==='times'?'数字合计 ×2':'额外 +'+v)+'</span>').join('')+(me.chance?'<span class="badge win">第二次机会 · 可抵消一次重复</span>':'')+'</div><p class="action-hint">'+(me.status==='bust'?'本轮已爆牌，以下数字不再计分。 ':'')+'数字 '+C.sum(me.numbers)+(me.modifiers.includes('times')?' ×2':'')+' + 加分 '+C.sum(me.modifiers.filter(Number.isInteger))+(me.numbers.length===7?' + 七张奖励 15':'')+' = '+points+'。重复数字会爆牌，特殊牌不算七张。</p>'+(ui.error?'<p class="field-error" role="alert">'+C.escape(ui.error)+'</p>':'')+controls+'</section><aside class="flip-draw"><h3>最近翻开的牌</h3>'+(s.lastCard?'<div class="flip-reveal '+(deck[s.lastCard.id].kind==='number'?'':'special')+'"><strong>'+cardName(deck[s.lastCard.id])+'</strong><span>'+label(s.lastCard.player)+'</span></div>':'<div class="flip-reveal"><strong>?</strong><span>准备发牌</span></div>')+'<p>你下张翻到重复数字的概率：<b>'+risk(s,0).toFixed(1)+'%</b></p><small class="muted">按公开牌堆余量计算；持有第二次机会可抵消一次重复。</small><details class="table-details"><summary>剩余数字牌</summary><div class="flip-counts">'+Array.from({length:13},(_,v)=>'<span>'+v+'：'+s.deck.filter(id=>deck[id].kind==='number'&&deck[id].value===v).length+'</span>').join('')+'</div></details></aside></div><details class="table-details game-record"><summary>最近翻牌过程</summary><div class="log">'+s.log.map(t=>'<div>'+C.escape(t)+'</div>').join('')+'</div></details></section>';
  }
  C.Games.flip7={create,act,bot,validate,render,deck,score,risk,step};
})();
