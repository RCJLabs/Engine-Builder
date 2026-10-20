/**
 * The frame (M4.5, D55, docs/specs/designer.md#the-frame): the screen drawn at a device's size and
 * breakpoint, fitted to the panel by one scale as Dirtbag fits its screen, inert, with the device,
 * the turn and what it draws above it. A tap selects the deepest widget under it.
 */
import { DesignFrame, frameBreakpoint, type LogLine } from '@eb/ui';
import type { Screen, Theme } from '@eb/ui/format';
import type { View } from '@eb/ui/session';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { DEVICES, type Device, fitScale, type Placed, pick, sizeOf } from './frame.ts';
import type { Standing } from './moment.ts';
import { device, turned } from './state.ts';

interface Props {
  readonly id: string;
  readonly screen: Screen;
  readonly theme: Theme | undefined;
  readonly view: View;
  readonly log: readonly LogLine[];
  readonly standing: Standing | null;
  readonly selected: string;
  readonly select: (at: string) => void;
  readonly assetUrl?: (path: string) => string | undefined;
}

/** Each widget's boxes in the frame, as the page lays them out: a widget's own box lays out nothing. */
function placed(frame: HTMLElement): Placed[] {
  return [...frame.querySelectorAll<HTMLElement>('[data-eb-at]')].flatMap((box) =>
    [...box.children].map((child) => {
      const { left, top, right, bottom } = child.getBoundingClientRect();
      return { at: box.dataset.ebAt ?? '', left, top, right, bottom };
    }),
  );
}

/** The width the frame has to fit in, measured as the panel resizes. */
function useWidth(box: { readonly current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);
  return width;
}

export function Frame(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const size = sizeOf(device.value, turned.value);
  // At most 60% of the window's height, so the outline and the form stay in reach below it.
  const scale = fitScale({ width, height: Math.max(240, window.innerHeight * 0.6) }, size);
  const onClick = (event: MouseEvent) => {
    const frame = box.current?.querySelector<HTMLElement>('.eb-game');
    const at = frame ? pick(event.clientX, event.clientY, placed(frame)) : undefined;
    if (at !== undefined) props.select(at);
  };
  return (
    <div class="designer-frame-part">
      <FrameBar />
      {props.standing ? <p class="muted designer-standing">{standingText(props.standing)}</p> : null}
      <div class="designer-frame-box" ref={box}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a tap on the inert frame selects what is under it; the outline's rows do the same for keys and screen readers */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above, the outline is the keyboard's way to select */}
        <div
          class="designer-frame"
          data-testid="designer-frame"
          style={{ width: `${size.width * scale}px`, height: `${size.height * scale}px` }}
          onClick={onClick}
        >
          <div class="designer-device" style={{ transform: `scale(${scale})` }}>
            <DesignFrame
              id={props.id}
              screen={props.screen}
              theme={props.theme}
              view={props.view}
              width={size.width}
              height={size.height}
              selected={props.selected}
              log={props.log}
              {...(props.assetUrl ? { assetUrl: props.assetUrl } : {})}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const standingText = (standing: Standing) => (standing.kind === 'moment' ? standing.what : standing.why);

/** The device and its turn, and the breakpoint they lay the screen out at. */
function FrameBar() {
  const id = useUniqueId();
  const size = sizeOf(device.value, turned.value);
  return (
    <div class="form-actions designer-frame-bar">
      <label for={id}>Device</label>
      <select
        id={id}
        class="field form-select"
        value={device.value.id}
        onChange={(event) => {
          device.value = DEVICES.find((d) => d.id === event.currentTarget.value) ?? (device.value as Device);
        }}
      >
        {DEVICES.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button type="button" class="button" aria-pressed={turned.value} onClick={() => (turned.value = !turned.value)}>
        Turn
      </button>
      <span
        class="muted"
        data-testid="designer-breakpoint"
      >{`${size.width} × ${size.height}, lays out as ${frameBreakpoint(size.width, size.height)}`}</span>
    </div>
  );
}
