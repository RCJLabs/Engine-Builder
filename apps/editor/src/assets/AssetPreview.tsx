import { gltfSummary } from '@eb/compiler';
import type { AssetKind } from '@eb/schema';
import { useMemo, useState } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { FontSample, Glyph } from './AssetTile.tsx';
import { fileName } from './assetPaths.ts';
import { mimeOf, sizeText } from './media.ts';
import type { AssetFile } from './useAssetFile.ts';

const NOUNS: Record<AssetKind, string> = { image: 'Image', audio: 'Sound', model: '3D model', font: 'Font' };

/** The most of a text file shown: enough for a font's licence notice. */
const TEXT_SHOWN = 4000;

/**
 * An asset as the inspector shows it: an image, a sound to play, a font's sample, a model's
 * counts, a text file's start. An SVG shows only as an image, where its scripts never run.
 */
export function AssetPreview(props: {
  project: OpenProject;
  path: string;
  kind: AssetKind | undefined;
  file: AssetFile;
}) {
  const { project, path, kind, file } = props;
  const [size, setSize] = useState<string | null>(null);
  const said = `${kind ? NOUNS[kind] : 'File'}${file.bytes ? `, ${sizeText(file.bytes.byteLength)}` : ''}${size ? `, ${size}` : ''}`;
  return (
    <div class="asset-preview">
      {kind === 'image' && file.url ? (
        <img
          src={file.url}
          alt={`${fileName(path)}, as it is`}
          onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`)}
        />
      ) : kind === 'audio' && file.url ? (
        // biome-ignore lint/a11y/useMediaCaption: a game's sound effects and music have no words to caption
        <audio controls preload="metadata" src={file.url} />
      ) : kind === 'font' ? (
        <p class="asset-font-sample">
          <FontSample bytes={file.bytes} text="Aa Bb Cc 0123 — The quick brown fox jumps over the lazy dog." />
        </p>
      ) : kind === 'model' && file.bytes ? (
        <ModelFacts project={project} path={path} bytes={file.bytes} />
      ) : kind === undefined && file.bytes && mimeOf(path).startsWith('text/') ? (
        <TextStart bytes={file.bytes} />
      ) : (
        <Glyph kind={kind === 'audio' || kind === 'model' ? kind : 'other'} />
      )}
      <p class="muted">{file.bytes === null ? 'The file can’t be read.' : said}</p>
    </div>
  );
}

function TextStart({ bytes }: { bytes: Uint8Array }) {
  const text = new TextDecoder().decode(bytes.subarray(0, TEXT_SHOWN));
  return (
    <pre class="asset-text">
      {text}
      {bytes.byteLength > TEXT_SHOWN ? '\n…' : ''}
    </pre>
  );
}

/** What a model holds, read without drawing it: the asset's preview, and a model record's form (M5.5). */
export function ModelFacts({ project, path, bytes }: { project: OpenProject; path: string; bytes: Uint8Array }) {
  const assets = project.catalog.assets;
  const summary = useMemo(() => gltfSummary(path, bytes, new Set(assets)), [path, bytes, assets]);
  if (typeof summary === 'string') return <p class="field-problem">{summary}</p>;
  const facts: [string, number][] = [
    ['Meshes', summary.meshes],
    ['Triangles', summary.triangles],
    ['Materials', summary.materials],
    ['Textures', summary.textures],
    ['Animations', summary.animations],
    ['Nodes', summary.nodes],
  ];
  return (
    <>
      <dl class="asset-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString('en')}</dd>
          </div>
        ))}
      </dl>
      {summary.external.length > 0 ? (
        <>
          <p>It needs these files beside it:</p>
          <ul class="asset-needs">
            {summary.external.map((need) => (
              <li key={need.path}>
                <span class="mono">{need.path}</span>{' '}
                {need.found ? (
                  <span class="muted">there</span>
                ) : (
                  <span class="field-problem">missing: import it into the same folder</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
