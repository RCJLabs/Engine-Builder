/**
 * Measures what a big asset costs a stored project's save (M2.7): the journal carries each saved
 * file whole, as base64 inside one line of JSON with its hash (editing/journal.ts), so a 25 MB
 * image is about 33 MB of journal, built in memory and hashed before anything is written. Times
 * building the journal and reading it back (what recovery does after a crash), and the memory the
 * build takes on top of the file. In Node: a phone is slower, and OPFS writes add their own time.
 * The instrument behind the "Big assets through the journal" reading in ROADMAP.md.
 *
 *   node --expose-gc apps/editor/test/assets-bench.ts
 */
import { journalText, readJournal } from '../src/editing/journal.ts';

const MB = 1024 * 1024;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc ?? (() => undefined);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Bytes that don't repeat, as an image's compressed data doesn't: a xorshift stream. */
function noise(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let x = 0x9e3779b9;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    bytes[i] = x & 0xff;
  }
  return bytes;
}

for (const size of [1, 5, 25]) {
  const file = { path: `assets/images/big-${size}.png`, bytes: noise(size * MB) };
  const build: number[] = [];
  const read: number[] = [];
  const memory: number[] = [];
  let length = 0;
  for (let run = 0; run < RUNS; run++) {
    gc();
    const before = process.memoryUsage().rss;
    let t0 = performance.now();
    const text = journalText([file]);
    build.push(performance.now() - t0);
    // What the save holds at once: the file, its journal text, and the text encoded to be written.
    const encoded = new TextEncoder().encode(text);
    memory.push((process.memoryUsage().rss - before) / MB);
    length = encoded.byteLength;
    t0 = performance.now();
    const back = readJournal(text);
    read.push(performance.now() - t0);
    if (back?.[0]?.bytes?.byteLength !== file.bytes.byteLength) throw new Error('The journal lost the file');
  }
  const range = (values: number[], digits: number) =>
    `${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)} (median ${median(values).toFixed(digits)})`;
  console.log(
    `${size} MB: journal ${(length / MB).toFixed(1)} MB; built in ${range(build, 0)} ms, read back in ${range(read, 0)} ms; ` +
      `memory on top of the file ${range(memory, 0)} MB`,
  );
}
