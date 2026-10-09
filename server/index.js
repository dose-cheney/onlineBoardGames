const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Hub } = require('./rooms');
const { upgrade } = require('./websocket');

const root = path.resolve(__dirname, '..');
const hub = new Hub();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function cookie(request) {
  const item = (request.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('tablecorner-id='));
  return item ? item.slice('tablecorner-id='.length) : '';
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

function body(request) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    request.on('data', chunk => { size += chunk.length; if (size > 2048) { reject(Error('请求过大')); request.destroy(); } else chunks.push(chunk); });
    request.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Error('JSON 格式无效')); } });
    request.on('error', reject);
  });
}

const allowed = name => name === 'landing.html' || name === 'index.html' || name === 'online.html' ||
  /^(styles|visual|tabletop|new-games|online|ui)\.css$/.test(name) ||
  /^js\/[a-z0-9-]+\.js$/.test(name) || /^assets\/[a-z0-9-]+\.(svg|png)$/.test(name);

function serve(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') { response.writeHead(405); response.end(); return; }
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/api/rooms' && request.method === 'GET') return json(response, 200, hub.list());
  if (url.pathname === '/api/me' && request.method === 'GET') {
    const user = hub.getByToken(cookie(request));
    return json(response, 200, user ? { id: user.id, nick: user.nick } : null);
  }
  if (url.pathname === '/api/identity' && request.method === 'POST') {
    body(request).then(input => {
      const user = hub.identity(input.nick);
      const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
      json(response, 200, { id: user.id, nick: user.nick }, { 'Set-Cookie': `tablecorner-id=${user.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure ? '; Secure' : ''}` });
    }).catch(error => json(response, 400, { error: error.message }));
    return;
  }
  if (request.method !== 'GET') return json(response, 404, { error: '不存在' });
  let name;
  try { name = url.pathname === '/' ? 'landing.html' : decodeURIComponent(url.pathname.slice(1)); }
  catch { response.writeHead(400); response.end('Bad path'); return; }
  if (!allowed(name)) { response.writeHead(404); response.end('Not found'); return; }
  const file = path.join(root, name);
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'" });
    response.end(data);
  });
}

const server = http.createServer(serve);
server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  try {
    const remote = request.socket.remoteAddress, localProxy = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    const host = localProxy && request.headers['x-forwarded-host'] || request.headers.host;
    if (new URL(request.url, 'http://localhost').pathname !== '/ws' || !origin || new URL(origin).host !== host) throw Error('来源无效');
    const user = hub.getByToken(cookie(request));
    if (!user) throw Error('请先创建身份');
    if (!user.peer && hub.onlineCount() >= 10) throw Error('已达到 10 人上限');
    let peer;
    peer = upgrade(request, socket, head, raw => {
      try { hub.handle(user, JSON.parse(raw)); }
      catch (error) { peer.send({ type: 'error', message: error.message }); }
    }, () => hub.disconnect(user, peer));
    if (peer) hub.connect(user, peer);
  } catch (error) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy();
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`桌边联机服务：http://${host}:${port}，当前进程最多 10 人在线`));
}

module.exports = { server, hub };
