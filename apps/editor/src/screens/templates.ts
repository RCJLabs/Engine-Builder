/**
 * What New screen and New theme write (M4.1): a screen that compiles as it stands, opened only by
 * a button until its `shows` names a mode, and the engine's own theme to change from.
 */
import { DEFAULT_THEME } from '@eb/ui/format';

const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const screenTemplate = (name: string): string =>
  pretty({
    title: name,
    shows: [],
    main: { widget: 'stack', children: [{ widget: 'text', text: name, style: 'title' }] },
  });

export const themeTemplate = (): string => pretty(DEFAULT_THEME);
