const assert = require('node:assert/strict');
const { Hub } = require('../server/rooms');
const C = require('../server/engines');

function peer() { return { packets: [], send(packet) { this.packets.push(packet); }, close() {} }; }
function setup(type, options = {}, people = type === 'flip7' ? 3 : 2) {
  const hub = new Hub(), users = Array.from({ length: people }, (_, i) => hub.identity('玩家' + (i + 1)));
  users.forEach(u => hub.connect(u, peer()));
  const room = hub.create(users[0], { type, seats: Math.max(C.limits[type][0], people), difficulty: 'medium',
    bots: false, mode: 'cash', buyin: 200, small: 1, big: 2, turnSeconds: 120, ...options });
  users.slice(1).forEach(u => hub.join(u, room.id, options.password || ''));
  users.forEach(u => hub.prepare(room, u));
  hub.start(room, users[0]);
  return { hub, users, room, g: room.game };
}
function act(ctx, user, action, data = {}) {
  ctx.hub.gameAction(ctx.room, user, { action, data });
}
function chips(room) {
  const g = room.game;
  return g.players.reduce((sum, p) => sum + p.stack + (g.betweenHands ? 0 : p.committed), 0);
}

{
  const ctx = setup('splendor'), { g, users, room, hub } = ctx;
  assert.equal(room.phase, 'playing');
  assert.equal(g.current, 0);
  act(ctx, users[0], 's-reserve', { id: g.market[0][0] });
  assert.equal(g.current, 1);
  assert.throws(() => act(ctx, users[0], 's-reserve', { id: g.market[0][0] }), /尚未轮到你/);
  const html = users[1].peer.packets.filter(x => x.type === 'state').at(-1).gameHtml;
  assert(html.includes('你的商会'));
  assert(!html.includes('data-action="s-buy" data-id="' + g.players[0].reserved[0] + '"'), 'opponent reserved card must not be purchasable');
  assert.equal(hub.seat(room, users[1].id), 1);
}
{
  const ctx = setup('scout'), { g, users } = ctx;
  assert(g.orientationPending);
  act(ctx, users[0], 'c-confirm');
  assert(g.orientationPending);
  act(ctx, users[1], 'c-confirm');
  assert(!g.orientationPending);
  const current = users[g.current], show = C.Games.scout.legalShows(g, g.current)[0];
  assert(show);
  act(ctx, current, 'c-show', { start: show.start, end: show.end });
  assert(C.Games.scout.validate(g, 2));
}
{
  const ctx = setup('athlete', { draftMode: 'random' }), { g, users } = ctx;
  assert.equal(g.phase, 'lineup');
  for (const user of users) {
    const seat = ctx.hub.seat(ctx.room, user.id);
    while (g.phase === 'lineup' && g.current === seat) act(ctx, user, 'a-lineup', { id: g.teams[seat].find(id => !g.chosen[seat].includes(id)) });
  }
  assert.equal(g.phase, 'prepare');
  assert(C.Games.athlete.validate(g, 2));
}
{
  const ctx = setup('flip7'), { g, users } = ctx;
  for (let i = 0; i < 12 && g.current < 0 && !g.roundPending; i++) C.Games.flip7.bot(g, 'medium');
  assert(g.current >= 0 || g.roundPending);
  if (g.current >= 0) act(ctx, users[g.current], g.pending ? 'f-target' : 'f-hit', g.pending ? { target: g.pending.candidates[0] } : {});
  const html = users[0].peer.packets.filter(x => x.type === 'state').at(-1).gameHtml;
  assert(!html.includes('剩余数字牌'), 'online view must hide remaining deck composition');
  assert(C.Games.flip7.validate(g, 3));
}
{
  const ctx = setup('poker'), { g, users, room, hub } = ctx;
  assert(g.betweenHands && g.handCount === 0);
  assert.throws(() => act(ctx, users[1], 'p-next'), /只有房主/);
  act(ctx, users[0], 'p-next');
  assert(!g.betweenHands);
  const currentState = users[0].peer.packets.filter(x => x.type === 'state').at(-1);
  assert(currentState.room.turnDeadline > Date.now(), 'current turn deadline must be broadcast immediately');
  const opponent = g.players[1].hole.map(id => ({ rank: id % 13 + 2, suit: Math.floor(id / 13) }));
  const html = users[0].peer.packets.filter(x => x.type === 'state').at(-1).gameHtml;
  assert(!html.includes('本手未发出公共牌'));
  assert.equal((html.match(/class="hero-cards"/g) || []).length, 1);
  assert.equal(g.players.reduce((n, p) => n + p.stack + p.committed, 0), 400);
  assert.equal(chips(room), room.seats.length * g.buyin);
  assert.equal(opponent.length, 2);
  while (!g.betweenHands) act(ctx, users[g.current], 'p-fold');
  assert.equal(g.players.reduce((n, p) => n + p.stack, 0), 400);
  assert.equal(chips(room), room.seats.length * g.buyin);
  const loser = g.players.findIndex(p => p.stack < g.buyin), winner = 1 - loser;
  const amount = g.buyin - g.players[loser].stack;
  hub.requestTransfer(room, users[loser], users[winner].id, amount);
  const requestId = [...room.requests.keys()][0];
  hub.decideTransfer(room, users[winner], requestId, true);
  assert.equal(g.players[loser].stack, 200);
  assert.equal(chips(room), room.seats.length * g.buyin);
  hub.leaveCash(room, users[loser]);
  assert.equal(g.n, 1);
  assert.equal(g.players[0].stack, 200);
  assert.equal(room.phase, 'finished');
}
{
  const hub = new Hub(), host = hub.identity('房主'), guest = hub.identity('朋友');
  hub.connect(host, peer()); hub.connect(guest, peer());
  const room = hub.create(host, { type: 'poker', seats: 3, difficulty: 'medium', mode: 'cash', buyin: 200, small: 1, big: 2, turnSeconds: 120, password: 'abcd' });
  assert.throws(() => hub.join(guest, room.id, 'nope'), /密码错误/);
  hub.join(guest, room.id, 'abcd');
  hub.prepare(room, host); hub.prepare(room, guest); hub.start(room, host);
  const newcomer = hub.identity('后来者'); hub.connect(newcomer, peer()); hub.join(newcomer, room.id, 'abcd');
  assert.equal(room.queue.length, 1);
  hub.gameAction(room, host, { action: 'p-next' });
  hub.prepare(room, newcomer);
  assert.equal(hub.seat(room, newcomer.id), -1, 'ready newcomer waits until the current hand finishes');
  while (!room.game.betweenHands) hub.gameAction(room, hub.identities.get(room.seats[room.game.current]), { action: 'p-fold' });
  hub.admitCash(room);
  assert.equal(room.game.n, 3);
  assert.equal(room.game.players.reduce((n, p) => n + p.stack, 0), 600);
  assert.equal(chips(room), room.seats.length * room.game.buyin);
  assert.equal(room.queue.length, 0);
}

{
  const hub = new Hub(), users = Array.from({ length: 11 }, (_, i) => hub.identity('人' + i));
  users.slice(0, 10).forEach(u => hub.connect(u, peer()));
  assert.equal(hub.onlineCount(), 10);
  assert.throws(() => hub.connect(users[10], peer()), /10 人在线上限/);
  hub.disconnect(users[0], users[0].peer);
  hub.connect(users[10], peer());
  assert.equal(hub.onlineCount(), 10);
}

{
  const ctx = setup('splendor', { seats: 3, bots: true }), { hub, users, room } = ctx;
  const queued = hub.identity('候场'); hub.connect(queued, peer()); hub.join(queued, room.id);
  assert.equal(hub.seat(room, queued.id), -1);
  assert.throws(() => hub.gameAction(room, queued, { action: 's-toggle', data: { color: 0 } }), /候场玩家/);
  room.game.finished = true; hub.touch(room);
  assert.equal(room.phase, 'finished');
  hub.rematch(room, users[0]);
  assert(room.members.includes(queued.id));
  assert.equal(room.phase, 'lobby');
}

{
  const ctx = setup('poker'), { hub, users, room, g } = ctx;
  act(ctx, users[0], 'p-next');
  const first = users[g.current];
  act(ctx, first, 'p-call');
  assert.equal(g.currentBet, g.players[g.current].streetBet);
  const checked = g.current, oldStreet = g.street;
  room.turnDeadline = Date.now() - 1;
  hub.expirePokerTurn(room, hub.turn(room));
  assert.equal(g.players[checked].lastAction, '过牌');
  assert.notEqual(g.street, oldStreet);
  while (!g.betweenHands) act(ctx, users[g.current], 'p-fold');
  act(ctx, users[0], 'p-next');
  const offline = users[g.current], seat = g.current;
  hub.disconnect(offline, offline.peer);
  room.turnDeadline = Date.now() - 1;
  hub.expirePokerTurn(room, hub.turn(room));
  assert.equal(g.players[seat].lastAction, '弃牌');
  assert.equal(chips(room), 400);
}

{
  const ctx = setup('scout'), { hub, users, room } = ctx;
  const lost = users[1]; hub.disconnect(lost, lost.peer);
  lost.disconnectedAt = Date.now() - 121000;
  hub.takeover(room, users[0], lost.id);
  assert(room.takeovers.has(lost.id));
  hub.connect(lost, peer());
  assert(!room.takeovers.has(lost.id));
}

{
  const ctx = setup('scout'), { g, users, room, hub } = ctx;
  users.forEach(u => act(ctx, u, 'c-confirm'));
  for (let i = 0; i < 1000 && !g.roundPending; i++) C.Games.scout.bot(g, 'medium');
  assert(g.roundPending, 'first Scout round should settle');
  act(ctx, users[0], 'c-next-round');
  assert(g.orientationPending);
  assert.deepEqual(Array.from(g.orientationConfirmed), [false, false]);
  act(ctx, users[0], 'c-confirm');
  act(ctx, users[1], 'c-confirm');
  assert(!g.orientationPending);
  assert(C.Games.scout.validate(g, room.seats.length));
  hub.touch(room);
}

{
  const ctx = setup('poker', { mode: 'tournament', seats: 3, blindEvery: 1 }, 3);
  const { g, room, users } = ctx;
  for (let hands = 0; room.phase === 'playing' && hands < 100; hands++) {
    act(ctx, users[0], 'p-next');
    for (let turns = 0; !g.betweenHands && turns < 100; turns++) {
      act(ctx, users[g.current], 'p-call');
      assert(C.Games.poker.validate(g, 3));
    }
    ctx.hub.schedule(room);
  }
  assert.equal(room.phase, 'finished');
  assert.equal(g.players.reduce((sum, p) => sum + p.stack, 0), 600);
}

console.log('Online room and game checks passed.');

for (const type of Object.keys(C.names)) {
  for (const bots of [false, true]) {
    const hub = new Hub(), users = Array.from({ length: 3 }, (_, i) => hub.identity('准备测试' + i));
    users.forEach(u => hub.connect(u, peer()));
    const room = hub.create(users[0], { type, seats: 4, difficulty: 'medium', bots,
      buyin: 200, small: 1, big: 2, mode: 'cash', draftMode: 'random' });
    users.slice(1).forEach(u => hub.join(u, room.id));
    hub.prepare(room, users[0]);
    assert.throws(() => hub.start(room, users[0]), /至少两名在线玩家准备好/);
    assert.equal(room.game, null);
    hub.prepare(room, users[1]);
    hub.disconnect(users[1], users[1].peer);
    assert.throws(() => hub.start(room, users[0]), /至少两名在线玩家准备好/);
    hub.connect(users[1], peer());
    hub.start(room, users[0]);
    assert.equal(room.seats.length, bots && type !== 'poker' ? 4 : 2);
    assert.equal(hub.seat(room, users[2].id), -1, 'unready room member does not play');
    assert.deepEqual(Array.from(room.game.humanSeats), [0, 1]);
    assert(C.Games[type].validate(room.game, room.seats.length));
    const before = JSON.stringify(room.game);
    hub.prepare(room, users[2]);
    if (type === 'poker') {
      assert.equal(hub.seat(room, users[2].id), 2, 'ready player joins before the first hand automatically');
      assert.equal(chips(room), 600);
      assert.equal(room.members.filter(id => id === users[2].id).length, 1);
      assert.throws(() => hub.prepare(room, users[2]), /当前不能准备/);
    } else {
      assert.equal(JSON.stringify(room.game), before, 'waiting readiness preserves current cards and scores');
      room.game.finished = true; hub.touch(room);
      hub.rematch(room, users[0]);
      assert(room.ready.has(users[2].id), 'waiting player stays ready across rematch');
      hub.prepare(room, users[0]); hub.start(room, users[0]);
      assert(hub.seat(room, users[2].id) >= 0, 'ready waiting player automatically plays the next game');
      assert.equal(hub.seat(room, users[1].id), -1, 'other unready players do not block the next game');
    }
    hub.closeRoom(room, users[0]);
  }
}
assert.throws(() => C.Games.flip7.create(2), /3–6 人/, 'solo player limits remain unchanged');

{
  const ctx = setup('poker', { seats: 4 }), { hub, room, users } = ctx;
  act(ctx, users[0], 'p-next');
  const later = Array.from({ length: 3 }, (_, i) => hub.identity('后来准备' + i));
  later.forEach(u => { hub.connect(u, peer()); hub.join(u, room.id); });
  hub.prepare(room, later[0]); hub.prepare(room, later[0]);
  hub.prepare(room, later[1]); hub.prepare(room, later[2]);
  hub.disconnect(later[2], later[2].peer);
  assert.equal(room.seats.length, 2, 'readiness during a hand never changes dealt seats');
  while (!room.game.betweenHands) act(ctx, hub.identities.get(room.seats[room.game.current]), 'p-fold');
  assert.equal(hub.seat(room, later[0].id), -1, 'canceled readiness does not admit a player');
  assert.equal(hub.seat(room, later[1].id), 2);
  assert.equal(hub.seat(room, later[2].id), -1, 'offline ready players wait until they reconnect');
  hub.connect(later[2], peer());
  assert.equal(hub.seat(room, later[2].id), 3, 'reconnected ready player is automatically admitted between hands');
  assert.equal(chips(room), 800);
  hub.prepare(room, later[0]);
  assert.equal(hub.seat(room, later[0].id), -1, 'full tables keep prepared players waiting');
  assert.equal(room.seats.length, 4);
  hub.closeRoom(room, users[0]);
}

{
  const hub = new Hub(), users = Array.from({ length: 3 }, (_, i) => hub.identity('房主旁观' + i));
  users.forEach(u => hub.connect(u, peer()));
  const room = hub.create(users[0], { type: 'poker', seats: 3, difficulty: 'medium', buyin: 200, small: 1, big: 2 });
  users.slice(1).forEach(u => { hub.join(u, room.id); hub.prepare(room, u); });
  hub.start(room, users[0]);
  assert.equal(hub.seat(room, users[0].id), -1);
  assert(users[0].peer.packets.filter(p => p.type === 'state').at(-1).gameHtml.includes('data-action="p-next"'));
  hub.gameAction(room, users[0], { action: 'p-next' });
  assert(!room.game.betweenHands, 'unready host can start a hand for two ready players');
  assert.throws(() => hub.gameAction(room, users[0], { action: 'p-fold' }), /候场玩家/);
  hub.closeRoom(room, users[0]);
}

for (const type of Object.keys(C.names)) {
  const ctx = setup(type), { hub, users, room } = ctx;
  const before = JSON.stringify(room.game);
  hub.emote(room, users[0], '好牌！'); hub.emote(room, users[1], '漂亮！');
  const packet = users[0].peer.packets.filter(p => p.type === 'state').at(-1);
  assert.equal(packet.room.emotes.length, 2, 'simultaneous players keep their own speech bubbles');
  assert(packet.gameHtml.includes('data-player-seat="0"'));
  assert(packet.gameHtml.includes('data-player-seat="1"'));
  assert(packet.gameHtml.includes('好牌！') && packet.gameHtml.includes('漂亮！'));
  assert.equal(JSON.stringify(room.game), before, 'speech bubbles do not change the game');
  assert.throws(() => hub.emote(room, users[0], '好牌！'), /请稍后/);
  assert(!packet.gameHtml.includes('undefined') && !packet.gameHtml.includes('NaN'));
  room.emotes.get(users[0].id).until = Date.now() - 1;
  hub.touch(room);
  assert(!users[0].peer.packets.filter(p => p.type === 'state').at(-1).gameHtml.includes('好牌！'));
  hub.closeRoom(room, users[0]);
}
console.log('Ready-to-play regressions passed: all five games, two ready players, offline and unready exclusions, automatic admission, cancellation, capacity, rematch, spectator hosts, avatars and independent speech bubbles.');

{
  const ctx = setup('poker', { mode: 'tournament', seats: 3 }), { hub, room, users } = ctx;
  const later = hub.identity('锦标赛候场'); hub.connect(later, peer()); hub.join(later, room.id);
  const before = JSON.stringify(room.game);
  hub.prepare(room, later);
  assert.equal(hub.seat(room, later.id), -1, 'tournament readiness waits for a new tournament');
  assert.equal(JSON.stringify(room.game), before, 'late readiness never adds chips to an ongoing tournament');
  room.game.finished = true; hub.touch(room); hub.rematch(room, users[0]);
  assert(room.ready.has(later.id));
  hub.prepare(room, users[0]); hub.start(room, users[0]);
  assert(hub.seat(room, later.id) >= 0);
  assert(C.Games.poker.validate(room.game, 2));
  assert.equal(chips(room), 400);
  hub.closeRoom(room, users[0]);
}
{
  const ctx = setup('splendor', { seats: 3, bots: true }), { hub, room, users } = ctx;
  const later = hub.identity('自动加入下一局'); hub.connect(later, peer()); hub.join(later, room.id);
  hub.prepare(room, later);
  assert.equal(hub.seat(room, later.id), -1, 'ready newcomer cannot replace an active computer midgame');
  room.game.finished = true; hub.touch(room); hub.rematch(room, users[0]);
  assert(room.members.includes(later.id) && room.ready.has(later.id));
  hub.prepare(room, users[0]); hub.start(room, users[0]);
  assert(hub.seat(room, later.id) >= 0);
  assert.equal(room.seats.filter(id => !id).length, 1);
  hub.closeRoom(room, users[0]);
}
console.log('Late readiness checks passed: tournaments conserve chips and prepared spectators replace computer seats in the next full game.');
{
  const g = C.Games.flip7.create(2, { online: true });
  for (let i = 0; i < 10000 && !g.finished; i++) {
    if (g.roundPending) C.Games.flip7.act(g, 'f-next');
    else C.Games.flip7.bot(g, 'medium');
    assert(C.Games.flip7.validate(g, 2));
  }
  assert(g.finished && g.ranks.length === 2, 'two-player online Flip 7 can complete a full game');
}
console.log('Two-player online Flip 7 completes with valid cards, special effects, round scores and rankings.');
