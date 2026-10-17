import { describe, expect, it } from 'vitest';
import { createGame, defineModule } from './index.ts';

describe('createGame', () => {
  const mod = (def: Record<string, unknown>) => defineModule({ id: 'a', init: () => ({}), ...def } as never);
  it.each([
    ['an invalid module id', [mod({ id: 'Crew' })], 'play', '"Crew" is not a valid module id'],
    ['the reserved kernel id', [mod({ id: 'kernel' })], 'play', '"kernel" is the kernel\'s own state'],
    ['two modules with one id', [mod({}), mod({})], 'play', 'Two modules have the id "a"'],
    ['an invalid action name', [mod({ actions: { Go() {} } })], 'play', '"Go" is not a valid a action'],
    [
      'an effect registered twice',
      [mod({ effects: { e() {} } }), mod({ id: 'b', effects: { e() {} } })],
      'x',
      'Effect "e" is registered by both a and b',
    ],
    [
      'a mode registered twice',
      [
        mod({ actions: { go() {} }, modes: { m: { actions: ['*'] } } }),
        mod({ id: 'b', modes: { m: { actions: [] } } }),
      ],
      'm',
      'Two modules register the mode "m"',
    ],
    [
      'a pattern that matches nothing',
      [mod({ actions: { go() {} }, modes: { m: { actions: ['a/og'] } } })],
      'm',
      'Mode "m" allows "a/og", which matches no action',
    ],
    [
      'a module pattern that only shares a prefix',
      [mod({ id: 'ab', actions: { go() {} } }), mod({ modes: { m: { actions: ['a/*'] } } })],
      'm',
      'Mode "m" allows "a/*", which matches no action',
    ],
    [
      'a start mode nobody registers',
      [mod({ actions: { go() {} }, modes: { m: { actions: ['*'] } } })],
      'n',
      'The start mode "n" is not registered',
    ],
  ])('throws for %s', (_name, modules, start, message) => {
    expect(() => createGame({ modules, start })).toThrow(message);
  });

  const fact = (spec: Record<string, unknown>, id = 'a') =>
    mod({ id, actions: { go() {} }, modes: { m: { actions: ['*'] } }, facts: { x: { read: () => 0, ...spec } } });
  it.each([
    ['bounds the wrong way round', { domain: { type: 'int', min: 5, max: 1 } }, 'Fact "a.x": min 5 is above max 1'],
    [
      'no whole number between the bounds',
      { domain: { type: 'int', min: 0.2, max: 0.8 } },
      'no whole number lies between 0.2 and 0.8',
    ],
    [
      'an infinite bound',
      { domain: { type: 'number', max: Number.POSITIVE_INFINITY } },
      'min and max are finite numbers',
    ],
    ['an empty enum', { domain: { type: 'enum', values: [] } }, 'an enum needs at least one value'],
    ['an enum value listed twice', { domain: { type: 'enum', values: ['a', 'a'] } }, 'an enum lists a value twice'],
    ['an enum number a condition cannot write', { domain: { type: 'enum', values: [1e21] } }, 'enum values are text'],
    ['a ref to no record type', { domain: { type: 'ref', to: 'Actor' } }, '"Actor" is not a record type name'],
    ['an unknown domain type', { domain: { type: 'date' } }, 'unknown domain type "date"'],
    [
      'an argument name a condition cannot write',
      { args: { Item: { type: 'text' } } },
      '"Item" is not a valid argument name',
    ],
    [
      'an argument with a bad domain',
      { args: { n: { type: 'enum', values: [] } } },
      'Fact "a.x", argument "n": an enum',
    ],
  ])('throws for a fact with %s', (_name, spec, message) => {
    expect(() => createGame({ modules: [fact(spec)], start: 'm' })).toThrow(message);
  });

  it('throws for a fact in a module whose id a condition cannot write', () => {
    expect(() => createGame({ modules: [fact({}, '3d')], start: 'm' })).toThrow(
      'Fact "3d.x" can\'t be named in a condition: module ids and fact names start with a letter',
    );
  });
});
