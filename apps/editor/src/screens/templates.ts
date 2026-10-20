/**
 * What New screen, New theme, New feedback and New shell write (M4.1, M4.2, M4.3): a screen that compiles as it
 * stands, opened only by a button until its `shows` names a mode, with a button that closes it;
 * the engine's own theme to change from; and feedback for the common events of the kits the
 * project has on, in plain words for the author to change.
 */
import type { FeedbackLine } from '@eb/ui/format';
import { DEFAULT_THEME } from '@eb/ui/format';

const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// No `shows`, which is the same as none: the designer ticks the modes it shows in (M4.5).
export const screenTemplate = (name: string): string =>
  pretty({
    title: name,
    main: { widget: 'stack', children: [{ widget: 'text', text: name, style: 'title' }] },
    // Opened only by a button, a screen needs one that closes it (W134).
    bottom: { widget: 'button', label: 'Close', action: { close: true } },
  });

export const themeTemplate = (): string => pretty(DEFAULT_THEME);

/** Each kit's common events, worded. The time kit's day events depend on the calendar, so they are left to the author. */
const KIT_LINES: Readonly<Record<string, readonly FeedbackLine[]>> = {
  inventory: [
    { on: 'inventory/gained', say: '{.item} ×{.count} into the bag' },
    { on: 'inventory/lost', say: '{.item} ×{.count} out of the bag', to: 'log' },
    { on: 'inventory/full', say: 'The bag is full: {.lost} {.item} left behind' },
  ],
  economy: [
    { on: 'economy/bought', say: 'Bought {.item} for {.price}' },
    { on: 'economy/sold', say: 'Sold {.item} for {.price}' },
    { on: 'economy/changed', say: '{.resource}: {.by}', to: 'log' },
  ],
  stats: [
    { on: 'stats/emptied', say: '{.actor} is out of {.stat}' },
    { on: 'stats/status-added', say: '{.actor}: {.status}', to: 'log' },
  ],
  gear: [{ on: 'gear/equipped', say: '{.actor} wears {.item}', to: 'log' }],
  factions: [{ on: 'factions/standing-changed', say: '{.faction}: {.by}', to: 'log' }],
  roster: [
    { on: 'roster/joined', say: '{.actor} joins' },
    { on: 'roster/left', say: '{.actor} leaves' },
  ],
  quests: [
    { on: 'quests/started', say: 'New quest: {.quest}' },
    { on: 'quests/done', say: 'Done: {.quest}' },
    { on: 'quests/failed', say: 'Failed: {.quest}. {.why}' },
  ],
};

export const feedbackTemplate = (kits: readonly string[]): string =>
  pretty({ lines: kits.flatMap((kit) => KIT_LINES[kit] ?? []) });

/**
 * The shell's settings with the defaults written out, so the author sees each one to change; a
 * slot line of the day when the time kit is on, the step otherwise.
 */
export const shellTemplate = (name: string, kits: readonly string[]): string =>
  pretty({
    title: name,
    slots: 3,
    daily: false,
    ...(kits.includes('time') ? { 'slot-line': 'Day {time.day}' } : {}),
  });
