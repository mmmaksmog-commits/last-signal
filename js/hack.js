// Мини-игра «Взлом»: угадай 4-значный код из разных цифр за 6 попыток.
// ● — цифра на своём месте, ○ — цифра есть в коде, но в другой позиции.

import { sfx } from './audio.js';

const ATTEMPTS = 6;

export function score(code, guess) {
  let exact = 0;
  let near = 0;
  for (let i = 0; i < 4; i++) {
    if (guess[i] === code[i]) exact++;
    else if (code.includes(guess[i])) near++;
  }
  return { exact, near };
}

/**
 * Открывает оверлей взлома.
 * @param {{code:string, hint?:string, onFail:()=>boolean, onDone:(won:boolean)=>void}} opts
 * onFail вызывается после каждой неудачной попытки; вернёт false — взлом прерывается (кончился кислород).
 */
export function openHack({ code, hint, onFail, onDone }) {
  const root = document.getElementById('hack');
  const slots = root.querySelector('.hack__slots');
  const history = root.querySelector('.hack__history');
  const status = root.querySelector('.hack__status');
  const pad = root.querySelector('.hack__pad');

  let input = '';
  let left = ATTEMPTS;
  let finished = false;

  history.innerHTML = '';
  root.querySelector('.hack__hint').textContent = hint || 'Подсказок нет. Только интуиция.';
  setStatus(`Попыток: ${left}`);
  draw();
  root.hidden = false;

  function setStatus(text, cls = '') {
    status.textContent = text;
    status.className = `hack__status ${cls}`;
  }

  function draw() {
    slots.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('span');
      el.className = 'hack__slot' + (i === input.length ? ' is-active' : '');
      el.textContent = input[i] ?? '_';
      slots.append(el);
    }
  }

  function press(key) {
    if (finished) return;
    if (key === 'back') input = input.slice(0, -1);
    else if (key === 'enter') return submit();
    else if (input.length < 4) {
      if (input.includes(key)) { setStatus('Цифры в коде не повторяются', 'is-warn'); sfx.error(); return; }
      input += key;
      sfx.tick();
    }
    draw();
  }

  function submit() {
    if (input.length < 4) { setStatus('Нужно 4 цифры', 'is-warn'); return; }
    const { exact, near } = score(code, input);
    const row = document.createElement('li');
    row.innerHTML = `<span class="hack__guess">${input.split('').join(' ')}</span>`
      + `<span class="hack__marks" aria-label="${exact} на месте, ${near} есть в коде">`
      + '●'.repeat(exact) + '○'.repeat(near) + '·'.repeat(4 - exact - near) + '</span>';
    history.append(row);
    input = '';
    left--;

    if (exact === 4) {
      setStatus('ДОСТУП РАЗРЕШЁН', 'is-ok');
      sfx.success();
      return finish(true);
    }
    sfx.error();
    const alive = onFail();
    if (!alive) { setStatus('КИСЛОРОД ЗАКОНЧИЛСЯ', 'is-bad'); return finish(false); }
    if (left === 0) { setStatus('ПАНЕЛЬ ЗАБЛОКИРОВАНА. -10% O₂', 'is-bad'); return finish(false); }
    setStatus(`Неверно. Попыток: ${left} · −3% O₂`, 'is-warn');
    draw();
  }

  function finish(won) {
    finished = true;
    draw();
    cleanup();
    setTimeout(() => { root.hidden = true; onDone(won); }, 1100);
  }

  function onPad(e) {
    const btn = e.target.closest('button[data-key]');
    if (btn) press(btn.dataset.key);
  }

  function onKey(e) {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') press('enter');
    else if (e.key === 'Escape') { left = 0; input = ''; setStatus('Взлом прерван', 'is-bad'); finish(false); }
    else return;
    e.preventDefault();
  }

  function cleanup() {
    pad.removeEventListener('click', onPad);
    window.removeEventListener('keydown', onKey, true);
  }

  pad.addEventListener('click', onPad);
  window.addEventListener('keydown', onKey, true);
}
