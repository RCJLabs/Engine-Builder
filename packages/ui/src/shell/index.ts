/** The play shell (M4.3, D53): the title, slots, saves, pause, settings and crash screen around a game. */
export { type CrashContext, crashReport, isNoise, showCrash, watchCrashes } from './crash.ts';
export { Shell } from './Shell.tsx';
export { DEFAULT_SETTINGS, readSettings, type Settings, settingsAttrs, settingsKey } from './settings.ts';
export { continueSlot, DAILY_SLOT, dailyNumber, dailySeed, slotIds, slotInfo, slotName } from './slots.ts';
export type { OpenedGame, ShellProps, ShellRequest } from './types.ts';
