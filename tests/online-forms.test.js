'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const forms = require('../js/online-forms');

function form(id, values) {
  const elements = Object.entries(values).map(([name, value]) => ({ name, value: String(value), type: 'text', required: false,
    minLength: -1, maxLength: -1, validity: { valid: true }, getAttribute() { return null; } }));
  elements.namedItem = name => elements.find(field => field.name === name);
  const result = { id, elements, getAttribute(name) { return name === 'id' ? id : null; } };
  for (const field of elements) field.form = result;
  return result;
}

test('joining accepts copied codes and invitation links without navigating to their host', () => {
  assert.equal(forms.roomCode('  ab1234cdef  '), 'AB1234CDEF');
  assert.equal(forms.roomCode('https://example.test/online.html?room=ab1234cdef&extra=1'), 'AB1234CDEF');
  for (const value of ['', 'AB1234', 'https://example.test/', 'https://example.test/?room=wrong', 'javascript:alert(1)']) assert.equal(forms.roomCode(value), '');
  const join = form('join-form', { id: 'https://example.test/online.html?room=ab1234cdef' });
  join.id = join.elements.namedItem('id'); // Browsers expose a named input ahead of form.id.
  assert.equal(forms.message(join.elements.namedItem('id'), '房间码'), '');
  join.elements.namedItem('id').value = 'wrong';
  assert.match(forms.message(join.elements.namedItem('id'), '房间码'), /10 位房间码/);
});

test('room drafts retain all settings and unchecked boxes across reconstruction', () => {
  const original = form('create-form', { type: 'poker', seats: 3, difficulty: 'hard', bots: '', password: 'test-only', buyin: 450, blindEvery: 0 });
  const bots = original.elements.namedItem('bots'); bots.type = 'checkbox'; bots.checked = false;
  const draft = forms.snapshot(original);
  assert.equal(draft.type, undefined, 'the game selector must keep the newly selected game');
  const replacement = form('create-form', { type: 'splendor', seats: 4, difficulty: 'easy', bots: '', password: '', buyin: 200, blindEvery: 10 });
  replacement.elements.namedItem('bots').type = 'checkbox'; replacement.elements.namedItem('bots').checked = true;
  forms.restore(replacement, draft);
  assert.equal(replacement.elements.namedItem('type').value, 'splendor');
  for (const name of ['seats', 'difficulty', 'password', 'buyin', 'blindEvery']) assert.equal(replacement.elements.namedItem(name).value, original.elements.namedItem(name).value);
  assert.equal(replacement.elements.namedItem('bots').checked, false);
});

test('poker errors identify the conflicting field before a room can be created', () => {
  const poker = form('create-form', { small: 5, big: 5, buyin: 90 });
  assert.match(forms.message(poker.elements.namedItem('big'), '大盲'), /大于小盲/);
  assert.match(forms.message(poker.elements.namedItem('buyin'), '初始筹码'), /100/);
  poker.elements.namedItem('small').value = '2'; poker.elements.namedItem('buyin').value = '100';
  assert.equal(forms.message(poker.elements.namedItem('big'), '大盲'), '');
  assert.equal(forms.message(poker.elements.namedItem('buyin'), '初始筹码'), '');
});

test('restored short passwords and whitespace nicknames still receive inline errors', () => {
  const create = form('create-form', { password: 'ab' });
  create.elements.namedItem('password').minLength = 4;
  assert.match(forms.message(create.elements.namedItem('password'), '房间密码'), /4 个字符/);
  create.elements.namedItem('password').value = '';
  assert.equal(forms.message(create.elements.namedItem('password'), '房间密码'), '');
  const identity = form('identity-form', { nick: '   ' });
  identity.elements.namedItem('nick').required = true;
  assert.equal(forms.message(identity.elements.namedItem('nick'), '昵称'), '请填写昵称');
  identity.elements.namedItem('nick').value = '新人甲';
  assert.equal(forms.message(identity.elements.namedItem('nick'), '昵称'), '');
});
