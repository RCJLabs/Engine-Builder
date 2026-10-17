import { fnv1a32, loadSave, stateHash } from '@eb/core';
import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BUILD, game, play, saveOf, sim } from '../test/runs.ts';
import { decodeSaveCode, encodeSaveCode, MAX_CODE_BYTES } from './index.ts';

const file = saveOf(play('x', 30), 1);
const code = encodeSaveCode(file);
const [, , payload = '', check = ''] = code.split('.');
// A code around any payload, with a check that matches it, to reach what comes after the check.
const wrap = (bytes: Uint8Array, gameId = 'salvage-run') => {
  const body = `EB1.${gameId}.${Buffer.from(bytes).toString('base64url')}`;
  return `${body}.${fnv1a32(body).toString(16).padStart(8, '0')}`;
};

describe('save codes', () => {
  it('carry a save whole, through the spaces and line breaks of a paste', () => {
    expect(code).toMatch(/^EB1\.salvage-run\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    const pasted = `  ${code.replace(/(.{60})/g, '$1\n  ')}\n`;
    const decoded = decodeSaveCode(pasted, 'salvage-run');
    expect(decoded).toEqual({ ok: true, game: 'salvage-run', file: JSON.parse(JSON.stringify(file)) });
    const loaded = loadSave(game, decoded.ok && decoded.file, sim, { game: 'salvage-run', build: BUILD });
    expect(loaded.ok && stateHash(loaded.state)).toBe(file.hash);
  });

  it('are shorter than the save they hold', () => {
    expect(code.length).toBeLessThan(JSON.stringify(file).length / 2);
  });

  const mistyped = `EB1.salvage-run.${payload.slice(0, 20)}${payload[20] === 'A' ? 'B' : 'A'}${payload.slice(21)}.${check}`;
  it.each([
    ['text that is not a code', 'hello there', 'Not a save code'],
    ['another format', code.replace(/^EB1/, 'EB2'), 'Not a save code'],
    ['a game id that is not one', code.replace('salvage-run', 'Salvage Run'), 'Not a save code'],
    ['a code cut short', `EB1.salvage-run.${payload.slice(0, -10)}.${check}`, 'The code is mistyped or cut short'],
    ['one letter mistyped', mistyped, 'The code is mistyped or cut short'],
    [
      'a code for another game',
      wrap(new Uint8Array([1]), 'space-wrecked'),
      'a save of "space-wrecked", not "salvage-run"',
    ],
    ['a payload that is not deflated', wrap(new Uint8Array([1, 2, 3, 4])), 'The code does not hold a save'],
    [
      'deflated text that is not JSON',
      wrap(deflateSync(new TextEncoder().encode('{"torn'))),
      'The code does not hold a save',
    ],
  ])('refuse %s', (_name, text, message) => {
    expect(decodeSaveCode(text, 'salvage-run')).toEqual({ ok: false, message: expect.stringContaining(message) });
  });

  it('refuse a code that would unpack to more than a save can be', () => {
    const bomb = wrap(deflateSync(new Uint8Array(MAX_CODE_BYTES + 1000), { level: 9 }));
    expect(bomb.length).toBeLessThan(20_000);
    expect(decodeSaveCode(bomb)).toEqual({ ok: false, message: 'The code unpacks to more than a save can be' });
    const justUnder = wrap(deflateSync(new TextEncoder().encode(`"${'x'.repeat(MAX_CODE_BYTES - 2)}"`)));
    expect(decodeSaveCode(justUnder)).toMatchObject({ ok: true });
  });
});
