/**
 * A battle's bar over a 2D space (M7.5, D87, docs/specs/tactics.md#the-stage): the page's own controls, so a
 * keyboard, a pad and a screen reader reach every action. A line in an aria-live region says what is
 * previewed and what the foes did; under it the selected unit, its actions (Watch, Reload, Steady, Open, its
 * order, End turn, and Confirm and Cancel while a preview is up) and its targets with their odds. Every button
 * is 44 px at least (battle.css). Buttons are kept by key between models, so the one focused stays focused.
 */

export interface BarButton {
  readonly key: string;
  readonly label: string;
  /** confirm, cancel, end, or an action's kind: for its style and the tests. */
  readonly kind: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly press: () => void;
}

export interface BarModel {
  readonly line: string;
  readonly who: string;
  readonly actions: readonly BarButton[];
  readonly targets: readonly BarButton[];
  /** Said in the targets' place when there are none: the row keeps its height. */
  readonly none: string;
}

export interface BattleBar {
  show(model: BarModel | undefined): void;
  /** The hook's: each button's key, label, kind and box in CSS pixels. */
  shown(): { key: string; label: string; kind: string; pressed: boolean; box: DOMRect }[];
  line(): string;
  /** Its height in CSS pixels, 0 while hidden: what the view keeps clear. */
  height(): number;
  stop(): void;
}

function row(label: string): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'eb-battle-row';
  list.setAttribute('aria-label', label);
  return list;
}

export function createBattleBar(box: HTMLElement): BattleBar {
  const bar = document.createElement('div');
  bar.className = 'eb-battle-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Battle');
  const line = document.createElement('p');
  line.className = 'eb-text eb-battle-line';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  const who = document.createElement('p');
  who.className = 'eb-text eb-battle-who';
  const actions = row('Actions');
  const targets = row('Targets');
  const none = document.createElement('p');
  none.className = 'eb-text eb-battle-none';
  bar.append(line, who, actions, targets, none);
  bar.hidden = true;
  box.append(bar);
  const kept = new Map<string, { button: HTMLButtonElement; item: HTMLLIElement; model: BarButton }>();

  const fill = (list: HTMLUListElement, buttons: readonly BarButton[], prefix: string) => {
    const keys = buttons.map((b) => `${prefix}:${b.key}`);
    for (const [key, { item }] of kept)
      if (key.startsWith(`${prefix}:`) && !keys.includes(key)) {
        item.remove();
        kept.delete(key);
      }
    buttons.forEach((model, i) => {
      const key = keys[i] as string;
      let entry = kept.get(key);
      if (!entry) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'eb-battle-button';
        button.addEventListener('click', () => kept.get(key)?.model.press());
        item.append(button);
        entry = { button, item, model };
        kept.set(key, entry);
      }
      entry.model = model;
      entry.button.textContent = model.label;
      entry.button.dataset.kind = model.kind;
      entry.button.dataset.key = model.key;
      entry.button.disabled = model.disabled === true;
      if (model.pressed === undefined) entry.button.removeAttribute('aria-pressed');
      else entry.button.setAttribute('aria-pressed', String(model.pressed));
      // Moved only when out of place, so a focused button isn't taken out and put back.
      if (list.children[i] !== entry.item) list.insertBefore(entry.item, list.children[i] ?? null);
    });
    list.hidden = buttons.length === 0;
  };

  return {
    show(model) {
      bar.hidden = model === undefined;
      if (!model) return;
      if (line.textContent !== model.line) line.textContent = model.line;
      who.textContent = model.who;
      who.hidden = model.who === '';
      fill(actions, model.actions, 'a');
      fill(targets, model.targets, 't');
      none.textContent = model.none;
      none.hidden = model.targets.length > 0 || model.none === '';
    },
    shown: () =>
      [...kept.values()].map(({ button, model }) => ({
        key: model.key,
        label: model.label,
        kind: model.kind,
        pressed: model.pressed === true,
        box: button.getBoundingClientRect(),
      })),
    line: () => line.textContent ?? '',
    height: () => (bar.hidden ? 0 : bar.offsetHeight),
    stop() {
      bar.remove();
    },
  };
}
