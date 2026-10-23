/**
 * Diagnostic codes are a public contract, like save keys: the editor, the CLI and people's notes
 * refer to them. A code is never renumbered or reused; a retired code stays here, marked retired.
 * Errors are E0xx and stop a build. Warnings are W1xx and don't.
 */
export const DIAGNOSTIC_CODES = {
  E001: "The record doesn't match its type's schema",
  E002: 'Unknown record type',
  E003: 'Invalid record id',
  E004: 'Duplicate record id within a type',
  E005: 'Reference to a record that does not exist',
  E006: 'Reference to a type this field does not allow',
  E007: 'A file is not valid UTF-8 JSON',
  E008: "project.json is missing or doesn't match the project schema",
  E009: 'The project needs a newer engine',
  E010: 'A JSON file under records/ is not at records/<type>/<id>.json',
  E011: 'A condition is not well formed',
  E012: 'A condition names a fact the game does not have',
  E013: "A condition's fact arguments are missing, unknown, or not among the argument's values",
  E014: 'A condition tests a fact in a way its values cannot match',
  E015: "A type file doesn't match the type file format",
  E016: 'A type file names a record type the project does not have',
  E017: 'A type file is misplaced, misnamed, or names a type the game already defines',
  E018: 'An asset field names a file that is not in assets/',
  E019: 'A file under assets/ has no provenance in assets/assets.json',
  E020: "An asset's licence isn't one the engine accepts, or what it asks for isn't logged",
  E021: "assets/assets.json doesn't match the provenance log's format",
  E022: 'A row or a count names an event the game does not have',
  E023: "A row's or a count's event arguments are unknown, or not among the argument's values",
  E024: 'Two rows of a sheet have the same id',
  E025: 'An effect the game does not have',
  E026: 'A flag is set or read as the other kind, or set outside its bounds',
  E027: "A flag's start lies outside its bounds, or its lowest is above its highest",
  E028: 'A script does not parse as TypeScript',
  E029: 'A script breaks a purity rule',
  E030: 'A script imports something other than "eb" and other scripts, or is misplaced or misnamed',
  E031: 'The game fails when its scripts run: a script throws as it loads, or the game it makes is refused',
  E032: "scripts/game.ts doesn't export what a game needs",
  E033: 'project.json names a kit the engine does not have, or one twice',
  E034: 'A kit needs another that project.json leaves out',
  E035: "A record of a kit's type doesn't hold together",
  E036: 'Loot tables nest in a loop',
  E037: "A project's fields for a kit's type name one of the kit's own",
  E038: "project.json's calendar doesn't hold together",
  E039: 'A condition names a band its faction does not have',
  E040: 'A condition names a rank, a bond band or a bond the roster does not have',
  E041: 'A condition names a choice its event does not have',
  E042: 'A condition names a line or an option its talk does not have',
  E043: 'A condition or a set-stage names a stage or an objective its quest does not have',
  E044: "A slot named where it can't be: one its quest doesn't have, of another type, not yet filled, or outside a quest",
  E045: 'A quest has a job in a game without the time module',
  E046: "A scene isn't ink the engine reads: a construct outside the subset, a tag it doesn't know, or a flow that runs out",
  E047: "A screen, the theme, the feedback or the shell isn't valid",
  E048: "A screen, a feedback line or the shell's slot line names a fact or a field it can't read",
  E049: 'A screen takes an action, opens a screen, shows a mode or lists a source the game lacks',
  E050: "The theme's text falls short of AA contrast",
  E051: "A feedback line is on an event the game doesn't declare",
  E052: "A feedback line names an argument its event lacks, or matches one on a value it can't take",
  E053: "An effect names a node its map doesn't have",
  E054: 'A fight names nobody to fight for the player, in a game without the roster kit',
  W101: 'A file under records/ that the compiler ignores',
  W102: 'A condition can never be true',
  W103: 'A condition can never be false',
  W104: 'The lint could not tell whether a condition can be true',
  W105: 'A file under types/ that the compiler ignores',
  W106: 'assets/assets.json logs a file that is not in assets/',
  W107: 'A stand-in made by the editor is still in assets/',
  W108: 'A flag is set, but nothing reads it',
  W109: 'A flag is read, but nothing sets it',
  W110: 'Nothing sets or reads a flag',
  W111: 'A file under scripts/ that the compiler ignores',
  W112: "A script scripts/game.ts doesn't import, directly or through another",
  W113: 'A shop stocks again every few days in a game without time.day',
  W114: 'A status lasts days or ticks in a game without the time module',
  W115: 'A faction drifts in a game without the time module',
  W116: "project.json's calendar is read by no time module",
  W117: 'A recruit has a fee in a game without the economy kit',
  W118: 'An event has no choice that is always open',
  W119: 'A choice or an option has a cost in a game without the economy kit',
  W120: 'A consequence or a quest counts days in a game without the time module',
  W121: 'No start of its talk reaches a line',
  W122: 'A line can show only locked options',
  W123: 'Nothing opens a talk',
  W124: 'Nothing brings a quest to a stage',
  W125: 'Nothing starts a quest',
  W126: 'A quest can never end from a stage',
  W127: 'No record can ever fill a slot',
  W128: "A text names a slot its quest doesn't have",
  W129: 'On every way through its talk, the conditions before rule out a line, an option or a branch',
  W130: 'A talk can never end from a line',
  W131: 'A file under scenes/ that the compiler ignores',
  W132: 'A file under ui/ that the compiler ignores',
  W133: 'A mode no screen shows',
  W134: 'A screen only a button opens has no button that closes it',
  W135: "A layered map's rule isn't kept in every seed",
  W136: "A drawn map's node no road reaches from its start",
  W137: "An encounter's fallen leave the roster, in a game without the roster kit",
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;
export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  /** For people. The code and path are the stable part; wording may improve. */
  readonly message: string;
  /** The record's type and id, when the diagnostic is about a record. */
  readonly type?: string;
  readonly id?: string;
  /** The file, relative to the project root with `/` between folders. */
  readonly file?: string;
  /** JSON Pointer (RFC 6901) into the file's JSON (a record's value); empty for the file as a whole. */
  readonly path: string;
  /** The line in a file that isn't JSON, counted from 1: a script's (M3.2). */
  readonly line?: number;
  readonly column?: number;
}

export const severityOf = (code: DiagnosticCode): Severity => (code.startsWith('W') ? 'warning' : 'error');

// UTF-16 order, the same in every locale.
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** File, then type, id, path, line, code and message: one order whatever order the files came in. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareText(a.file ?? '', b.file ?? '') ||
    compareText(a.type ?? '', b.type ?? '') ||
    compareText(a.id ?? '', b.id ?? '') ||
    compareText(a.path, b.path) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    compareText(a.code, b.code) ||
    compareText(a.message, b.message)
  );
}
