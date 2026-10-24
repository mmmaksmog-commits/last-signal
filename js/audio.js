// Простые звуковые эффекты на Web Audio API — без аудиофайлов.

const KEY = 'ls_sound';
let ctx = null;
let enabled = read();

function read() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

function beep(freq, dur, type = 'square', vol = 0.03, delay = 0) {
  if (!enabled) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch { /* звук недоступен — игра работает и без него */ }
}

export const sfx = {
  tick: () => beep(1600 + Math.random() * 500, 0.012, 'square', 0.008),
  echo: () => beep(520, 0.05, 'sine', 0.02),
  select: () => beep(980, 0.05, 'square', 0.02),
  alarm: () => { beep(440, 0.22, 'sawtooth', 0.03); beep(330, 0.22, 'sawtooth', 0.03, 0.25); },
  success: () => { beep(660, 0.08, 'square', 0.03); beep(990, 0.08, 'square', 0.03, 0.09); beep(1320, 0.16, 'square', 0.03, 0.18); },
  error: () => beep(140, 0.25, 'sawtooth', 0.04),
  ending: () => { beep(220, 0.6, 'sine', 0.04); beep(165, 0.9, 'sine', 0.04, 0.5); },
  get enabled() { return enabled; },
  toggle() {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    return enabled;
  },
};
