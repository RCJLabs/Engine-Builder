/**
 * The assets' credits a pack carries (M4.4, D54): each file the provenance log covers and assets/
 * holds, with its licence by id and by name, where it came from, and who or what made it. A credits
 * screen lists them as the game plays, so an asset added later is credited without the screen
 * being touched.
 */
import type { PackCredit } from '@eb/core';
import { licenceOf, type ProvenanceLog } from '@eb/schema';
import type { ParsedFile } from './decode.ts';

/** The credits of a log that read, in the order of its files' paths; none for one that didn't. */
export function creditsOf(log: ParsedFile | undefined, assets: ReadonlySet<string>): PackCredit[] {
  if (!log?.ok) return [];
  const files = (log.value as Partial<ProvenanceLog> | null)?.files ?? {};
  return Object.keys(files)
    .filter((asset) => assets.has(asset))
    .sort()
    .map((asset) => {
      const { licence, source, author, tool } = files[asset] as ProvenanceLog['files'][string];
      return {
        asset,
        licence,
        licenceName: licenceOf(licence)?.name ?? licence,
        source,
        ...(author !== undefined ? { author } : {}),
        ...(tool !== undefined ? { tool } : {}),
      };
    });
}
