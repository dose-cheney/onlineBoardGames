(function(){
  'use strict';
  const C=window.GameCore,D=C.AthleteData.racers,byId=Object.fromEntries(D.map(r=>[r.id,r])),label=i=>C.onlineLabels?.[i]||(i===0?'你':'电脑 '+i);
  const FINISH=30;
  // Coordinates are presentation only: positions are counted from Start toward the line.
  const wild={1:'star',5:'trip',7:3,11:1,13:'star',16:4,17:'trip',23:2,24:-2,26:'trip'};
  const gold=[3,4,4,5],silver=[1,2,2,3];
  const die=()=>1+Math.floor(Math.random()*6),card=id=>byId[id];
  let spriteSequence=0,artworkReady=false;
  function ensureArtwork(){
    if(artworkReady)return true;
    if(typeof document==='undefined'||!document.createElementNS)return false;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='athlete-artwork';svg.setAttribute('aria-hidden','true');svg.setAttribute('width','0');svg.setAttribute('height','0');
    svg.style.position='absolute';svg.style.pointerEvents='none';
    svg.innerHTML='<defs>'+D.map(r=>'<clipPath id="athlete-outline-'+r.id+'"><path d="'+r.artwork.clip+'"/></clipPath><g id="athlete-image-'+r.id+'"><image href="assets/athlete-atlas.png" width="1254" height="1254" clip-path="url(#athlete-outline-'+r.id+')"/></g>').join('')+'</defs>';
    document.body.appendChild(svg);artworkReady=true;return true;
  }
  function sprite(id,cls=''){
    if(ensureArtwork())return '<svg class="athlete-sprite '+cls+'" viewBox="'+card(id).artwork.viewBox+'" aria-hidden="true" focusable="false"><use href="#athlete-image-'+id+'"/></svg>';
    const r=card(id),clipId='athlete-clip-'+(++spriteSequence);
    return '<svg class="athlete-sprite '+cls+'" viewBox="'+r.artwork.viewBox+'" aria-hidden="true" focusable="false"><defs><clipPath id="'+clipId+'"><path d="'+r.artwork.clip+'"/></clipPath></defs><image href="assets/athlete-atlas.png" width="1254" height="1254" clip-path="url(#'+clipId+')"/></svg>';
  }
  function log(s,text,racer=null){s.log.unshift(text);s.log=s.log.slice(0,70);s.lastEvent={text,racer};s.eventCount=(s.eventCount||0)+1}
  function create(n,settings={}){
    if(!Number.isInteger(n)||n<2||n>6)throw Error('胡闹运动会支持 2–6 人');
    const first=Math.floor(Math.random()*n),s={n,phase:'draft',round:0,current:first,teams:Array.from({length:n},()=>[]),used:[],totals:Array(n).fill(0),pool:C.shuffle(D.map(r=>r.id)),draftMarket:[],draftOrder:[],draftIndex:0,draftBatch:0,first,firstRacer:0,chosen:[],racers:[],tasks:[],pending:null,turn:null,nextRacer:null,winners:[],pastWinners:[],roundScores:[],raceScores:Array(n).fill(0),finished:false,roundPending:false,ranks:null,log:[],lastEvent:null,eventCount:0,humanWins:0,humanBestChain:0,speed:'normal',difficulty:['easy','medium','hard'].includes(settings.difficulty)?settings.difficulty:'medium',trackMode:settings.trackMode==='mild'?'mild':'alternating',draftMode:settings.draftMode==='random'?'random':'draft',loopSeen:{}};
    if(s.draftMode==='random'){for(let i=0;i<n;i++)s.teams[i]=s.pool.splice(0,n===2?8:4);lineup(s)}else draftBatch(s);
    return s;
  }
  function draftBatch(s){
    const start=(s.first+s.draftBatch)%s.n,order=Array.from({length:s.n},(_,i)=>(start+i)%s.n);
    s.draftOrder=s.n===2?[...order,...order.slice().reverse(),...order,...order.slice().reverse()]:[...order,...order.slice().reverse()];
    s.draftMarket=s.pool.splice(0,s.n===2?8:s.n*2);s.draftIndex=0;s.current=s.draftOrder[0];
    log(s,'第 '+(s.draftBatch+1)+' 批选角，采用蛇形顺序。');
  }
  function lineup(s){
    s.phase='lineup';s.roundPending=false;s.round++;s.current=0;s.chosen=Array.from({length:s.n},()=>[]);s.tasks=[];s.pending=null;
    for(let i=0;i<s.n;i++)if(!s.online?s.current!==i:!s.humanSeats.includes(i))s.chosen[i]=(s.difficulty==='easy'?C.shuffle(s.teams[i]):s.teams[i].slice().sort((a,b)=>strength(a)-strength(b))).slice(0,s.n===2?2:1);
    if(s.online)s.current=s.humanSeats[0];
    log(s,'第 '+s.round+' / 4 场，请选择上场选手'+(s.n===2?'，选择顺序也是队内行动顺序':'')+'。');
  }
  function strength(id){return ({legs:5,rocket:4.8,toad:4.7,scoocher:6,fish:4.6,blimp:4.3,alchemist:4.2,hare:4.3,coach:4.1,gunk:4,mouth:3.5,magician:4.5,sisyphus:3.5,egg:4.6,twin:4})[id]||3.6}
  function launch(s){
    s.racers=s.chosen.flatMap((ids,owner)=>ids.map(id=>({id,owner,pos:0,tripped:false,out:false,place:0,ability:null,prediction:null,predicted:false,turns:0})));
    s.chosen.forEach((ids,i)=>{s.teams[i]=s.teams[i].filter(id=>!ids.includes(id));s.used.push(...ids)});
    s.phase='prepare';s.turn=null;s.current=-1;s.raceScores=Array(s.n).fill(0);s.winners=[];s.pending=null;s.loopSeen={};
    if(s.round===1)s.firstRacer=Math.floor(Math.random()*s.n)*(s.n===2?2:1);
    s.tasks=s.racers.map((r,i)=>({kind:'prepare',i}));s.tasks.push({kind:'start-race'});
  }
  function living(s){return s.racers.map((r,i)=>!r.out?i:-1).filter(i=>i>=0)}
  function priority(s,indices=living(s)){
    const first=s.turn?s.turn.i:s.firstRacer,count=s.racers.length;
    return indices.slice().sort((a,b)=>{if(a===first)return -1;if(b===first)return 1;const owner=s.racers[first]?.owner||0;return (s.racers[a].owner-owner+s.n)%s.n-(s.racers[b].owner-owner+s.n)%s.n||a-b});
  }
  function ability(s,i,visited=new Set()){
    const r=s.racers[i];if(!r||r.out||visited.has(i))return null;
    const id=r.ability||r.id;if(id!=='copycat')return id;
    visited.add(i);const options=living(s),max=Math.max(...options.map(j=>s.racers[j].pos));
    const leaders=options.filter(j=>s.racers[j].pos===max);let target=leaders.includes(r.copyTarget)?r.copyTarget:leaders.find(j=>j!==i);
    if(target===undefined)return null;
    // Copycat copies Twin's printed before-race power, never Twin's chosen ability.
    if(s.racers[target].id==='twin')return 'twin';
    return ability(s,target,visited);
  }
  const withAbility=(s,id)=>priority(s,living(s).filter(i=>ability(s,i)===id));
  function score(s,i,n,text){const r=s.racers[i],before=s.totals[r.owner];s.totals[r.owner]=Math.max(0,before+n);n=s.totals[r.owner]-before;s.raceScores[r.owner]+=n;log(s,card(r.id).name+'：'+text+'（'+(n>0?'+':'')+n+' 分）',i)}
  function power(s,i,text,tasks=[]){
    if(s.racers[i].out)return;if(s.turn&&s.racers[s.turn.i].owner===0){s.turn.powers=(s.turn.powers||0)+1;s.humanBestChain=Math.max(s.humanBestChain,s.turn.powers)}log(s,card(s.racers[i].id).name+'发动：'+text,i);
    s.tasks.unshift(...tasks,{kind:'power-end',i});
  }
  function ask(s,i,kind,text,options,extra={}){s.pending={i,kind,text,options,...extra};s.current=s.racers[i].owner}
  function queue(s,...tasks){s.tasks.unshift(...tasks)}
  function same(s,pos,exclude=[]){return living(s).filter(i=>s.racers[i].pos===pos&&!exclude.includes(i))}
  function nextLive(s,i){for(let k=1;k<=s.racers.length;k++){const j=(i+k)%s.racers.length;if(!s.racers[j].out)return j}return -1}
  function finish(s,i){
    const r=s.racers[i];if(r.out)return;r.out=true;r.pos=FINISH;r.place=s.winners.length+1;s.winners.push(i);
    score(s,i,r.place===1?gold[s.round-1]:silver[s.round-1],'获得第 '+r.place+' 名');if(r.place===1){s.pastWinners.push(r.id);if(r.owner===0)s.humanWins++}
    if(s.winners.length===1){
      const predictors=priority(s,living(s).filter(j=>ability(s,j)==='mastermind'&&s.racers[j].prediction===i)).sort((a,b)=>((s.racers[b].ability||s.racers[b].id)==='mastermind')-((s.racers[a].ability||s.racers[a].id)==='mastermind'));
      if((r.ability||r.id)==='mastermind'&&r.prediction===i)predictors.unshift(i);
      if(predictors.length){const p=predictors[0],pr=s.racers[p];pr.out=true;if(p!==i)pr.place=2;s.winners.push(p);score(s,p,silver[s.round-1],'预测冠军成功，获得亚军奖分')}
    }
    if(s.winners.length>=2)endRace(s);
  }
  function endRace(s){
    const indices=s.racers.map((_,i)=>i),eliminated=indices.filter(i=>s.racers[i].eliminated);
    const last=eliminated.length?eliminated.sort((a,b)=>s.racers[a].eliminated-s.racers[b].eliminated)[0]:indices.filter(i=>!s.racers[i].place).sort((a,b)=>s.racers[a].pos-s.racers[b].pos||a-b)[0];
    if(s.n===2){const low=Math.min(...s.raceScores),owners=[0,1].filter(i=>s.raceScores[i]===low);s.firstRacer=owners[Math.floor(Math.random()*owners.length)]*2}else if(last!==undefined)s.firstRacer=s.racers[last].owner;
    s.phase='round';s.roundPending=true;s.current=0;s.pending=null;s.tasks=[];
    s.roundScores.push(s.raceScores.slice());s.roundSummary={round:s.round,rows:s.totals.map((total,i)=>({name:label(i),score:s.raceScores[i],total})),winners:s.winners.map(i=>card(s.racers[i].id).name)};
    log(s,'第 '+s.round+' 场结束：'+s.roundSummary.winners.join('、')+'。');
  }
  function cleanupEliminations(s){
    const live=living(s);if(live.length<=1){if(live.length)finish(s,live[0]);if(!s.roundPending)endRace(s)}
  }
  function loopKey(s,t){return JSON.stringify([t,s.racers.map(r=>[r.pos,r.tripped,r.out,r.ability,r.prediction]),s.totals])}
  function movementEnd(s,t){
    const r=s.racers[t.i],direction=Math.sign(t.amount);let end=r.pos,skips=0;
    for(let count=0;count<Math.abs(t.amount);count++){
      end+=direction;if(end<0){end=0;break}if(end>=FINISH){end+=direction*(Math.abs(t.amount)-count-1);break}
      if(ability(s,t.i)==='toad')while(end>0&&end<FINISH&&same(s,end,[t.i,...(t.vacating||[])]).length){end+=direction;skips++}
    }
    if(end>FINISH&&withAbility(s,'stickler').some(j=>j!==t.i))return {end:r.pos,blocked:true,skips:0};
    return {end:Math.max(0,end),skips};
  }
  function move(s,t){
    const r=s.racers[t.i];if(!r||r.out||!t.amount)return;
    const computed=movementEnd(s,t);if(computed.blocked){const i=withAbility(s,'stickler').find(j=>j!==t.i);power(s,i,'必须恰好到终点，取消'+card(r.id).name+'的过量移动');return}
    if(computed.end===r.pos)return;
    if(!t.checked){
      t.followers=[];t.followCandidates=withAbility(s,'fish').filter(j=>j!==t.i&&s.racers[j].pos===r.pos);t.checked=true;
      queue(s,{kind:'follow',move:t});return;
    }
    const group=[t.i,...t.followers.filter(j=>!s.racers[j].out&&s.racers[j].pos===r.pos)],from=Object.fromEntries(group.map(i=>[i,s.racers[i].pos]));
    for(const i of group)s.racers[i].pos=Math.min(FINISH,computed.end);
    log(s,group.map(i=>card(s.racers[i].id).name).join('与')+'从 '+from[t.i]+' → '+computed.end+' 格'+(t.reason?' · '+t.reason:''),t.i);
    if(computed.end>=FINISH){for(const i of group){if(s.roundPending)break;finish(s,i)}return}
    const effects=[];
    for(let k=0;k<computed.skips;k++)effects.push({kind:'ability-notify',i:t.i,text:'跳过占用格'});
    effects.push({kind:'arrive',group,from,moved:true});queue(s,...effects);
  }
  function arrive(s,t){
    const group=t.group.filter(i=>!s.racers[i].out);if(!group.length)return;
    const events=[];
    for(const i of priority(s,group))events.push({kind:'space',i,pos:s.racers[i].pos});
    for(const i of priority(s))events.push({kind:'arrival-power',i,event:t});
    queue(s,...events);
  }
  function arrivalPower(s,i,e){
    if(s.racers[i].out)return;
    const a=ability(s,i),r=s.racers[i],group=e.group.filter(j=>!s.racers[j].out),moving=group.includes(i);
    const crossed=(j)=>e.moved&&e.from[j]!==r.pos&&s.racers[j].pos!==r.pos&&((e.from[j]<r.pos&&s.racers[j].pos>r.pos)||(e.from[j]>r.pos&&s.racers[j].pos<r.pos));
    if(a==='banana'){
      const targets=group.filter(j=>j!==i&&crossed(j));if(targets.length)power(s,i,'绊倒越过自己的选手',targets.map(j=>({kind:'trip',i:j})));
    }else if(a==='centaur'&&moving&&e.moved){
      const targets=living(s).filter(j=>!group.includes(j)&&e.from[i]!==s.racers[j].pos&&((e.from[i]<s.racers[j].pos&&r.pos>s.racers[j].pos)||(e.from[i]>s.racers[j].pos&&r.pos<s.racers[j].pos))).sort((a,b)=>Math.abs(s.racers[a].pos-e.from[i])-Math.abs(s.racers[b].pos-e.from[i]));
      if(targets.length)power(s,i,'被超过者后退 2 格',targets.map(j=>({kind:'move',i:j,amount:-2,reason:'半人马'})));
    }else if(a==='baby'&&r.pos!==0){
      const targets=same(s,r.pos,[i]);if(targets.length)power(s,i,'把同格选手放到后面一格',[{kind:'warp-many',destinations:targets.map(j=>({i:j,pos:Math.max(0,r.pos-1)}))}]);
    }else if(a==='baba'){
      const targets=moving?same(s,r.pos,group):group.filter(j=>j!==i&&s.racers[j].pos===r.pos);
      if(targets.length)power(s,i,'让相遇选手摔倒',targets.map(j=>({kind:'trip',i:j})));
    }else if(a==='mouth'&&moving){
      const targets=same(s,r.pos,group);if(targets.length===1&&group.filter(j=>s.racers[j].pos===r.pos).length===1)power(s,i,'淘汰同格唯一对手',[{kind:'eliminate',i:targets[0]}]);
    }else if(a==='romantic'){
      const meetings=group.filter(j=>same(s,s.racers[j].pos,group).length===1&&group.filter(k=>s.racers[k].pos===s.racers[j].pos).length===1);
      if(meetings.length)power(s,i,'相遇让爱心选手前进 2 格',meetings.map(()=>({kind:'move',i,amount:2,reason:'心动'})));
    }else if(a==='duelist'){
      const targets=same(s,r.pos,[i]);if(targets.length&&(moving||group.some(j=>s.racers[j].pos===r.pos)))ask(s,i,'duel','选择决斗对象，或放弃这次决斗',[{value:'skip',label:'不决斗'},...targets.map(j=>({value:String(j),label:card(s.racers[j].id).name}))]);
    }
  }
  function startTurn(s,i){
    if(i<0){endRace(s);return}s.turn={i,start:s.racers[i].pos,die:null,rerolls:0,merchantUsed:false,extra:false,next:null,first:s.racers[i].turns===0,mainSkipped:false,eventStart:s.eventCount};s.racers[i].turns++;s.loopSeen={};s.phase='race';s.current=-1;
    queue(s,{kind:'begin',i},{kind:'main-prompt',i},{kind:'end-turn',i});
    log(s,label(s.racers[i].owner)+' · '+card(s.racers[i].id).name+'的回合。',i);
  }
  function begin(s,i){
    const r=s.racers[i],a=ability(s,i),live=living(s),last=Math.min(...live.map(j=>s.racers[j].pos)),lead=Math.max(...live.map(j=>s.racers[j].pos));
    if(a==='loser'&&r.pos===last&&live.filter(j=>s.racers[j].pos===last).length===1)power(s,i,'独自最后，获得 1 分',[{kind:'score',i,amount:1,text:'独自最后'}]);
    if(a==='hare'&&r.pos===lead&&live.filter(j=>s.racers[j].pos===lead).length===1){s.turn.mainSkipped=true;power(s,i,'独自领先，跳过本次主移动')}
    if(a==='party')power(s,i,'全员朝自己靠近 1 格',[{kind:'group-toward',i}]);
    if(a==='duelist'&&same(s,r.pos,[i]).length)ask(s,i,'duel','选择同格对手决斗，或跳过',[{value:'skip',label:'不决斗'},...same(s,r.pos,[i]).map(j=>({value:String(j),label:card(s.racers[j].id).name}))]);
    else if(a==='mastermind'&&!r.predicted)ask(s,i,'predict-winner','预测本场冠军，猜中可获得亚军奖分',live.map(j=>({value:String(j),label:card(s.racers[j].id).name})));
    else if(a==='cheer')ask(s,i,'cheer','是否帮助当前最后的选手？',[{value:'yes',label:'最后选手 +2，然后自己 +1'},{value:'skip',label:'跳过'}]);
    else if(a==='hypnotist')ask(s,i,'hypnotize','把一名选手传送到自己身边',[{value:'skip',label:'跳过'},...live.filter(j=>j!==i).map(j=>({value:String(j),label:card(s.racers[j].id).name+' · '+s.racers[j].pos+' 格'}))]);
    else if(a==='third'){const positions=[...new Set(live.map(j=>s.racers[j].pos))].filter(pos=>same(s,pos).length===2);if(positions.length)ask(s,i,'third','传送到恰有两名选手的格子',[{value:'skip',label:'跳过'},...positions.map(pos=>({value:String(pos),label:'传送至 '+pos+' 格'}))])}
    else if(a==='copycat'){/* Resolved dynamically in ability(). */}
  }
  function mainPrompt(s,i){
    const r=s.racers[i];if(r.out||s.turn.mainSkipped)return;
    if(r.tripped){r.tripped=false;log(s,card(r.id).name+'站起来，本回合跳过主移动。',i);return}
    const a=ability(s,i),options=[{value:'roll',label:'掷骰前进'}];
    if(a==='legs')options.unshift({value:'five',label:'使用大长腿 · 走 5 格'});
    if(a==='flipflop')options.push(...living(s).filter(j=>j!==i).map(j=>({value:'swap:'+j,label:'交换 '+card(s.racers[j].id).name+' · '+s.racers[j].pos+' 格'})));
    if(a==='genius')options.push(...Array.from({length:6},(_,j)=>({value:'guess:'+(j+1),label:'预测 '+(j+1)+'，再掷骰'})));
    ask(s,i,'main','选择主移动方式',options);
  }
  function afterRoll(s,i){
    const a=ability(s,i),roll=s.turn.die,options=[{value:'keep',label:'采用 '+roll+' 点'}];
    if(a==='alchemist'&&roll<=2)options.push({value:'four',label:'炼金术 · 改走 4 格'});
    if(a==='rocket')options.push({value:'double',label:'火箭 · 走 '+roll*2+' 格后摔倒'});
    if(a==='magician'&&s.turn.rerolls<2)options.push({value:'reroll',label:'魔术师重掷 · 还可 '+(2-s.turn.rerolls)+' 次'});
    if(withAbility(s,'merchant').length&&!s.turn.merchantUsed)options.push({value:'merchant',label:'使用商人的一次重掷'});
    if(options.length>1)ask(s,i,'rolled','骰子为 '+roll+'，请选择是否使用技能',options);else queue(s,{kind:'roll-final',i,base:roll});
  }
  function rollFinal(s,t){
    const i=t.i,r=s.racers[i],a=ability(s,i),roll=s.turn.die,events=[];
    if(roll!==null){
      if(roll===1){for(const j of withAbility(s,'skipper'))events.push({kind:'skipper',i:j});const worms=withAbility(s,'worm').filter(j=>j!==i);if(worms.length){s.turn.mainSkipped=true;events.push(...worms.map(j=>({kind:'worm',i:j})))} }
      if(roll===6)events.push(...withAbility(s,'lackey').filter(j=>j!==i).map(j=>({kind:'lackey',i:j})));
      if(a==='genius'&&s.turn.guess===roll){s.turn.extra=true;events.push({kind:'ability-notify',i,text:'预测正确，回合后再行动'})}
      if(a==='sisyphus'&&roll===6){s.turn.mainSkipped=true;events.push({kind:'sisyphus',i})}
    }
    events.push({kind:'main-move',i,base:t.base,rocket:!!t.rocket});queue(s,...events);
  }
  function mainMove(s,t){
    const i=t.i,r=s.racers[i];if(r.out||s.turn.mainSkipped)return;
    let amount=t.base;const events=[];
    for(const j of priority(s)){
      const a=ability(s,j),jr=s.racers[j];let modifier=0;
      if(a==='gunk'&&j!==i)modifier=-1;
      if(a==='coach'&&jr.pos===r.pos)modifier=1;
      if(j===i&&a==='hare')modifier+=2;
      if(j===i&&a==='blimp')modifier+=s.turn.start<15?3:-1;
      if(j===i&&a==='party'){const count=same(s,r.pos,[i]).length;amount+=count;for(let k=0;k<count;k++)events.push({kind:'ability-notify',i:j,text:'同格选手使主移动 +1'});}
      if(modifier){amount+=modifier;events.push({kind:'ability-notify',i:j,text:'主移动 '+(modifier>0?'+':'')+modifier})}
    }
    // Main modifiers are fully calculated before the pawn moves; each power then notifies Scoocher.
    queue(s,{kind:'move',i,amount,reason:'主移动'},...(t.rocket?[{kind:'trip',i}]:[]),...events);
  }
  function choose(s,value){
    const p=s.pending;if(!p||!p.options.some(o=>o.value===String(value)))throw Error('请选择有效的技能选项');
    s.pending=null;s.current=-1;const i=p.i,r=s.racers[i];value=String(value);
    if(value==='skip')return;
    if(p.kind==='leader'){r.copyTarget=+value;r.copyKey=p.copyKey;log(s,card(r.id).name+'模仿 '+card(s.racers[+value].id).name+'。',i);syncCopies(s)}
    else if(p.kind==='group-follow'){p.task.followers.push({i,source:p.source});power(s,i,'跟随同时移动',[{kind:'group-follow',task:p.task}])}
    else if(p.kind==='copy'){r.ability=value;queue(s,{kind:'prepare',i});log(s,card(r.id).name+'选择复制 '+card(value).name+'。',i)}
    else if(p.kind==='predict-winner'){r.prediction=+value;r.predicted=true;power(s,i,'预测冠军为'+card(s.racers[+value].id).name)}
    else if(p.kind==='cheer'){const min=Math.min(...living(s).map(j=>s.racers[j].pos));const targets=living(s).filter(j=>s.racers[j].pos===min);power(s,i,'鼓励最后选手',[{kind:'group-move',moves:targets.map(j=>({i:j,amount:2}))},{kind:'move',i,amount:1,reason:'啦啦队'}])}
    else if(p.kind==='hypnotize')power(s,i,'传送'+card(s.racers[+value].id).name+'到自己身边',[{kind:'warp-many',destinations:[{i:+value,pos:r.pos}]}]);
    else if(p.kind==='third')power(s,i,'传送到 '+value+' 格',[{kind:'warp-many',destinations:[{i,pos:+value}]}]);
    else if(p.kind==='duel'){const j=+value;if(s.racers[j].out||r.pos!==s.racers[j].pos)return;const mine=die(),other=die(),winner=mine>=other?i:j;power(s,i,'决斗 '+mine+' 对 '+other+'，'+card(s.racers[winner].id).name+'前进',[{kind:'move',i:winner,amount:2,reason:'决斗'}])}
    else if(p.kind==='follow'){p.move.followers.push(i);power(s,i,'跟随'+card(s.racers[p.move.i].id).name,[{kind:'follow',move:p.move}])}
    else if(p.kind==='main'){
      if(value==='five'){s.turn.die=null;power(s,i,'不掷骰，主移动基础值为 5',[{kind:'roll-final',i,base:5}])}
      else if(value.startsWith('swap:')){const j=+value.slice(5);power(s,i,'与'+card(s.racers[j].id).name+'交换位置',[{kind:'warp-many',destinations:[{i,pos:s.racers[j].pos},{i:j,pos:r.pos}]}])}
      else {if(value.startsWith('guess:'))s.turn.guess=+value.slice(6);s.turn.die=die();log(s,card(r.id).name+'掷出 '+s.turn.die+' 点。',i);queue(s,{kind:'after-roll',i})}
    }else if(p.kind==='rolled'){
      if(value==='reroll'||value==='merchant'){
        const events=[];
        if(value==='reroll'){s.turn.rerolls++;events.push({kind:'ability-notify',i,text:'重掷'})}
        else {s.turn.merchantUsed=true;for(const j of withAbility(s,'merchant'))events.push({kind:'merchant-reroll',i:j,roller:i})}
        queue(s,...events,{kind:'reroll',i});
      }else if(value==='four')power(s,i,'把低点数改为 4 格',[{kind:'roll-final',i,base:4}]);
      else if(value==='double')power(s,i,'火箭基础移动翻倍',[{kind:'roll-final',i,base:s.turn.die*2,rocket:true}]);
      else queue(s,{kind:'roll-final',i,base:s.turn.die});
    }
  }
  function prepare(s,i){
    const r=s.racers[i],a=r.ability||r.id;
    if(a==='egg'){
      const options=s.pool.splice(0,3);if(options.length)ask(s,i,'copy','神秘蛋：选择本场使用的能力',options.map(id=>({value:id,label:card(id).name+' · '+card(id).text})));return;
    }
    if(a==='twin'&&!r.preparedTwin){r.preparedTwin=true;const options=[...new Set(s.pastWinners)].filter(id=>id!=='twin');if(options.length)ask(s,i,'copy','双头伙伴：复制之前的冠军能力',[{value:'skip',label:'不复制'},...options.map(id=>({value:id,label:card(id).name+' · '+card(id).text}))]);return}
    if(a==='sisyphus')score(s,i,4,'赛前奖励');
  }
  function syncCopies(s){
    for(const r of s.racers){if(r.out||(r.ability||r.id)!=='copycat')continue;
      const a=ability(s,s.racers.indexOf(r));if(r.lastCopied==='mastermind'&&a!=='mastermind'){r.prediction=null;r.predicted=false}r.lastCopied=a;
    }
  }
  function copyChoice(s){
    syncCopies(s);const live=living(s),lead=Math.max(...live.map(j=>s.racers[j].pos));
    for(const i of priority(s,live.filter(j=>(s.racers[j].ability||s.racers[j].id)==='copycat'))){
      const r=s.racers[i],options=live.filter(j=>j!==i&&s.racers[j].pos===lead),key=options.join(',');
      if(options.length>1&&r.copyKey!==key){ask(s,i,'leader','领先选手并列，选择持续模仿的能力',options.map(j=>({value:String(j),label:card(s.racers[j].id).name+' · '+card(s.racers[j].ability||s.racers[j].id).text})),{copyKey:key});return true}
    }return false;
  }
  function step(s){
    if(s.finished||s.roundPending||s.pending||s.current>=0)return;
    if(s.phase==='race'&&copyChoice(s))return;
    const t=s.tasks.shift();if(!t){if(s.phase==='race')startTurn(s,s.nextRacer);return}
    if(s.phase==='race'&&['move','warp-many','group-move'].includes(t.kind)){
      const key=loopKey(s,t);if(s.loopSeen[key]){log(s,'检测到相同局面重复，按规则停止这一条循环。');return}s.loopSeen[key]=true;
    }
    const i=t.i,r=s.racers[i];
    if(t.kind==='prepare')prepare(s,i);
    else if(t.kind==='start-race'){s.phase='race';s.nextRacer=s.firstRacer;startTurn(s,s.firstRacer)}
    else if(t.kind==='begin')begin(s,i);
    else if(t.kind==='main-prompt')mainPrompt(s,i);
    else if(t.kind==='after-roll')afterRoll(s,i);
    else if(t.kind==='roll-final')rollFinal(s,t);
    else if(t.kind==='main-move')mainMove(s,t);
    else if(t.kind==='move')move(s,t);
    else if(t.kind==='arrive')arrive(s,t);
    else if(t.kind==='arrival-power')arrivalPower(s,i,t.event);
    else if(t.kind==='trip'){if(r&&!r.out){r.tripped=true;log(s,card(r.id).name+'摔倒，下次主移动先站起来。',i)}}
    else if(t.kind==='score')score(s,i,t.amount,t.text);
    else if(t.kind==='eliminate'){r.out=true;r.eliminated=s.eventCount;log(s,card(r.id).name+'被淘汰。',i);cleanupEliminations(s)}
    else if(t.kind==='ability-notify')power(s,i,t.text);
    else if(t.kind==='power-end'){for(const j of withAbility(s,'scoocher').reverse())if(j!==i)queue(s,{kind:'scooch',i:j})}
    else if(t.kind==='scooch')power(s,i,'其他能力生效，蹭进 1 格',[{kind:'move',i,amount:1,reason:'蹭蹭'}]);
    else if(t.kind==='worm')power(s,i,'拦截其他选手的 1 点主移动',[{kind:'move',i,amount:1,reason:'毛毛虫'}]);
    else if(t.kind==='lackey')power(s,i,'其他选手掷出 6，先走 2 格',[{kind:'move',i,amount:2,reason:'小跟班'}]);
    else if(t.kind==='skipper'){s.turn.next=i;power(s,i,'下个回合改为船长')}
    else if(t.kind==='sisyphus')power(s,i,'6 点返回起点并失去 1 分',[{kind:'warp-many',destinations:[{i,pos:0}]},{kind:'score',i,amount:-1,text:'推石失败'}]);
    else if(t.kind==='merchant-reroll')power(s,i,'提供一次重掷',i!==t.roller?[{kind:'move',i,amount:1,reason:'商人'}]:[]);
    else if(t.kind==='reroll'){s.turn.die=die();log(s,card(r.id).name+'重掷为 '+s.turn.die+'，之前的点数作废。',i);queue(s,{kind:'after-roll',i})}
    else if(t.kind==='follow'){
      if(t.move.followCandidates.length){const j=t.move.followCandidates.shift();ask(s,j,'follow','是否跟随'+card(s.racers[t.move.i].id).name+'的移动？',[{value:'yes',label:'跟随移动'},{value:'skip',label:'留在原地'}],{move:t.move});if(s.pending)s.pending.skipTask={kind:'follow',move:t.move}}
      else queue(s,{kind:'move',...t.move});
    }else if(t.kind==='warp-many'){
      const destinations=t.destinations.filter(d=>!s.racers[d.i].out),from=Object.fromEntries(destinations.map(d=>[d.i,s.racers[d.i].pos]));
      for(const d of destinations)s.racers[d.i].pos=Math.max(0,Math.min(FINISH-1,d.pos));
      log(s,destinations.map(d=>card(s.racers[d.i].id).name+'传送 '+from[d.i]+' → '+s.racers[d.i].pos).join('，'));
      queue(s,{kind:'arrive',group:destinations.map(d=>d.i),from,moved:false});
    }else if(t.kind==='group-toward'){
      const pos=r.pos,moves=living(s).filter(j=>j!==i&&s.racers[j].pos!==pos).map(j=>({i:j,amount:Math.sign(pos-s.racers[j].pos)}));queue(s,{kind:'group-move',moves});
    }else if(t.kind==='group-follow'){
      const task=t.task;if(task.followCandidates.length){const f=task.followCandidates.shift();ask(s,f.i,'group-follow','是否跟随同时移动的选手？',[{value:'yes',label:'跟随移动'},{value:'skip',label:'留在原地'}],{task,source:f.source});s.pending.skipTask={kind:'group-follow',task}}
      else queue(s,task);
    }else if(t.kind==='group-move'){
      if(!t.checked){t.checked=true;t.followers=[];t.followCandidates=withAbility(s,'fish').filter(j=>!t.moves.some(m=>m.i===j)).map(i=>({i,source:t.moves.find(m=>s.racers[m.i].pos===s.racers[i].pos)?.i})).filter(f=>f.source!==undefined);queue(s,{kind:'group-follow',task:t});return}
      const moves=t.moves.filter(m=>!s.racers[m.i].out),from=Object.fromEntries(moves.map(m=>[m.i,s.racers[m.i].pos])),ends=moves.map(m=>({...m,...movementEnd(s,{...m,vacating:moves.filter(k=>k.amount).map(k=>k.i)})}));
      for(const f of t.followers){const source=ends.find(m=>m.i===f.source);if(source&&!s.racers[f.i].out){from[f.i]=s.racers[f.i].pos;ends.push({i:f.i,end:source.end,skips:0})}}
      for(const m of ends)s.racers[m.i].pos=Math.min(FINISH,m.end);
      log(s,'同时移动：'+ends.map(m=>card(s.racers[m.i].id).name+' '+from[m.i]+' → '+m.end).join('，'));
      for(const m of ends)if(m.end>=FINISH){finish(s,m.i);if(s.roundPending)return}
      queue(s,...ends.flatMap(m=>Array.from({length:m.skips||0},()=>({kind:'ability-notify',i:m.i,text:'跳过占用格'}))),{kind:'arrive',group:ends.filter(m=>m.end!==from[m.i]).map(m=>m.i),from,moved:true});
    }else if(t.kind==='space'){
      if(r.out||r.pos!==t.pos||s.trackMode==='mild'||s.round%2===1)return;const effect=wild[r.pos];
      if(effect==='trip')queue(s,{kind:'trip',i});else if(effect==='star')score(s,i,1,'踩到星星格');else if(Number.isInteger(effect))queue(s,{kind:'move',i,amount:effect,reason:'箭头格'});
    }else if(t.kind==='end-turn'){
      const effects=[];if(!r.out){const gain=Math.abs(r.pos-s.turn.start);if(gain<=1)for(const j of withAbility(s,'heckler'))effects.push({kind:'heckle',i:j})}
      queue(s,...effects,{kind:'next-turn',i});
    }else if(t.kind==='heckle')power(s,i,'该回合没走远，自己前进 2 格',[{kind:'move',i,amount:2,reason:'嘲笑'}]);
    else if(t.kind==='next-turn'){
      
      const next=s.turn.next!==null&&!s.racers[s.turn.next].out?s.turn.next:s.turn.extra&&!r.out?i:nextLive(s,i);s.nextRacer=next;
      if(next<0)endRace(s);else startTurn(s,next);
    }
  }
  // Playback consumes invisible bookkeeping until the next event or decision.
  // Rule-level step() stays separate so effects keep their original resolution order.
  function advance(s,difficulty=s.difficulty||'medium'){
    const before=s.eventCount;
    for(let count=0;count<500;count++){
      if(s.finished||s.roundPending||['draft','lineup'].includes(s.phase)||(s.pending&&(s.online?s.humanSeats.includes(s.current):s.current===0)))return;
      if(s.pending)bot(s,difficulty);else step(s);
      if(s.eventCount!==before||s.pending||s.roundPending||s.finished)return;
    }
    throw Error('结算未能推进，请暂停后重新加载存档');
  }
  function act(s,a,v={}){
    if(s.finished)throw Error('比赛已结束');
    if(a==='a-speed'){if(!['normal','fast','step'].includes(v.speed))throw Error('速度无效');s.speed=v.speed;return}
    if(a==='a-step'){if(['draft','lineup'].includes(s.phase)||(s.pending&&(s.online?s.humanSeats.includes(s.current):s.current===0))||s.roundPending)throw Error('请先完成当前选项');advance(s,v.difficulty||s.difficulty);return}
    if(s.phase==='draft'){
      if(a!=='a-draft'||!s.draftMarket.includes(v.id))throw Error('请选择可用选手');
      s.teams[s.current].push(v.id);s.draftMarket=s.draftMarket.filter(id=>id!==v.id);log(s,label(s.current)+'选中 '+card(v.id).name+'。');s.draftIndex++;
      if(s.draftIndex>=s.draftOrder.length){s.draftBatch++;if(s.draftBatch>=2)lineup(s);else draftBatch(s)}else s.current=s.draftOrder[s.draftIndex];return;
    }
    if(s.phase==='lineup'){
      const i=s.online?s.current:0;
      if(a!=='a-lineup'||!s.teams[i].includes(v.id)||s.chosen[i].includes(v.id))throw Error('请选择尚未上场的选手');
      s.chosen[i].push(v.id);if(s.chosen[i].length===(s.n===2?2:1)){
        if(s.online){const next=s.humanSeats.find(j=>s.chosen[j].length<(s.n===2?2:1));if(next!==undefined){s.current=next;return}}
        launch(s);
      }return;
    }
    if(s.roundPending){if(a!=='a-next')throw Error('请先查看比赛结算');if(s.round===4){s.roundPending=false;s.finished=true;s.ranks=C.ranks(s.totals)}else lineup(s);return}
    if(s.pending){if(a!=='a-choice')throw Error('请先选择技能选项');const skipTask=s.pending.skipTask;choose(s,v.value);if(v.value==='skip'&&skipTask)queue(s,skipTask);return}
    throw Error('正在结算，请稍候');
  }
  function bot(s,difficulty){
    if(s.finished||s.roundPending||s.phase==='lineup')return;
    if(s.phase==='draft'){const ids=s.draftMarket.slice().sort((a,b)=>strength(b)-strength(a));act(s,'a-draft',{id:difficulty==='easy'?ids[Math.floor(Math.random()*ids.length)]:ids[0]});return}
    if(!s.pending){step(s);return}
    const p=s.pending,r=s.racers[p.i],options=p.options;let pick=options[0];
    if(p.kind==='copy')pick=options.filter(o=>o.value!=='skip').sort((a,b)=>strength(b.value)-strength(a.value))[0]||pick;
    if(p.kind==='main'){
      const swap=options.filter(o=>o.value.startsWith('swap:')).sort((a,b)=>s.racers[+b.value.slice(5)].pos-s.racers[+a.value.slice(5)].pos)[0];
      if(swap&&s.racers[+swap.value.slice(5)].pos>r.pos+4)pick=swap;
      else pick=options.find(o=>o.value==='five')||options.find(o=>o.value==='guess:4')||options[0];
    }else if(p.kind==='rolled'){
      pick=options.find(o=>o.value==='four')||options[0];
      if(s.turn.die<=3)pick=options.find(o=>o.value==='reroll')||options.find(o=>o.value==='merchant')||pick;
      if(s.turn.die>=4)pick=options.find(o=>o.value==='double')||pick;
    }else if(p.kind==='leader')pick=options.slice().sort((a,b)=>strength(s.racers[+b.value].id)-strength(s.racers[+a.value].id))[0];
    else if(p.kind==='group-follow'){const move=p.task.moves.find(m=>m.i===p.source);pick=move.amount>0?options[0]:options[1]}
    else if(p.kind==='follow'){const end=movementEnd(s,p.move).end;pick=end>r.pos?options[0]:options[1]}
    else if(p.kind==='duel')pick=options[1]||options[0];
    else if(p.kind==='third')pick=options.filter(o=>o.value!=='skip'&&+o.value>r.pos).sort((a,b)=>+b.value-+a.value)[0]||options[0];
    else if(p.kind==='hypnotize')pick=options.filter(o=>o.value!=='skip'&&s.racers[+o.value].owner!==r.owner&&!['baba','mouth'].includes(ability(s,+o.value))&&s.racers[+o.value].pos>r.pos).sort((a,b)=>s.racers[+b.value].pos-s.racers[+a.value].pos)[0]||options[0];
    else if(p.kind==='predict-winner')pick=options.slice().sort((a,b)=>strength(s.racers[+b.value].id)-strength(s.racers[+a.value].id))[0];
    if(difficulty==='easy'&&Math.random()<.3)pick=options[Math.floor(Math.random()*options.length)];
    act(s,'a-choice',{value:pick.value});
  }
  function validate(s,n){
    try{return s.n===n&&n>=2&&n<=6&&['draft','lineup','prepare','race','round'].includes(s.phase)&&s.teams.length===n&&s.teams.every(t=>Array.isArray(t)&&t.every(id=>byId[id]))&&s.totals.length===n&&s.totals.every(v=>Number.isSafeInteger(v)&&v>=0)&&Number.isInteger(s.round)&&s.round>=0&&s.round<=4&&Number.isInteger(s.current)&&s.current>=-1&&s.current<n&&s.pool.every(id=>byId[id])&&new Set([...s.pool,...s.teams.flat(),...s.used,...s.draftMarket]).size===[...s.pool,...s.teams.flat(),...s.used,...s.draftMarket].length&&['normal','fast','step'].includes(s.speed)&&['mild','alternating'].includes(s.trackMode)&&['draft','random'].includes(s.draftMode)&&s.racers.every(r=>byId[r.id]&&Number.isInteger(r.owner)&&r.owner>=0&&r.owner<n&&Number.isInteger(r.pos)&&r.pos>=0&&r.pos<=FINISH&&typeof r.out==='boolean'&&typeof r.tripped==='boolean'&&(!r.ability||byId[r.ability]))&&Array.isArray(s.tasks)&&s.tasks.every(t=>['prepare','start-race','begin','main-prompt','after-roll','roll-final','main-move','move','arrive','arrival-power','trip','score','eliminate','ability-notify','power-end','scooch','worm','lackey','skipper','sisyphus','merchant-reroll','reroll','follow','warp-many','group-toward','group-move','group-follow','space','end-turn','heckle','next-turn'].includes(t.kind))&&Array.isArray(s.roundScores)&&s.roundScores.length<=4&&s.roundScores.every(a=>a.length===n&&a.every(Number.isSafeInteger))&&s.raceScores.length===n&&s.raceScores.every(Number.isSafeInteger)&&typeof s.finished==='boolean'&&typeof s.roundPending==='boolean'&&Array.isArray(s.log)&&(!s.pending||(['copy','leader','group-follow','follow','main','rolled','predict-winner','cheer','hypnotize','third','duel'].includes(s.pending.kind)&&s.racers[s.pending.i]&&s.current===s.racers[s.pending.i].owner&&Array.isArray(s.pending.options)&&s.pending.options.length>0&&s.pending.options.every(o=>typeof o.value==='string'&&typeof o.label==='string')));}catch(e){return false}
  }
  function racerCard(id,action,disabled=false,selected=false){const r=card(id);return '<button class="athlete-card '+(selected?'selected':'')+'" '+(action?'data-action="'+action+'" data-id="'+id+'"':'')+' '+(disabled?'disabled':'')+'>'+sprite(id)+'<strong>'+r.name+'</strong><span>'+r.text+'</span>'+(selected?'<small>已选择上场</small>':'')+'</button>'}
  function track(s){
    const wildOn=s.trackMode!=='mild'&&s.round%2===0;
    return '<div class="race-track '+(wildOn?'wild':'')+'" aria-label="赛道，按箭头由起点走向终点">'+Array.from({length:31},(_,pos)=>{
      const row=Math.floor(pos/8),col=row%2?7-pos%8:pos%8,rs=s.racers.map((r,i)=>({r,i})).filter(({r})=>Math.min(FINISH,r.pos)===pos&&!r.eliminated),effect=wildOn?wild[pos]:null;
      return '<div class="race-space '+(pos===0?'start':pos===30?'finish':'')+'" style="grid-row:'+(row+1)+';grid-column:'+(col+1)+'"><span class="space-label">'+(pos===0?'起点 →':pos===30?'终点':pos+' '+(row%2?'←':'→'))+'</span>'+(effect?'<span class="space-effect">'+(effect==='trip'?'摔倒':effect==='star'?'+1 分':(effect>0?'+':'')+effect+' 格')+'</span>':'')+'<div class="space-racers">'+rs.map(({r,i})=>'<span class="race-token '+(r.tripped?'tripped':'')+' '+(s.lastEvent?.racer===i?'highlight':'')+'" style="--team:'+C.AthleteData.colors[r.owner]+'" data-name="'+card(r.id).name+'" title="'+label(r.owner)+' · '+card(r.id).name+(r.tripped?' · 已摔倒':'')+'">'+sprite(r.id)+'<small>'+label(r.owner)+'</small></span>').join('')+'</div></div>';
    }).join('')+'</div>';
  }
  function playback(s,viewer=0){
    const waiting=s.pending&&s.current===viewer,blocked=waiting||s.roundPending;
    return '<div class="race-playback-bar"><div class="race-speed"><span>播放速度</span>'+['normal','fast','step'].map((speed,i)=>'<button data-action="a-speed" data-speed="'+speed+'" class="'+(s.speed===speed?'primary':'')+'" title="'+['每条提示停留约 1.2 秒','每条提示停留约 0.18 秒','等待你点击下一步'][i]+'">'+['正常','快速','逐步'][i]+'</button>').join('')+'</div>'+(s.speed==='step'?'<button class="primary race-next-step" data-action="a-step" '+(blocked?'disabled':'')+'>播放下一步结算</button><small>'+(waiting?'请先在下方选择技能':s.roundPending?'请先查看本场结算':'每次点击推进一条提示或电脑行动')+'</small>':'<small>'+(s.speed==='normal'?'每条提示停留约 1.2 秒':'每条提示停留约 0.18 秒')+'</small>')+'</div>';
  }
  function render(s,ui={}){
    const viewer=ui.viewer??0;
    let h='<div class="table-status"><strong>'+(s.phase==='draft'?'组建队伍':'第 '+s.round+' / 4 场 · '+(s.trackMode==='mild'||s.round%2?'温和赛道':'狂野赛道'))+'</strong><span>冠军 '+gold[Math.max(0,s.round-1)]+' 分 · 亚军 '+silver[Math.max(0,s.round-1)]+' 分</span></div>';
    h+='<div class="athlete-scoreboard">'+s.totals.map((v,i)=>'<span style="--team:'+C.AthleteData.colors[i]+'"><strong>'+C.playerBadge(i,ui)+label(i)+'</strong><span class="athlete-score-value" aria-label="总分 '+v+' 分">'+v+' 分</span></span>').join('')+'</div>';
    if(s.phase==='draft')return h+'<div class="turn-prompt '+(s.current===viewer?'your-turn':'')+'">'+(s.current===viewer?'轮到你选角：点击角色卡即可选入队伍。':label(s.current)+'正在选角…')+' · 第 '+(s.draftBatch+1)+' / 2 批</div><div class="athlete-cards">'+s.draftMarket.map(id=>racerCard(id,'a-draft',s.current!==viewer)).join('')+'</div><details class="table-details" open><summary>你的队伍 · '+s.teams[viewer].length+' 位</summary><div class="athlete-team-strip">'+s.teams[viewer].map(id=>'<span>'+sprite(id)+card(id).name+'</span>').join('')+'</div></details>';
    if(s.phase==='lineup')return h+'<div class="turn-prompt '+(s.current===viewer?'your-turn':'')+'">选择本场上场的 '+(s.n===2?'2 位选手（先点者先行动）':'1 位选手')+'。每个角色只能上场一次，后续比赛奖分更高。</div><div class="athlete-cards">'+s.teams[viewer].map(id=>racerCard(id,'a-lineup',s.current!==viewer||s.chosen[viewer].includes(id),s.chosen[viewer].includes(id))).join('')+'</div>';
    let controls='';
    if(s.roundPending)controls='<section class="round-summary"><h2>第 '+s.round+' 场结算</h2><p>获奖选手：'+s.roundSummary.winners.map(C.escape).join('、')+'</p><div class="round-score-grid">'+s.roundSummary.rows.map(r=>'<article class="round-score"><strong>'+r.name+' · 本场 '+r.score+' 分</strong><span>累计 '+r.total+' 分</span></article>').join('')+'</div><button class="primary" data-action="a-next">'+(s.round===4?'查看最终成绩':'选择下一场选手')+'</button></section>';
    else if(s.pending)controls='<div class="turn-prompt '+(s.current===viewer?'your-turn':'')+'">'+card(s.racers[s.pending.i].id).name+'：'+C.escape(s.pending.text)+'</div>'+(s.current===viewer?'<div class="actions">'+s.pending.options.map(o=>'<button data-action="a-choice" data-value="'+C.escape(o.value)+'">'+C.escape(o.label)+'</button>').join('')+'</div>':s.speed==='step'?'<p class="muted">'+label(s.current)+'待选择，点击上方下一步执行电脑行动。</p>':'<p class="muted">'+label(s.current)+'正在选择…</p>');
    else controls='<div class="turn-prompt">'+(s.speed==='step'?'点击上方下一步，继续播放移动与技能。':'正在结算移动与技能，请跟随高亮角色查看过程。')+'</div>';
    h+=playback(s,viewer)+'<div class="athlete-workspace"><section class="athlete-board">'+track(s)+'<div class="race-controls">'+(ui.error?'<p class="field-error" role="alert">'+C.escape(ui.error)+'</p>':'')+controls+'</div></section><aside class="race-sidebar"><div class="race-event" role="status">'+(s.lastEvent?.racer!==null&&s.lastEvent?.racer!==undefined?sprite(s.racers[s.lastEvent.racer].id):'')+'<span><small class="race-event-count">比赛动态 · 第 '+s.eventCount+' 条</small><strong>'+C.escape(s.lastEvent?.text||'准备比赛')+'</strong></span></div><div class="race-live-abilities">'+s.racers.map((r,i)=>'<details class="race-runner '+(r.owner===viewer?'mine':'')+'" '+(r.owner===viewer?'open':'')+'><summary>'+sprite(r.id)+'<span>'+card(r.id).name+' · '+label(r.owner)+'<small>'+(r.place?'第 '+r.place+' 名':r.eliminated?'已淘汰':r.pos+' 格'+(r.tripped?' · 摔倒':''))+'</small></span></summary><p>'+C.escape(card(r.ability||r.id).text)+'</p>'+(r.ability?'<small>复制能力：'+card(r.ability).name+'</small>':'')+'</details>').join('')+'</div></aside></div><details class="table-details game-record" data-detail-id="athlete-record" open><summary>最近比赛过程</summary><div class="log">'+s.log.map(t=>'<div>'+C.escape(t)+'</div>').join('')+'</div></details>';
    return h;
  }
  C.Games.athlete={create,act,bot,validate,render,racers:D,ability,step,advance,movementEnd,wild,FINISH,gold,silver};
})();
