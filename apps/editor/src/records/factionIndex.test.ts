/**
 * The record index with the factions and time kits (M3.5): a condition naming a band is checked
 * against its faction's bands, so an edit to a faction is an edit to the problems of every record
 * naming it; and the time kit's effects are checked in the calendar's units, so an edit to
 * project.json's calendar checks every record again.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const GUILD = 'records/faction/guild.json';
const WATCH = 'records/sheet/watch.json';

const sheet = (row: Record<string, unknown>) =>
  JSON.stringify({ rows: [{ id: 'a', when: { event: 'time/day-started' }, ...row }] });

/** Ludus with the factions and time kits on, the guild in two bands, and a sheet reading them. */
function guilded() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['factions', 'time'];
  });
  files.write(GUILD, JSON.stringify({ bands: [{ id: 'wary' }, { id: 'friendly', from: 10 }] }));
  files.write(WATCH, sheet({ if: 'factions.band(guild) == friendly', do: [] }));
  return files;
}

describe('the index with factions and time', () => {
  it('checks every record naming a faction again when it changes, so a band it no longer has shows', async () => {
    const files = guilded();
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    // Only the guild is written, but the band is the sheet's to report.
    files.write(GUILD, JSON.stringify({ bands: [{ id: 'wary' }, { id: 'trusted', from: 10 }] }));
    ({ index, fresh } = await files.update([GUILD]));
    expect(problemsOf(index, 'sheet:watch')).toEqual([
      'E039 /rows/0/if: guild has no band friendly: its bands are wary, trusted',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks every record again when the calendar changes, a wait’s lengths being the calendar’s', async () => {
    const files = guilded();
    files.write(WATCH, sheet({ do: [{ effect: 'wait', hours: 6 }] }));
    let { index, fresh } = await files.update(null);
    // A day a tick has no hours.
    expect(problemsOf(index, 'sheet:watch')).not.toEqual([]);
    files.edit('project.json', (manifest) => {
      manifest.calendar = { ticksPerDay: 24, units: { hours: 1 } };
    });
    ({ index, fresh } = await files.update(['project.json']));
    expect(problemsOf(index, 'sheet:watch')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
