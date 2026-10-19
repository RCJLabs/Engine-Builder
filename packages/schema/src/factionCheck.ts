/**
 * The factions kit's checks beyond its type file (M3.5, docs/specs/factions.md): E035 for a
 * faction whose bounds, start or bands don't hold together, E039 for a condition naming a band its
 * faction doesn't have, and W115 for drift in a game without days. A condition can name a faction
 * before its record is read, so E039 waits for finish().
 */
import { FACTION, type FactionRecord } from '@eb/kits';
import { boundsText, checkBands, outside } from './bandCheck.ts';
import type { SoundCondition } from './conditions.ts';
import type { DiagnosticCode } from './diagnostics.ts';
import { factTests } from './flagCheck.ts';
import type { Known } from './known.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

function checkFaction(faction: FactionRecord, known: Known, report: Report): void {
  if (faction.min !== undefined && faction.max !== undefined && faction.max < faction.min) {
    report('E035', '/max', `Highest ${faction.max} is below lowest ${faction.min}`);
    return;
  }
  if (faction.start !== undefined && outside(faction, faction.start)) {
    report('E035', '/start', `It starts at ${faction.start}, outside ${boundsText(faction)}`);
  }
  checkBands(faction.bands ?? [], '/bands', faction, 'band', report);
  const { drift } = faction;
  if (drift === undefined) return;
  if (drift.toward !== undefined && outside(faction, drift.toward)) {
    report('E035', '/drift/toward', `It rests at ${drift.toward}, outside ${boundsText(faction)}`);
  }
  if (!known.openEvents && known.events['time/day-started'] === undefined) {
    report('W115', '/drift', 'It drifts as days start, which time/day-started says: this game has no time module');
  }
}

interface Named {
  readonly report: Report;
  readonly path: string;
  readonly faction: string;
  readonly band: string;
}

export class FactionChecks {
  private readonly known: Known;
  private readonly factions = new Map<string, FactionRecord>();
  private readonly named: Named[] = [];

  constructor(known: Known) {
    this.known = known;
  }

  /** One record of a kit's type that passed its schema; false for one these checks don't read. */
  record(type: string, id: string, value: unknown, report: Report): boolean {
    if (type !== FACTION) return false;
    checkFaction(value as FactionRecord, this.known, report);
    this.factions.set(id, value as FactionRecord);
    return true;
  }

  /** A condition's tests that name a band: `factions.reached(f, band)`, or `factions.band(f)` compared with one. */
  condition(report: Report, sound: SoundCondition): void {
    for (const [inner, test] of factTests(sound.tree, '')) {
      const faction = test.args?.faction;
      if (typeof faction !== 'string') continue;
      const band =
        test.fact === 'factions.reached'
          ? test.args?.band
          : test.fact === 'factions.band' && (test.op === '==' || test.op === '!=')
            ? test.value
            : undefined;
      if (typeof band === 'string') this.named.push({ report, path: sound.at(inner), faction, band });
    }
  }

  /** Each band a condition names, against its faction's: a faction there is none of is E005 already. */
  finish(): void {
    for (const { report, path, faction, band } of this.named) {
      const record = this.factions.get(faction);
      if (record === undefined) continue;
      const bands = (record.bands ?? []).map((b) => b.id);
      if (bands.includes(band)) continue;
      report(
        'E039',
        path,
        bands.length === 0
          ? `${faction} has no bands`
          : `${faction} has no band ${band}: its bands are ${bands.join(', ')}`,
      );
    }
  }
}
