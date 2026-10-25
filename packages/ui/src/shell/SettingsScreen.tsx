/**
 * Settings (M4.3, docs/specs/shell.md#settings): text size and motion, each a row of buttons, one
 * pressed, which a pad and arrows move through as they do any controls; and the controls, to read.
 * M4.8 adds the volumes, each a value between Quieter and Louder rather than a slider, whose arrow
 * keys would fight the arrows' move between controls (Spliceworld chose steps for its own reasons),
 * and Vibration where the device can vibrate.
 */

import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import {
  MOTIONS,
  type Motion,
  QUALITIES,
  type Quality,
  type Settings,
  TEXT_SIZES,
  type TextSize,
  VOLUME_STEP,
  VOLUMES,
  type VolumeName,
} from './settings.ts';

const TEXT_WORDS: Readonly<Record<TextSize, string>> = { normal: 'Normal', large: 'Large', larger: 'Larger' };
const MOTION_WORDS: Readonly<Record<Motion, string>> = { device: 'As the device says', less: 'Less', full: 'Full' };
const VOLUME_WORDS: Readonly<Record<VolumeName, string>> = {
  sound: 'Sound',
  music: 'Music',
  ambience: 'Ambience',
  effects: 'Effects',
};
const QUALITY_WORDS: Readonly<Record<Quality, string>> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };
const VIBRATION = ['on', 'off'] as const;
const VIBRATION_WORDS = { on: 'On', off: 'Off' } as const;

/** Whether this device can vibrate at all: iPhones can't, so the setting isn't offered there. */
const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

const CONTROLS: readonly (readonly [string, string])[] = [
  ['Move between controls', 'Arrow keys, a pad’s d-pad or left stick, or Tab'],
  ['Press', 'Enter or Space, or a pad’s A'],
  ['Back, or pause when nothing is open', 'Escape, or a pad’s B'],
  ['Pause', 'A pad’s Start, or the Pause button'],
  ['Turn tabs', 'A pad’s LB and RB, or a swipe on the tabs'],
  ['Close a screen', 'A swipe right, or the browser’s back on the player page'],
];

interface SettingsProps {
  readonly settings: Settings;
  readonly change: (next: Settings) => void;
  readonly memory: ScreenMemory;
  readonly back: () => void;
  /** The game has spaces (M5.8): Quality is offered for how they are drawn. */
  readonly walks?: boolean;
}

function Choices<T extends string>(props: {
  readonly legend: string;
  readonly name: string;
  readonly values: readonly T[];
  readonly words: Readonly<Record<T, string>>;
  readonly chosen: T;
  readonly choose: (value: T) => void;
}) {
  return (
    <fieldset class="eb-shell-choices">
      <legend class="eb-text eb-heading">{props.legend}</legend>
      <div class="eb-shell-row">
        {props.values.map((value) => (
          <button
            key={value}
            type="button"
            class={`eb-button${value === props.chosen ? ' eb-primary' : ''}`}
            data-key={`${props.name}-${value}`}
            aria-pressed={value === props.chosen ? 'true' : 'false'}
            onClick={() => props.choose(value)}
          >
            {props.words[value]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** One volume: its value, and Quieter and Louder a step either way, each disabled at its end. */
function Volume(props: { readonly name: VolumeName; readonly value: number; readonly set: (value: number) => void }) {
  const { name, value, set } = props;
  const words = VOLUME_WORDS[name];
  return (
    <fieldset class="eb-shell-choices eb-shell-volume">
      <legend class="eb-text eb-heading">{words}</legend>
      <div class="eb-shell-row">
        <button
          type="button"
          class="eb-button"
          data-key={`${name}-down`}
          aria-label={`${words} quieter`}
          disabled={value <= 0}
          onClick={() => set(Math.max(0, value - VOLUME_STEP))}
        >
          Quieter
        </button>
        <output class="eb-text eb-shell-volume-value" aria-live="polite">
          {value === 0 ? 'Off' : String(value)}
        </output>
        <button
          type="button"
          class="eb-button"
          data-key={`${name}-up`}
          aria-label={`${words} louder`}
          disabled={value >= 100}
          onClick={() => set(Math.min(100, value + VOLUME_STEP))}
        >
          Louder
        </button>
      </div>
    </fieldset>
  );
}

export function SettingsScreen({ settings, change, memory, back, walks = false }: SettingsProps) {
  return (
    <ShellScreen
      name="settings"
      title="Settings"
      memory={memory}
      bottom={
        <button type="button" class="eb-button" data-key="back" onClick={back}>
          Back
        </button>
      }
    >
      <Choices
        legend="Text size"
        name="text"
        values={TEXT_SIZES}
        words={TEXT_WORDS}
        chosen={settings.text}
        choose={(text) => change({ ...settings, text })}
      />
      <Choices
        legend="Motion"
        name="motion"
        values={MOTIONS}
        words={MOTION_WORDS}
        chosen={settings.motion}
        choose={(motion) => change({ ...settings, motion })}
      />
      {VOLUMES.map((name) => (
        <Volume key={name} name={name} value={settings[name]} set={(value) => change({ ...settings, [name]: value })} />
      ))}
      {walks ? (
        <Choices
          legend="Quality"
          name="quality"
          values={QUALITIES}
          words={QUALITY_WORDS}
          chosen={settings.quality}
          choose={(quality) => change({ ...settings, quality })}
        />
      ) : null}
      {canVibrate() ? (
        <Choices
          legend="Vibration"
          name="vibration"
          values={VIBRATION}
          words={VIBRATION_WORDS}
          chosen={settings.vibration ? 'on' : 'off'}
          choose={(on) => change({ ...settings, vibration: on === 'on' })}
        />
      ) : null}
      <h3 class="eb-text eb-heading">Controls</h3>
      <dl class="eb-shell-controls">
        {CONTROLS.map(([what, how]) => (
          <div key={what}>
            <dt class="eb-text">{what}</dt>
            <dd class="eb-text eb-caption">{how}</dd>
          </div>
        ))}
      </dl>
    </ShellScreen>
  );
}
