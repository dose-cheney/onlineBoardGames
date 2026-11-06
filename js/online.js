(function () {
  'use strict';
  const app = document.getElementById('online-app'), forms = window.OnlineForms;
  const drafts = new Map(), passwordDrafts = new Map();
  let sharedCreate = {}, notice = '', noticeTimer, manualCopyRoom = '', renderedView = '';
  const names = { splendor: '璀璨宝石', scout: '马戏星探', poker: '德州扑克', athlete: '胡闹运动会', flip7: 'Flip 7', mahjong: '武穴麻将' };
  const limits = { splendor: [2, 4], scout: [2, 5], poker: [2, 10], athlete: [2, 6], flip7: [2, 6], mahjong: [4, 4] };
  const emotes = ['好牌！', '漂亮！', '再想想…', '运气真好', '哎呀！', '轮到你啦'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let me = null, socket = null, connected = false, rooms = [], state = null, error = '', draftGame = 'splendor';
  const invite = forms.roomCode(new URLSearchParams(location.search).get('room'));
  let lobbyMode = invite ? 'join' : 'create';
  const send = value => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); else showError('连接中断，请等待重连'); };
  const showError = message => { error = message; render(); };
  const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

  function fieldError(field) {
    const label = field.labels?.[0];
    const name = label ? [...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim().replace(/（.*）$/, '') : '此项';
    return forms.message(field, name || '此项');
  }

  function showFieldError(field) {
    const message = fieldError(field), id = `${field.form.getAttribute('id')}-${field.name}-feedback`;
    let feedback = document.getElementById(id);
    if (message) {
      if (!feedback) {
        feedback = document.createElement('span');
        feedback.id = id; feedback.className = 'form-feedback'; feedback.setAttribute('role', 'alert');
        field.insertAdjacentElement('afterend', feedback);
      }
      feedback.textContent = message;
      field.setAttribute('aria-invalid', 'true');
      const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      descriptions.add(id); field.setAttribute('aria-describedby', [...descriptions].join(' '));
    } else {
      feedback?.remove(); field.removeAttribute('aria-invalid');
      const descriptions = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
      if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' ')); else field.removeAttribute('aria-describedby');
    }
    return !message;
  }

  function validateForm(form) {
    let firstInvalid;
    for (const field of form.elements) {
      if (field.willValidate && field.name && !showFieldError(field) && !firstInvalid) firstInvalid = field;
    }
    firstInvalid?.focus();
    return !firstInvalid;
  }

  function roomList() {
    return `<section class="panel"><h2>当前房间</h2>${rooms.length ? rooms.map(r =>
      `<div class="online-room-card"><div class="row between"><strong>${esc(names[r.type])} · ${esc(r.id)}</strong><span>${r.locked ? '🔒 有密码' : '无密码'}</span></div>
      <p>${r.phase === 'lobby' ? '准备中' : r.phase === 'playing' ? '对局中 · 可候场' : '本局结束'} · 已入房 ${r.players}/${r.seats} · 候场 ${r.waiting}</p>
      ${me && !state ? `<div class="online-compact">${r.locked ? `<input aria-label="房间 ${r.id} 的密码" type="password" data-password-for="${r.id}" placeholder="房间密码">` : ''}<button data-ui="join-listed" data-room="${r.id}">加入房间</button></div>` : ''}</div>`).join('') : '<p class="muted">还没有房间。创建一个并分享邀请链接吧。</p>'}</section>`;
  }

  function identityPage() {
    return `<div class="online-grid"><section class="panel"><span class="eyebrow">TEMPORARY ID</span><h1>先取一个昵称</h1>
      <p>无需注册。昵称会显示在牌桌上，刷新页面可继续使用。</p>${invite ? `<p class="notice">朋友邀请你加入房间 <strong>${esc(invite)}</strong>。创建身份后即可加入。</p>` : ''}
      <form id="identity-form" data-draft-key="identity"><label class="online-field">昵称<input name="nick" maxlength="16" required autocomplete="nickname" placeholder="例如 小陈"></label><button class="primary">创建身份</button></form>
      <p class="muted">全站最多 10 人同时在线。</p></section>${roomList()}</div>`;
  }

  function createForm() {
    const type = draftGame, [min, max] = limits[type], mode = drafts.get('create:poker')?.mode?.value || 'cash';
    return `<section class="panel"><h2>创建房间</h2><p class="muted">先创建房间，再邀请朋友。至少两名真人准备好后，房主即可开局。</p><form id="create-form" data-draft-key="create:${type}">
      <label class="online-field">游戏<select name="type" id="create-game">${Object.keys(names).map(k => option(k, names[k], k === type)).join('')}</select></label>
      <label class="online-field">座位上限<input name="seats" type="number" min="${min}" max="${max}" value="${type === 'poker' ? 10 : Math.min(max, 4)}" required></label>
      ${type !== 'poker' ? `<label class="online-field">电脑难度<select name="difficulty">${option('easy', '初级 · 初次玩', true)}${option('medium', '中级')}${option('hard', '高级')}</select></label>` : '<input type="hidden" name="difficulty" value="medium">'}
      ${type !== 'poker' ? `<label class="online-field"><span><input name="bots" type="checkbox" checked> 人数不足时由电脑补位</span></label>` : ''}
      ${type === 'athlete' ? `<label class="online-field">选角<select name="draftMode">${option('draft', '蛇形选角', true)}${option('random', '随机组队')}</select></label><label class="online-field">赛道<select name="trackMode">${option('alternating', '温和／狂野交替', true)}${option('mild', '全程温和')}</select></label>` : ''}
      ${type === 'mahjong' ? '<div class="mj-price-fields">'+Object.entries({1:'1斤',2:'2斤',4:'4斤',8:'8斤',16:'16斤封顶',silver:'银顶／家',gold:'金顶／家'}).map(([key,text])=>'<label>'+text+'（元）<input name="mj-price-'+key+'" type="number" min="0.01" max="1000000" step="0.01" value="'+({1:1,2:1,4:2,8:4,16:8,silver:10,gold:15})[key]+'" required></label>').join('')+'</div><label>操作时限（秒）<input name="turnSeconds" type="number" min="15" max="300" value="120" required></label><p>麻将固定四座；不启用电脑时，需要四人准备。金额在本场固定，人员更换前结算。</p>' : ''}
      ${type === 'poker' ? `<label class="online-field">玩法<select name="mode">${option('cash', '现金桌', mode === 'cash')}${option('tournament', '锦标赛', mode === 'tournament')}</select></label>
        <div class="online-compact"><label>初始筹码 <input name="buyin" type="number" min="40" max="1000000" value="200" required></label><label>小盲 <input name="small" type="number" min="1" max="100000" value="1" required></label><label>大盲 <input name="big" type="number" min="2" max="100000" value="2" required></label></div>
        <div class="online-compact">${mode === 'tournament' ? '<label>每几手升盲 <input name="blindEvery" type="number" min="0" max="100" value="10" required><small class="muted">填 0 使用固定盲注</small></label>' : ''}<label>操作时限（秒）<input name="turnSeconds" type="number" min="30" max="300" value="120" required></label></div>` : ''}
      <p class="muted">${type === 'poker' ? (mode === 'cash' ? '现金桌由真人游玩；每手结束后由房主开启下一手。' : '锦标赛由真人游玩；输光淘汰，最后留下的人获胜。') : '勾选电脑补位时，电脑会补到座位上限；关闭后只让已准备真人参与。'}</p><label class="online-field">房间密码（可留空）<input name="password" type="password" minlength="4" maxlength="32" autocomplete="new-password" placeholder="留空则公开加入"></label>
      <button class="primary">创建房间</button></form></section>`;
  }

  function lobbyPage() {
    const join = `<section class="panel"><h2>加入朋友的房间</h2><p class="muted">粘贴房间码或完整邀请链接，也可以从房间列表直接加入。</p><form id="join-form" data-draft-key="join">
      <label class="online-field">房间码或邀请链接<input name="id" maxlength="512" value="${esc(invite)}" required autocomplete="off" spellcheck="false" placeholder="10 位房间码或邀请链接"></label>
      <label class="online-field">密码（若有）<input name="password" type="password" autocomplete="off" placeholder="无密码房间可留空"></label><button class="primary">加入房间</button></form></section>`;
    return `<nav class="online-lobby-tabs" aria-label="联机游玩方式">${[['create', '创建房间'], ['join', '加入房间']].map(([value, label]) => `<button data-ui="lobby-tab" data-mode="${value}" aria-pressed="${lobbyMode === value}" class="${lobbyMode === value ? 'primary' : ''}">${label}</button>`).join('')}</nav>
      <div class="online-grid"><div>${lobbyMode === 'join' ? join : createForm()}</div>${roomList()}</div>`;
  }

  function guide(room) {
    const tips = {
      splendor: ['拿宝石、预留或购买卡牌，每回合选一项。', '先拿不同颜色的宝石，再查看卡牌的折扣后费用。卡牌提供永久折扣，有人达到 15 分后完成当前轮，比较最终分数。'],
      scout: ['手牌顺序固定，从连续位置选牌表演，或招募舞台两端的牌。', '开局可以整手翻面；之后不能重排。先点选组合查看预览，再确认表演；招募时选择数字朝向和插入位置。'],
      poker: ['轮到你时，在底牌旁选择弃牌、过牌、跟注或加注。', '加注金额是本轮累计下注总额；旁边会显示本次需要支付多少。每手结束后由房主开启下一手；筹码仅用于游戏。'],
      athlete: ['先选队员，再挑选本场出赛角色；轮到你时掷骰或选择技能。', '每位角色只能参加一场，共四场。随机组队可跳过选角；需要技能选择时，操作按钮会显示在赛道附近。'],
      mahjong: ['点击自己的牌出牌；出现响应时选择吃、碰、杠、胡或过。', '固定四座，可用电脑补齐。清水与浑水按斤数结算，庄家不加斤。双方杠数相加，赖子杠和暗杠计两杠。门面清、七对赢牌时三家都付款；其他情况未开口者免付。16斤封顶，银顶两家各10元，金顶三家各15元（按开局金额）。抢杠仅限补杠，按杠上开花算。两骰和从庄家起顺时针选牌墙，大点数翻该垛上牌；翻皮后跳过皮子点数垛（字牌跳1垛）再抓。单张特殊杠不算开口；多个牌型取最高，风一色暂按16斤，赢家坐庄。每局结束可继续或结算本场，参与人的结果自动缓存在本机，可下载JSON。'],
      flip7: ['轮到你时，选择“继续翻一张”或“收分”。', '重复数字会爆牌，本轮 0 分；集齐七种数字加 15 分并结束本轮。特殊牌出现时按提示选目标，累计至少 200 分且独自领先获胜。']
    };
    const [action, rule] = tips[room.options.type];
    return `<details class="online-guide" data-detail-id="game-guide"><summary>玩法与操作 · ${names[room.options.type]}</summary><p><strong>${action}</strong></p><p>${rule}</p><p class="muted">快捷短语在屏幕底部，消息显示在对应玩家头像旁。联机查看说明时，对局与操作倒计时继续。</p></details>`;
  }

  function seatCard(s, index, room) {
    const phrase = room.emotes?.find(x => x.id === s.id)?.phrase;
    const emote = phrase ? `<span class="online-emote-bubble" role="status">${esc(phrase)}</span>` : '';
    const member = room.members.find(m => m.id === s.id);
    return `<div class="online-seat ${s.id === me.id ? 'me' : ''}">${emote}<span class="avatar">${esc((s.nick || '?').slice(0, 1))}</span><strong>${esc(s.nick)}</strong>
      <small>${s.bot ? '电脑' : s.online ? '在线' : '<span class="online-disconnected">离线</span>'}${member?.takeover ? ' · 电脑托管' : ''} · ${index + 1} 号座位${room.phase === 'lobby' ? member?.ready ? ' · 已准备' : ' · 未准备' : ''}</small></div>`;
  }

  function transferPanel(room) {
    if (room.options.type !== 'poker' || room.options.mode !== 'cash' || room.phase !== 'playing' || room.seat < 0 || !room.betweenHands) return '';
    const mine = room.cashStacks.find(x => x.id === me.id), others = room.cashStacks.filter(x => x.id !== me.id), buyin = room.options.buyin;
    const targetOptions = others.map(x => option(x.id, `${x.nick} · ${x.stack} 筹码`)).join('');
    return `<section class="online-transfer"><h3>两手之间 · 筹码与离席</h3><p>初始筹码 ${buyin}，你当前 ${mine?.stack ?? 0}。桌内总量保持在座人数 × 初始筹码。</p>
      ${mine && mine.stack < buyin ? `<form id="transfer-form" data-draft-key="${room.id}:transfer" class="online-compact"><label>向玩家申请 <select name="to">${targetOptions}</select></label><label>筹码 <input name="amount" type="number" min="1" value="${Math.max(1, buyin - mine.stack)}" required></label><button>请求转让</button></form>` : ''}
      ${mine && mine.stack > buyin ? `<form id="gift-form" data-draft-key="${room.id}:gift" class="online-compact"><label>赠送给 <select name="to">${targetOptions}</select></label><label>筹码 <input name="amount" type="number" min="1" max="${mine.stack - buyin}" value="${mine.stack - buyin}" required></label><button>直接赠送</button></form>` : ''}
      ${room.requests.map(r => `<div class="online-request">${r.from === me.id ? `已向 ${esc(r.toNick)} 申请 ${r.amount} 筹码，等待同意` : `${esc(r.fromNick)} 向你申请 ${r.amount} 筹码 <button data-ui="accept-transfer" data-id="${r.id}">同意</button> <button data-ui="reject-transfer" data-id="${r.id}">拒绝</button>`}</div>`).join('')}
      <button data-ui="leave-cash" ${mine?.stack === buyin ? '' : 'disabled'}>按初始筹码离席</button></section>`;
  }

  function roomPage(room, gameHtml) {
    const title = `${names[room.options.type]} · ${room.id}`;
    const inviteUrl = new URL('/online.html?room=' + encodeURIComponent(room.id), location.href).href;
    const seats = room.phase === 'lobby' ? room.members.map((m, i) => ({ ...m, bot: false, nick: m.nick, id: m.id })) : room.seats;
    const host = room.isHost;
    const seated = room.seat >= 0;
    const mine = [...room.members, ...room.queue].find(m => m.id === me.id);
    const prepared = [...room.members, ...room.queue].filter(m => m.ready && m.online).length;
    const needed = room.options.type === 'mahjong' && room.options.bots === false ? 4 : 2;
    const waiting = [...room.members.filter(m => room.phase !== 'lobby' && m.seat < 0), ...room.queue];
    const readyButton = `<button class="${mine?.ready ? '' : 'primary'}" data-ui="ready">${mine?.ready ? '取消准备' : '准备好了'}</button>`;
    const timing = room.options.type === 'poker' && room.options.mode === 'cash' ? '下一手' : '下一整局';
    const management = `${host ? '<button data-ui="close-room">关闭房间</button>' : ''}
      <div class="online-seat-list">${seats.map((s, i) => seatCard(s, i, room)).join('')}</div>
      ${waiting.length ? `<p>候场：${waiting.map(x => `${esc(x.nick)}（${x.ready ? '已准备' : '未准备'}）`).join('、')}</p>` : ''}
      ${room.phase === 'playing' && room.options.type !== 'poker' && host ? room.members.filter(x => !x.online && !x.takeover && x.seat >= 0).map(x => `<button data-ui="takeover" data-target="${x.id}">托管 ${esc(x.nick)}（掉线满 120 秒后）</button>`).join('') : ''}`;
    return `<section class="panel online-room-header ${room.phase === 'playing' ? 'is-playing' : ''}"><div class="row between"><div><span class="eyebrow">ROOM ${esc(room.id)}</span><h1>${esc(title)}</h1></div><div class="online-compact"><button data-ui="copy-link" data-url="${esc(inviteUrl)}">复制邀请链接</button>${room.phase !== 'playing' || !seated || room.mahjongBetween ? '<button data-ui="leave-room">离开房间</button>' : ''}</div></div>
      ${manualCopyRoom === room.id ? `<details class="online-copy-fallback" data-detail-id="manual-copy" open><summary>手动复制邀请链接</summary><label class="online-field">邀请链接<input id="invite-copy-url" readonly value="${esc(inviteUrl)}"></label><p class="muted">浏览器暂不支持自动复制，请选中链接复制；手机可长按复制。</p></details>` : ''}
      <div class="online-room-status"><span>${room.phase === 'lobby' ? `已准备 ${prepared} 人 · 满 ${needed} 人即可开局` : room.phase === 'playing' ? seated ? '对局进行中' : mine?.ready ? `已准备 · ${timing}自动入座` : '候场中 · 准备后自动参与' : '本局已结束'} · 房主 ${esc([...room.members, ...room.queue].find(x => x.id === room.host)?.nick || '')} · ${room.options.seats} 座</span>
      ${room.turnDeadline && room.phase === 'playing' ? `<span>操作剩余 <time id="turn-clock" data-deadline="${room.turnDeadline}"></time></span>` : ''}</div>
      ${room.phase === 'playing' ? `<details class="online-room-details" data-detail-id="room-management"><summary>房间成员与管理</summary>${management}</details>` : management}
      ${room.phase === 'lobby' ? `<div class="online-compact">${readyButton}${host ? `<button class="primary" data-ui="start" ${prepared >= needed ? '' : 'disabled'}>开始本局</button>` : ''}</div><p class="footer-note">未准备的人可以稍后准备，${timing}自动入座。</p>` : !seated && mine ? `<div class="online-compact">${readyButton}<span class="muted">${timing}有空位时自动入座。</span></div>` : ''}
      ${room.phase === 'finished' && host ? '<button class="primary" data-ui="rematch">返回准备下一局</button>' : ''}${guide(room)}</section>
      ${room.phase !== 'lobby' ? `<div class="online-game"><div class="game-surface game-${room.options.type}">${gameHtml}</div>${transferPanel(room)}</div>` : ''}
      ${room.phase === 'playing' ? `<nav class="online-emote-dock" aria-label="牌桌快捷短语"><span>快捷短语</span><div class="online-emote-buttons">${emotes.map(x => `<button data-ui="emote" data-phrase="${esc(x)}">${esc(x)}</button>`).join('')}</div></nav>` : ''}`;
  }

  function render() {
    const focus = document.activeElement;
    const focusKey = focus?.form?.dataset.draftKey, focusName = focus?.name, focusId = focus?.id, focusPassword = focus?.dataset.passwordFor;
    for (const form of app.querySelectorAll('form[data-draft-key]')) {
      const draft = { ...drafts.get(form.dataset.draftKey), ...forms.snapshot(form) }; drafts.set(form.dataset.draftKey, draft);
      if (form.getAttribute('id') === 'create-form') {
        for (const name of ['password', 'bots', ...(form.dataset.draftKey === 'create:poker' ? [] : ['difficulty'])]) if (draft[name]) sharedCreate[name] = draft[name];
      }
    }
    for (const field of app.querySelectorAll('[data-password-for]')) passwordDrafts.set(field.dataset.passwordFor, field.value);
    const details = new Map([...app.querySelectorAll('details[data-detail-id]')].map(item => [item.dataset.detailId, item.open]));
    app.classList.toggle('online-playing', state?.room.phase === 'playing');
    app.innerHTML = `<header class="topbar"><a class="brand" href="/">桌边 <span class="muted">/ 联机</span></a><nav class="top-actions" aria-label="页面导航与状态"><a class="nav-link" href="/index.html">游客单机 <span aria-hidden="true">↗</span></a>${me ? `<span class="online-account">${esc(me.nick)} · ID ${esc(me.id.slice(0, 8))}</span><span class="connection-pill ${connected ? 'is-connected' : 'online-disconnected'}">${connected ? '已连接' : '连接中…'}</span>` : ''}</nav></header>
      ${error ? `<p class="notice error online-error" role="alert">${esc(error)}</p>` : ''}${notice ? `<p class="notice online-success" role="status">${esc(notice)}</p>` : ''}
      ${!me ? identityPage() : state ? roomPage(state.room, state.gameHtml) : lobbyPage()}${window.MahjongResults?.html() || ''}
      <p class="footer-note">临时身份与房间只保存在本机服务器进程中；联机筹码仅用于游戏。</p>`;
    for (const form of app.querySelectorAll('form')) {
      form.noValidate = true;
      const draft = form.dataset.draftKey ? { ...(form.getAttribute('id') === 'create-form' ? sharedCreate : {}), ...drafts.get(form.dataset.draftKey) } : null;
      forms.restore(form, draft);
      for (const field of form.elements) if (draft?.[field.name]?.invalid) showFieldError(field);
    }
    for (const field of app.querySelectorAll('[data-password-for]')) if (passwordDrafts.has(field.dataset.passwordFor)) field.value = passwordDrafts.get(field.dataset.passwordFor);
    for (const item of app.querySelectorAll('details[data-detail-id]')) if (details.has(item.dataset.detailId)) item.open = details.get(item.dataset.detailId);
    const replacement = focusId ? document.getElementById(focusId) : focusKey && focusName ? [...app.querySelectorAll('form[data-draft-key]')].find(form => form.dataset.draftKey === focusKey)?.elements.namedItem(focusName) : focusPassword ? [...app.querySelectorAll('[data-password-for]')].find(field => field.dataset.passwordFor === focusPassword) : null;
    if (replacement && replacement.tagName === focus.tagName && replacement.type !== 'hidden') replacement.focus({ preventScroll: true });
    const view = !me ? 'identity' : state ? `${state.room.id}:${state.room.phase}` : `lobby:${lobbyMode}`;
    if (view !== renderedView && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    renderedView = view;
    clock();
  }

  function clock() {
    const item = document.getElementById('turn-clock');
    if (item) item.textContent = Math.max(0, Math.ceil((Number(item.dataset.deadline) - Date.now()) / 1000)) + ' 秒';
  }

  function connect() {
    if (!me) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => { connected = true; error = ''; render(); };
    socket.onmessage = event => {
      let packet; try { packet = JSON.parse(event.data); } catch { return; }
      if (packet.type === 'rooms') rooms = packet.rooms;
      else if (packet.type === 'state') { state = { room: packet.room, gameHtml: packet.gameHtml }; error = ''; if(packet.mahjongResult && window.MahjongResults && !window.MahjongResults.save(packet.mahjongResult)) { if(packet.mahjongResult.ledger.length) error='本机结果缓存失败，请及时下载本场结果'; } }
      else if (packet.type === 'mahjongResult') { window.MahjongResults?.save(packet.result); }
      else if (packet.type === 'left') state = null;
      else if (packet.type === 'error') error = packet.message;
      render();
    };
    socket.onclose = async () => {
      connected = false; render();
      try { const result = await fetch('/api/me').then(r => r.json()); if (!result) { me = null; state = null; showError('服务器已重启，请重新创建身份'); return; } }
      catch { /* The local server may still be restarting. */ }
      setTimeout(connect, 3000);
    };
  }

  app.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    const ui = button.dataset.ui;
    if (ui) {
      const room = state?.room;
      if (ui === 'lobby-tab') { lobbyMode = button.dataset.mode; error = ''; render(); }
      else if (ui === 'join-listed') { const id = button.dataset.room; const pwd = app.querySelector(`[data-password-for="${id}"]`)?.value || ''; send({ kind: 'join', id, password: pwd }); }
      else if (ui === 'copy-link') {
        try {
          await navigator.clipboard.writeText(button.dataset.url); error = ''; notice = '邀请链接已复制，可以发给朋友';
          clearTimeout(noticeTimer); render(); noticeTimer = setTimeout(() => { notice = ''; render(); }, 4000);
        } catch {
          manualCopyRoom = room.id; render();
          const field = document.getElementById('invite-copy-url'); field?.focus(); field?.select();
        }
      }
      else if (ui === 'ready') send({ kind: 'ready' });
      else if (ui === 'start') send({ kind: 'start' });
      else if (ui === 'leave-room') send({ kind: 'leave' });
      else if (ui === 'leave-cash') send({ kind: 'leaveCash' });
      else if (ui === 'rematch') send({ kind: 'rematch' });
      else if (ui === 'close-room' && confirm('关闭房间会结束当前联机对局，确定关闭？')) send({ kind: 'closeRoom' });
      else if (ui === 'takeover') send({ kind: 'takeover', target: button.dataset.target });
      else if (ui === 'emote') send({ kind: 'emote', phrase: button.dataset.phrase });
      else if (ui === 'accept-transfer' || ui === 'reject-transfer') send({ kind: 'decideTransfer', id: button.dataset.id, accept: ui === 'accept-transfer' });
      return;
    }
    if (!state) return;
    const action = button.dataset.action; if (!action) return;
    const data = { ...button.dataset }; delete data.action;
    if (['s-tier', 's-review', 'c-select-show', 'c-recruit-end'].includes(action)) { send({ kind: 'preview', action, data }); return; }
    if (action === 'c-scout') { data.position = document.getElementById('scout-position')?.value; data.flip = document.getElementById('scout-flip')?.value; }
    if (action === 'p-bet') data.amount = document.getElementById('poker-amount')?.value;
    send({ kind: 'gameAction', action, data, revision: state.room.revision });
  });

  app.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target;
    if (!validateForm(form)) return;
    const values = Object.fromEntries(new FormData(form));
    if (form.getAttribute('id') === 'identity-form') {
      try {
        const response = await fetch('/api/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const data = await response.json(); if (!response.ok) throw Error(data.error);
        me = data; error = ''; connect(); render();
      } catch (e) { showError(e.message); }
    } else if (form.getAttribute('id') === 'create-form') {
      const prices=values.type==='mahjong'?Object.fromEntries(['1','2','4','8','16','silver','gold'].map(key=>[key,Math.round(Number(values['mj-price-'+key])*100)])):undefined;
      send({ kind: 'create', ...values, ...(prices?{prices}:{}), bots: form.elements.bots ? form.elements.bots.checked : false });
    }
    else if (form.getAttribute('id') === 'join-form') send({ kind: 'join', ...values, id: forms.roomCode(values.id) });
    else if (form.getAttribute('id') === 'transfer-form') send({ kind: 'requestTransfer', to: values.to, amount: Number(values.amount) });
    else if (form.getAttribute('id') === 'gift-form') send({ kind: 'gift', to: values.to, amount: Number(values.amount) });
  });

  app.addEventListener('input', event => {
    if (event.target.form) {
      for (const field of event.target.form.elements) if (field.getAttribute('aria-invalid') === 'true') showFieldError(field);
    }
  });

  app.addEventListener('change', event => {
    if (event.target.name === 'mode' && event.target.form?.id === 'create-form') render();
    if (event.target.id === 'create-game') { draftGame = event.target.value; render(); }
    if (event.target.id === 'scout-position' || event.target.id === 'scout-flip') send({ kind: 'preview', action: event.target.id, data: { value: event.target.value } });
  });
  setInterval(clock, 250);
  Promise.all([fetch('/api/me').then(r => r.json()), fetch('/api/rooms').then(r => r.json())]).then(([identity, list]) => {
    me = identity; rooms = list; render(); if (me) connect();
  }).catch(() => showError('无法连接本机服务器'));
})();
