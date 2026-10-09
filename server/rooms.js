const crypto = require('node:crypto');
const C = require('./engines');

const EMOTES = ['好牌！', '漂亮！', '再想想…', '运气真好', '哎呀！', '轮到你啦'];
const kinds = Object.keys(C.names);
const esc = C.escape;
const code = () => crypto.randomBytes(5).toString('hex').toUpperCase();
const int = (x, lo, hi) => Number.isSafeInteger(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Number(x) : null;
const bad = message => { throw Error(message); };

function settings(input) {
  const type = String(input.type || '');
  if (!kinds.includes(type)) bad('游戏无效');
  const seats = int(input.seats, 2, C.limits[type][1]);
  const difficulty = ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : null;
  if (!seats || !difficulty) bad('人数或难度无效');
  const out = { type, seats, difficulty };
  if (type === 'poker') {
    out.mode = ['cash', 'tournament'].includes(input.mode) ? input.mode : 'cash';
    out.buyin = int(input.buyin, 40, 1000000);
    out.small = int(input.small, 1, 100000);
    out.big = int(input.big, 2, 100000);
    out.blindEvery = int(input.blindEvery ?? 10, 0, 100);
    out.turnSeconds = int(input.turnSeconds ?? 120, 30, 300);
    if (!out.buyin || !out.small || !out.big || out.big <= out.small || out.buyin < out.big * 20 || out.blindEvery === null || !out.turnSeconds) bad('德州筹码、盲注或操作时限无效');
  }
  if (type === 'athlete') {
    out.draftMode = input.draftMode === 'random' ? 'random' : 'draft';
    out.trackMode = input.trackMode === 'mild' ? 'mild' : 'alternating';
  }
  out.bots = type !== 'poker' && input.bots !== false;
  return out;
}

function cardName(id) {
  const faces = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, suits = ['♠', '♥', '♦', '♣'];
  const rank = id % 13 + 2;
  return (faces[rank] || rank) + suits[Math.floor(id / 13)];
}

class Hub {
  constructor() {
    this.identities = new Map();
    this.byToken = new Map();
    this.rooms = new Map();
  }

  identity(nickname) {
    const nick = String(nickname || '').trim();
    if (!/^[\p{L}\p{N}_ -]{1,16}$/u.test(nick)) bad('昵称需为 1–16 个中文、字母、数字或空格');
    const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
    const user = { id, nick, token, peer: null, roomId: null, ui: {}, lastEmote: 0, disconnectedAt: 0 };
    this.identities.set(id, user); this.byToken.set(token, user);
    return user;
  }

  getByToken(token) { return this.byToken.get(token); }
  onlineCount() { return [...this.identities.values()].filter(u => u.peer).length; }
  names(room) { return room.seats.map((id, i) => id ? this.identities.get(id)?.nick || '离线玩家' : '电脑 ' + (i + 1)); }
  seat(room, id) { return room.seats.indexOf(id); }
  isOnline(id) { return !!this.identities.get(id)?.peer; }

  connect(user, peer) {
    if (user.peer) user.peer.close();
    else if (this.onlineCount() >= 10) bad('服务器已达到 10 人在线上限');
    user.peer = peer; user.disconnectedAt = 0;
    peer.send({ type: 'hello', id: user.id, nick: user.nick, emotes: EMOTES });
    this.sendList(user);
    if (user.roomId) {
      const room = this.rooms.get(user.roomId);
      if (room) { room.takeovers.delete(user.id); if (room.phase === 'playing') this.admitCash(room); this.touch(room); }
      else user.roomId = null;
    }
  }

  disconnect(user, peer) {
    if (user.peer !== peer) return;
    user.peer = null; user.disconnectedAt = Date.now();
    const room = this.rooms.get(user.roomId);
    if (room) {
      this.touch(room);
      if (room.host === user.id) setTimeout(() => {
        if (room.host !== user.id || this.isOnline(user.id)) return;
        const next = room.members.find(id => id !== user.id && this.isOnline(id)) || room.queue.find(id => this.isOnline(id));
        if (next) { room.host = next; this.touch(room); }
      }, 10000).unref();
    }
  }

  list() {
    return [...this.rooms.values()].map(r => ({ id: r.id, type: r.options.type, phase: r.phase,
      locked: !!r.password, players: r.members.length, waiting: r.queue.length, seats: r.options.seats }));
  }
  sendList(user) { user.peer?.send({ type: 'rooms', rooms: this.list() }); }
  lists() { for (const user of this.identities.values()) if (user.peer) this.sendList(user); }

  create(user, input) {
    if (user.roomId) bad('请先离开当前房间');
    const options = settings(input), password = String(input.password || '');
    if (password && (password.length < 4 || password.length > 32)) bad('房间密码需为 4–32 个字符');
    let id; do { id = code(); } while (this.rooms.has(id));
    const salt = password ? crypto.randomBytes(16) : null;
    const room = { id, options, password: password ? crypto.scryptSync(password, salt, 32) : null, salt,
      host: user.id, members: [user.id], queue: [], ready: new Set(), seats: [], game: null,
      phase: 'lobby', revision: 0, takeovers: new Set(), requests: new Map(), emotes: new Map(),
      timer: null, turnKey: '', turnDeadline: 0, boardChanged: false };
    this.rooms.set(id, room); user.roomId = id; this.touch(room); return room;
  }

  join(user, id, password = '') {
    if (user.roomId) bad('请先离开当前房间');
    const room = this.rooms.get(String(id).toUpperCase());
    if (!room) bad('房间码不存在');
    if (room.password) {
      const check = crypto.scryptSync(String(password), room.salt, 32);
      if (!crypto.timingSafeEqual(check, room.password)) bad('房间密码错误');
    }
    user.roomId = room.id;
    if (room.phase === 'lobby' && room.members.length < room.options.seats) room.members.push(user.id);
    else room.queue.push(user.id);
    this.touch(room); return room;
  }

  removeMember(room, id) {
    room.members = room.members.filter(x => x !== id); room.queue = room.queue.filter(x => x !== id);
    room.ready.delete(id); room.takeovers.delete(id);
    room.emotes.delete(id);
    for (const [key, req] of room.requests) if (req.from === id || req.to === id) room.requests.delete(key);
    const user = this.identities.get(id); if (user) user.roomId = null;
    if (room.host === id) room.host = [...room.members, ...room.queue].find(x => this.isOnline(x)) || room.members[0] || room.queue[0] || null;
    if (['lobby', 'finished'].includes(room.phase)) while (room.queue.length && room.members.length < room.options.seats) room.members.push(room.queue.shift());
    if (!room.members.length && !room.queue.length) { clearTimeout(room.timer); this.rooms.delete(room.id); this.lists(); }
    else this.touch(room);
  }

  leave(user) {
    const room = this.currentRoom(user);
    if (room.phase === 'playing' && this.seat(room, user.id) >= 0) bad('对局进行中，德州现金桌须在两手之间按筹码规则离席；其余游戏请等待本局结束');
    this.removeMember(room, user.id);
    user.peer?.send({ type: 'left' });
  }

  currentRoom(user) {
    const room = this.rooms.get(user.roomId);
    if (!room) bad('尚未加入房间');
    return room;
  }

  requireHost(room, user) { if (room.host !== user.id) bad('只有房主可以操作'); }

  prepare(room, user) {
    if (![...room.members, ...room.queue].includes(user.id) || room.phase === 'playing' && this.seat(room, user.id) >= 0) bad('当前不能准备');
    if (room.ready.has(user.id)) room.ready.delete(user.id); else room.ready.add(user.id);
    if (room.phase === 'playing') this.admitCash(room);
    this.touch(room);
  }

  start(room, user) {
    this.requireHost(room, user);
    if (room.phase !== 'lobby') bad('当前不能开局');
    const o = room.options;
    const players = [...room.members, ...room.queue].filter(id => room.ready.has(id) && this.isOnline(id)).slice(0, o.seats);
    if (players.length < 2) bad('至少两名在线玩家准备好即可开局');
    const count = o.bots ? o.seats : players.length;
    room.members = [...new Set([...room.members, ...players])];
    room.queue = room.queue.filter(id => !players.includes(id));
    room.seats = Array.from({ length: count }, (_, i) => players[i] || null);
    C.onlineLabels = this.names(room);
    const g = C.Games[o.type].create(count, { ...o, online: true, deferStart: o.type === 'poker' });
    g.online = true; g.humanSeats = room.seats.map((id, i) => id ? i : -1).filter(i => i >= 0);
    if (o.type === 'scout') {
      g.turnStart = g.current; g.orientationConfirmed = room.seats.map(id => !id);
      g.current = g.orientationConfirmed.findIndex(x => !x);
    }
    if (o.type === 'athlete' && g.phase === 'lineup') {
      for (const i of g.humanSeats) g.chosen[i] = [];
      g.current = g.humanSeats[0];
    }
    room.game = g; room.phase = 'playing'; room.requests.clear(); room.takeovers.clear();
    if (!C.Games[o.type].validate(g, room.seats.length)) bad('开局状态无效');
    if (o.type === 'poker' && o.mode === 'cash') this.cashInvariant(room);
    this.touch(room);
  }

  turn(room) {
    const g = room.game, o = room.options;
    if (!g || room.phase !== 'playing' || o.type !== 'poker' || g.betweenHands || g.finished || g.current < 0) return '';
    return [g.handCount, g.street, g.current, g.currentBet, g.players[g.current]?.streetBet].join(':');
  }

  expirePokerTurn(room, key) {
    if (this.turn(room) !== key || !key || Date.now() < room.turnDeadline) return;
    const g = room.game, current = g.current, online = this.isOnline(room.seats[current]);
    C.onlineLabels = this.names(room);
    C.Games.poker.act(g, online && g.currentBet <= g.players[current].streetBet ? 'p-call' : 'p-fold', {});
    if (g.betweenHands && room.options.mode === 'cash') this.admitCash(room);
    if (room.options.mode === 'cash') this.cashInvariant(room);
    this.touch(room);
  }

  schedule(room) {
    clearTimeout(room.timer); room.timer = null;
    const g = room.game, o = room.options;
    if (room.phase !== 'playing' || !g) return;
    if (g.finished) { room.phase = 'finished'; return; }
    if (o.type === 'poker') {
      const key = this.turn(room);
      if (key !== room.turnKey) { room.turnKey = key; room.turnDeadline = key ? Date.now() + o.turnSeconds * 1000 : 0; }
      if (!key) return;
      room.timer = setTimeout(() => {
        try { this.expirePokerTurn(room, key); }
        catch (e) { console.error('Poker timeout:', e); }
      }, Math.max(0, room.turnDeadline - Date.now()));
      room.timer.unref(); return;
    }
    if (g.roundPending) return;
    if (o.type === 'scout' && g.orientationPending) {
      const id = room.seats[g.current];
      if (id && !room.takeovers.has(id)) return;
      room.timer = setTimeout(() => { C.onlineLabels = this.names(room); C.Games.scout.act(g, 'c-confirm', {}); this.touch(room); }, 250);
      room.timer.unref(); return;
    }
    if (o.type === 'athlete' && g.phase === 'lineup') {
      const id = room.seats[g.current];
      if (id && !room.takeovers.has(id)) return;
      const i = g.current, pick = g.teams[i].find(x => !g.chosen[i].includes(x));
      room.timer = setTimeout(() => { C.onlineLabels = this.names(room); C.Games.athlete.act(g, 'a-lineup', { id: pick }); this.touch(room); }, 250);
      room.timer.unref(); return;
    }
    const current = g.current, id = current >= 0 ? room.seats[current] : null;
    const waitingHuman = id && !room.takeovers.has(id);
    if (waitingHuman && !(o.type === 'athlete' && !g.pending && g.phase !== 'draft')) return;
    if (o.type === 'athlete' && g.speed === 'step' && !g.pending && g.phase !== 'draft') return;
    room.timer = setTimeout(() => {
      C.onlineLabels = this.names(room);
      try {
        if (o.type === 'athlete' && g.phase !== 'draft') C.Games.athlete.advance(g, o.difficulty);
        else C.Games[o.type].bot(g, o.difficulty);
        this.touch(room);
      } catch (e) { console.error('Automatic action:', e); }
    }, o.type === 'athlete' ? (g.speed === 'fast' ? 180 : 700) : 350);
    room.timer.unref();
  }

  gameAction(room, user, message) {
    if (room.phase !== 'playing') bad('游戏未运行');
    const g = room.game, o = room.options, engine = C.Games[o.type], action = String(message.action || '');
    if (!action.startsWith({ splendor: 's-', scout: 'c-', poker: 'p-', athlete: 'a-', flip7: 'f-' }[o.type])) bad('行动与游戏不符');
    const seat = this.seat(room, user.id);
    const hostAction = (o.type === 'poker' && action === 'p-next') ||
      (o.type === 'scout' && action === 'c-next-round') || (o.type === 'athlete' && ['a-next', 'a-speed', 'a-step'].includes(action)) ||
      (o.type === 'flip7' && action === 'f-next');
    if (hostAction) this.requireHost(room, user);
    else if (seat < 0) bad('候场玩家不能行动');
    else if (g.current !== seat) bad('尚未轮到你');
    if (o.type === 'poker' && ['p-watch'].includes(action)) bad('联机观战方式由房主控制');
    const data = message.data && typeof message.data === 'object' && !Array.isArray(message.data) ? message.data : {};
    C.onlineLabels = this.names(room);
    engine.act(g, action, data);
    if (!engine.validate(g, room.seats.length)) bad('行动后游戏状态无效');
    if (o.type === 'poker' && action === 'p-next') room.boardChanged = false;
    user.ui = {};
    if (o.type === 'poker' && g.betweenHands && o.mode === 'cash') this.admitCash(room);
    if (o.type === 'poker' && o.mode === 'cash') this.cashInvariant(room);
    this.touch(room);
  }

  admitCash(room) {
    const g = room.game;
    if (!g || room.options.type !== 'poker' || room.options.mode !== 'cash' || !g.betweenHands) return;
    while (room.seats.length < room.options.seats) {
      const id = [...room.members, ...room.queue].find(id => this.seat(room, id) < 0 && room.ready.has(id) && this.isOnline(id));
      if (!id) break;
      room.queue = room.queue.filter(x => x !== id);
      if (!room.members.includes(id)) room.members.push(id);
      room.seats.push(id);
      g.players.push({ stack: g.buyin, buyins: g.buyin, hole: [], committed: 0, streetBet: 0,
        folded: true, allIn: false, needs: false, acted: false, lastAction: '等待下一手' });
      g.n++; g.handHistory = [];
      g.humanSeats = room.seats.map((_, i) => i);
      room.boardChanged = true;
    }
    if (!C.Games.poker.validate(g, g.n)) bad('新玩家入座后状态无效');
    this.cashInvariant(room);
  }

  requestTransfer(room, user, to, amount) {
    this.cashBetween(room);
    const fromSeat = this.seat(room, user.id), toSeat = this.seat(room, to);
    const g = room.game, source = g.players[fromSeat], target = g.players[toSeat];
    if (fromSeat < 0 || toSeat < 0 || fromSeat === toSeat || source.stack >= g.buyin || target.stack <= source.stack ||
        !Number.isSafeInteger(amount) || amount < 1 || amount > target.stack) bad('转让申请无效');
    if ([...room.requests.values()].some(x => x.from === user.id)) bad('请先处理已有申请');
    const request = { id: code(), from: user.id, to, amount };
    room.requests.set(request.id, request); this.touch(room);
  }

  decideTransfer(room, user, requestId, accept) {
    this.cashBetween(room);
    const req = room.requests.get(requestId);
    if (!req || req.to !== user.id) bad('申请不存在');
    room.requests.delete(requestId);
    if (accept) {
      const from = room.game.players[this.seat(room, req.from)], to = room.game.players[this.seat(room, req.to)];
      if (!from || !to || to.stack < req.amount) bad('筹码不足');
      to.stack -= req.amount; from.stack += req.amount;
    }
    this.cashInvariant(room); this.touch(room);
  }

  gift(room, user, to, amount) {
    this.cashBetween(room);
    const fromSeat = this.seat(room, user.id), toSeat = this.seat(room, to), g = room.game;
    if (fromSeat < 0 || toSeat < 0 || fromSeat === toSeat || !Number.isSafeInteger(amount) || amount < 1 ||
        g.players[fromSeat].stack - amount < g.buyin) bad('赠送金额无效');
    g.players[fromSeat].stack -= amount; g.players[toSeat].stack += amount;
    this.cashInvariant(room); this.touch(room);
  }

  cashBetween(room) {
    if (room.phase !== 'playing' || room.options.type !== 'poker' || room.options.mode !== 'cash' || !room.game.betweenHands) bad('只能在现金桌两手之间操作');
  }
  cashInvariant(room) {
    const g = room.game;
    if (g.players.reduce((n, p) => n + p.stack + (g.betweenHands ? 0 : p.committed), 0) !== room.seats.length * g.buyin)
      bad('现金桌总筹码不守恒');
  }

  leaveCash(room, user) {
    this.cashBetween(room);
    const seat = this.seat(room, user.id), g = room.game;
    if (seat < 0 || g.players[seat].stack !== g.buyin) bad('离席前须将筹码调整到初始值');
    room.seats.splice(seat, 1); g.players.splice(seat, 1); g.n--;
    room.ready.delete(user.id);
    g.humanSeats = room.seats.map((_, i) => i);
    const adjust = i => i > seat ? i - 1 : i === seat ? (g.n ? (i + g.n - 1) % g.n : 0) : i;
    g.button = adjust(g.button); g.sb = adjust(g.sb); g.bb = adjust(g.bb);
    g.handHistory = []; room.requests.clear(); room.boardChanged = true;
    this.cashInvariant(room);
    this.admitCash(room);
    if (g.n < 2) room.phase = 'finished';
    this.removeMember(room, user.id);
    user.peer?.send({ type: 'left' });
    this.touch(room);
  }

  takeover(room, user, target) {
    this.requireHost(room, user);
    if (room.phase !== 'playing' || room.options.type === 'poker' || this.seat(room, target) < 0) bad('此座位不能托管');
    const lost = this.identities.get(target);
    if (!lost?.disconnectedAt || Date.now() - lost.disconnectedAt < 120000) bad('玩家掉线满 120 秒后才能托管');
    room.takeovers.add(target); this.touch(room);
  }

  rematch(room, user) {
    this.requireHost(room, user);
    if (room.phase !== 'finished') bad('本局尚未结束');
    for (const id of room.seats) room.ready.delete(id);
    const players = [...room.members, ...room.queue].sort((a, b) => Number(room.ready.has(b)) - Number(room.ready.has(a)));
    room.members = players.slice(0, room.options.seats); room.queue = players.slice(room.options.seats);
    room.phase = 'lobby'; room.game = null; room.seats = []; room.requests.clear();
    this.touch(room);
  }

  closeRoom(room, user) {
    this.requireHost(room, user);
    clearTimeout(room.timer);
    for (const id of [...room.members, ...room.queue]) {
      const member = this.identities.get(id);
      if (member) { member.roomId = null; member.peer?.send({ type: 'left' }); }
    }
    this.rooms.delete(room.id); this.lists();
  }

  preview(room, user, input) {
    if (room.phase !== 'playing' || this.seat(room, user.id) < 0) return;
    const a = String(input.action || ''), d = input.data || {};
    if (a === 's-tier') user.ui.gemTier = int(d.tier, 0, 2) ?? 0;
    else if (a === 's-review') user.ui.gemReview = int(d.id, 0, 89);
    else if (a === 'c-select-show') user.ui.scoutShow = { start: int(d.start, 0, 30), end: int(d.end, 0, 30) };
    else if (a === 'c-recruit-end') user.ui.scoutEnd = d.end === 'right' ? 'right' : 'left';
    else if (a === 'scout-position') user.ui.scoutPosition = int(d.value, 0, 30) ?? 0;
    else if (a === 'scout-flip') user.ui.scoutFlip = d.value === 'true';
    this.sendState(user, room);
  }

  emote(room, user, phrase) {
    if (!EMOTES.includes(phrase) || Date.now() - user.lastEmote < 5000) bad('请稍后再发送表情短句');
    user.lastEmote = Date.now(); room.emotes.set(user.id, { id: user.id, phrase, until: Date.now() + 3500 });
    this.touch(room);
    setTimeout(() => { if (room.emotes.get(user.id)?.until <= Date.now()) { room.emotes.delete(user.id); this.touch(room); } }, 3600).unref();
  }

  handle(user, message) {
    const action = String(message?.kind || '');
    if (action === 'create') return this.create(user, message);
    if (action === 'join') return this.join(user, message.id, message.password);
    const room = this.currentRoom(user);
    if (action === 'leave') return this.leave(user);
    if (action === 'ready') return this.prepare(room, user);
    if (action === 'start') return this.start(room, user);
    if (action === 'preview') return this.preview(room, user, message);
    if (action === 'emote') return this.emote(room, user, message.phrase);
    if (action === 'takeover') return this.takeover(room, user, message.target);
    if (action === 'rematch') return this.rematch(room, user);
    if (action === 'closeRoom') return this.closeRoom(room, user);
    if (action === 'leaveCash') return this.leaveCash(room, user);
    if (action === 'requestTransfer') return this.requestTransfer(room, user, String(message.to), Number(message.amount));
    if (action === 'decideTransfer') return this.decideTransfer(room, user, String(message.id), message.accept === true);
    if (action === 'gift') return this.gift(room, user, String(message.to), Number(message.amount));
    if (action === 'gameAction') {
      if (message.revision !== room.revision) bad('对局已更新，请按最新画面重试');
      return this.gameAction(room, user, message);
    }
    bad('未知操作');
  }

  publicView(room, user, view) {
    const g = room.game, type = room.options.type, names = this.names(room);
    if (!g) return '';
    const playerName = i => C.playerBadge(i, { onlineSeats: view.seats, onlineEmotes: view.emotes }) + esc(names[i]);
    let rows = '';
    if (type === 'poker') rows = g.players.map((p, i) => `<li>${playerName(i)} · ${p.stack} 筹码${p.folded ? ' · 已弃牌或候场' : ''}</li>`).join('');
    else if (type === 'splendor') rows = g.players.map((p, i) => `<li>${playerName(i)} · ${C.Games.splendor.points(p)} 分 · ${p.gems.join('/')} 筹码</li>`).join('');
    else if (type === 'scout') rows = g.totals.map((score, i) => `<li>${playerName(i)} · ${score} 分 · ${g.hands[i].length} 张手牌</li>`).join('');
    else if (type === 'athlete') rows = g.totals.map((score, i) => `<li>${playerName(i)} · ${score} 分</li>`).join('');
    else rows = g.players.map((p, i) => `<li>${playerName(i)} · ${p.total} 分 · 本轮 ${p.numbers.join('、') || '暂无数字牌'}</li>`).join('');
    const board = type === 'poker' ? `<p>公共牌：${g.board.map(cardName).join(' ') || '尚未翻牌'}</p>` : '';
    let controls = '';
    if (room.host === user.id && room.phase === 'playing') {
      if (type === 'poker' && g.betweenHands) controls = '<button class="primary" data-action="p-next">开启下一手</button>';
      else if (type === 'scout' && g.roundPending) controls = '<button class="primary" data-action="c-next-round">继续下一轮</button>';
      else if (type === 'flip7' && g.roundPending) controls = '<button class="primary" data-action="f-next">继续下一轮</button>';
      else if (type === 'athlete' && g.roundPending) controls = '<button class="primary" data-action="a-next">继续下一场</button>';
    }
    return `<section class="panel"><h2>公开牌桌 · 候场中</h2>${board}<ul class="online-public-seats">${rows}</ul><p>准备后，下一整局有空位时自动入座；现金桌在下一手入座。</p>${controls}</section>`;
  }

  roomView(room, user) {
    return { id: room.id, options: room.options, phase: room.phase, revision: room.revision,
      isHost: room.host === user.id, host: room.host, seat: this.seat(room, user.id),
      members: room.members.map(id => ({ id, nick: this.identities.get(id)?.nick, online: this.isOnline(id), ready: room.ready.has(id), seat: this.seat(room, id), takeover: room.takeovers.has(id) })),
      queue: room.queue.map(id => ({ id, nick: this.identities.get(id)?.nick, online: this.isOnline(id), ready: room.ready.has(id) })),
      seats: room.seats.map((id, i) => ({ id, nick: this.names(room)[i], online: id ? this.isOnline(id) : true, bot: !id })),
      requests: [...room.requests.values()].filter(r => r.from === user.id || r.to === user.id).map(r => ({ ...r, fromNick: this.identities.get(r.from)?.nick, toNick: this.identities.get(r.to)?.nick })),
      cashStacks: room.options.type === 'poker' && room.options.mode === 'cash' && room.game ? room.game.players.map((p, i) => ({ id: room.seats[i], nick: this.names(room)[i], stack: p.stack })) : [],
      betweenHands: !!room.game?.betweenHands, handCount: room.game?.handCount || 0,
      turnDeadline: room.turnDeadline, emotes: [...room.emotes.values()].filter(x => x.until > Date.now()),
      ranks: room.game?.ranks || null };
  }

  sendState(user, room) {
    if (!user.peer) return;
    const view = this.roomView(room, user);
    let gameHtml = '';
    if (room.game && room.phase !== 'lobby') {
      const viewer = this.seat(room, user.id);
      if (viewer < 0) gameHtml = this.publicView(room, user, view);
      else if (room.phase === 'finished' && room.options.type === 'poker' && room.game.n < 2)
        gameHtml = '<section class="panel"><h2>牌桌结束</h2><p>剩余玩家不足两人。</p></section>';
      else {
        C.onlineLabels = this.names(room);
        gameHtml = C.Games[room.options.type].render(room.game, { ...user.ui, viewer, isHost: room.host === user.id,
          waitingHand: room.boardChanged, onlineSeats: view.seats, onlineEmotes: view.emotes });
      }
    }
    user.peer.send({ type: 'state', room: view, gameHtml });
  }

  touch(room) {
    if (!this.rooms.has(room.id)) return;
    room.revision++;
    this.schedule(room);
    for (const id of [...room.members, ...room.queue]) {
      const user = this.identities.get(id);
      if (user?.peer) this.sendState(user, room);
    }
    this.lists();
  }
}

module.exports = { Hub, settings, EMOTES };
