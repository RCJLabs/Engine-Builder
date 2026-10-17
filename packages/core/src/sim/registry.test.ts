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
});
