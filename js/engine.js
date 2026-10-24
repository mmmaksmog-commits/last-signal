// Движок квеста: хранит состояние, применяет выборы, ничего не знает о DOM.

export const O2_START = 60;
const DEFAULT_COST = 3;

/** Код рубки связи: 4 разные цифры, первая — 7 (подсказка из диктофона). */
export function generateCode() {
  const digits = [0, 1, 2, 3, 4, 5, 6, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return '7' + digits.slice(0, 3).join('');
}

export function newState() {
  return {
    scene: 'wake',
    inv: [],
    flags: {},
    visits: { wake: 1 },
    trust: 0,
    o2: O2_START,
    code: generateCode(),
    steps: 0,
  };
}

export class Engine {
  constructor(story, state = newState()) {
    this.story = story;
    this.state = state;
  }

  get node() {
    return this.story[this.state.scene];
  }

  get isEnding() {
    return Boolean(this.node.ending);
  }

  lines() {
    const { text } = this.node;
    const list = typeof text === 'function' ? text(this.state) : text;
    return list
      .filter(Boolean)
      .map((l) => (typeof l === 'string' ? { who: 'narrator', t: l } : l));
  }

  choices() {
    return (this.node.choices || []).filter((c) => !c.if || c.if(this.state));
  }

  /** Применяет выбор. Возвращает { puzzle } если выбор запускает мини-игру. */
  choose(choice) {
    const s = this.state;
    s.o2 = Math.max(0, s.o2 - (choice.cost ?? DEFAULT_COST));
    s.steps += 1;
    choice.do?.(s);
    if (choice.puzzle) return { puzzle: choice.puzzle };
    this.goto(choice.to);
    return {};
  }

  /** Переход в сцену с проверкой кислорода. */
  goto(id) {
    const target = this.story[id];
    if (!target) throw new Error(`Нет сцены «${id}»`);
    if (this.state.o2 <= 0 && !target.ending) id = 'end_oxygen';
    this.state.scene = id;
    this.state.visits[id] = (this.state.visits[id] || 0) + 1;
    this.story[id].onEnter?.(this.state);
  }

  spendO2(amount) {
    this.state.o2 = Math.max(0, this.state.o2 - amount);
  }
}
