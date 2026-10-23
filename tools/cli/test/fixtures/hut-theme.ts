/**
 * The hut's music stem (M4.8, D58): a slow arpeggio in A minor, eight soft triangle notes half a
 * second apart, rendered by the engine's own ZzFX port and written as a 4-second 16-bit mono WAV
 * at 22,050 Hz. Each note's tail past the end is laid over the start, so the loop has no seam.
 * The file is logged in the hut's assets.json as the project's own work; this script remakes it.
 *
 *   node tools/cli/test/fixtures/hut-theme.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSamples } from '../../../../packages/ui/src/audio/zzfx.ts';

const RATE = 22050;
const SECONDS = 4;
// A3 C4 E4 A4 G4 E4 C4 E4.
const NOTES = [220, 261.63, 329.63, 440, 392, 329.63, 261.63, 329.63];

const loop = new Float32Array(RATE * SECONDS);
NOTES.forEach((frequency, n) => {
  // volume, randomness, frequency, attack, sustain, release, shape (triangle)
  const note = buildSamples([0.5, 0, frequency, 0.02, 0.1, 0.9, 1], RATE);
  const from = n * (RATE / 2);
  for (let i = 0; i < note.length; i++) {
    const at = (from + i) % loop.length;
    loop[at] = (loop[at] as number) + (note[i] as number);
  }
});
const peak = loop.reduce((most, s) => Math.max(most, Math.abs(s)), 0);

const data = Buffer.alloc(loop.length * 2);
for (const [i, s] of loop.entries()) data.writeInt16LE(Math.round((s / peak) * 0.8 * 32767), i * 2);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = resolve(import.meta.dirname, 'hut/assets/audio/hut-theme.wav');
writeFileSync(out, Buffer.concat([header, data]));
console.log(`${out}: ${44 + data.length} bytes`);
