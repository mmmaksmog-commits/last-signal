import { Engine, newState } from './engine.js';
import { story, ENDINGS } from './story.js';
import { openHack } from './hack.js';
import { sfx } from './audio.js';

const SAVE_KEY = 'ls_save_v1';
const ENDINGS_KEY = 'ls_endings_v1';
const TYPE_SPEED = 14; // мс на символ

const $ = (sel) => document.querySelector(sel);
const ui = {
  title: $('#title'),
  game: $('#game'),
  log: $('#log'),
  choices: $('#choices'),
  cmd: $('#cmd'),
  input: $('#cmdInput'),
  o2fill: $('#o2fill'),
  o2val: $('#o2val'),
  inv: $('#inv'),
  menu: $('#menu'),
  endings: $('#endings'),
  continueBtn: $('#continueBtn'),
  soundBtns: document.querySelectorAll('[data-action="sound"]'),
};

let engine = null;
let renderId = 0;
let skipTyping = false;

// ---------- Хранилище ----------
const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const save = () => storage.set(SAVE_KEY, engine.state);
const unlocked = () => new Set(storage.get(ENDINGS_KEY, []));

// ---------- Экраны ----------
function showTitle() {
  ui.game.hidden = true;
  ui.title.hidden = false;
  ui.continueBtn.hidden = !storage.get(SAVE_KEY, null);
  document.body.classList.remove('low-o2');
  renderId++;
}

function startGame(state) {
  engine = new Engine(story, state);
  ui.title.hidden = true;
  ui.game.hidden = false;
  ui.log.innerHTML = '';
  if (!state.steps) sfx.alarm();
  render();
}

// ---------- Отрисовка ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scrollDown() {
  ui.log.scrollTop = ui.log.scrollHeight;
}

async function typeLine(el, text, id) {
  if (skipTyping) { el.textContent = text; return; }
  el.classList.add('is-typing');
  for (let i = 0; i < text.length; i++) {
    if (id !== renderId) return;
    if (skipTyping) { el.textContent = text; break; }
    el.textContent += text[i];
    if (i % 2 === 0) sfx.tick();
    if (i % 8 === 0) scrollDown();
    await sleep(text[i] === '.' || text[i] === '—' ? TYPE_SPEED * 6 : TYPE_SPEED);
  }
  el.classList.remove('is-typing');
}

async function render() {
  const id = ++renderId;
  skipTyping = false;
  ui.choices.innerHTML = '';
  ui.cmd.hidden = true;
  updateHud();

  ui.log.querySelectorAll('.scene').forEach((s) => s.classList.add('is-past'));
  const block = document.createElement('div');
  block.className = 'scene';
  ui.log.append(block);

  for (const line of engine.lines()) {
    const p = document.createElement('p');
    p.className = `line line--${line.who}`;
    if (line.who === 'echo' && engine.state.trust < 0) p.classList.add('line--cold');
    block.append(p);
    if (line.who === 'echo') sfx.echo();
    await typeLine(p, line.t, id);
    if (id !== renderId) return;
    scrollDown();
    if (!skipTyping) await sleep(180);
  }

  if (engine.isEnding) return renderEnding(block);
  renderChoices();
  save();
}

function renderChoices() {
  const list = engine.choices();
  list.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.innerHTML = `<span class="choice__num">${i + 1}</span><span>${choice.t}</span>`;
    btn.addEventListener('click', () => pick(choice));
    ui.choices.append(btn);
  });
  ui.cmd.hidden = false;
  if (window.matchMedia('(pointer: fine)').matches) ui.input.focus({ preventScroll: true });
  scrollDown();
}

function renderEnding(block) {
  const { id, title } = engine.node.ending;
  const set = unlocked();
  set.add(id);
  storage.set(ENDINGS_KEY, [...set]);
  storage.remove(SAVE_KEY);
  sfx.ending();

  const card = document.createElement('div');
  card.className = 'ending';
  card.innerHTML = `
    <p class="ending__label">Концовка</p>
    <h2 class="ending__title glitch" data-text="${title}">${title}</h2>
    <p class="ending__count">Открыто ${set.size} из ${ENDINGS.length}</p>
    <div class="ending__actions">
      <button class="btn btn--primary" data-action="new">Сыграть ещё раз</button>
      <button class="btn" data-action="title">В главное меню</button>
    </div>`;
  block.append(card);
  scrollDown();
}

function updateHud() {
  const { o2, inv } = engine.state;
  ui.o2fill.style.width = `${o2}%`;
  ui.o2val.textContent = `${o2}%`;
  document.body.classList.toggle('low-o2', o2 > 0 && o2 < 25);
  ui.inv.innerHTML = inv.length
    ? inv.map((i) => `<span class="inv__item">${i}</span>`).join('')
    : '<span class="inv__empty">инвентарь пуст</span>';
}

function echoPlayer(text) {
  const p = document.createElement('p');
  p.className = 'line line--player';
  p.textContent = `> ${text}`;
  ui.log.lastElementChild?.append(p);
}

function system(text) {
  const p = document.createElement('p');
  p.className = 'line line--sys';
  p.textContent = text;
  ui.log.lastElementChild?.append(p);
  scrollDown();
}

// ---------- Действия игрока ----------
function pick(choice) {
  if (ui.cmd.hidden) return;
  sfx.select();
  echoPlayer(choice.t);
  const result = engine.choose(choice);
  if (result.puzzle) return startHack(result.puzzle);
  render();
}

function startHack({ win, lose }) {
  ui.choices.innerHTML = '';
  ui.cmd.hidden = true;
  const s = engine.state;
  openHack({
    code: s.code,
    hint: s.inv.includes('диктофон') ? 'Запись капитана: код начинается с 7' : '',
    onFail() {
      engine.spendO2(3);
      updateHud();
      return engine.state.o2 > 0;
    },
    onDone(won) {
      if (won) {
        engine.goto(win);
      } else {
        engine.spendO2(10);
        engine.goto(engine.state.o2 > 0 ? lose : 'end_oxygen');
      }
      render();
    },
  });
}

const COMMANDS = {
  help: () => system('Команды: номер варианта · часть текста варианта · инв — инвентарь · o2 — кислород · очистить — очистить экран · меню'),
  inv: () => system(`Инвентарь: ${engine.state.inv.join(', ') || 'пусто'}`),
  o2: () => system(`Кислород: ${engine.state.o2}%`),
  clear: () => { ui.log.querySelectorAll('.scene.is-past').forEach((s) => s.remove()); },
  menu: () => openMenu(),
};
const ALIASES = {
  помощь: 'help', '?': 'help', инв: 'inv', инвентарь: 'inv', i: 'inv',
  кислород: 'o2', статус: 'o2', очистить: 'clear', cls: 'clear', меню: 'menu',
};

function runCommand(raw) {
  const text = raw.trim().toLowerCase();
  if (!text) return;
  const list = engine.choices();
  const num = Number(text);
  if (Number.isInteger(num) && list[num - 1]) return pick(list[num - 1]);

  const cmd = COMMANDS[text] || COMMANDS[ALIASES[text]];
  if (cmd) { echoPlayer(raw); return cmd(); }

  const matches = list.filter((c) => c.t.toLowerCase().includes(text));
  if (matches.length === 1) return pick(matches[0]);
  echoPlayer(raw);
  system(matches.length > 1
    ? 'Неоднозначно. Уточните команду или введите номер.'
    : 'Команда не распознана. Введите help.');
}

// ---------- Меню и концовки ----------
function openMenu() { ui.menu.hidden = false; }
function closeOverlays() { ui.menu.hidden = true; ui.endings.hidden = true; }

function openEndings() {
  const set = unlocked();
  ui.endings.querySelector('.endings__list').innerHTML = ENDINGS
    .map((e, i) => `<li class="${set.has(e.id) ? 'is-open' : ''}">
      <span>${String(i + 1).padStart(2, '0')}</span>${set.has(e.id) ? e.title : '??? ????????'}</li>`)
    .join('');
  ui.endings.querySelector('.endings__count').textContent = `${set.size} / ${ENDINGS.length}`;
  ui.endings.hidden = false;
}

function updateSoundLabels() {
  ui.soundBtns.forEach((b) => { b.textContent = `Звук: ${sfx.enabled ? 'вкл' : 'выкл'}`; });
}

const ACTIONS = {
  new: () => { closeOverlays(); startGame(newState()); },
  continue: () => { closeOverlays(); startGame(storage.get(SAVE_KEY, newState())); },
  title: () => { closeOverlays(); showTitle(); },
  endings: () => { ui.menu.hidden = true; openEndings(); },
  menu: openMenu,
  close: closeOverlays,
  sound: () => { sfx.toggle(); updateSoundLabels(); },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) { ACTIONS[btn.dataset.action]?.(); return; }
  if (e.target.closest('#log')) skipTyping = true;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (!ui.menu.hidden || !ui.endings.hidden)) return closeOverlays();
  if (ui.game.hidden || !$('#hack').hidden) return;
  if (ui.cmd.hidden && (e.key === ' ' || e.key === 'Enter')) { skipTyping = true; e.preventDefault(); }
});

ui.cmd.addEventListener('submit', (e) => {
  e.preventDefault();
  runCommand(ui.input.value);
  ui.input.value = '';
});

updateSoundLabels();
showTitle();
