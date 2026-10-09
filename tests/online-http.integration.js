const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const { server } = require('../server');

async function run() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  let socket;
  try {
    const landing = await fetch(base + '/');
    assert.equal(landing.status, 200);
    assert((await landing.text()).includes('临时身份联机'));
    const online = await fetch(base + '/online.html');
    assert((await online.text()).includes('js/online-forms.js'));
    const clientForms = await fetch(base + '/js/online-forms.js');
    assert.equal(clientForms.status, 200);
    assert((await clientForms.text()).includes('root.OnlineForms'));
    const profile = await fetch(base + '/api/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick: '网络测试' }) });
    assert.equal(profile.status, 200);
    const cookie = profile.headers.get('set-cookie').split(';')[0];
    assert.equal((await profile.json()).nick, '网络测试');
    const mine = await fetch(base + '/api/me', { headers: { cookie } });
    assert.equal((await mine.json()).nick, '网络测试');
    assert.equal((await fetch(base + '/.git/config')).status, 404);

    socket = net.connect(port, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    const packets = [];
    let handshook = false, buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshook) {
        const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
        assert(buffer.subarray(0, end).toString().includes('101 Switching Protocols'));
        buffer = buffer.subarray(end + 4); handshook = true;
      }
      while (buffer.length >= 2) {
        const len = buffer[1] & 127, head = len === 126 ? 4 : len === 127 ? 10 : 2;
        if (buffer.length < head) break;
        const size = len === 126 ? buffer.readUInt16BE(2) : len === 127 ? Number(buffer.readBigUInt64BE(2)) : len;
        if (buffer.length < head + size) break;
        packets.push(JSON.parse(buffer.subarray(head, head + size).toString()));
        buffer = buffer.subarray(head + size);
      }
    });
    socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${base}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\nCookie: ${cookie}\r\n\r\n`);
    for (let i = 0; i < 100 && !packets.some(x => x.type === 'hello'); i++) await new Promise(r => setTimeout(r, 10));
    assert(packets.some(x => x.type === 'hello'));
    const payload = Buffer.from(JSON.stringify({ kind: 'create', type: 'splendor', seats: 2, difficulty: 'medium' }));
    const mask = crypto.randomBytes(4), frame = Buffer.alloc(2 + 4 + payload.length);
    frame[0] = 0x81; frame[1] = 0x80 | payload.length; mask.copy(frame, 2);
    for (let i = 0; i < payload.length; i++) frame[6 + i] = payload[i] ^ mask[i & 3];
    socket.write(frame);
    for (let i = 0; i < 100 && !packets.some(x => x.type === 'state'); i++) await new Promise(r => setTimeout(r, 10));
    const state = packets.find(x => x.type === 'state');
    assert.equal(state.room.options.type, 'splendor');
    assert.equal(state.room.phase, 'lobby');
  } finally { socket?.destroy(); server.close(); }
}

run().then(() => console.log('HTTP and WebSocket handshake checks passed.')).catch(error => { console.error(error); process.exitCode = 1; server.close(); });
