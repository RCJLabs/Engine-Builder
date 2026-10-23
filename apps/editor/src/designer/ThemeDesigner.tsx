/**
 * The theme designed (M4.5, D55, docs/specs/designer.md#the-theme): its six colours from the
 * platform's colour picker, each text pair's contrast shown as it is picked against 4.5:1 with the
 * arithmetic E050 uses; its font, size, space and radius; and a sample screen drawn in it.
 */
import { THEME_FILE } from '@eb/compiler';
import type { FieldDef, TypeFile } from '@eb/schema';
import { COLOUR_PATTERN } from '@eb/schema';
import { DesignFrame } from '@eb/ui';
import { AA_BODY, COLOR_NAMES, CONTRAST_PAIRS, contrast, type Screen, type Theme } from '@eb/ui/format';
import { useMemo, useRef } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { useFile } from '../forms/useFile.ts';
import type { OpenProject } from '../projects/opened.ts';
import { formApi } from './formApi.ts';
import { fitScale } from './frame.ts';
import { sampleView } from './samples.ts';

type Loose = Record<string, unknown>;

const THEME: TypeFile = {
  title: 'theme',
  fields: {
    colors: {
      kind: 'group',
      label: 'Colours',
      fields: Object.fromEntries(COLOR_NAMES.map((name) => [name, { kind: 'colour', label: name } as FieldDef])),
    },
    font: { kind: 'text', optional: true, label: 'Font', description: 'A CSS font list: system-ui, sans-serif.' },
    size: { kind: 'int', min: 10, max: 32, optional: true, label: 'Text size', description: 'Body text, in px.' },
    space: { kind: 'int', min: 0, max: 32, optional: true, label: 'Space', description: 'One spacing step, in px.' },
    radius: { kind: 'int', min: 0, max: 32, optional: true, label: 'Corner radius', description: 'In px.' },
    // The interface's sounds (M4.8): a press, a screen a button opens, Back or a Close.
    sounds: {
      kind: 'group',
      optional: true,
      label: 'Interface sounds',
      fields: {
        press: { kind: 'ref', to: 'sound', optional: true, label: 'A press' },
        open: { kind: 'ref', to: 'sound', optional: true, label: 'A screen opening' },
        back: { kind: 'ref', to: 'sound', optional: true, label: 'Back' },
      },
    },
  },
};

const text = (t: string, style?: 'title' | 'heading' | 'caption') => ({
  widget: 'text' as const,
  text: t,
  ...(style ? { style } : {}),
});

/** What the sample draws: a little of each thing a theme colours. */
const SAMPLE: Screen = {
  title: 'Sample',
  top: text('A heading', 'heading'),
  main: {
    widget: 'stack',
    gap: 2,
    children: [
      text('A title', 'title'),
      text('Body text, as most of a game’s words are.'),
      text('A caption, in the muted colour.', 'caption'),
      { widget: 'panel', children: [text('In a panel, on the surface colour.')] },
      { widget: 'progress', value: 3, max: 10, label: 'A bar' },
    ],
  },
  bottom: {
    widget: 'stack',
    direction: 'row',
    gap: 1,
    children: [
      { widget: 'button', label: 'Primary', style: 'primary', action: { close: true } },
      { widget: 'button', label: 'Plain', action: { close: true } },
    ],
  },
};

/** Each pair text is drawn in, its ratio, and whether it reaches AA. */
function Contrast({ colors }: { colors: Loose }) {
  return (
    <ul class="designer-contrast" aria-label="Contrast">
      {CONTRAST_PAIRS.map(([fore, back]) => {
        const a = colors[fore];
        const b = colors[back];
        const sound =
          typeof a === 'string' && typeof b === 'string' && COLOUR_PATTERN.test(a) && COLOUR_PATTERN.test(b);
        const ratio = sound ? contrast(a, b) : null;
        return (
          <li key={`${fore}-${back}`} class={ratio !== null && ratio >= AA_BODY ? '' : 'field-problem'}>
            {`${fore} on ${back}: `}
            {ratio === null
              ? 'not a colour yet'
              : `${ratio.toFixed(2)}:1, ${ratio >= AA_BODY ? 'passes' : `below ${AA_BODY}:1`}`}
          </li>
        );
      })}
    </ul>
  );
}

export function ThemeDesigner({ project }: { project: OpenProject }) {
  const loaded = useFile(project, THEME_FILE);
  const box = useRef<HTMLDivElement>(null);
  const view = useMemo(() => sampleView(SAMPLE), []);
  if (!loaded) return <p class="muted">Reading {THEME_FILE}…</p>;
  if (loaded.kind !== 'ok')
    return (
      <p class="logic-problem">{`${THEME_FILE} can’t be designed: it isn’t JSON. The JSON tab shows it as written.`}</p>
    );
  const theme = (loaded.value ?? {}) as Loose;
  const colors = (theme.colors ?? {}) as Loose;
  const problems = project.catalog.problems.filter((p) => p.file === THEME_FILE);
  const api = formApi({
    project,
    file: THEME_FILE,
    at: '',
    typeFile: THEME,
    problems,
    canEdit: editing.access.value.kind === 'editing',
    title: 'the theme',
  });
  const drawable = COLOR_NAMES.every(
    (name) => typeof colors[name] === 'string' && COLOUR_PATTERN.test(colors[name] as string),
  );
  const scale = fitScale(
    { width: Math.min(box.current?.clientWidth ?? 300, 360), height: 480 },
    { width: 360, height: 740 },
  );
  return (
    <FormContext.Provider value={api}>
      <div class="designer">
        <div class="designer-frame-box" ref={box}>
          <div class="designer-frame" style={{ width: `${360 * scale}px`, height: `${740 * scale}px` }}>
            <div class="designer-device" style={{ transform: `scale(${scale})` }}>
              <DesignFrame
                id="theme-sample"
                screen={SAMPLE}
                theme={drawable ? (theme as unknown as Theme) : undefined}
                view={view}
                width={360}
                height={740}
              />
            </div>
          </div>
        </div>
        <div class="designer-form">
          {COLOR_NAMES.map((name) => (
            <FieldView
              key={name}
              label={name}
              def={{ kind: 'colour' }}
              info={{}}
              path={['colors', name]}
              value={colors[name]}
            />
          ))}
          <Contrast colors={colors} />
          {(['font', 'size', 'space', 'radius', 'sounds'] as const).map((name) => {
            const def = THEME.fields[name] as FieldDef;
            return (
              <FieldView key={name} label={def.label ?? name} def={def} info={def} path={[name]} value={theme[name]} />
            );
          })}
        </div>
      </div>
    </FormContext.Provider>
  );
}
