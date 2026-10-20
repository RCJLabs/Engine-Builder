/**
 * Settings (M4.3, docs/specs/shell.md#settings): text size and motion, each a row of buttons, one
 * pressed, which a pad and arrows move through as they do any controls; and the controls, to read.
 * Volumes come with M4.8's audio.
 */

import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import { MOTIONS, type Motion, type Settings, TEXT_SIZES, type TextSize } from './settings.ts';

const TEXT_WORDS: Readonly<Record<TextSize, string>> = { normal: 'Normal', large: 'Large', larger: 'Larger' };
const MOTION_WORDS: Readonly<Record<Motion, string>> = { device: 'As the device says', less: 'Less', full: 'Full' };

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

export function SettingsScreen({ settings, change, memory, back }: SettingsProps) {
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
