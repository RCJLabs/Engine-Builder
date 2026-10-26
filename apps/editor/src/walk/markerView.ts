/**
 * The compass strip and the quest markers drawn over the walk (M6.6, D78, docs/specs/markers.md#the-compass-and-the-marker):
 * in the page's own DOM, as the prompt and the touch controls are, in a layer that takes no touch and
 * is clipped to the walk's box. The strip shows while there is a marker to point at: the four points,
 * a pip for each marker with its distance, and the objective's text while its pip is near the middle.
 * A diamond stands over each marker on screen. Hidden from assistive tech: the journal says the same.
 */
import { compassPoints, stripOffset, TEXT_WITHIN } from './markers.ts';

/** A marker as the walk shows it this frame. */
export interface WalkMarker {
  readonly quest: string;
  readonly objective: string;
  readonly text: string;
  readonly at: readonly [number, number, number];
  readonly door?: string;
  /** Degrees from the way the camera faces, right positive, and metres across the ground. */
  readonly bearing: number;
  readonly distance: number;
  /** Where it is drawn, in CSS pixels from the box's top left; null behind the camera or off screen. */
  readonly screen: readonly [number, number] | null;
}

export interface MarkerView {
  draw(shown: readonly WalkMarker[], yaw: number): void;
  dispose(): void;
}

const GOLD = '#ffd75e';
const style = (el: HTMLElement, css: Partial<CSSStyleDeclaration>) => Object.assign(el.style, css);
const metres = (m: number) => `${Math.round(m)} m`;

function diamond(size: number): HTMLElement {
  const d = document.createElement('div');
  style(d, {
    width: `${size}px`,
    height: `${size}px`,
    background: GOLD,
    border: '2px solid #1a1a1a',
    transform: 'rotate(45deg)',
    margin: '0 auto',
  });
  return d;
}

/** A pip, or a marker over the world: a diamond with its distance under it. */
function badge(size: number, kind: string): { el: HTMLElement; words: HTMLElement } {
  const el = document.createElement('div');
  el.className = kind;
  style(el, { position: 'absolute', left: '0', top: '0', textAlign: 'center', willChange: 'transform' });
  const words = document.createElement('div');
  style(words, {
    marginTop: '2px',
    fontSize: '12px',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 2px #000',
  });
  el.append(diamond(size), words);
  return { el, words };
}

export function createMarkerView(box: HTMLElement): MarkerView {
  const layer = document.createElement('div');
  layer.className = 'walk-markers';
  layer.setAttribute('aria-hidden', 'true');
  style(layer, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', color: '#ffffff' });
  const strip = document.createElement('div');
  strip.className = 'walk-compass';
  style(strip, {
    position: 'absolute',
    top: 'max(8px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(320px, calc(100% - 32px))',
    height: '44px',
    borderRadius: '8px',
    background: 'rgb(0 0 0 / 0.6)',
    display: 'none',
  });
  const caption = document.createElement('div');
  caption.className = 'walk-compass-text';
  style(caption, {
    position: 'absolute',
    top: 'calc(max(8px, env(safe-area-inset-top)) + 48px)',
    left: '50%',
    transform: 'translateX(-50%)',
    maxWidth: 'calc(100% - 32px)',
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'rgb(0 0 0 / 0.6)',
    fontSize: '14px',
    display: 'none',
  });
  layer.append(strip, caption);
  box.append(layer);
  const letters = new Map<string, HTMLElement>();
  const pips = new Map<string, ReturnType<typeof badge>>();
  const marks = new Map<string, ReturnType<typeof badge>>();
  const take = (pool: Map<string, ReturnType<typeof badge>>, key: string, size: number, into: HTMLElement) => {
    let found = pool.get(key);
    if (!found) {
      found = badge(size, into === strip ? 'walk-pip' : 'walk-marker');
      pool.set(key, found);
      into.append(found.el);
    }
    return found;
  };
  const drop = (pool: Map<string, ReturnType<typeof badge>>, keep: ReadonlySet<string>) => {
    for (const [key, { el }] of pool) {
      if (keep.has(key)) continue;
      el.remove();
      pool.delete(key);
    }
  };

  return {
    draw(shown, yaw) {
      strip.style.display = shown.length > 0 ? 'block' : 'none';
      const width = strip.clientWidth;
      const at = (offset: number) => (width / 2) * (1 + offset);
      const seen = new Set<string>();
      for (const { label, offset } of shown.length > 0 ? compassPoints(yaw) : []) {
        let el = letters.get(label);
        if (!el) {
          el = document.createElement('div');
          el.textContent = label;
          style(el, { position: 'absolute', top: '4px', left: '0', fontWeight: '700', fontSize: '13px' });
          letters.set(label, el);
          strip.append(el);
        }
        el.style.transform = `translateX(${at(offset) - 5}px)`;
        el.style.display = 'block';
        seen.add(label);
      }
      for (const [label, el] of letters) if (!seen.has(label)) el.style.display = 'none';
      const keys = new Set<string>();
      const onScreen = new Set<string>();
      let middle: WalkMarker | undefined;
      for (const marker of shown) {
        const key = `${marker.quest}/${marker.objective}`;
        keys.add(key);
        const pip = take(pips, key, 8, strip);
        pip.words.textContent = metres(marker.distance);
        pip.el.style.transform = `translate(${at(stripOffset(marker.bearing)) - 20}px, 18px)`;
        pip.el.style.width = '40px';
        if (Math.abs(marker.bearing) <= TEXT_WITHIN && (!middle || marker.distance < middle.distance)) middle = marker;
        if (!marker.screen) continue;
        onScreen.add(key);
        const mark = take(marks, key, 14, layer);
        mark.words.textContent = metres(marker.distance);
        mark.el.style.width = '64px';
        mark.el.style.transform = `translate(${marker.screen[0] - 32}px, ${marker.screen[1] - 9}px)`;
      }
      drop(pips, keys);
      drop(marks, onScreen);
      caption.textContent = middle?.text ?? '';
      caption.style.display = middle ? 'block' : 'none';
    },
    dispose() {
      layer.remove();
    },
  };
}
