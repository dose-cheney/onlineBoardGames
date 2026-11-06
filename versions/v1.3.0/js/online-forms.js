(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnlineForms = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function roomCode(value) {
    let code = String(value || '').trim();
    if (/^https?:\/\//i.test(code)) {
      try { code = new URL(code).searchParams.get('room') || ''; } catch { return ''; }
    }
    return /^[a-f0-9]{10}$/i.test(code) ? code.toUpperCase() : '';
  }
  function snapshot(form) {
    return Object.fromEntries([...form.elements].filter(field => field.name && field.name !== 'type').map(field =>
      [field.name, { value: field.value, checked: field.checked, invalid: field.getAttribute('aria-invalid') === 'true' }]));
  }
  function restore(form, draft) {
    for (const [name, saved] of Object.entries(draft || {})) {
      const field = form.elements.namedItem(name);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = saved.checked;
      else field.value = saved.value;
    }
  }
  function message(field, name) {
    const validity = field.validity;
    if (validity.badInput) return `${name}请输入有效数字`;
    if (validity.valueMissing || (field.required && !field.value.trim())) return `请填写${name}`;
    if (validity.rangeUnderflow) return `${name}不能小于 ${field.min}`;
    if (validity.rangeOverflow) return `${name}不能大于 ${field.max}`;
    if (validity.stepMismatch) return field.name.startsWith('mj-price-') ? `${name}最多保留两位小数` : `${name}请输入整数`;
    if (validity.tooShort || (field.value && field.minLength > 0 && field.value.length < field.minLength)) return `${name}至少需要 ${field.minLength} 个字符`;
    if (validity.tooLong || (field.maxLength >= 0 && field.value.length > field.maxLength)) return `${name}最多允许 ${field.maxLength} 个字符`;
    if (!validity.valid) return `请检查${name}的格式`;
    if (field.name === 'nick' && !/^[\p{L}\p{N}_ -]{1,16}$/u.test(field.value.trim())) return '昵称可用中文、字母、数字、空格、下划线和短横线';
    if (field.form.getAttribute('id') === 'join-form' && field.name === 'id' && !roomCode(field.value)) return '请输入 10 位房间码，或粘贴完整邀请链接';
    if (field.form.getAttribute('id') === 'create-form') {
      const value = key => Number(field.form.elements.namedItem(key)?.value);
      if (field.name === 'big' && value('big') <= value('small')) return '大盲必须大于小盲';
      if (field.name === 'buyin' && value('buyin') < value('big') * 20) return `初始筹码至少为大盲的 20 倍（${value('big') * 20}）`;
    }
    return '';
  }
  return { roomCode, snapshot, restore, message };
});
