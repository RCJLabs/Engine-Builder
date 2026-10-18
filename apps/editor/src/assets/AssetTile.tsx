import type { AssetKind } from '@eb/schema';
import type { OpenProject } from '../projects/opened.ts';
import type { AssetRow } from './assetList.ts';
import { fileName, folderOf } from './assetPaths.ts';
import { openAsset } from './open.ts';
import { useAssetFile, useFontFace } from './useAssetFile.ts';

// 24×24 outline glyphs for what has no picture of its own, drawn with currentColor.
const GLYPHS: Record<Exclude<AssetKind, 'image' | 'font'> | 'other', string> = {
  audio: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  model: 'M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  other: 'M6.5 3H14l4.5 4.5v12A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM14 3v4.5h4.5',
};

export function Glyph({ kind }: { kind: keyof typeof GLYPHS }) {
  return (
    <svg class="asset-glyph" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false">
      <path
        d={GLYPHS[kind]}
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** A font's "Aa" in the font itself, once it has loaded. */
export function FontSample({ bytes, text }: { bytes: Uint8Array | null | undefined; text: string }) {
  const family = useFontFace(bytes);
  return (
    <span class="asset-font" style={family ? { fontFamily: `"${family}"` } : undefined}>
      {text}
    </span>
  );
}

/** What a tile shows of a file: an image itself, a font's sample, or a glyph for its kind. */
function Thumb({ project, row }: { project: OpenProject; row: AssetRow }) {
  const file = useAssetFile(project, row.path, row.kind === 'image');
  if (row.kind === 'image') {
    return file.url ? <img class="asset-thumb" src={file.url} alt="" decoding="async" /> : <span class="asset-thumb" />;
  }
  if (row.kind === 'font') return <FontSample bytes={file.bytes} text="Aa" />;
  return <Glyph kind={row.kind ?? 'other'} />;
}

/** The badge a tile wears for its worst problem: none, a stand-in, or one that stops the build. */
function badgeOf(row: AssetRow): { text: string; tone: 'error' | 'warning' } | null {
  if (row.problems.some((p) => p.code === 'E019')) return { text: 'No provenance', tone: 'error' };
  if (row.problems.some((p) => p.severity === 'error')) return { text: 'Licence problem', tone: 'error' };
  if (row.problems.some((p) => p.code === 'W107')) return { text: 'Stand-in', tone: 'warning' };
  return null;
}

/** One asset in the panel's grid: a button that opens it in the inspector. */
export function AssetTile({ project, row, current }: { project: OpenProject; row: AssetRow; current: boolean }) {
  const badge = badgeOf(row);
  return (
    <li class="asset-tile">
      <button
        type="button"
        class="asset-open"
        aria-current={current ? 'true' : undefined}
        onClick={() => openAsset(row.path)}
      >
        <span class="asset-picture">
          <Thumb project={project} row={row} />
        </span>
        <span class="asset-name">{fileName(row.path)}</span>
        <span class="asset-folder muted">{folderOf(row.path) || 'assets/'}</span>
        {badge ? <span class={`asset-badge ${badge.tone}`}>{badge.text}</span> : null}
      </button>
    </li>
  );
}
