import { engineModules, type FactCatalog, factCatalog } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { compileScene, lineAt } from './index.ts';

const facts: FactCatalog = {
  ...factCatalog(engineModules),
  'time.day': { domain: { type: 'int', min: 1 } },
  'quests.state': {
    args: { quest: { type: 'ref', to: 'quest' } },
    domain: { type: 'enum', values: ['waiting', 'active', 'done', 'failed'] },
  },
  'dialogue.heard': {
    args: { talk: { type: 'ref', to: 'talk' }, line: { type: 'text' } },
    domain: { type: 'int', min: 0 },
  },
  'my-game.ready': { domain: { type: 'bool' } },
  'faction.name': { args: { faction: { type: 'ref', to: 'faction' } }, domain: { type: 'text' } },
};

const ink = (lines: string[]) => lines.join('\n');
const compile = (lines: string[]) => compileScene(ink(lines), { facts });
const talkOf = (lines: string[]) => {
  const { talk, problems } = compile(lines);
  expect(problems).toEqual([]);
  return talk as { starts: unknown; lines: Record<string, unknown>[]; name?: string; 'show-odds'?: boolean };
};
const problemsOf = (lines: string[]) => compile(lines).problems.map((p) => `${p.code} ${p.line}: ${p.message}`);

describe('a scene', () => {
  it('makes a talk of its lines, choices and gathers', () => {
    expect(
      talkOf([
        'At dusk a woman comes up the path.',
        '"I keep the bridge." # speaker: modgudr',
        '* ["Is my grandfather there?"]',
        '  # fx: add-to-flag(flag: truth, by: 1)',
        '  "Two benches down." # speaker: modgudr',
        '* [Say nothing.]',
        '- She goes.',
        '-> END',
      ]),
    ).toEqual({
      starts: [{ line: 'start' }],
      lines: [
        { id: 'start', text: 'At dusk a woman comes up the path.', next: 'start-2' },
        {
          id: 'start-2',
          speaker: 'modgudr',
          text: '"I keep the bridge."',
          options: [
            {
              id: 'start-2-1',
              label: '"Is my grandfather there?"',
              effects: [{ effect: 'add-to-flag', flag: 'truth', by: 1 }],
              next: 'start-3',
            },
            { id: 'start-2-2', label: 'Say nothing.', next: 'start-4' },
          ],
        },
        { id: 'start-3', speaker: 'modgudr', text: '"Two benches down."', next: 'start-4' },
        { id: 'start-4', text: 'She goes.' },
      ],
    });
  });

  it('runs on one speaker’s lines as one, until another speaks or a beat', () => {
    const { lines } = talkOf([
      'Narration one.',
      'Narration two.',
      '"Hello." # speaker: marge',
      '# speaker: marge',
      '"Still me."',
      '"A new breath." # speaker: marge # beat',
      'Back to the narrator.',
    ]);
    expect(lines.map((l) => [l.speaker, l.text])).toEqual([
      [undefined, 'Narration one.\nNarration two.'],
      ['marge', '"Hello."\n"Still me."'],
      ['marge', '"A new breath."'],
      [undefined, 'Back to the narrator.'],
    ]);
  });

  it('takes its name and show-odds from the top, and its effects from # fx tags', () => {
    const talk = talkOf([
      '# name: Marge at the crag',
      '# show-odds',
      '// a comment',
      'Hi. # fx: set-flag(flag: met, value: true) # fx: add-resource(resource: cash, amount: -10)',
      '# fx: note(text: "A \\"quoted\\" word", tags: [a, b], cost: (cash: 2))',
      'Bye.',
    ]);
    expect(talk.name).toBe('Marge at the crag');
    expect(talk['show-odds']).toBe(true);
    expect(talk.lines[0]?.effects).toEqual([
      { effect: 'set-flag', flag: 'met', value: true },
      { effect: 'add-resource', resource: 'cash', amount: -10 },
      { effect: 'note', text: 'A "quoted" word', tags: ['a', 'b'], cost: { cash: 2 } },
    ]);
    expect(talk.lines[0]?.text).toBe('Hi.\nBye.');
  });
});

describe('choices', () => {
  it('take their label, conditions, cost and needs, and divert on their line', () => {
    const { lines } = talkOf([
      'EXTERNAL flag_on(flag)',
      'EXTERNAL time_day()',
      'Pick.',
      '* (gas) {flag_on("met")} {time_day() > 2} [Chip in. # cost: cash 10, rope 1 # needs: not flag_on("broke")] -> END',
      '* ["Beta?"] -> END',
    ]);
    expect(lines[0]?.options).toEqual([
      {
        id: 'gas',
        label: 'Chip in.',
        if: 'flag.on(met) and time.day > 2',
        needs: 'not flag.on(broke)',
        cost: { cash: 10, rope: 1 },
      },
      { id: 'start-2', label: '"Beta?"' },
    ]);
  });

  it('nest, their loose ends gathered by the next gather as shallow', () => {
    const { lines } = talkOf([
      'Ask.',
      '* [Ask him.]',
      '  He answers.',
      '  ** [Go, then.]',
      '     He goes.',
      '  ** [Stay.]',
      '* [Don’t.]',
      '- Later.',
      '-> END',
    ]);
    expect(
      lines.map((l) => [l.id, l.text, l.next, (l.options as { next?: string }[] | undefined)?.map((o) => o.next)]),
    ).toEqual([
      ['start', 'Ask.', undefined, ['start-2', 'start-4']],
      ['start-2', 'He answers.', undefined, ['start-3', 'start-4']],
      ['start-3', 'He goes.', 'start-4', undefined],
      ['start-4', 'Later.', undefined, undefined],
    ]);
  });

  it('hang on a line of their own after a labelled gather, which diverts reach', () => {
    const { lines } = talkOf([
      '-> hill',
      '=== hill ===',
      'The raven comes.',
      '- (choose)',
      '* [Fly.] -> END',
      '* [Wait.]',
      '  The hill doesn’t come down.',
      '  -> choose',
      '* [Rest.] -> hill.choose',
    ]);
    expect(lines.map((l) => [l.id, l.text, l.next])).toEqual([
      ['hill', 'The raven comes.', 'hill-choose'],
      ['hill-choose', undefined, undefined],
      ['hill-2', 'The hill doesn’t come down.', 'hill-choose'],
    ]);
    const options = (lines[1]?.options ?? []) as { next?: string; once?: boolean }[];
    expect(options.map((o) => o.next)).toEqual([undefined, 'hill-2', 'hill-choose']);
    // On a loop, an ink choice is once-only, as within one play; elsewhere it is shown again when the talk is.
    expect(options.map((o) => o.once)).toEqual([true, true, true]);
  });
});

describe('conditions', () => {
  const cond = (
    text: string,
    externals = ['flag_on(flag)', 'flag_number(flag)', 'quests_state(quest)', 'time_day()'],
  ) => talkOf([...externals.map((e) => `EXTERNAL ${e}`), `{ ${text}: Yes. }`, 'Then.']).lines[0]?.branches;

  it('name facts by EXTERNAL, a lone number holding when it isn’t 0', () => {
    expect(cond('flag_on("met")')).toEqual([{ if: 'flag.on(met)', line: 'start-2' }]);
    expect(cond('flag_number("truth")')).toEqual([{ if: 'flag.number(truth) != 0', line: 'start-2' }]);
    expect(cond('3 <= flag_number("truth")')).toEqual([{ if: 'flag.number(truth) >= 3', line: 'start-2' }]);
    expect(cond('quests_state("debt") == "done"')).toEqual([{ if: 'quests.state(debt) == done', line: 'start-2' }]);
    expect(cond('not flag_on("a") && (flag_on("b") || flag_on("c")) and time_day() > -1')).toEqual([
      { if: 'not flag.on(a) and (flag.on(b) or flag.on(c)) and time.day > -1', line: 'start-2' },
    ]);
    expect(cond('my_game_ready()', ['my_game_ready()'])).toEqual([{ if: 'my-game.ready', line: 'start-2' }]);
  });

  it('are refused, at their line and column, when they aren’t a fact compared with a value', () => {
    const at = (text: string) =>
      compile(['EXTERNAL flag_number(flag)', `{ ${text}: Yes. }`]).problems.filter((p) => p.line === 2);
    expect(at('flag_number("a") > flag_number("b")')).toEqual([
      { code: 'E046', line: 2, column: 20, message: 'Compare a fact with a value, not with another fact' },
    ]);
    expect(at('x > 2')[0]?.message).toMatch(/ink variable or read count/);
    expect(at('flag_number("a") + 1 > 2')[0]?.message).toMatch(/Arithmetic/);
    expect(at('RANDOM(1, 6) > 3')[0]?.message).toMatch(/RANDOM isn’t read/);
    expect(at('flag_on("a")')[0]?.message).toMatch(/isn’t an EXTERNAL of this scene/);
    expect(at('flag_number(a)')[0]?.message).toMatch(/ink variable/);
    expect(at('true')[0]?.message).toMatch(/always true or always false/);
    expect(at('flag_number("a") = 2')[0]?.message).toMatch(/Compare with "=="/);
    expect(at('flag_number("a", "b")')[0]?.message).toMatch(/takes 1 argument/);
  });

  it('read EXTERNALs against the game’s facts', () => {
    expect(
      problemsOf([
        'EXTERNAL flags_on(flag)',
        'EXTERNAL flag_on(name)',
        'EXTERNAL dialogue_heard(talk)',
        'EXTERNAL time_day()',
        'EXTERNAL time_day()',
        'EXTERNAL faction_name(faction)',
        'EXTERNAL quests_state(quest, quest)',
        '{ faction_name("hel"): Hi. }',
      ]),
    ).toEqual([
      'E012 1: EXTERNAL flags_on names no fact of the game: an EXTERNAL is a fact’s name with _ for its . and -, like flags_value for flags.value',
      'E013 2: flag.on has no argument name: it takes flag',
      'E013 3: dialogue.heard takes talk, line: name each in the EXTERNAL',
      'E046 5: EXTERNAL time_day is declared twice',
      'E013 7: An argument of quests.state is named twice',
      'E046 8: Compare faction.name with a value: it isn’t true or false',
    ]);
  });
});

describe('conditional blocks', () => {
  it('branch the line before them, each branch going on to what follows', () => {
    const { lines } = talkOf([
      'EXTERNAL flag_on(flag)',
      'The letter.',
      '{',
      '- flag_on("a"):',
      '  "A." # speaker: ulf',
      '- flag_on("b"): -> END',
      '- else:',
      '  # fx: set-flag(flag: c, value: true)',
      '  Short.',
      '}',
      'After.',
    ]);
    expect(lines.map((l) => [l.id, l.text, l.branches, l.next])).toEqual([
      ['start', 'The letter.', [{ if: 'flag.on(a)', line: 'start-2' }, { if: 'flag.on(b)' }], 'start-3'],
      ['start-2', '"A."', undefined, 'start-4'],
      ['start-3', 'Short.', undefined, 'start-4'],
      ['start-4', 'After.', undefined, undefined],
    ]);
    expect(lines[2]?.effects).toEqual([{ effect: 'set-flag', flag: 'c', value: true }]);
  });

  it('pass on a line of their own after a gather or at a knot’s start, and nest', () => {
    const { starts, lines } = talkOf([
      'EXTERNAL flag_on(flag)',
      '{ flag_on("a"):',
      '  { flag_on("b"):',
      '    Both.',
      '  - else:',
      '    Only a.',
      '  }',
      '}',
      '- { flag_on("c"): -> other }',
      '-> END',
      '=== other ===',
      'Other.',
      '-> END',
    ]);
    expect(starts).toEqual([{ line: 'start' }]);
    expect(lines.map((l) => [l.id, l.text, l.branches, l.next])).toEqual([
      ['start', undefined, [{ if: 'flag.on(a)', line: 'start-2' }], 'start-5'],
      ['start-2', undefined, [{ if: 'flag.on(b)', line: 'start-3' }], 'start-4'],
      ['start-3', 'Both.', undefined, 'start-5'],
      ['start-4', 'Only a.', undefined, 'start-5'],
      ['start-5', undefined, [{ if: 'flag.on(c)', line: 'other' }], undefined],
      ['other', 'Other.', undefined, undefined],
    ]);
  });

  it('inside a line show one of its variants, from a line that passes and holds its effects', () => {
    const { lines } = talkOf([
      'EXTERNAL flag_on(flag)',
      'You write {flag_on("u"):Ulf’s name|it}, and {flag_on("s"): shake| don’t}. # fx: set-flag(flag: w, value: true)',
    ]);
    expect(lines).toEqual([
      {
        id: 'start',
        effects: [{ effect: 'set-flag', flag: 'w', value: true }],
        branches: [
          { if: 'flag.on(u) and flag.on(s)', line: 'start-1' },
          { if: 'flag.on(u) and not flag.on(s)', line: 'start-2' },
          { if: 'not flag.on(u) and flag.on(s)', line: 'start-3' },
        ],
        next: 'start-4',
      },
      { id: 'start-1', text: 'You write Ulf’s name, and shake.' },
      { id: 'start-2', text: 'You write Ulf’s name, and don’t.' },
      { id: 'start-3', text: 'You write it, and shake.' },
      { id: 'start-4', text: 'You write it, and don’t.' },
    ]);
  });
});

describe('ink outside the subset', () => {
  it.each([
    ['VAR x = 1', 'ink’s variables aren’t read: keep state in the game, as facts and effects'],
    ['CONST x = 1', 'ink’s variables aren’t read: keep state in the game, as facts and effects'],
    ['LIST l = a, b', 'ink’s lists aren’t read: keep state in the game, as facts and effects'],
    ['INCLUDE other.ink', 'A scene is one file: INCLUDE isn’t read'],
    ['~ x = 2', 'Logic lines aren’t read: change the game with # fx: tags'],
    ['=== function f() ===', 'ink’s functions aren’t read: name a fact of the game through an EXTERNAL'],
    ['= stitch', 'Stitches aren’t read: make it a knot of its own'],
    ['<- thread', 'Threads aren’t read: divert to a knot instead'],
    ['+ [Sticky]', 'Sticky choices (+) aren’t read: write * choices'],
    ['* Said aloud', 'Write a choice as * [what the player says], and what follows on the lines after it'],
    ['* [Go.] Then more.', 'Write a choice as * [what the player says], and what follows on the lines after it'],
    [
      '* [Go.] # fx: set-flag(flag: a, value: true)',
      'Put a choice’s effects on the line after it, or its cost and needs inside its [ ]',
    ],
    [
      '* [Go. # fx: set-flag(flag: a, value: true)]',
      'Inside a choice’s [ ], only # cost and # needs: put # fx on the line after it',
    ],
    ['-> knot ->', 'Tunnels aren’t read: divert to a knot or a gather’s label'],
    ['->->', 'Tunnels aren’t read: divert to a knot or a gather’s label'],
    ['Stuck <> together.', 'Glue isn’t read: write the line whole'],
    ['{a|b|c}', 'Only {condition: this|that} is read: ink’s alternatives aren’t'],
    [
      'A {&a|b} shuffle.',
      'Only {condition: this|that} is read inside a line: ink’s alternatives and printed variables aren’t',
    ],
    [
      'Hello # mood: sad',
      'Unknown tag "mood: sad": the engine reads # speaker, # fx, # beat, # cost, # needs, # name, # show-odds',
    ],
    ['Hello # name: x', '# name and # show-odds go at the scene’s top, before its first line'],
    ['Hi # speaker: two words', 'A speaker tag names one speaker by id: # speaker: marge'],
    ['Hi # fx: Give', 'An effect starts with its name, like give-item'],
    ['Hi # fx: give-item(item: a, item: b)', '"item" is given twice'],
    ['Hi # fx: give-item(effect: a)', '"effect" is the effect’s name, not a field'],
    ['Hi # fx: note(text: "open)', 'This text has no closing "'],
    ['TODO: write it', 'TODO lines aren’t read: write it as a comment'],
  ])('%s', (line, message) => {
    expect(compile(['Start.', line, '-> END']).problems.map((p) => [p.line, p.message])).toContainEqual([2, message]);
  });

  it('a choice or a gather inside a block, an unclosed block, and a switch', () => {
    expect(
      problemsOf([
        'EXTERNAL time_day()',
        '{ time_day() > 1:',
        '  * [No.]',
        '  - Gather.',
        '}',
        '{ time_day():',
        '- 1: One.',
        '}',
        '{',
        '- time_day() > 2: Late.',
        '=== knot ===',
        'Hi.',
        '-> END',
      ]),
    ).toEqual([
      'E046 3: A choice can’t sit inside a condition: put the condition on the choice, * {…} [ ]',
      'E046 4: Expected - condition: or - else:',
      'E046 7: A switch on a value isn’t read: write { and - condition: on each line',
      'E046 9: The block from line 9 isn’t closed with }',
    ]);
  });

  it('a loose end in a knot, a divert to nothing, names that clash and an empty scene', () => {
    expect(
      problemsOf([
        '-> a',
        '=== a ===',
        'Hi.',
        '* [Go.] -> nowhere',
        '* [Stay.]',
        '  Stays.',
        '- (b) x',
        '-> END',
        '=== a_b ===',
        'Hi.',
        '-> END',
        '=== Bad ===',
        'Bad.',
      ]),
    ).toEqual([
      'E046 4: No knot or label called nowhere',
      'E046 9: Two lines would both be called a-b: the other is on line 7',
      'E046 12: Name "Bad" in lowercase words joined by _, like the_pass',
      'E046 13: The flow runs out here: end it with -> END, or divert',
    ]);
    expect(problemsOf(['=== a ===', 'Hi.', '-> END'])).toEqual([
      'E046 1: Nothing to say: write a line before the first knot, or divert to one',
    ]);
  });
});

describe('the map', () => {
  it('gives the scene’s line for each part of the talk, through block comments too', () => {
    const { map } = compile([
      '/* a comment',
      '   over two lines */',
      'Hi. # speaker: marge',
      '* [Go.]',
      '  # fx: set-flag(flag: a, value: true)',
      '  Gone.',
    ]);
    expect(lineAt(map, '/lines/0')).toBe(3);
    expect(lineAt(map, '/lines/0/speaker')).toBe(3);
    expect(lineAt(map, '/lines/0/options/0/label')).toBe(4);
    expect(lineAt(map, '/lines/0/options/0/effects/0/flag')).toBe(5);
    expect(lineAt(map, '/lines/1/text')).toBe(6);
    expect(lineAt(map, '/starts/0/line')).toBe(1);
    expect(lineAt(map, '/name')).toBeUndefined();
  });
});
