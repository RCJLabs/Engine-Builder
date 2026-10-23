/**
 * export.json as a form sees it (M4.10, D60): its fields as a type file, so the record form's
 * fields draw it, as the calendar's are (M3.5). The editions a target can ship and the types and
 * scenes an edition can leave out come from the project, so the file is drawn again as they change.
 * docs/specs/export.md says what each field does; these are the words beside each box.
 */
import { EXPORT_FILE, type ProjectSource } from '@eb/compiler';
import type { Diagnostic, Fields, TypeFile } from '@eb/schema';
import type { FileChange } from '../editing/history.ts';
import { editJson } from '../editing/jsonText.ts';

export interface ExportChoices {
  /** The editions export.json has, `full` aside. */
  readonly editions: readonly string[];
  readonly types: readonly string[];
  readonly scenes: readonly string[];
}

const edition = (editions: readonly string[]) =>
  ({
    kind: 'enum',
    values: ['full', ...editions],
    optional: true,
    label: 'Edition',
    description: 'What it ships: the full game, or an edition below. Left empty, the full game.',
  }) as const;

function leaveOut({ types, scenes }: ExportChoices): Fields {
  return {
    records: {
      kind: 'list',
      of: { kind: 'ref', to: types },
      optional: true,
      label: 'Records',
      description: 'Records to leave out. A kept record that names one is a problem (E055).',
    },
    types: {
      kind: 'list',
      of: { kind: 'enum', values: [...types] },
      optional: true,
      label: 'Types',
      description: 'Every record of these types.',
    },
    ...(scenes.length > 0
      ? {
          scenes: {
            kind: 'list',
            of: { kind: 'enum', values: [...scenes] },
            optional: true,
            label: 'Scenes',
            description: 'Ink scenes, each the talk of its name.',
          },
        }
      : {}),
    assets: {
      kind: 'list',
      of: { kind: 'asset' },
      optional: true,
      label: 'Assets',
      description: 'Files under assets/, with their credits.',
    },
  };
}

export function exportTypeFile(choices: ExportChoices): TypeFile {
  return {
    title: 'Export',
    fields: {
      name: {
        kind: 'text',
        optional: true,
        label: 'Name',
        description: 'On the title, the tab and the launcher. Left empty, the project’s.',
      },
      'short-name': {
        kind: 'text',
        optional: true,
        label: 'Short name',
        description: 'Under an installed icon: about 12 characters.',
      },
      description: {
        kind: 'text',
        multiline: true,
        optional: true,
        label: 'Description',
        description: 'For the web manifest.',
      },
      icon: {
        kind: 'asset',
        of: 'image',
        optional: true,
        label: 'Icon',
        description: 'A square PNG of at least 512 px. Left empty, one is drawn in the theme’s colours.',
      },
      orientation: { kind: 'enum', values: ['any', 'portrait', 'landscape'], optional: true, label: 'Orientation' },
      colors: {
        kind: 'group',
        optional: true,
        label: 'Colours',
        description: 'Left empty, the theme’s background.',
        fields: {
          background: { kind: 'colour', optional: true, label: 'Background', description: 'The splash screen’s.' },
          theme: { kind: 'colour', optional: true, label: 'Theme', description: 'The browser bar’s.' },
        },
      },
      editions: {
        kind: 'map',
        of: {
          kind: 'group',
          fields: { 'leave-out': { kind: 'group', optional: true, label: 'Leave out', fields: leaveOut(choices) } },
        },
        optional: true,
        label: 'Editions',
        description: 'Each a name, like taster, and what it leaves out. The full game is always there.',
      },
      targets: {
        kind: 'group',
        optional: true,
        label: 'Targets',
        fields: {
          web: {
            kind: 'group',
            optional: true,
            label: 'Web',
            description: 'Installs and plays offline. Publish to GitHub puts it on Pages.',
            fields: {
              edition: edition(choices.editions),
              domain: {
                kind: 'text',
                optional: true,
                label: 'Domain',
                description: 'Its own domain, like hut.example.com, if it has one: an Android app needs it.',
              },
            },
          },
          file: { kind: 'group', optional: true, label: 'Single file', fields: { edition: edition(choices.editions) } },
          itch: { kind: 'group', optional: true, label: 'itch.io', fields: { edition: edition(choices.editions) } },
          android: {
            kind: 'group',
            optional: true,
            label: 'Android',
            description: 'Built by a GitHub workflow that Publish writes, around the web build on its domain.',
            fields: {
              package: { kind: 'text', label: 'Package', description: 'Its id on Play, like com.rcjlabs.thehut.' },
              fingerprints: {
                kind: 'list',
                of: { kind: 'text' },
                optional: true,
                label: 'Key fingerprints',
                description:
                  'SHA-256, from Play Console’s App signing page: the app opens without a browser bar once the site names them.',
              },
            },
          },
        },
      },
    },
  };
}

/** What Set up export writes: the three targets that need nothing more, each the full game. */
export const STARTING_EXPORT = {
  targets: { web: { edition: 'full' }, file: { edition: 'full' }, itch: { edition: 'full' } },
};

/** The change `change` makes to export.json, written new, two spaces deep, when there is none. */
export async function exportChange(source: ProjectSource, change: (value: unknown) => unknown): Promise<FileChange[]> {
  const before = (await source.read(EXPORT_FILE)) ?? null;
  const after = before
    ? editJson(before, change)
    : new TextEncoder().encode(`${JSON.stringify(change({}), null, 2)}\n`);
  return after === before ? [] : [{ path: EXPORT_FILE, before, after }];
}

/** export.json's own problems, at their places in it. */
export const exportFileProblems = (problems: readonly Diagnostic[]): Diagnostic[] =>
  problems.filter((d) => d.file === EXPORT_FILE);
