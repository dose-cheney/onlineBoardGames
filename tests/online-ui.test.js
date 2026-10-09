'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const forms = require('../js/online-forms');

async function harness() {
  const handlers = {}, sent = [], feedback = new Map(), sockets = [];
  const app = { innerHTML: '', classList: { toggle() {} }, querySelectorAll() { return []; }, addEventListener(name, fn) { handlers[name] = fn; } };
  class Socket { static OPEN = 1; readyState = 1; constructor() { sockets.push(this); } send(value) { sent.push(JSON.parse(value)); } }
  const context = { URL, URLSearchParams, console, OnlineForms: forms, location: { search: '', protocol: 'http:', host: 'localhost', href: 'http://localhost/online.html' },
    document: { activeElement: null, getElementById(id) { return id === 'online-app' ? app : feedback.get(id); }, createElement() { return { setAttribute() {}, remove() { feedback.delete(this.id); } }; } },
    WebSocket: Socket, setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: async path => ({ json: async () => path === '/api/me' ? { id: 'viewer', nick: '测试' } : [] }),
    FormData: class { constructor(form) { this.entries = form.elements.map(field => [field.name, field.value]); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(__dirname + '/../js/online.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  function joinForm(value) {
    const attrs = new Map();
    const field = { name: 'id', value, type: 'text', tagName: 'INPUT', required: true, willValidate: true,
      minLength: -1, maxLength: 512, validity: { valid: true }, focus() { this.focused = true; },
      getAttribute(name) { return attrs.get(name) || null; }, setAttribute(name, text) { attrs.set(name, text); }, removeAttribute(name) { attrs.delete(name); },
      insertAdjacentElement(position, node) { feedback.set(node.id, node); } };
    const form = { id: field, elements: [field], getAttribute(name) { return name === 'id' ? 'join-form' : null; } };
    form.elements.namedItem = name => form.elements.find(item => item.name === name); field.form = form;
    return form;
  }
  return { sent, feedback, joinForm, html() { return app.innerHTML; }, room(type) {
    sockets[0].onmessage({ data: JSON.stringify({ type: 'state', room: { id: 'AB1234CDEF', phase: 'lobby', options: { type, mode: 'cash', seats: 2 },
      members: [{ id: 'viewer', nick: '测试', ready: false, online: true }], queue: [], seat: -1, seats: [], isHost: true, host: 'viewer' }, gameHtml: '' }) });
  }, async submit(form) { let prevented = false; await handlers.submit({ target: form, preventDefault() { prevented = true; } }); assert(prevented); } };
}

test('the real submit handler joins even when a named input shadows form.id', async () => {
  const h = await harness(), form = h.joinForm(' https://example.test/online.html?room=ab1234cdef ');
  assert.equal(form.id, form.elements[0]);
  await h.submit(form);
  assert.deepEqual(h.sent, [{ kind: 'join', id: 'AB1234CDEF' }]);
});

test('an invalid room code stays beside the input and sends no websocket command', async () => {
  const h = await harness(), form = h.joinForm('wrong');
  await h.submit(form);
  assert.equal(h.sent.length, 0);
  assert.equal(form.elements[0].focused, true);
  assert.match(h.feedback.get('join-form-id-feedback').textContent, /10 位房间码/);
});

test('each online game provides an operation guide with the next action', async () => {
  const h = await harness();
  for (const [type, action] of Object.entries({ splendor: '拿宝石', scout: '连续位置', poker: '加注金额', athlete: '选择技能', flip7: '继续翻一张' })) {
    h.room(type);
    assert(h.html().includes('玩法与操作'));
    assert(h.html().includes(action));
    assert(h.html().includes('对局与操作倒计时继续'));
  }
});
