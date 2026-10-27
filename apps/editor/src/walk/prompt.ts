/**
 * The Interact prompt (M5.9, D71, docs/specs/worldspaces.md#interact): what using the faced object
 * does, and its key, E or the pad's X. It is a button too: a tap or a click uses it, so on a phone it
 * is the touch button, beside Jump and the same height. Drawn in the page's own DOM over the canvas,
 * styled here as touch.ts's are.
 */

export interface Prompt {
  /** The label of what the player faces, and the key that uses it; undefined hides it. */
  show(label: string | undefined, key: string | null): void;
  /** Pressed since the last take. */
  take(): boolean;
  readonly shown: string | undefined;
  dispose(): void;
}

const HEIGHT = 64;

export function createPrompt(box: HTMLElement): Prompt {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'walk-use';
  Object.assign(button.style, {
    position: 'absolute',
    // Left of Jump (touch.ts's, 64 px at 12 px in), at its height, inside the safe area.
    right: `calc(max(12px, env(safe-area-inset-right)) + ${HEIGHT + 12}px)`,
    bottom: 'max(12px, env(safe-area-inset-bottom))',
    minWidth: `${HEIGHT}px`,
    height: `${HEIGHT}px`,
    padding: '0 16px',
    borderRadius: `${HEIGHT / 2}px`,
    border: '2px solid rgb(255 255 255 / 0.8)',
    background: 'rgb(0 0 0 / 0.55)',
    color: '#ffffff',
    font: 'inherit',
    fontWeight: '600',
    touchAction: 'none',
    display: 'none',
    gap: '8px',
    alignItems: 'center',
  } satisfies Partial<CSSStyleDeclaration>);
  const words = document.createElement('span');
  const key = document.createElement('kbd');
  Object.assign(key.style, {
    font: 'inherit',
    padding: '0 6px',
    border: '1px solid currentColor',
    borderRadius: '4px',
  } satisfies Partial<CSSStyleDeclaration>);
  button.append(words, key);
  button.setAttribute('aria-keyshortcuts', 'E');
  box.append(button);

  let pressed = false;
  let shown: string | undefined;
  // pointerdown, not click: the walk takes the pointer for the stick and the look, and a tap is short.
  const press = (event: PointerEvent) => {
    pressed = true;
    event.preventDefault();
    event.stopPropagation();
  };
  // A keyboard on the button itself: Enter and Space press it as they press any button.
  const click = (event: MouseEvent) => {
    if (event.detail === 0) pressed = true;
  };
  // A touch makes no click: the click a tap makes lands where the finger lifts, and what the use
  // opened (a chest, a talk) can be drawn there by then. Main's CI took all a chest held that way,
  // its Take all under a thumb held on the prompt (M6.10). Cancelling pointerdown doesn't stop it.
  const touched = (event: TouchEvent) => event.preventDefault();
  button.addEventListener('pointerdown', press);
  button.addEventListener('click', click);
  button.addEventListener('touchstart', touched, { passive: false });

  return {
    show(label, keyName) {
      shown = label;
      if (label === undefined) {
        button.style.display = 'none';
        return;
      }
      words.textContent = label;
      key.textContent = keyName ?? '';
      key.style.display = keyName === null ? 'none' : 'inline';
      button.style.display = 'flex';
    },
    take() {
      const was = pressed;
      pressed = false;
      return was;
    },
    get shown() {
      return shown;
    },
    dispose() {
      button.removeEventListener('pointerdown', press);
      button.removeEventListener('click', click);
      button.removeEventListener('touchstart', touched);
      button.remove();
    },
  };
}
