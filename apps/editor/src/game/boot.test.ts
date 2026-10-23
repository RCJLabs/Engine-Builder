import { describe, expect, it } from 'vitest';
import { readBoot } from './boot.ts';

describe('an exported game’s boot JSON (M4.10)', () => {
  it('is read when whole', () => {
    const boot = { edition: 'taster', pack: { hash: 'x' }, sw: true };
    expect(readBoot(JSON.stringify(boot))).toEqual({ ok: true, boot });
  });

  it('says what is wrong with a page that has none, or a broken one', () => {
    expect(readBoot('')).toMatchObject({
      ok: false,
      message: 'This page holds no game: Export writes the page with one.',
    });
    expect(readBoot('{ nope')).toMatchObject({ ok: false, message: 'This page’s game isn’t JSON: export it again.' });
    expect(readBoot('{"edition":"full"}')).toMatchObject({ ok: false });
  });
});
