/** The renderer: a game's screens drawn with Preact from the views its session sends (M4.1, D51). */
export type { Drawing } from './render/context.ts';
export { DesignFrame, type DesignFrameProps, frameBreakpoint } from './render/DesignFrame.tsx';
export type { LogLine } from './render/feedback.ts';
export { actionFor, amount, fill, holds, shownText } from './render/fill.ts';
export { GameScreens, type GameScreensProps } from './render/GameScreens.tsx';
export { breakpointOf, layoutAt, layoutStyle, themeVars } from './render/layout.ts';
export {
  type Board,
  boardOf,
  HALF_ACROSS,
  HALF_DOWN,
  linksInset,
  nodeName,
  placeStyle,
  scrollFor,
} from './render/mapLayout.ts';
export {
  type Sent,
  type SpaceAsk,
  type SpaceDrawn,
  type SpaceHost,
  WALK_QUALITIES,
  type WalkQuality,
} from './render/spaceHost.ts';
export {
  drawn,
  type Opened,
  type Shown as ShownScreen,
  screenFor,
  screenStack,
  stillOpen,
} from './render/stack.ts';
