import { describe, expect, it } from 'vitest';
import { coalesce } from './refresh.ts';

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** A reader whose reads finish when `finish` is called, recording what each was asked to read. */
function reader(results: (boolean | Error)[] = []) {
  const asked: (readonly string[] | null)[] = [];
  const failures: unknown[] = [];
  let finish: () => void = () => undefined;
  const refresh = coalesce(
    (paths) => {
      asked.push(paths);
      const result = results.shift() ?? true;
      return new Promise<boolean>((resolve, reject) => {
        finish = () => (result instanceof Error ? reject(result) : resolve(result));
      });
    },
    (error) => failures.push(error),
  );
  return { refresh, asked, failures, finish: () => finish() };
}

describe('coalesce', () => {
  it('reads at once, and gathers the changes made during a read into one more', async () => {
    const r = reader();
    r.refresh(['a']);
    r.refresh(['b']);
    r.refresh(['c', 'b']);
    expect(r.asked).toEqual([['a']]);
    r.finish();
    await settle();
    expect(r.asked).toEqual([['a'], ['b', 'c']]);
    r.finish();
    await settle();
    expect(r.asked).toHaveLength(2);
  });

  it('reads everything when anything may have changed, whatever else was named', async () => {
    const r = reader();
    r.refresh(['a']);
    r.refresh(['b']);
    r.refresh(null);
    r.refresh(['c']);
    r.finish();
    await settle();
    expect(r.asked).toEqual([['a'], null]);
  });

  it('stops when what it reads for has gone', async () => {
    const r = reader([false]);
    r.refresh(['a']);
    r.refresh(['b']);
    r.finish();
    await settle();
    expect(r.asked).toEqual([['a']]);
    // A later change starts it again, with what went unread.
    r.refresh(['c']);
    expect(r.asked).toEqual([['a'], ['b', 'c']]);
  });

  it('says why a read failed, and reads everything on the next change', async () => {
    const r = reader([new Error('gone')]);
    r.refresh(['a']);
    r.finish();
    await settle();
    expect(r.failures).toEqual([new Error('gone')]);
    r.refresh(['b']);
    expect(r.asked).toEqual([['a'], null]);
  });

  it('keeps a change that comes as the read finishes', async () => {
    const r = reader();
    r.refresh(['a']);
    // Queued before the read's own continuation, so it lands while the loop is still deciding.
    r.finish();
    queueMicrotask(() => r.refresh(['b']));
    await settle();
    expect(r.asked).toEqual([['a'], ['b']]);
  });
});
