(function () {
  'use strict';
  const synth = window.speechSynthesis;
  const available = !!synth && typeof window.SpeechSynthesisUtterance === 'function';
  const preferenceKey = 'tablecorner-mahjong-voice';
  let enabled = true, needsInteraction = false, current = null;
  try { enabled = localStorage.getItem(preferenceKey) !== 'off'; } catch { /* Use the default. */ }

  function stop() {
    if (!current) return;
    clearTimeout(current.timeout);
    current = null;
    synth.cancel();
  }

  function play(text, done) {
    stop();
    if (!available || !enabled || needsInteraction || !text) return false;
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    const voices = synth.getVoices().filter(voice => /^zh(?:[-_]|$)/i.test(voice.lang));
    const chinese = voices.find(voice => voice.localService && /^zh[-_]CN$/i.test(voice.lang))
      || voices.find(voice => /^zh[-_]CN$/i.test(voice.lang)) || voices[0];
    if (chinese) {
      utterance.voice = chinese;
      utterance.lang = chinese.lang;
    }

    const playback = { utterance };
    current = playback;
    function finish(cancel = false) {
      if (current !== playback) return;
      clearTimeout(playback.timeout);
      current = null;
      if (cancel) synth.cancel();
      // Playback may fail before speak() returns. Update the table on the next task.
      if (done) setTimeout(done, 0);
    }
    utterance.onend = () => finish();
    utterance.onerror = event => {
      if (current !== playback) return;
      if (event.error === 'not-allowed') needsInteraction = true;
      finish();
    };
    // A missing voice or a stalled speech engine must not freeze a solo table.
    playback.timeout = setTimeout(() => finish(true), 12000);
    try { synth.speak(utterance); }
    catch { finish(); }
    return !!current;
  }

  function toggle(done) {
    if (!available) return;
    enabled = needsInteraction || !enabled;
    needsInteraction = false;
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Keep the in-page setting. */ }
    if (enabled) play('语音已开启', done);
    else stop();
  }

  function button(attribute) {
    const pressed = available && enabled && !needsInteraction;
    const label = !available ? '语音不可用' : needsInteraction ? '启用语音' : pressed ? '语音：开' : '语音：关';
    return '<button ' + attribute + '="mahjong-voice" aria-pressed="' + pressed + '"' +
      (available ? '' : ' disabled') + '>' + label + '</button>';
  }

  window.MahjongVoice = { play, stop, toggle, button, get busy() { return !!current; } };
})();
