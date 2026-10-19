/** The renderer: a game's screens drawn with Preact from the views its session sends (M4.1, D51). */
export type { Drawing } from './render/context.ts';
export { actionFor, amount, fill, holds, shownText } from './render/fill.ts';
export { GameScreens, type GameScreensProps } from './render/GameScreens.tsx';
export { breakpointOf, layoutAt, layoutStyle, themeVars } from './render/layout.ts';
export {
  drawn,
  type Opened,
  type Shown as ShownScreen,
  screenFor,
  screenStack,
  stillOpen,
} from './render/stack.ts';
