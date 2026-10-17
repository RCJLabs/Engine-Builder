/**
 * Measures save codes on salvage run: 1,000 seeds played to their end, each save encoded and
 * decoded again. The instrument behind the "save codes" reading in ROADMAP.md.
 *
 *   node packages/platform/test/code-bench.ts
 */
import { decodeSaveCode, encodeSaveCode } from '../src/index.ts';
import { play, saveOf } from './runs.ts';

let json = 0;
let chars = 0;
let longest = 0;
let encoding = 0;
let decoding = 0;
for (let i = 0; i < 1000; i++) {
  const file = saveOf(play(`seed-${i}`));
  const t0 = performance.now();
  const code = encodeSaveCode(file);
  const t1 = performance.now();
  const decoded = decodeSaveCode(code, 'salvage-run');
  const t2 = performance.now();
  if (!decoded.ok) throw new Error(decoded.message);
  json += JSON.stringify(file).length;
  chars += code.length;
  longest = Math.max(longest, code.length);
  encoding += t1 - t0;
  decoding += t2 - t1;
}
console.log(
  `1000 codes: ${Math.round(chars / 1000)} characters each (longest ${longest}) for ${Math.round(json / 1000)} bytes ` +
    `of JSON; encode ${((encoding * 1000) / 1000).toFixed(0)} µs, decode ${((decoding * 1000) / 1000).toFixed(0)} µs`,
);
