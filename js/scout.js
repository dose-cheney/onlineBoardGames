(function(){
  'use strict';
  const C=window.GameCore;
  const deck=[];for(let a=1;a<=10;a++)for(let b=a+1;b<=10;b++)deck.push({id:deck.length,a,b});
  const val=c=>{const d=deck[c.id];return c.flip?d.b:d.a};
  const other=c=>{const d=deck[c.id];return c.flip?d.a:d.b};
  const label=i=>C.onlineLabels?.[i]||(i===0?'你':'电脑 '+i);
  function allowedDeck(n){return deck.filter(c=>n===3?c.b!==10:n===2||n===4?!(c.a===9&&c.b===10):true).map(c=>c.id)}
  function combo(hand,start,end){
    if(start<0||end>=hand.length||start>end)return null;
    const nums=hand.slice(start,end+1).map(val),same=nums.every(v=>v===nums[0]);
    const asc=nums.every((v,i)=>i===0||v===nums[i-1]+1),desc=nums.every((v,i)=>i===0||v===nums[i-1]-1);
    if(!same&&!asc&&!desc)return null;
    return {length:nums.length,kind:same?1:0,value:same?nums[0]:Math.max(...nums),nums};
  }
  function beats(a,b){return !b||a.length>b.length||(a.length===b.length&&(a.kind>b.kind||(a.kind===b.kind&&a.value>b.value)))}
  function legalShows(s,i){const h=s.hands[i],out=[];for(let a=0;a<h.length;a++)for(let b=a;b<h.length;b++){const c=combo(h,a,b);if(c&&beats(c,s.activeRank))out.push({start:a,end:b,rank:c})}return out}
  function create(n){
    const s={n,round:0,firstPlayer:n===2?0:null,roundDecks:n===2?(()=>{const all=C.shuffle(allowedDeck(n));return [all.slice(0,22),all.slice(22)]})():null,hands:[],totals:Array(n).fill(0),roundScores:[],captured:[],tokens:[],scoutsLeft:[],comboUsed:[],active:[],activeRank:null,owner:-1,current:0,scoutChain:0,pendingCombined:false,orientationPending:true,finished:false,ranks:null,log:['新比赛开始。'],maxCombo:0,maxHumanCombo:0};
    startRound(s);return s;
  }
  function log(s,t){s.log.unshift(t);s.log=s.log.slice(0,20)}
  function flipHand(h){return h.reverse().map(c=>({id:c.id,flip:!c.flip}))}
  function quality(h){let best=0;for(let a=0;a<h.length;a++)for(let b=a;b<h.length;b++){const c=combo(h,a,b);if(c)best=Math.max(best,c.length*10+c.kind*2+c.value*.1)}return best}
  function startRound(s){
    s.roundPending=false;
    const ids=s.n===2?s.roundDecks[s.round]:C.shuffle(allowedDeck(s.n));
    const per=ids.length/s.n;s.hands=Array.from({length:s.n},(_,i)=>ids.slice(i*per,(i+1)*per).map(id=>({id,flip:Math.random()<.5})));
    for(let i=1;i<s.n;i++){const f=flipHand(s.hands[i].map(c=>({...c})));if(quality(f)>quality(s.hands[i]))s.hands[i]=f}
    s.captured=Array(s.n).fill(0);s.tokens=Array(s.n).fill(0);s.scoutsLeft=Array(s.n).fill(3);s.comboUsed=Array(s.n).fill(false);
    if(s.firstPlayer===null)s.firstPlayer=s.hands.findIndex(h=>h.some(c=>c.id===0));
    s.active=[];s.activeRank=null;s.owner=-1;s.current=(s.firstPlayer+s.round)%s.n;s.scoutChain=0;s.pendingCombined=false;s.orientationPending=true;
    if(s.online){s.turnStart=s.current;s.orientationConfirmed=Array.from({length:s.n},(_,i)=>!s.humanSeats.includes(i));s.current=s.orientationConfirmed.findIndex(x=>!x)}
    log(s,'第 '+(s.round+1)+' / '+s.n+' 轮，手牌已发放。');
  }
  function finishRound(s,exempt){
    const scores=s.hands.map((h,i)=>s.captured[i]+s.tokens[i]-((i===exempt)?0:h.length)+(s.n===2?s.scoutsLeft[i]:0));
    scores.forEach((v,i)=>s.totals[i]+=v);s.roundScores.push(scores);
    s.roundSummary={round:s.round+1,reason:s.hands[exempt]&&s.hands[exempt].length===0?label(exempt)+'出完了手牌':s.scoutChain>=s.n-1?label(exempt)+'的表演被所有对手招募':'双人招募次数耗尽，无法继续表演',rows:scores.map((score,i)=>({name:label(i),captured:s.captured[i],tokens:s.tokens[i],penalty:i===exempt?0:s.hands[i].length,exempt:i===exempt,remaining:s.n===2?s.scoutsLeft[i]:0,score,total:s.totals[i]}))};
    log(s,'第 '+(s.round+1)+' 轮结算：'+scores.map((v,i)=>label(i)+' '+v).join('，'));
    s.round++;
    s.roundPending=true;s.pendingCombined=false;s.orientationPending=false;
  }
  function doShow(s,start,end){
    const i=s.current,h=s.hands[i],rank=combo(h,start,end);
    if(!rank||!beats(rank,s.activeRank))throw Error('该连续牌组不能压过当前表演');
    if(s.pendingCombined){if(s.comboUsed[i]||s.n===2)throw Error('无法使用招募后表演');s.comboUsed[i]=true;s.pendingCombined=false}
    s.captured[i]+=s.active.length;s.active=h.splice(start,end-start+1);s.activeRank=rank;s.owner=i;s.scoutChain=0;s.maxCombo=Math.max(s.maxCombo,rank.length);
    if(i===0)s.maxHumanCombo=Math.max(s.maxHumanCombo||0,rank.length);
    log(s,label(i)+'表演 '+rank.nums.join('·')+'。');
    if(h.length===0){finishRound(s,i);return}
    s.current=(i+1)%s.n;
  }
  function doScout(s,end,position,flip){
    if(!s.active.length)throw Error('场上无牌可招募');
    if(end!=='left'&&end!=='right')throw Error('请选择表演的最左或最右端');
    const i=s.current,h=s.hands[i];
    if(s.n===2&&s.scoutsLeft[i]<=0)throw Error('招募次数已用完');
    if(!Number.isInteger(position)||position<0||position>h.length)throw Error('插入位置无效');
    const card=end==='left'?s.active.shift():s.active.pop();h.splice(position,0,{id:card.id,flip:!!flip});
    s.activeRank=s.active.length?combo(s.active,0,s.active.length-1):null;
    if(s.n===2)s.scoutsLeft[i]--;else if(s.owner>=0)s.tokens[s.owner]++;
    log(s,label(i)+'从表演末端招募 1 张牌。');
    if(s.n===2){
      if(s.scoutsLeft[i]===0&&!legalShows(s,i).length){finishRound(s,s.owner);return}
      return;
    }
    s.scoutChain++;
    if(s.scoutChain>=s.n-1){finishRound(s,s.owner);return}
    if(!s.comboUsed[i]&&legalShows(s,i).length){s.pendingCombined=true;return}
    s.current=(i+1)%s.n;
  }
  function act(s,a,v){
    if(s.finished)throw Error('比赛已结束');
    if(s.roundPending){
      if(a!=='c-next-round')throw Error('请先查看轮次结算');
      if(s.round>=s.n){s.roundPending=false;s.finished=true;s.ranks=C.ranks(s.totals);log(s,'比赛结束。')}
      else startRound(s);
      return;
    }
    if(s.orientationPending){
      const i=s.online?s.current:0;
      if(a==='c-flip'){s.hands[i]=flipHand(s.hands[i]);return}
      if(a==='c-confirm'){
        if(s.online){s.orientationConfirmed[i]=true;const next=s.orientationConfirmed.findIndex(x=>!x);if(next>=0){s.current=next;return}s.current=s.turnStart}
        s.orientationPending=false;return;
      }
      throw Error('请先确认本轮手牌方向');
    }
    if(s.pendingCombined){
      if(a==='c-endturn'){s.pendingCombined=false;s.current=(s.current+1)%s.n;return}
      if(a==='c-show'){doShow(s,+v.start,+v.end);return}
      throw Error('请选择招募后表演或结束回合');
    }
    if(a==='c-show'){doShow(s,+v.start,+v.end);return}
    if(a==='c-scout'){doScout(s,v.end,+v.position,v.flip==='true'||v.flip===true);return}
    if(a==='c-forfeit'&&s.n===2&&!legalShows(s,s.current).length&&s.scoutsLeft[s.current]===0){finishRound(s,s.owner);return}
    throw Error('未知行动');
  }
  function bot(s,difficulty){
    if(s.orientationPending||s.roundPending||s.finished)return;
    const i=s.current,h=s.hands[i],shows=legalShows(s,i);
    if(s.pendingCombined){
      const best=shows.sort((a,b)=>b.rank.length-a.rank.length||b.rank.value-a.rank.value)[0];
      if(best&&best.rank.length>=2)doShow(s,best.start,best.end);
      else {s.pendingCombined=false;s.current=(i+1)%s.n}
      return;
    }
    if(!s.active.length){
      const opts=shows.sort((a,b)=>b.rank.length-a.rank.length||a.rank.value-b.rank.value);
      const choice=difficulty==='easy'?opts[Math.floor(Math.random()*Math.min(opts.length,6))]:opts[0];
      doShow(s,choice.start,choice.end);return;
    }
    if(shows.length){
      const opts=shows.sort((a,b)=>(difficulty==='easy'?0:b.rank.length-a.rank.length)||a.rank.value-b.rank.value);
      const choice=difficulty==='easy'?opts[Math.floor(Math.random()*opts.length)]:opts[0];
      if(s.n===2||choice.rank.length>=2||h.length<=3||difficulty==='easy'){doShow(s,choice.start,choice.end);return}
    }
    if(s.n===2&&s.scoutsLeft[i]===0){if(shows.length){const c=shows[0];doShow(s,c.start,c.end)}else finishRound(s,s.owner);return}
    let options=[];
    for(const end of ['left','right']){
      const card=end==='left'?s.active[0]:s.active[s.active.length-1];
      for(let pos=0;pos<=h.length;pos++)for(const flip of [false,true]){
        const test=h.map(x=>({...x}));test.splice(pos,0,{id:card.id,flip});
        options.push({end,pos,flip,score:quality(test)-(difficulty==='easy'?Math.random()*30:0)});
      }
    }
    options.sort((a,b)=>b.score-a.score);
    const pick=options[0];doScout(s,pick.end,pick.pos,pick.flip);
  }
  function summaryHtml(summary){
    if(!summary)return '';
    return '<section class="round-summary"><h2>第 '+summary.round+' 轮结算</h2><p>'+C.escape(summary.reason)+'</p><div class="round-score-grid">'+summary.rows.map(r=>'<article class="round-score '+(r.name==='你'?'mine':'')+'"><strong>'+C.escape(r.name)+' · 本轮 '+(r.score>0?'+':'')+r.score+' 分</strong><span>收牌 '+r.captured+' + 招募奖励 '+r.tokens+' − 手牌扣分 '+r.penalty+(summary.rows.length===2?' + 剩余招募 '+r.remaining:'')+'</span>'+(r.exempt?'<small>本轮结束者免扣剩余手牌</small>':'')+'<b>累计 '+r.total+' 分</b></article>').join('')+'</div></section>';
  }
  function render(s,ui={}){
    if(s.roundPending)return '<div class="scout-tabletop"><div class="scout-score-strip">'+s.totals.map((v,i)=>'<section class="opponent-mat"><strong>'+C.playerBadge(i,ui)+label(i)+'</strong><b>'+v+' 分</b></section>').join('')+'</div>'+summaryHtml(s.roundSummary)+'<div class="actions"><button class="primary" data-action="c-next-round">'+(s.round>=s.n?'查看最终排名':'开始第 '+(s.round+1)+' 轮')+'</button></div><p class="muted">查看结算后再继续，电脑不会自动开始下一轮。</p></div>';
    const viewer=ui.viewer??0,my=s.hands[viewer],turn=s.current===viewer&&!s.finished,shows=turn&&!s.orientationPending?legalShows(s,viewer):[];
    const chosen=shows.find(x=>ui.scoutShow&&x.start===ui.scoutShow.start&&x.end===ui.scoutShow.end);
    let html='<div class="scout-tabletop"><div class="scout-score-strip">'+s.hands.map((h,i)=>'<section class="opponent-mat '+(i===s.current?'current':'')+'"><div class="row between"><strong>'+C.playerBadge(i,ui)+label(i)+'</strong><b>'+s.totals[i]+' 分</b></div><small>手牌 '+h.length+' · 收牌 '+s.captured[i]+' · 招募奖励 '+s.tokens[i]+'</small></section>').join('')+'</div><div class="table-status"><strong>第 '+(s.round+1)+' / '+s.n+' 轮 · '+(s.orientationPending?'选择方向':'轮到 '+label(s.current))+'</strong><span class="latest-action" aria-live="polite">'+C.escape(s.log[0])+'</span></div><div class="scout-stage"><div class="panel scout-performance"><h2>中央舞台</h2>';
    html+='<div class="section-title">当前表演'+(s.activeRank?' · '+s.activeRank.length+' 张'+(s.activeRank.kind?'同点数组合':'顺子'):'')+'</div><div class="hand">'+(s.active.length?s.active.map(c=>'<div class="card hand-card"><strong>'+val(c)+'</strong><div class="small">另一面 '+other(c)+'</div></div>').join(''):'<span class="muted">等待第一场表演</span>')+'</div>';
    if(s.owner>=0)html+='<p class="muted">表演者：'+label(s.owner)+' · 已连续招募 '+s.scoutChain+' 人</p>';
    html+='</div><div class="panel scout-player"><div class="row between"><h2>你的手牌</h2><span class="muted">按序号连续，换行不改变顺序</span></div><div class="hand scout-hand">'+my.map((c,i)=>'<div class="card hand-card '+(chosen&&i>=chosen.start&&i<=chosen.end?'selected':'')+'"><small>第 '+(i+1)+' 张</small><strong>'+val(c)+'</strong><div class="small">另一面 '+other(c)+'</div></div>').join('')+'</div>';
    if(ui.error)html+='<div class="notice error" role="alert">'+C.escape(ui.error)+'</div>';
    if(s.orientationPending)html+='<div class="notice">发牌时每张牌的数字朝向随机。拿到手牌后不能单张调整，可将整手牌翻面并反转顺序，对比两个方向后确认。</div>'+(turn?'<div class="actions"><button data-action="c-flip">整手翻面</button><button class="primary" data-action="c-confirm">确认手牌方向</button></div>':'<p class="muted">等待 '+label(s.current)+' 确认手牌。</p>');
    else if(turn){
      if(s.pendingCombined)html+='<div class="notice">可使用本轮一次的「招募后表演」，也可结束回合。</div>';
      html+='<div class="section-title">合法表演 · 选择组合'+(s.pendingCombined?'（使用组合行动）':'')+'</div><p class="action-hint">先选择组合，对应手牌会高亮；确认后才出牌。</p><div class="actions scout-shows">'+shows.map(x=>'<button class="'+(chosen===x?'primary':'')+'" data-action="c-select-show" data-start="'+x.start+'" data-end="'+x.end+'" aria-pressed="'+(chosen===x)+'">第 '+(x.start+1)+(x.end===x.start?'':'–'+(x.end+1))+' 张：'+x.rank.nums.join('·')+'</button>').join('')+'</div>';
      if(chosen)html+='<div class="action-preview" aria-live="polite"><strong>将表演 '+chosen.rank.length+' 张'+(chosen.rank.kind&&chosen.rank.length>1?'同点数组合':chosen.rank.length>1?'顺子':'单牌')+'：'+chosen.rank.nums.join('、')+'</strong><button class="primary" data-action="c-show" data-start="'+chosen.start+'" data-end="'+chosen.end+'">表演这 '+chosen.rank.length+' 张</button></div>';
      if(!shows.length)html+='<p class="muted">没有可以压过当前表演的连续组合。'+(s.active.length?'可以招募舞台两端的一张牌。':'')+'</p>';
      if(s.pendingCombined)html+='<div class="actions"><button data-action="c-endturn">结束回合</button></div>';
      else if(s.active.length&&(s.n!==2||s.scoutsLeft[viewer]>0)){
        const end=ui.scoutEnd==='right'?'right':'left',picked=end==='left'?s.active[0]:s.active[s.active.length-1],flip=typeof ui.scoutFlip==='boolean'?ui.scoutFlip:picked.flip,pos=Math.max(0,Math.min(my.length,ui.scoutPosition||0)),number=val({id:picked.id,flip}),position=pos===0?'最左':pos===my.length?'最右':'第 '+pos+' 张后';
        const preview=my.slice();preview.splice(pos,0,{id:picked.id,flip});
        html+='<div class="section-title">招募预览</div><div class="actions"><button data-action="c-recruit-end" data-end="left" aria-pressed="'+(end==='left')+'">左端 '+val(s.active[0])+' / '+other(s.active[0])+'</button><button data-action="c-recruit-end" data-end="right" aria-pressed="'+(end==='right')+'">右端 '+val(s.active[s.active.length-1])+' / '+other(s.active[s.active.length-1])+'</button></div><div class="row recruit-settings"><label>插入位置 <select id="scout-position">'+Array.from({length:my.length+1},(_,i)=>'<option value="'+i+'" '+(i===pos?'selected':'')+'>'+(i===0?'最左':i===my.length?'最右':'第 '+i+' 张后')+'</option>').join('')+'</select></label><label>数字朝向 <select id="scout-flip"><option value="false" '+(!flip?'selected':'')+'>以 '+deck[picked.id].a+' 朝上</option><option value="true" '+(flip?'selected':'')+'>以 '+deck[picked.id].b+' 朝上</option></select></label></div><div class="scout-insertion" aria-label="招募后的手牌预览">'+preview.map((c,i)=>'<span class="'+(i===pos?'inserted':'')+'">'+val(c)+(i===pos?'<small>新牌</small>':'')+'</span>').join('')+'</div><div class="actions"><button class="primary" data-action="c-scout" data-end="'+end+'">招募 '+number+' · 插入'+position+'</button></div>';
        if(s.n===2)html+='<p class="muted">双人本轮尚可招募 '+s.scoutsLeft[viewer]+' 次；招募后仍由你行动。</p>';
      }else if(s.n===2&&!shows.length)html+='<div class="actions"><button data-action="c-forfeit">本轮结算</button></div>';
    }
    if(!turn&&!s.orientationPending)html+='<div class="turn-prompt">轮到 '+label(s.current)+'，请稍候。</div>';
    html+='</div></div>'+(s.roundSummary?'<details class="table-details"><summary>上一轮结算</summary>'+summaryHtml(s.roundSummary)+'</details>':'')+'<details class="table-details game-record"><summary>对局记录</summary><div class="log">'+s.log.map(x=>'<div>'+C.escape(x)+'</div>').join('')+'</div></details></div>';
    return html;
  }
  function validate(s,n){
    if(!s||s.n!==n||!Array.isArray(s.hands)||s.hands.length!==n||!Array.isArray(s.totals)||s.totals.length!==n||!Array.isArray(s.active)||!Array.isArray(s.log)||!Number.isInteger(s.current)||s.current<0||s.current>=n||!Number.isInteger(s.round)||s.round<0||s.round>n)return false;
    if(s.roundSummary&&(!Number.isInteger(s.roundSummary.round)||typeof s.roundSummary.reason!=='string'||!Array.isArray(s.roundSummary.rows)||s.roundSummary.rows.length!==n||s.roundSummary.rows.some(r=>!r||typeof r.name!=='string'||!['captured','tokens','penalty','remaining','score','total'].every(k=>Number.isSafeInteger(r[k])))))return false;
    if(s.roundPending&&!s.roundSummary)return false;
    const cards=s.hands.flat().concat(s.active);return cards.every(c=>c&&Number.isInteger(c.id)&&c.id>=0&&c.id<45&&typeof c.flip==='boolean')&&new Set(cards.map(c=>c.id)).size===cards.length;
  }
  C.Games.scout={create,act,bot,render,validate,deck,legalShows,combo,beats};
})();
