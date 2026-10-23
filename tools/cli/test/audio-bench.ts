/**
 * Times the hut's audio (M4.8): each sound rendered by the ZzFX port, and each ambience layer
 * rendered to its 8-second loop. A sound renders once, the first time it plays, and a layer as
 * its ambience starts. Milliseconds, the median of 5 rounds after one to warm up. The instrument
 * behind the "Audio renders" reading in ROADMAP.md.
 *
 *   node tools/cli/test/audio-bench.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderLayer, renderSound } from '../../../packages/ui/src/audio/index.ts';
import type { AmbienceRecord, SoundRecord } from '../../../packages/ui/src/format/index.ts';

const HUT = join(import.meta.dirname, 'fixtures/hut/records');
const read = <T>(type: string) =>
  readdirSync(join(HUT, type)).map((file) => ({
    id: file.replace(/\.json$/, ''),
    value: JSON.parse(readFileSync(join(HUT, type, file), 'utf8')) as T,
  }));

function median(make: () => unknown): number {
  make();
  const times: number[] = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    make();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[2] as number;
}

for (const { id, value } of read<SoundRecord>('sound')) {
  const seconds = renderSound(value).length / 44100;
  console.log(`sound ${id} (${seconds.toFixed(2)} s): ${median(() => renderSound(value)).toFixed(2)} ms`);
}
for (const { id, value } of read<AmbienceRecord>('ambience')) {
  for (const [n, layer] of value.layers.entries()) {
    const time = median(() => renderLayer(layer, `${id}/${n}`));
    console.log(
      `ambience ${id} layer ${n + 1} (${layer.kind} ${layer.colour ?? layer.shape ?? ''}): ${time.toFixed(2)} ms`,
    );
  }
}
