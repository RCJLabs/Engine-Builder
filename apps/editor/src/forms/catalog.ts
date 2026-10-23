/**
 * What forms need to know about the open project besides the record on screen: its types from
 * types/, the records there are of each type, and the files under assets/, read as the compiler
 * reads them (readProjectFiles), with the problems it finds there. It is read again after every
 * change, beside the Project panel's summary (projects/opened.ts).
 */
import {
  classifyScene,
  classifyUi,
  type ProjectSource,
  RECORDS_DIR,
  readProjectFiles,
  SCENES_DIR,
  type TypeReport,
  UI_DIR,
} from '@eb/compiler';
import type { CalendarDef } from '@eb/core';
import { DIALOGUE, TALK } from '@eb/kits';
import { type DataType, type Diagnostic, isEngineType, type RecordType, severityOf } from '@eb/schema';
import { AMBIENCE, MUSIC, SOUND } from '@eb/ui/format';

export interface Catalog {
  /** The project's types whose files are sound, by name, the engine's flag and sheet (D36) and the kits' (D41). */
  readonly types: ReadonlyMap<string, DataType>;
  /** What is wrong with each type file that has problems, by type: its first problem. */
  readonly broken: ReadonlyMap<string, TypeReport>;
  /** Every type that types/ or records/ names, sorted: the engine's own once the project has records of them. */
  readonly names: readonly string[];
  /** Record ids by type, sorted: the talks among them include the scenes'. */
  readonly records: ReadonlyMap<string, readonly string[]>;
  /**
   * The ids of the scenes under scenes/ the record index compiles into talks (M3.11, D49): with the
   * dialogue kit on, placed and named right, and no talk record of the same id.
   */
  readonly scenes: ReadonlySet<string>;
  /** The screens under ui/ by id, sorted (M4.1, D51). */
  readonly screens: readonly string[];
  /** Whether there is a ui/theme.json. */
  readonly theme: boolean;
  /** Whether there is a ui/feedback.json (M4.2, D52). */
  readonly feedback: boolean;
  /** Whether there is a ui/shell.json (M4.3, D53). */
  readonly shell: boolean;
  /** Paths inside assets/, sorted: every file there but the provenance log. */
  readonly assets: readonly string[];
  /**
   * The assets' provenance log (D34, M2.7): its JSON, or undefined when there is none; `logProblem`
   * says why when it can't be read.
   */
  readonly assetsLog: unknown;
  readonly logProblem?: string;
  /** Every type for validation, stand-ins for broken ones included. */
  readonly recordTypes: readonly RecordType[];
  /** The kits project.json turns on (M3.3, D41), in the engine's order. */
  readonly kits: readonly string[];
  /** project.json's calendar, with the time kit on and the calendar sound (M3.5, D43). */
  readonly calendar?: CalendarDef;
  /**
   * The problems with the project's files that aren't one record's (M2.8): project.json, types/,
   * files under records/ that aren't records, and the assets' log; files under scenes/ that aren't
   * scenes, and scenes the index can't compile (M3.11); files under ui/ that are no screen (M4.1).
   * The record index has the rest, and the screens' own checks follow the game (screenChecks.ts).
   */
  readonly problems: readonly Diagnostic[];
}

export const EMPTY_CATALOG: Catalog = {
  types: new Map(),
  broken: new Map(),
  names: [],
  records: new Map(),
  scenes: new Set(),
  screens: [],
  theme: false,
  feedback: false,
  shell: false,
  assets: [],
  assetsLog: undefined,
  recordTypes: [],
  kits: [],
  problems: [],
};

// UTF-16 order, the same in every locale, as the compiler sorts.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function readCatalog(source: ProjectSource): Promise<Catalog> {
  const read = await readProjectFiles(source, []);
  const known = read.types;
  const broken = new Map<string, TypeReport>();
  for (const { code, message, file = '', path } of read.diagnostics) {
    const type = /^types\/([^/]+)\.json$/.exec(file)?.[1];
    if (type !== undefined && known.unchecked.has(type) && !broken.has(type))
      broken.set(type, { code, message, file, path });
  }
  const records = new Map<string, string[]>();
  for (const { type, id } of read.recordFiles) {
    const ids = records.get(type) ?? [];
    ids.push(id);
    records.set(type, ids);
  }
  const scenes = await readScenes(source, records, read.kits);
  const ui = await readUiFiles(source);
  for (const ids of records.values()) ids.sort(byText);
  const assets = [...read.assets].sort(byText);
  const named = known.types.map((t) => t.type).filter((type) => !isEngineType(type));
  // The project's own types first, so its first is the table Records opens on; the audio after.
  const names = [
    ...[...new Set([...named, ...records.keys()])].filter((type) => !AUDIO_TYPES.has(type)).sort(byText),
    ...AUDIO_ORDER,
  ];
  const log = read.assetsLog;
  return {
    types: known.data,
    broken,
    names,
    records,
    scenes: scenes.ids,
    screens: ui.screens,
    theme: ui.theme,
    feedback: ui.feedback,
    shell: ui.shell,
    assets,
    assetsLog: log?.ok ? log.value : undefined,
    ...(log && !log.ok ? { logProblem: log.message } : {}),
    recordTypes: known.types,
    kits: read.kits,
    ...(read.calendar ? { calendar: read.calendar } : {}),
    problems: [...read.diagnostics, ...scenes.problems, ...ui.problems],
  };
}

/** The engine's flag and sheet live in the Logic panel (D36); its sounds, ambiences and music are tables like a project's own (M4.8). */
const AUDIO_ORDER = [SOUND, AMBIENCE, MUSIC];
const AUDIO_TYPES: ReadonlySet<string> = new Set(AUDIO_ORDER);

/** The files under ui/, as the compiler places them (compiler/ui.ts): screens, the theme, the feedback, the shell, and W132 for the rest. */
async function readUiFiles(source: ProjectSource) {
  const screens: string[] = [];
  const problems: Diagnostic[] = [];
  let theme = false;
  let feedback = false;
  let shell = false;
  for (const file of [...(await source.files(UI_DIR))].sort(byText)) {
    const role = classifyUi(file);
    if (role.kind === 'screen') screens.push(role.id);
    else if (role.kind === 'theme') theme = true;
    else if (role.kind === 'feedback') feedback = true;
    else if (role.kind === 'shell') shell = true;
    else problems.push({ code: 'W132', severity: 'warning', message: role.reason, file, path: '' });
  }
  return { screens, theme, feedback, shell, problems };
}

const problem = (code: 'E004' | 'E046' | 'W131', message: string, file: string, id?: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  ...(id === undefined ? {} : { type: TALK, id }),
  file,
  path: '',
});

/**
 * The scenes under scenes/, each a talk (M3.11): their ids join the talks', and what the compiler
 * would say of a file there that is no scene, as `eb` says it (compiler/scenes.ts), is the
 * catalog's. A scene beside a talk record of its id is E004 on both files, and isn't compiled.
 */
async function readScenes(source: ProjectSource, records: Map<string, string[]>, kits: readonly string[]) {
  const ids = new Set<string>();
  const problems: Diagnostic[] = [];
  const talks = records.get(TALK) ?? [];
  for (const file of [...(await source.files(SCENES_DIR))].sort(byText)) {
    const role = classifyScene(file);
    if (role.kind === 'ignored') problems.push(problem('W131', 'Ignored: scenes are scenes/<id>.ink', file));
    else if (role.kind === 'misplaced') problems.push(problem('E046', role.reason, file));
    else if (!kits.includes(DIALOGUE)) {
      problems.push(
        problem('E046', 'A scene compiles into a talk: turn the dialogue kit on in project.json', file, role.id),
      );
    } else if (talks.includes(role.id)) {
      const twice = `2 talk records have the id "${role.id}"`;
      problems.push(problem('E004', twice, file, role.id), problem('E004', twice, recordFile(TALK, role.id), role.id));
    } else ids.add(role.id);
  }
  if (ids.size > 0) records.set(TALK, [...talks, ...ids]);
  return { ids, problems };
}

export const recordFile = (type: string, id: string): string => `${RECORDS_DIR}/${type}/${id}.json`;
