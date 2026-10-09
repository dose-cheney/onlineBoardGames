(function(){
  'use strict';
  const C=window.GameCore,KEY='tablecorner-save-v1';
  const rules={
    splendor:'每回合只执行一项行动：拿 3 种不同宝石、在库存至少 4 枚时拿 2 枚同色、预留卡并领取金筹码，或购买卡牌。卡牌提供永久折扣；满足条件时得到贵族。有人到达 15 分后完成当前轮，分数最高者获胜，同分比较已购卡牌数。',
    scout:'手牌顺序不能调整。开局可将整手牌翻面，之后从连续位置打出相同数字或连续数字组合，压过场上的表演；也可以从表演两端招募一张并插入手牌。本轮可一次招募后立即表演。有人出完牌，或其表演被所有对手招募后，本轮结算。双人使用专用的每轮 3 次招募规则。',
    athlete:'组建你的队伍，参加四场掷骰竞速。每位选手只能上场一次，能力可触发连锁移动。每场前两名获得奖分，四场总分最高者获胜。',
    flip7:'轮流翻牌或收分。重复数字会爆牌，本轮 0 分；集齐七个不同数字立即结束本轮并额外加 15 分。冻结、连翻三张和第二次机会改变局势。累计至少 200 分且独自领先即可获胜。',
    poker:'无限注德州扑克。每人两张底牌，依次经过翻牌前、翻牌、转牌、河牌的下注。可弃牌、过牌、跟注、下注、加注或全下。摊牌时用七张可用牌组成最强的五张牌；全下会形成主池和边池。此现金桌每手结算，离桌时按本场净收益排名。筹码均为虚拟游戏金额。'
  };
  const descriptions={
    splendor:'收集宝石，建造一条越来越高效的商路。',
    scout:'不改手牌顺序，用表演与招募拼出精彩牌组。',
    athlete:'36 位奇妙选手，用技能连锁跑出四场惊喜。',
    flip7:'再翻一张，还是见好就收？向七张不同数字冲刺。',
    poker:'选择现金桌，或用固定筹码参加锦标赛争夺冠军。'
  };
  const achievements=Object.fromEntries(C.Achievements.items.map(a=>[a.id,a.title+' · '+a.description]));
  let profile=null,screen='home',selected='splendor',lastResult=null,error='',autoTimer=null,lastTick=Date.now(),importTarget=null,ui={},saveBusy=false,notice='',renderedView='';
  const isTournament=g=>g.mode==='tournament';
  const tournamentRules='无限注德州扑克锦标赛。所有人使用相同初始筹码，不可补买，输光淘汰；最后留下的一人获得冠军。比赛筹码独立于钱包，不扣款或兑换。盲注可按设定手数翻倍，或全程固定；升盲在下一手开始时生效。同手淘汰时，手牌开始时筹码更多者名次靠前，相同筹码共享名次。';
  function pauseAll(p){Object.values(p.games).forEach(a=>{if(a)a.paused=true})}
  function hasGames(){return Object.values(profile.games).some(Boolean)}
  function validateGames(p){Object.values(p.games).forEach(a=>{if(a){const engine=C.Games[a.type];if(!engine.validate(a.game,a.players))throw Error('当前对局数据损坏');engine.render(a.game)}})}
  function loadCache(){try{const raw=localStorage.getItem(KEY);if(raw){const p=JSON.parse(raw);if(C.validProfile(p)){C.attachSlots(p);validateGames(p);profile=p;pauseAll(p);C.Achievements.check(p)}}}catch(e){}}
  function saveCache(){if(!profile)return;try{localStorage.setItem(KEY,JSON.stringify(profile))}catch(e){}}
  function title(){return '<header class="topbar"><button class="brand" data-action="app-home">桌边 <span class="muted">/ 单机桌游</span></button><nav class="top-actions" aria-label="页面导航与操作">'+(window.location&&/^https?:$/.test(window.location.protocol)?'<a class="nav-link" href="/online.html">联机房间 <span aria-hidden="true">↗</span></a>':'')+'<button data-action="app-visual" '+(!profile?'disabled':'')+'>'+(profile&&profile.visual?'切换无图':'切换有图')+'</button><button data-action="app-save" '+(!profile?'disabled':'')+'>备份全部</button><button data-action="app-load">加载存档</button>'+(profile&&profile.active&&screen==='game'?'<button data-action="app-pause">'+(profile.active.paused?'继续':'暂停')+'</button>':'')+'</nav></header>'}
  function totalStats(){const out={started:0,completed:0,wins:0,activeMs:0};if(profile)Object.entries(profile.stats).forEach(([k,s])=>{out.started+=s.started;out.completed+=s.completed;out.wins+=s.wins;out.activeMs+=s.activeMs+(profile.games[k]?.elapsedMs||0)});return out}
  function statCard(n,label){return '<div class="stat"><strong>'+n+'</strong><span>'+label+'</span></div>'}
  function achievementPanel(){
    const groups={general:'通用',...C.names};
    const cards=items=>'<div class="achievement-grid">'+items.map(a=>{const unlocked=profile.achievements.includes(a.id),progress=C.Achievements.progress(profile,a.id);return '<article class="achievement '+(unlocked?'unlocked':'')+'"><strong>'+(unlocked?'✓ ':'○ ')+a.title+'</strong><span>'+a.description+'</span><small>'+(unlocked?'已解锁':progress||'未解锁')+'</small></article>'}).join('')+'</div>';
    return '<div class="panel achievements"><h2>成就 · 已解锁 '+C.Achievements.items.filter(a=>profile.achievements.includes(a.id)).length+' / '+C.Achievements.items.length+'</h2>'+Object.keys(groups).map(group=>{
      const items=C.Achievements.items.filter(a=>a.group===group),count=items.filter(a=>profile.achievements.includes(a.id)).length;
      const content=group==='poker'?'<h3 class="achievement-section">现金桌与通用</h3>'+cards(items.filter(a=>a.mode!=='tournament'))+'<h3 class="achievement-section">锦标赛</h3>'+cards(items.filter(a=>a.mode==='tournament')):cards(items);
      return '<details class="achievement-group" data-detail-id="achievement-'+group+'" '+(group==='general'?'open':'')+'><summary>'+groups[group]+' · '+count+' / '+items.length+'</summary>'+content+'</details>';
    }).join('')+'</div>';
  }
  function bankFeedback(id,message){return '<div id="'+id+'" class="field-error bank-feedback" role="alert">'+C.escape(message||'')+'</div>'}
  function bankPanel(){
    const b=profile.bank;return '<div class="panel"><div class="row between"><div><h2>虚拟资金</h2><p class="muted">钱包 '+C.formatMoney(profile.wallet)+' · 累计借款 '+C.formatMoney(b.totalBorrowed)+' · 已还 '+C.formatMoney(b.totalRepaid)+' · 未还 '+C.formatMoney(b.outstanding)+' / '+C.formatMoney(b.limit)+'</p></div></div><div class="row"><label>金额 <input id="bank-amount" type="number" min="1" step="1" value="'+C.escape(ui.bankAmount??200)+'" aria-describedby="bank-error"></label><button data-action="app-borrow">借款</button><button data-action="app-repay">还款</button></div>'+bankFeedback('bank-error',ui.bankError)+'<div class="row" style="margin-top:10px"><label>借款总额度 <input id="bank-limit" type="number" min="'+b.outstanding+'" step="1" value="'+C.escape(ui.bankLimit??b.limit)+'" aria-describedby="bank-limit-error"></label><button data-action="app-bank-limit">修改额度</button></div>'+bankFeedback('bank-limit-error',ui.bankLimitError)+'<p class="footer-note">借款无息，额度可在牌桌外调整；借款不会算作德州盈利。</p></div>';
  }
  function home(){
    const t=totalStats();
    let h='<section class="hero"><span class="eyebrow">PRIVATE TABLE / OFFLINE</span><h1>找一张桌子，开一局。</h1><p class="subtle">一个人和电脑玩家玩五款桌游。游戏可暂停；存档可作为独立文件带走。</p>';
    if(!t.started)h+='<div class="newcomer-start"><p>第一次玩？Flip 7 只需决定翻牌还是收分，可以先熟悉回合操作。</p><button class="primary" data-action="app-select" data-game="flip7">先试 Flip 7 →</button></div>';
    if(hasGames())h+='<div class="notice">每款游戏都有独立进度。切换游戏会暂停当前桌，可以随时回来继续。</div>';
    h+='</section><div class="grid">'+Object.keys(C.names).map(k=>{const a=profile.games[k];return '<article class="game-card"><div class="art '+k+'" aria-hidden="true"></div><span class="eyebrow">'+(k==='poker'?'CARD TABLE':k==='athlete'?'CHAOTIC RACING':k==='splendor'?'ENGINE BUILDING':'CARD GAME')+'</span><h2>'+C.names[k]+'</h2><p>'+descriptions[k]+'</p><div class="row between"><span class="muted">'+(a?'已暂停 · '+C.fmtTime(a.elapsedMs):C.limits[k][0]+'–'+C.limits[k][1]+' 人')+'</span><button class="'+(a?'primary':'')+'" data-action="'+(a?'app-resume':'app-select')+'" data-game="'+k+'">'+(a?'继续游戏 →':'选择游戏 →')+'</button></div><div class="slot-tools"><button data-action="app-save" data-game="'+k+'">保存此游戏</button><button data-action="app-load" data-game="'+k+'">加载此游戏</button></div></article>'}).join('')+'</div>';
    h+='<div class="panel"><h2>游玩记录</h2><div class="stats">'+statCard(t.started,'开局次数')+statCard(t.completed,'完成场次')+statCard(t.wins,'胜利次数')+statCard(C.fmtTime(t.activeMs),'有效游玩时长')+'</div><div class="section-title">各游戏</div><div class="table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">游戏</th><th>开局</th><th>完成</th><th>胜利</th><th>平均排名</th></tr></thead><tbody>'+Object.keys(C.names).map(k=>{const s=profile.stats[k];return '<tr><td>'+C.names[k]+'</td><td align="center">'+s.started+'</td><td align="center">'+s.completed+'</td><td align="center">'+s.wins+'</td><td align="center">'+(s.completed?(s.rankSum/s.completed).toFixed(2):'—')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
    h+=achievementPanel();
    h+=bankPanel();
    h+='<div class="panel"><h2>最近完成</h2>'+(profile.history.length?'<div class="log">'+profile.history.slice(0,10).map(x=>'<div>'+C.escape(x.date)+' · '+C.names[x.type]+(x.type==='poker'?' · '+(x.mode==='tournament'?'锦标赛':'现金桌'):'')+' · 第 '+x.rank+' 名 · '+C.fmtTime(x.elapsedMs)+'</div>').join('')+'</div>':'<p class="muted">还没有完成的游戏。</p>')+'<div class="actions"><button class="danger" data-action="app-reset" '+(hasGames()?'disabled':'')+'>重置本地档案</button></div></div>';
    return h;
  }
  function rememberSetup(){
    const fields={...(ui.setupFields||{})};for(const id of ['players','difficulty','small','big','buyin','blind-every','draft-mode','track-mode']){const el=document.getElementById(id);if(el)fields[id]=el.value}
    ui.setupFields=fields;
  }
  function setup(){
    const k=selected,limit=C.limits[k],mode=ui.pokerMode||'cash',tour=k==='poker'&&mode==='tournament',fields=ui.setupFields||{},value=(id,otherwise)=>C.escape(fields[id]??otherwise);
    let h='<div class="setup"><button data-action="app-home">← 返回首页</button><div class="panel"><span class="eyebrow">NEW GAME</span><h1>'+C.names[k]+'</h1><p>'+descriptions[k]+'</p>';
    if(k==='poker')h+='<div class="poker-mode-tabs" role="group" aria-label="德州玩法"><button data-action="app-poker-mode" data-mode="cash" aria-pressed="'+(!tour)+'" class="'+(!tour?'primary':'')+'">现金桌</button><button data-action="app-poker-mode" data-mode="tournament" aria-pressed="'+tour+'" class="'+(tour?'primary':'')+'">锦标赛 · 争夺冠军</button></div>';
    h+='<h2>规则简介</h2><p class="subtle">'+(tour?tournamentRules:rules[k])+'</p><div class="form-grid"><div class="field"><label for="players">总人数（包含你）</label><select id="players">'+Array.from({length:limit[1]-limit[0]+1},(_,i)=>'<option value="'+(i+limit[0])+'" '+(i+limit[0]===Number(fields.players??Math.min(4,limit[1]))?'selected':'')+'>'+(i+limit[0])+' 人 · '+(i+limit[0]-1)+' 名电脑</option>').join('')+'</select></div><div class="field"><label for="difficulty">电脑难度</label><select id="difficulty">'+Object.entries({easy:'初级 · 初次玩',medium:'中级',hard:'高级'}).map(([id,name])=>'<option value="'+id+'" '+(id===(fields.difficulty||'easy')?'selected':'')+'>'+name+'</option>').join('')+'</select></div>';
    if(k==='poker')h+='<div class="field"><label for="small">'+(tour?'初始小盲注':'小盲注')+'</label><input id="small" type="number" min="1" value="'+value('small',1)+'"></div><div class="field"><label for="big">'+(tour?'初始大盲注':'大盲注')+'</label><input id="big" type="number" min="2" value="'+value('big',2)+'"></div><div class="field"><label for="buyin">'+(tour?'每人初始比赛筹码':'每人初始买入')+'</label><input id="buyin" type="number" min="40" value="'+value('buyin',200)+'"><small class="muted">至少为初始大盲注的 20 倍</small></div>';
    if(tour)h+='<div class="field"><label for="blind-every">每多少手盲注翻倍</label><input id="blind-every" type="number" min="0" max="100" step="1" value="'+value('blind-every',10)+'"><small class="muted">默认 10 手；填 0 使用固定盲注</small></div>';
    if(k==='athlete')h+='<div class="field"><label for="draft-mode">组队方式</label><select id="draft-mode"><option value="draft" '+(fields['draft-mode']!=='random'?'selected':'')+'>蛇形选角</option><option value="random" '+(fields['draft-mode']==='random'?'selected':'')+'>随机队伍 · 快速开赛</option></select></div><div class="field"><label for="track-mode">赛道</label><select id="track-mode"><option value="alternating" '+(fields['track-mode']!=='mild'?'selected':'')+'>温和／狂野交替</option><option value="mild" '+(fields['track-mode']==='mild'?'selected':'')+'>全程温和 · 初次熟悉技能</option></select></div>';
    h+='</div>'+(k==='poker'?'<div class="notice">'+(tour?'免费参赛 · 比赛筹码独立于钱包。你和电脑均不能补买，输光淘汰，目标是拿第一。':'你的钱包：'+C.formatMoney(profile.wallet)+'。买入会从钱包扣除，离桌后桌面筹码返还；无需每手重置资金。')+'</div>':'')+(error?'<p class="form-feedback" role="alert">'+C.escape(error)+'</p>':'')+'<div class="actions"><button class="primary" data-action="app-start">'+(tour?'开始锦标赛':'开始游戏')+'</button></div></div>'+(k==='poker'&&!tour?bankPanel():'')+'</div>';
    return h;
  }
  function game(){
    const a=profile.active,g=a.game,tour=a.type==='poker'&&isTournament(g);
    let h='<div class="game-header compact-header"><div class="row"><button data-action="app-home">← 换一张桌</button><h1>'+C.names[a.type]+'</h1><span class="muted">'+({easy:'初级',medium:'中级',hard:'高级'})[a.difficulty]+' · '+a.players+' 人 · <span class="timer">'+C.fmtTime(a.elapsedMs)+'</span></span></div><div class="row"><button data-action="app-help">规则 / 帮助</button><button data-action="app-save" data-game="'+a.type+'">保存此游戏</button>'+(a.type!=='poker'?'<button class="danger" data-action="app-abandon">放弃本局</button>':'')+'</div></div>';
    if(tour)h+='<div class="tournament-exit"><button class="danger" data-action="app-abandon">'+(g.players[0].eliminated?'按第 '+g.players[0].place+' 名结算离桌…':'退出锦标赛…')+'</button><small>'+(g.players[0].eliminated?'名次已确定，离桌即记录本场成绩':'可随时保存或换桌暂停')+'</small></div>';
    h+='<div class="game-surface game-'+a.type+'">'+C.Games[a.type].render(g,a.type==='poker'&&!tour?{...ui,wallet:profile.wallet,rebuyAmount:rebuyAmount(g)}:ui)+'</div>';
    if(a.type==='poker'&&!tour&&g.betweenHands){const n=rebuyAmount(g);h+='<details id="poker-funding" class="panel poker-funding" '+(ui.bankOpen?'open':'')+'><summary>钱包 '+C.formatMoney(profile.wallet)+' · 未还欠款 '+C.formatMoney(profile.bank.outstanding)+' · 补买与银行</summary><p class="muted">补买从你的钱包扣除，只增加你的桌面筹码。通常补至初始买入 '+g.buyin+'；钱包不足时可用剩余余额补买。电脑仅在筹码归零后，下一手自动补买 '+g.buyin+'，不使用你的钱包。</p><div class="row"><button data-action="app-rebuy" '+(n<=0?'disabled':'')+'>用钱包补买 '+n+'（补后 '+(g.players[0].stack+n)+'）</button><label>银行金额 <input id="bank-amount" type="number" min="1" step="1" value="'+C.escape(ui.bankAmount??200)+'" aria-describedby="bank-error"></label><button data-action="app-borrow">借款</button><button data-action="app-repay">还款</button></div>'+bankFeedback('bank-error',ui.bankError)+'</details>'}
    if(a.paused&&screen==='game')h+='<div class="paused"><div class="panel"><span class="eyebrow">PAUSED</span><h1>游戏已暂停</h1>'+(error?'<div class="notice error" role="alert">'+C.escape(error)+'</div>':'')+'<p class="subtle">计时和电脑行动已停止，牌面暂时遮盖。</p><div class="actions"><button class="primary" data-action="app-resume">继续游戏</button><button data-action="app-home">返回首页</button><button data-action="app-save">保存存档</button></div></div></div>';
    return h;
  }
  function welcome(){return '<div class="setup home-welcome"><div class="panel"><span class="eyebrow">FIRST VISIT</span><h1>欢迎来到桌边</h1><p class="subtle">选择一款桌游，和电脑开一局。进度会暂存在本浏览器，需要带走时可导出存档。</p><div class="actions"><button class="primary" data-action="app-create">开始选游戏</button><button data-action="app-load">加载已有存档</button></div><details class="welcome-funds"><summary>调整德州初始资金（可选）</summary><p class="muted">默认钱包和借款额度各为 2,000 枚虚拟筹码，仅用于德州。使用默认值即可开始。</p><div class="form-grid"><div class="field"><label for="initial-wallet">德州初始资金</label><input id="initial-wallet" type="number" min="40" step="1" value="2000"></div><div class="field"><label for="initial-limit">银行借款总额度</label><input id="initial-limit" type="number" min="0" step="1" value="2000"></div></div></details></div></div>'}
  function help(){
    const k=profile.active.type,tour=k==='poker'&&isTournament(profile.active.game),extra={
      splendor:'<li>卡上的颜色 +1 是永久折扣，分数用于争取 15 分；两者分别计算。</li><li>金筹码可补任何颜色；购买预览会显示本次实际支付。</li><li>预留最多 3 张；拿取后超过 10 枚筹码要归还。贵族条件看永久折扣。</li>',
      scout:'<li>先比张数，更多张更强；相同张数时，同点数组合强于顺子，再比较最高数字。</li><li>例如当前单牌 7，可以表演单牌 8，或任何合法的两张组合。只有相邻手牌能一起表演。</li><li>招募可选舞台两端、数字朝向和插入位置，预览中的新牌就是最终加入的数字。</li><li>每轮得分 = 收牌 + 招募奖励 − 剩余手牌；触发本轮结束的表演者免扣手牌。双人还加剩余招募次数。</li>',
      athlete:'<li>冠军奖分依次 3、4、4、5；亚军 1、2、2、3。技能和星星格可获得额外分，同分共享名次。</li><li>摔倒后下次主移动先站起来，能力仍可发动。技能移动与传送不同，传送不触发越过或跟随。</li><li>狂野格停下才触发：摔倒、+1 分或按箭头移动。两人各选两位上场，按选角顺序行动。</li><li>正常／快速播放自动结算，逐步播放由你点击下一步。需要你选择技能时会停在按钮旁。</li>',
      flip7:'<li>数字 0 只有一张，1 有一张，2 有两张，依此到 12 有十二张，共 94 张牌。</li><li>分数 = 数字合计 × 倍率 + 加分牌 + 七张奖励 15。“×2”只翻倍数字分；特殊牌不计入七张。</li><li>冻结让目标立即收分；连翻三张必须连抽三张，其中冻结与再次连翻延后处理，爆牌或集齐七张则取消后续效果。</li><li>第二次机会抵消一次重复数字，随后轮到下一人。多余的机会牌交给仍在本轮且没有保护的玩家。</li><li>达到 200 分后最高分并列，全员加赛。仅在牌堆耗尽时重新洗入弃牌。</li>',
      poker:'<li>跟注显示本次要付的筹码；加注总额包含你在本轮已经下注的筹码。</li><li>牌型从强到弱：同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。A 可以组成 A、2、3、4、5 顺子。</li><li>同牌型比较点数，再比踢脚；摊牌页展示每人的最佳五张。</li><li>全下后只能争取自己参与的底池，边池会单独分配。离桌返还剩余桌面筹码。</li><li>桌面筹码用完可用钱包补买后继续；钱包不足以补满时，可用现有余额买入。补买不计作盈利。电脑筹码归零后，下一手自动补买初始金额；仍有筹码的电脑保留余额。</li>'
    };
    if(tour)extra.poker='<li>跟注显示本次付出的筹码，加注输入本轮累计下注总额。摊牌使用两张底牌和五张公共牌组成最佳五张，边池分别结算。</li><li>你和电脑使用相同初始筹码，输光后永久淘汰；电脑不会自动补买，剩余筹码也不能兑换钱包资金。</li><li>按设定的手数升盲，下一手开始时生效；填 0 则固定盲注。庄位与盲注跳过已淘汰的座位，两人时庄位支付小盲。</li><li>名次按淘汰顺序决定。同手淘汰时，手牌开始时筹码更多者名次靠前，相同筹码共享名次。筹码排名只是当前进度。</li><li>淘汰后可按已确定的名次结算离桌，也可自动或逐手观战到冠军产生；名次未确定时退出会放弃本场。</li>';
    return '<dialog id="game-help" aria-labelledby="help-title"><div class="row between"><h2 id="help-title">'+C.names[k]+(tour?' · 锦标赛':'')+' · 规则速查</h2><button data-action="app-close-help" aria-label="关闭规则">关闭</button></div><p>'+(tour?tournamentRules:rules[k])+'</p><ul class="rule-list">'+extra[k]+'</ul><p class="action-hint">查看规则期间，计时和电脑行动暂停。关闭后继续。</p></dialog>';
  }
  function results(){const r=lastResult;if(!r)return home();const tour=r.mode==='tournament';return '<div class="setup"><div class="panel"><span class="eyebrow">FINISHED</span><h1>'+C.names[r.type]+' · '+(r.earlyExit?'成绩已记录':tour?'锦标赛结束':'本场结束')+'</h1>'+(tour?'<div class="notice">'+(r.earlyExit?'你的名次已确定；退出时其他选手尚未决出冠军。':r.rank===1?'你获得锦标赛冠军！':C.escape(r.champion)+'获得锦标赛冠军。')+' · 比赛筹码不进入钱包。</div>':'')+'<p>你的排名：第 '+r.rank+' 名 · 有效时长 '+C.fmtTime(r.elapsedMs)+'</p><ul class="ranking">'+r.lines.map(x=>'<li>'+C.escape(x)+'</li>').join('')+'</ul>'+(r.unlocked.length?'<section class="new-achievements"><h2>本场新成就</h2>'+r.unlocked.map(id=>'<p>✓ '+achievements[id]+'</p>').join('')+'</section>':'')+'<div class="actions"><button class="primary" data-action="app-home">返回首页</button><button data-action="app-select" data-game="'+r.type+'" '+(tour?'data-mode="tournament"':'')+'>再玩一场</button></div></div></div>'}
  function saveDialog(){
    const type=ui.save.type,file=C.SaveFiles.targetName(type),supported=C.SaveFiles.supported();
    return '<dialog id="save-dialog" aria-labelledby="save-title"><div class="row between"><h2 id="save-title">保存 · '+(C.names[type]||'全部存档')+'</h2><button data-action="app-close-save" '+(saveBusy?'disabled':'')+'>关闭</button></div><p>'+(type?'保存这一款的进度、统计与成就'+(type==='poker'?'，以及钱包和借款账目':'')+'。':'保存五款游戏的进度、统计、成就和资金账目。')+'</p><p class="save-target">当前文件：<strong>'+C.escape(file||'尚未选择')+'</strong></p><p class="muted">'+(supported?'首次选择文件；之后“覆盖保存”会更新同一个 JSON 文件。“另存为”可更换位置，“下载副本”可保留另一个版本。':'此浏览器支持下载副本。若要直接覆盖同一个 JSON 文件，请用 Chrome / Edge 打开本页面。')+'</p><div class="actions">'+(supported?'<button class="primary" data-action="app-save-write" '+(saveBusy?'disabled':'')+'>'+(saveBusy?'正在保存…':file?'覆盖保存':'选择文件并保存')+'</button><button data-action="app-save-as" '+(saveBusy?'disabled':'')+'>另存为…</button>':'')+'<button '+(!supported?'class="primary" ':'')+'data-action="app-save-copy" '+(saveBusy?'disabled':'')+'>下载副本</button></div><div class="field-error" role="alert">'+C.escape(ui.save.error||'')+'</div><p class="action-hint">保存窗口打开期间，计时和电脑行动暂停。</p></dialog>';
  }
  function detailKey(e){return e.dataset.detailId||e.querySelector('summary').textContent}
  function render(){
    const focused=document.activeElement,focusId=focused&&focused.id,focusData=focused&&focused.dataset&&focused.dataset.action?{...focused.dataset}:null;
    const oldNodes=document.querySelectorAll?Array.from(document.querySelectorAll('.own-gems .token,.own-bonuses .token,.gem-market .gem-card,.poker-seat .seat-stack')).map(e=>e.textContent):[];
    const detailStates=document.querySelectorAll?new Map(Array.from(document.querySelectorAll('.game-surface details,.achievement-group')).map(e=>[detailKey(e),e.open])):new Map();
    document.body.dataset.visual=profile&&profile.visual?'on':'off';
    let content=!profile?welcome():screen==='setup'?setup():screen==='game'&&profile.active?game():screen==='results'?results():home();
    document.getElementById('app').innerHTML='<div class="shell '+(screen==='game'?'game-shell':'')+'">'+title()+(error&&screen!=='setup'&&(screen!=='game'||!ui.error)?'<div class="notice error" role="alert">'+C.escape(error)+'</div>':'')+content+'<p class="footer-note">本地离线页面 · 五款游戏独立存档 · 正式存档请导出 JSON</p></div>'+(ui.save?saveDialog():ui.help&&profile&&profile.active?help():'')+(notice?'<div class="app-toast" role="status">'+C.escape(notice)+'</div>':'');
    const active=profile&&profile.active,view=screen+':'+(active&&screen==='game'?active.type+(active.type==='athlete'&&['draft','lineup'].includes(active.game.phase)?':'+active.game.phase:''):'');
    if(view!==renderedView&&typeof window.scrollTo==='function')window.scrollTo(0,0);renderedView=view;
    if(document.querySelectorAll){document.querySelectorAll('.game-surface details,.achievement-group').forEach(e=>{if(detailStates.has(detailKey(e)))e.open=detailStates.get(detailKey(e))});document.querySelectorAll('.own-gems .token,.own-bonuses .token,.gem-market .gem-card,.poker-seat .seat-stack').forEach((e,i)=>{if(oldNodes[i]!==undefined&&oldNodes[i]!==e.textContent)e.classList.add('changed')})}
    if(!ui.help&&!ui.save){const target=focusId?document.getElementById(focusId):focusData&&document.querySelectorAll?Array.from(document.querySelectorAll('[data-action]')).find(e=>Object.keys(focusData).every(k=>e.dataset[k]===focusData[k])):null;if(target&&target.focus)target.focus({preventScroll:true});else if(focusData&&['app-close-help','app-close-save'].includes(focusData.action)){const button=document.querySelector('[data-action="'+(focusData.action==='app-close-help'?'app-help':'app-save')+'"]');if(button)button.focus({preventScroll:true})}}
    const dialog=document.getElementById(ui.save?'save-dialog':'game-help');if((ui.save||ui.help)&&dialog&&dialog.showModal)dialog.showModal();
    scheduleBot();
  }
  function tick(){const now=Date.now(),delta=Math.min(1000,Math.max(0,now-lastTick));lastTick=now;if(profile&&profile.active&&!profile.active.paused&&!document.hidden&&!ui.help&&!ui.save&&!ui.pickingFile){profile.active.elapsedMs+=delta;const el=document.querySelector('.timer');if(el)el.textContent=C.fmtTime(profile.active.elapsedMs);if(Math.floor(now/1000)%5===0)saveCache()}}
  function complete(earlyExit=false){
    const a=profile.active,g=a.game,k=a.type,rank=earlyExit?g.players[0].place:g.ranks[0],stats=profile.stats[k];
    stats.completed++;stats.rankSum+=rank;stats.activeMs+=a.elapsedMs;if(rank===1)stats.wins++;
    const tour=k==='poker'&&isTournament(g),values=k==='splendor'?g.players.map(C.Games.splendor.points):['scout','athlete'].includes(k)?g.totals:k==='flip7'?g.players.map(p=>p.total):g.players.map(p=>tour?p.stack:p.stack-p.buyins);
    const places=earlyExit?g.players.map(p=>p.place):g.ranks;
    const lines=places.map((r,i)=>({r,i,text:(i===0?'你':'电脑 '+i)+' · '+(r===null?'退出时仍在比赛 · 当时筹码 '+values[i]:(places.filter(x=>x===r).length>1?'并列':'')+'第 '+r+' 名 · '+(tour?'剩余比赛筹码 '+values[i]:k==='poker'?'本场净收益 '+values[i]:values[i]+' 分'))})).sort((a,b)=>(a.r??0)-(b.r??0)||a.i-b.i).map(x=>x.text);
    profile.history.unshift({date:new Date().toLocaleString('zh-CN'),type:k,...(k==='poker'?{mode:tour?'tournament':'cash'}:{}),...(tour?{players:a.players,difficulty:a.difficulty,buyin:g.buyin,peakStack:g.tournamentPeakStack||g.players[0].stack,lowStack:g.tournamentLowStack===true||g.players[0].handStartStack>0&&g.players[0].handStartStack<g.big*5}:{}),...(earlyExit?{earlyExit:true}:{}),rank,elapsedMs:a.elapsedMs});profile.history=profile.history.slice(0,50);
    const unlocked=C.Achievements.check(profile,earlyExit?{...a,completedWithRank:true}:a);
    lastResult={type:k,mode:tour?'tournament':k==='poker'?'cash':undefined,rank,elapsedMs:a.elapsedMs,lines,unlocked,earlyExit,champion:tour&&!earlyExit?(g.ranks.indexOf(1)===0?'你':'电脑 '+g.ranks.indexOf(1)):null};
    profile.active=null;screen='results';saveCache();
  }
  function scheduleBot(){
    clearTimeout(autoTimer);autoTimer=null;
    if(!profile||!profile.active||screen!=='game'||profile.active.paused||ui.help||ui.save||ui.pickingFile)return;
    const a=profile.active,g=a.game;
    if(g.finished){complete();render();return}
    if(a.type==='scout'&&(g.orientationPending||g.roundPending))return;
    if(a.type==='poker'&&g.betweenHands){
      if(isTournament(g)&&g.players[0].eliminated&&g.autoWatch)autoTimer=setTimeout(()=>{
        if(!profile||profile.active!==a||a.paused||screen!=='game'||ui.help||ui.save||ui.pickingFile)return;
        try{C.Games.poker.act(g,'p-next',{});error='';saveCache();render()}catch(e){error='观战继续失败：'+e.message;a.paused=true;render()}
      },1600);
      return;
    }
    if(g.roundPending)return;
    if(a.type==='athlete'&&g.speed==='step'&&g.phase!=='draft')return;
    if(g.current===0)return;
    autoTimer=setTimeout(()=>{if(!profile||profile.active!==a||a.paused||screen!=='game'||ui.help||ui.save||ui.pickingFile)return;try{if(a.type==='athlete'&&g.phase!=='draft')C.Games.athlete.advance(g,a.difficulty);else C.Games[a.type].bot(g,a.difficulty);error='';awardActiveAchievements();saveCache();render()}catch(e){error='电脑行动失败：'+e.message;a.paused=true;render()}},a.type==='poker'?650:a.type==='athlete'?(g.speed==='fast'?180:1200):a.type==='flip7'?300:500);
  }
  function showNotice(message){notice=message;setTimeout(()=>{if(notice===message){notice='';const toast=document.querySelector('.app-toast');if(toast)toast.remove()}},6000)}
  function awardActiveAchievements(){if(profile.active&&!profile.active.game.finished){const added=C.Achievements.check(profile);if(added.length)showNotice('解锁成就：'+added.map(id=>C.Achievements.items.find(a=>a.id===id).title).join('、'))}}
  function readInt(id){const el=document.getElementById(id);return el?Number(el.value):NaN}
  function rebuyAmount(g){return isTournament(g)?0:Math.min(profile.wallet,Math.max(0,g.buyin-g.players[0].stack))}
  function rebuy(nextHand){
    const a=profile.active;if(!a||a.type!=='poker'||a.paused||screen!=='game'||ui.help||!a.game.betweenHands)throw Error('只能在两手之间补买');
    if(isTournament(a.game))throw Error('锦标赛不可补买');
    const g=a.game,p=g.players[0];if(p.stack>=g.buyin)throw Error('当前筹码无需补买');
    const n=rebuyAmount(g);if(n<=0)throw Error('钱包余额为 0，可打开银行借款，或离桌结算');
    profile.wallet-=n;p.stack+=n;p.buyins+=n;g.log.unshift('你用钱包补买 '+n+'，桌面筹码 '+p.stack+'。');g.log=g.log.slice(0,30);
    if(nextHand){C.Games.poker.act(g,'p-next',{});ui={};if(p.stack<g.big*5)g.hadLowStack=true}
  }
  function bankAction(action){
    if(profile.games.poker&&!isTournament(profile.games.poker.game)&&!profile.games.poker.game.betweenHands)throw Error('请先完成正在进行的德州手牌，再操作银行');
    const amount=readInt('bank-amount'),b=profile.bank;if(!Number.isSafeInteger(amount)||amount<1)throw Error('请输入正整数金额');
    if(action==='app-borrow'){if(b.outstanding+amount>b.limit)throw Error('借款超过总额度');profile.wallet+=amount;b.totalBorrowed+=amount;b.outstanding+=amount}
    else {if(amount>profile.wallet||amount>b.outstanding)throw Error('还款不能超过钱包余额或未还欠款');profile.wallet-=amount;b.totalRepaid+=amount;b.outstanding-=amount;if(b.outstanding===0)C.gainAchievement(profile,'debt_free')}
  }
  function dispatch(action,data){
    if(ui.pickingFile)return;
    if(ui.save){
      if(saveBusy)return;
      if(action==='app-close-save'){delete ui.save;lastTick=Date.now();render();return}
      if(action==='app-save-write'||action==='app-save-as'){writeSave(action==='app-save-as');return}
      if(action==='app-save-copy'){downloadSave(ui.save.type);delete ui.save;lastTick=Date.now();render();return}
      throw Error('请先关闭保存窗口');
    }
    error='';ui.error='';ui.bankError='';ui.bankLimitError='';
    if(action==='app-borrow'||action==='app-repay'){const amount=document.getElementById('bank-amount');if(amount)ui.bankAmount=amount.value;ui.bankOpen=true}
    if(action==='app-bank-limit'){const limit=document.getElementById('bank-limit');if(limit)ui.bankLimit=limit.value}
    if(action==='app-help'){ui.help=true;render();return}
    if(action==='app-close-help'){ui.help=false;lastTick=Date.now();render();return}
    if(action==='app-funding'){
      const a=profile&&profile.active;if(!a||a.type!=='poker'||a.paused||screen!=='game'||ui.help||!a.game.betweenHands)throw Error('只能在两手之间操作银行');
      if(isTournament(a.game))throw Error('锦标赛使用独立比赛筹码');
      ui.bankOpen=true;const panel=document.getElementById('poker-funding');if(panel){panel.open=true;if(panel.scrollIntoView)panel.scrollIntoView({block:'center'})}return;
    }
    if(['c-select-show','c-recruit-end','s-review','s-tier'].includes(action)){
      const a=profile&&profile.active;if(!a||a.paused||screen!=='game'||ui.help)throw Error('游戏未运行');
      if(action==='s-tier')ui.gemTier=+data.tier;
      else {if(a.game.current!==0)throw Error('尚未轮到你');if(action==='s-review')ui.gemReview=+data.id;else if(action==='c-select-show')ui.scoutShow={start:+data.start,end:+data.end};else {ui.scoutEnd=data.end;delete ui.scoutFlip;}}
      render();if(action==='s-review'&&window.innerWidth<=900){const el=document.querySelector('.purchase-preview');if(el)el.scrollIntoView({block:'center'})}return;
    }
    if(action==='app-create'){if(profile)throw Error('档案已存在');const wallet=document.getElementById('initial-wallet')?readInt('initial-wallet'):2000,limit=document.getElementById('initial-limit')?readInt('initial-limit'):2000;if(!Number.isSafeInteger(wallet)||wallet<40||!Number.isSafeInteger(limit)||limit<0)throw Error('初始资金至少 40，额度不能为负');profile=C.createProfile(wallet,limit)}
    else if(action==='app-visual'){if(!profile)throw Error('请先创建档案');profile.visual=!profile.visual}
    else if(action==='app-reset'){if(hasGames())throw Error('请先结束所有对局');if(!window.confirm('重置会清除本浏览器的档案和统计。请先保存 JSON 存档。确定重置？'))return;profile=null;lastResult=null;screen='home';try{localStorage.removeItem(KEY)}catch(e){}render();return}
    else if(action==='app-home'){ui={};if(profile&&profile.active)profile.active.paused=true;screen='home'}
    else if(action==='app-select'){ui={};if(!C.names[data.game])throw Error('游戏无效');if(data.game==='poker'&&data.mode==='tournament')ui.pokerMode='tournament';pauseAll(profile);selected=data.game;if(profile.games[selected]){profile.activeType=selected;screen='game'}else screen='setup'}
    else if(action==='app-poker-mode'){
      if(screen!=='setup'||selected!=='poker'||!['cash','tournament'].includes(data.mode))throw Error('请选择德州玩法');
      rememberSetup();ui.pokerMode=data.mode;
    }
    else if(action==='app-start'){
      rememberSetup();
      if(profile.games[selected])throw Error('此游戏已有进行中的对局，请先继续或结束');
      const players=readInt('players'),difficulty=document.getElementById('difficulty').value,k=selected;
      if(!Number.isInteger(players)||players<C.limits[k][0]||players>C.limits[k][1]||!['easy','medium','hard'].includes(difficulty))throw Error('人数或难度无效');
      let settings={};if(k==='poker'){
        settings={mode:ui.pokerMode||'cash',small:readInt('small'),big:readInt('big'),buyin:readInt('buyin')};
        if(!Number.isSafeInteger(settings.small)||settings.small<1)throw Error('小盲注需为至少 1 的整数');
        if(!Number.isSafeInteger(settings.big)||settings.big<2||settings.big<=settings.small)throw Error('大盲注需为至少 2 的整数，并大于小盲注');
        if(!Number.isSafeInteger(settings.buyin)||settings.buyin<40||settings.buyin<settings.big*20)throw Error('初始筹码需为整数，至少 '+Math.max(40,settings.big*20)+'（大盲注的 20 倍）');
        if(settings.mode==='tournament')settings.blindEvery=readInt('blind-every');else if(profile.wallet<settings.buyin)throw Error('钱包余额不足买入，可先向银行借款');
      }
      if(k==='athlete')settings={draftMode:document.getElementById('draft-mode').value,trackMode:document.getElementById('track-mode').value};
      settings.difficulty=difficulty;const g=C.Games[k].create(players,settings);if(k==='poker'&&!isTournament(g))profile.wallet-=settings.buyin;ui={};
      pauseAll(profile);profile.active={type:k,players,difficulty,elapsedMs:0,paused:false,game:g};profile.stats[k].started++;screen='game';lastTick=Date.now();
    }else if(action==='app-resume'){ui={};const k=data.game||profile.activeType;if(!C.names[k]||!profile.games[k])throw Error('没有待继续的对局');pauseAll(profile);profile.activeType=k;profile.active.paused=false;screen='game';lastTick=Date.now()}
    else if(action==='app-pause'){if(!profile.active)throw Error('没有进行中的对局');profile.active.paused=!profile.active.paused;lastTick=Date.now()}
    else if(action==='app-abandon'){
      const a=profile.active;if(!a||a.type==='poker'&&!isTournament(a.game))throw Error('请在两手之间离桌结算');
      const ranked=a.type==='poker'&&a.game.players[0].eliminated&&Number.isInteger(a.game.players[0].place);
      const message=ranked?'你的名次已确定为第 '+a.game.players[0].place+' 名。现在离桌会记录本场完成、排名和游玩时间；其余电脑不会继续比赛。确认结算离桌？':a.type==='poker'?'退出锦标赛？名次尚未确定，本场不会计入完成或胜利，比赛筹码不进入钱包。':'放弃本局？本局不会计入完成场次。';
      if(!window.confirm(message))return;
      if(ranked)complete(true);else{profile.stats[a.type].activeMs+=a.elapsedMs;profile.active=null;screen='home'}
    }
    else if(action==='app-borrow'||action==='app-repay')bankAction(action)
    else if(action==='app-bank-limit'){if(profile.games.poker&&!isTournament(profile.games.poker.game)&&!profile.games.poker.game.betweenHands)throw Error('请在两手之间修改额度');const n=readInt('bank-limit');if(!Number.isSafeInteger(n)||n<profile.bank.outstanding)throw Error('额度不能低于未还欠款');profile.bank.limit=n}
    else if(action==='app-rebuy'||action==='app-rebuy-next')rebuy(action==='app-rebuy-next')
    else if(action==='p-end'){const a=profile.active;if(!a||a.type!=='poker'||a.paused||screen!=='game')throw Error('无正在运行的德州牌桌');if(isTournament(a.game))throw Error('锦标赛按淘汰名次结算，比赛筹码不能兑换');if(!a.game.betweenHands||a.game.handCount<1)throw Error('至少完成一手牌并在两手之间离桌');const p=a.game.players[0];if(!window.confirm('确认离桌结算？\n桌面筹码 '+p.stack+' 将返还钱包。\n本场净收益 '+(p.stack-p.buyins)+'，结算后此牌桌结束。'))return;C.Games.poker.endSession(a.game);profile.wallet+=p.stack;complete()}
    else if(action==='app-save'){exportSave(data.game);return}
    else if(action==='app-load'){importTarget=data.game||null;if(typeof window.showOpenFilePicker==='function'){openSaveFile();return}document.getElementById('import-file').click();return}
    else {const a=profile.active;if(!a||a.paused||screen!=='game'||ui.help)throw Error('游戏未运行');const nextHand=a.type==='poker'&&action==='p-next'&&a.game.betweenHands,watch=a.type==='poker'&&action==='p-watch'&&isTournament(a.game)&&a.game.players[0].eliminated;if(a.game.current!==0&&!nextHand&&!watch&&!(a.type==='athlete'&&['a-speed','a-step'].includes(action))&&!(a.type==='scout'&&(a.game.orientationPending||a.game.roundPending)))throw Error('尚未轮到你');
      if(action==='c-scout'){data.position=readInt('scout-position');data.flip=document.getElementById('scout-flip').value}
      if(action==='p-bet')data.amount=readInt('poker-amount');
      if(action==='a-step')data.difficulty=a.difficulty;
      C.Games[a.type].act(a.game,action,data);
      const gemTier=ui.gemTier;ui={gemTier};
      if(a.type==='poker'&&a.game.players[0].stack<a.game.big*5)a.game.hadLowStack=true;
      if(a.game.finished){complete();render();return}
    }
    awardActiveAchievements();saveCache();render();
    if(action==='app-rebuy'||(action==='app-borrow'&&screen==='game'&&profile.active&&profile.active.type==='poker'&&profile.active.game.players[0].stack===0)){
      const dock=document.querySelector('.poker-action-dock');if(dock&&dock.scrollIntoView)dock.scrollIntoView({block:'center'});
    }
  }
  function exportSave(type){
    if(!profile)throw Error('没有可保存的档案');
    if(type&&!C.names[type])throw Error('游戏无效');saveCache();ui.save={type:type||null,error:''};render();
    C.SaveFiles.ready.then(()=>{if(ui.save&&!saveBusy)render()});
  }
  function saveData(type){
    const content=type?{kind:'tablecorner-game',version:1,type,session:profile.games[type],stats:profile.stats[type],history:profile.history.filter(h=>h.type===type),achievements:profile.achievements,...(type==='poker'?{wallet:profile.wallet,bank:profile.bank}:{})}:profile;
    return JSON.stringify(content,null,2);
  }
  async function writeSave(asNew){
    const dialog=ui.save;saveBusy=true;dialog.error='';saveCache();render();
    try{const name=await C.SaveFiles.write(dialog.type,saveData(dialog.type),asNew);delete ui.save;lastTick=Date.now();showNotice('已保存到 '+name)}
    catch(e){if(e.name!=='AbortError')dialog.error='保存失败：'+e.message}
    finally{saveBusy=false;render()}
  }
  function downloadSave(type){
    saveCache();const data=saveData(type),blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='桌边-'+(C.names[type]||'全部存档')+'-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function openSaveFile(){
    ui.pickingFile=true;render();
    try{const handles=await window.showOpenFilePicker({multiple:false,types:[{description:'桌边 JSON 存档',accept:{'application/json':['.json']}}]});importSave(await handles[0].getFile(),handles[0])}
    catch(e){if(e.name!=='AbortError')error='加载失败：'+e.message;importTarget=null;ui.pickingFile=false;lastTick=Date.now();render()}
  }
  function importSave(file,handle){
    if(!file)return;const reader=new FileReader();
    const target=importTarget;importTarget=null;
    reader.onload=()=>{try{
      const raw=JSON.parse(reader.result);let p,message;
      if(raw.kind==='tablecorner-game'){
        const k=raw.type;if(raw.version!==1||!C.names[k]||(target&&target!==k)||!Array.isArray(raw.history)||raw.history.some(h=>h.type!==k)||!Array.isArray(raw.achievements))throw Error('游戏存档类型或格式无效');
        p=C.attachSlots(profile?JSON.parse(JSON.stringify(profile)):C.createProfile());p.games[k]=raw.session;p.stats[k]=raw.stats;p.history=raw.history.concat(p.history.filter(h=>h.type!==k)).slice(0,50);p.achievements=[...new Set(p.achievements.concat(raw.achievements))];if(k==='poker'){p.wallet=raw.wallet;p.bank=raw.bank}p.activeType=k;
        message='加载会替换'+C.names[k]+'的进度和统计'+(k==='poker'?'，以及钱包和借款账目':'')+'。其他游戏进度保留。确定继续？';
      }else {if(target)throw Error('请选择对应游戏的独立存档；全部备份请从顶部加载');if(!C.validProfile(raw))throw Error('存档结构或资金账目无效');p=C.attachSlots(raw);message='加载全部备份会替换五个游戏及当前档案。确定继续？'}
      if(!C.validProfile(p))throw Error('存档结构或资金账目无效');validateGames(p);pauseAll(p);if(profile&&!window.confirm(message))return;
      if(handle)C.SaveFiles.remember(raw.kind==='tablecorner-game'?raw.type:null,handle);
      profile=p;C.Achievements.check(p);ui={};screen=p.active?'game':'home';lastResult=null;error='';saveCache();render();
    }catch(e){error='加载失败：'+e.message;render()}finally{if(ui.pickingFile){ui.pickingFile=false;lastTick=Date.now();render()}}};
    reader.onerror=()=>{ui.pickingFile=false;error='加载失败：无法读取文件';lastTick=Date.now();render()};
    reader.readAsText(file);document.getElementById('import-file').value='';
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;try{dispatch(b.dataset.action,{...b.dataset})}catch(err){
    const action=b.dataset.action,bank=action==='app-borrow'||action==='app-repay',limit=action==='app-bank-limit';
    if(bank||limit){error='';ui.error='';ui[bank?'bankError':'bankLimitError']=err.message}else {error=err.message;ui.error=err.message}
    render();if(bank||limit){const feedback=document.getElementById(bank?'bank-error':'bank-limit-error');if(feedback&&feedback.scrollIntoView)feedback.scrollIntoView({block:'nearest'})}
  }});
  document.addEventListener('change',e=>{
    if(screen==='setup'){rememberSetup();return}
    if(!profile||!profile.active||screen!=='game')return;
    if(e.target.id==='scout-position'){ui.scoutPosition=Number(e.target.value);render()}
    if(e.target.id==='scout-flip'){ui.scoutFlip=e.target.value==='true';render()}
  });
  document.addEventListener('input',e=>{
    if(screen==='setup'){rememberSetup();return}
    if(e.target.id!=='poker-amount'||!profile||!profile.active)return;
    ui.pokerAmount=e.target.value;const g=profile.active.game,p=g.players[0],n=Number(e.target.value),min=g.currentBet+g.lastFullRaise,max=p.streetBet+p.stack;
    const message=!Number.isSafeInteger(n)||n<=g.currentBet||n>max?'请输入大于 '+g.currentBet+'、不超过 '+max+' 的整数':n<min&&n!==max?'最低加注至 '+min+'；不足额时只能全下':'';
    ui.error=message;const err=document.getElementById('poker-error');if(err)err.textContent=message;
    const paid=document.getElementById('poker-paid');if(paid)paid.textContent='本次再付 '+Math.max(0,n-p.streetBet);
    const button=document.querySelector('[data-action="p-bet"]');if(button){button.textContent=(g.currentBet?'加注至 ':'下注 ')+e.target.value;button.disabled=!!message}
  });
  document.addEventListener('cancel',e=>{if(e.target.id==='save-dialog'){e.preventDefault();if(!saveBusy){delete ui.save;lastTick=Date.now();render()}}else if(e.target.id==='game-help'){e.preventDefault();ui.help=false;lastTick=Date.now();render()}},true);
  document.getElementById('import-file').addEventListener('change',e=>importSave(e.target.files[0]));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&profile&&profile.active&&!profile.active.paused&&!ui.save&&!ui.help&&!ui.pickingFile){profile.active.paused=true;saveCache();render()}lastTick=Date.now()});
  window.addEventListener('beforeunload',saveCache);
  loadCache();if(profile)saveCache();render();setInterval(tick,250);
})();
