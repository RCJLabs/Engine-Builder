/**
 * A type file and a record of it that between them reach every place a value can sit: fields,
 * groups, lists of groups, maps of groups, map keys of both kinds, refs to one type and to
 * several, and a condition. The type designer's tests share them, and `arena()`, a project made
 * of them.
 */
export const FIGHTER = {
  title: 'Fighter',
  nameField: 'name',
  fields: {
    name: { kind: 'text', min: 1 },
    style: { kind: 'enum', values: ['retiarius', 'murmillo'] },
    school: { kind: 'ref', to: 'school' },
    rival: { kind: 'ref', to: ['fighter', 'beast'], optional: true },
    bouts: {
      kind: 'list',
      of: {
        kind: 'group',
        fields: { foe: { kind: 'ref', to: ['fighter', 'beast'] }, won: { kind: 'bool' } },
      },
    },
    kit: { kind: 'map', key: { kind: 'ref', to: 'weapon' }, of: { kind: 'int', min: 1 } },
    spoils: { kind: 'map', key: { kind: 'ref', to: ['weapon', 'beast'] }, of: { kind: 'int' }, optional: true },
    titles: { kind: 'map', key: { kind: 'enum', values: ['gold', 'silver'] }, of: { kind: 'text' } },
    moods: { kind: 'list', of: { kind: 'enum', values: ['calm', 'wild'] } },
    allies: { kind: 'map', of: { kind: 'group', fields: { since: { kind: 'int' } } }, optional: true },
    record: { kind: 'group', fields: { wins: { kind: 'int' }, losses: { kind: 'int' } } },
    fights: { kind: 'condition', optional: true },
  },
};

export const CRIXUS = {
  name: 'Crixus',
  style: 'murmillo',
  school: 'ludus-magnus',
  rival: 'fighter:spartacus',
  bouts: [
    { foe: 'fighter:spartacus', won: false },
    { foe: 'beast:lion', won: true },
  ],
  kit: { gladius: 1, net: 2 },
  spoils: { 'weapon:trident': 1, 'beast:lion': 2 },
  titles: { gold: 'Champion of Capua' },
  moods: ['wild', 'calm', 'wild'],
  allies: { oenomaus: { since: 70 } },
  record: { wins: 12, losses: 1 },
  fights: 'arena.day and rival.is(spartacus)',
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const named = (title: string) => ({ title, nameField: 'name', fields: { name: { kind: 'text', min: 1 } } });

/**
 * A project of fighters, schools, weapons and beasts that refer to each other every way a record
 * can. Spartacus is written by hand on Windows (tabs, CRLF), and the weapons on one line, so a
 * rewrite that loses a file's layout shows.
 */
export function arena(): Record<string, string> {
  const spartacus = {
    name: 'Spartacus',
    style: 'retiarius',
    school: 'ludus-magnus',
    rival: 'fighter:crixus',
    // Sparring counts: a record that refers to itself, which its own rename must follow.
    bouts: [
      { foe: 'fighter:crixus', won: true },
      { foe: 'fighter:spartacus', won: false },
    ],
    kit: { trident: 1 },
    titles: {},
    moods: ['calm'],
    record: { wins: 3, losses: 0 },
  };
  return {
    'project.json': json({ format: 1, id: 'arena', name: 'Arena', version: '0.1.0' }),
    'types/fighter.json': json(FIGHTER),
    'types/school.json': json(named('School')),
    'types/weapon.json': json(named('Weapon')),
    'types/beast.json': json(named('Beast')),
    'records/fighter/crixus.json': json({ ...CRIXUS, fights: 'arena.day and not crowd.angry' }),
    'records/fighter/spartacus.json': `${JSON.stringify(spartacus, null, '\t').replaceAll('\n', '\r\n')}\r\n`,
    'records/school/ludus-magnus.json': json({ name: 'Ludus Magnus' }),
    'records/weapon/gladius.json': '{"name":"Gladius"}',
    'records/weapon/net.json': '{"name":"Net"}',
    'records/weapon/trident.json': '{"name":"Trident"}',
    'records/beast/lion.json': json({ name: 'Lion' }),
  };
}
