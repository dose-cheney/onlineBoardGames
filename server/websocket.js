const crypto = require('node:crypto');

const MAX_MESSAGE = 64 * 1024;

class Peer {
  constructor(socket, head, onMessage, onClose) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.parts = [];
    this.partSize = 0;
    this.onMessage = onMessage;
    this.closed = false;
    this.onClose = onClose;
    socket.on('data', chunk => this.read(chunk));
    socket.on('error', () => this.end());
    socket.on('close', () => this.end());
    if (head.length) queueMicrotask(() => this.read(head));
  }

  frame(opcode, body = Buffer.alloc(0)) {
    if (this.closed || !this.socket.writable) return;
    const size = body.length;
    const header = Buffer.alloc(size < 126 ? 2 : size < 65536 ? 4 : 10);
    header[0] = 0x80 | opcode;
    if (size < 126) header[1] = size;
    else if (size < 65536) { header[1] = 126; header.writeUInt16BE(size, 2); }
    else { header[1] = 127; header.writeBigUInt64BE(BigInt(size), 2); }
    this.socket.write(Buffer.concat([header, body]));
  }

  send(value) { this.frame(1, Buffer.from(JSON.stringify(value))); }
  ping() { this.frame(9); }
  close() { this.frame(8); this.socket.end(); }
  end() {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0], second = this.buffer[1], opcode = first & 15;
      const fin = !!(first & 0x80), masked = !!(second & 0x80);
      let length = second & 127, offset = 2;
      if (!masked || first & 0x70) return this.close();
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const large = this.buffer.readBigUInt64BE(2);
        if (large > BigInt(MAX_MESSAGE)) return this.close();
        length = Number(large); offset = 10;
      }
      if (length > MAX_MESSAGE || this.buffer.length < offset + 4 + length) return length > MAX_MESSAGE ? this.close() : undefined;
      const mask = this.buffer.subarray(offset, offset + 4);
      const data = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      this.buffer = this.buffer.subarray(offset + 4 + length);
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      if (opcode === 8) { this.close(); return; }
      if (opcode === 9) { this.frame(10, data); continue; }
      if (opcode === 10) continue;
      if (opcode === 1) { this.parts = []; this.partSize = 0; }
      else if (opcode !== 0 || !this.parts.length) return this.close();
      this.parts.push(data); this.partSize += data.length;
      if (this.partSize > MAX_MESSAGE) return this.close();
      if (fin) {
        try { this.onMessage(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(this.parts))); }
        catch { this.close(); return; }
        this.parts = []; this.partSize = 0;
      }
    }
  }
}

function upgrade(request, socket, head, onMessage, onClose) {
  const key = request.headers['sec-websocket-key'];
  if (request.headers.upgrade?.toLowerCase() !== 'websocket' || typeof key !== 'string' ||
      Buffer.from(key, 'base64').length !== 16 || request.headers['sec-websocket-version'] !== '13') {
    socket.destroy(); return null;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return new Peer(socket, head, onMessage, onClose);
}

module.exports = { upgrade };
