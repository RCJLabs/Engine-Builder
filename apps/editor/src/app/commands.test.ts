import { describe, expect, it } from 'vitest';
import { type Command, matchCommands, stepActive } from './commands.ts';

const command = (title: string, keywords?: string): Command => ({ id: title, title, keywords, run: () => undefined });
// Ordered so that ranking has to move commands: the best matches for "pro" and "zip" come late.
const COMMANDS = [
  command('Show the Project panel', 'go open view'),
  command('Show the World panel', 'go open view map'),
  command('New project', 'create start'),
  command('Export the project', 'zip download backup save'),
  command('Import a zip', 'load file'),
  command('Reset the layout', 'panels dock default'),
  command('Project settings', 'options'),
];
const titles = (query: string) => matchCommands(COMMANDS, query).map((c) => c.title);

describe('matchCommands', () => {
  it('offers everything, in order, before anything is typed', () => {
    expect(titles('  ')).toEqual(COMMANDS.map((c) => c.title));
  });

  it('puts titles that start with the query first, then word starts, then the rest', () => {
    expect(titles('new')).toEqual(['New project']);
    expect(titles('pro')).toEqual(['Project settings', 'Show the Project panel', 'New project', 'Export the project']);
    expect(titles('zip')).toEqual(['Import a zip', 'Export the project']);
  });

  it('needs every word typed, in any order, ignoring case', () => {
    expect(titles('PANEL world')).toEqual(['Show the World panel']);
    expect(titles('world project')).toEqual([]);
  });

  it('finds a command by the words people might type for it', () => {
    expect(titles('backup')).toEqual(['Export the project']);
    expect(titles('dock')).toEqual(['Reset the layout']);
  });
});

describe('stepActive', () => {
  it('moves and wraps at both ends', () => {
    expect([stepActive(0, 3, 1), stepActive(2, 3, 1), stepActive(0, 3, -1)]).toEqual([1, 0, 2]);
    expect(stepActive(-1, 3, 1)).toBe(0);
    expect(stepActive(0, 0, 1)).toBe(-1);
  });
});
