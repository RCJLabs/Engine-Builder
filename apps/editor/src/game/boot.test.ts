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

  it('names walk.js only as Export writes it (M5.8)', () => {
    for (const walk of ['walk.0a1b2c3d.js', '#eb-walk']) {
      const boot = { edition: 'full', pack: {}, sw: false, walk };
      expect(readBoot(JSON.stringify(boot))).toEqual({ ok: true, boot });
    }
    for (const walk of ['https://example.com/walk.js', 'walk.js', '#other', 3]) {
      expect(readBoot(JSON.stringify({ edition: 'full', pack: {}, sw: false, walk }))).toMatchObject({ ok: false });
    }
  });
});
