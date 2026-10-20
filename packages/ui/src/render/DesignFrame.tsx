/**
 * One screen drawn to be designed (M4.5, D55, docs/specs/designer.md#the-frame): from a view, at a
 * device's size and so at its breakpoint, in the game's theme. Inert, so nothing in it takes focus
 * or acts; each widget's box carries where it sits, for the editor to select it by a tap.
 */
import type { Breakpoint, Screen } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import type { View } from '../session/types.ts';
import type { Drawing } from './context.ts';
import type { LogLine } from './feedback.ts';
import { breakpointOf, themeVars } from './layout.ts';
import { ScreenView } from './Screen.tsx';
import './screens.css';

export interface DesignFrameProps {
  readonly id: string;
  readonly screen: Screen;
  readonly theme?: Theme | undefined;
  readonly view: View;
  /** The device's size in CSS pixels, which sets the breakpoint as the device's would. */
  readonly width: number;
  readonly height: number;
  /** The selected widget's JSON Pointer, ringed. */
  readonly selected?: string | undefined;
  readonly log?: readonly LogLine[];
  readonly assetUrl?: (path: string) => string | undefined;
}

const nothing = () => {};

/** The breakpoint a device of this size lays a game out at. */
export const frameBreakpoint = (width: number, height: number): Breakpoint => breakpointOf(width, height);

export function DesignFrame(props: DesignFrameProps) {
  const { id, screen, theme, view, width, height, selected } = props;
  const breakpoint = breakpointOf(width, height);
  const drawing: Drawing = {
    view,
    breakpoint,
    busy: false,
    act: nothing,
    open: nothing,
    close: undefined,
    assetUrl: (path) => props.assetUrl?.(path),
    log: props.log ?? [],
    // Nothing in the frame takes focus: the outline is the way in for keys and screen readers.
    paused: true,
    design: { selected },
  };
  return (
    <div
      class={`eb-game eb-at-${breakpoint}`}
      style={{ ...themeVars(theme), width: `${width}px`, height: `${height}px` }}
      inert
      data-breakpoint={breakpoint}
    >
      <ScreenView shown={{ kind: 'screen', id, screen }} top drawing={drawing} remembered={() => undefined} />
    </div>
  );
}
