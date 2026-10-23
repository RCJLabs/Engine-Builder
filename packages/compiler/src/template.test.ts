import { describe, expect, it } from 'vitest';
import { fromTemplate, idFromName, shortNameOf } from './template.ts';

const bytes = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const json = (made: Map<string, Uint8Array>, file: string) =>
  JSON.parse(new TextDecoder().decode(made.get(file))) as Record<string, unknown>;

const TEMPLATE = new Map([
  ['project.json', bytes({ format: 1, id: 'salvage-coast', name: 'Salvage coast', version: '0.1.0', kits: ['maps'] })],
  ['export.json', bytes({ name: 'Salvage coast', 'short-name': 'Salvage', colors: { theme: '#18303d' } })],
  ['records/resource/debt.json', bytes({ name: 'Debt', start: 120 })],
  ['scenes/boarding.ink', new TextEncoder().encode('Hello.\n-> END\n')],
]);

describe('a project from a template', () => {
  it('takes the author’s name and its id in project.json, keeping the rest', () => {
    const made = fromTemplate(TEMPLATE, '  The Grey Sound ');
    expect(json(made, 'project.json')).toEqual({
      format: 1,
      id: 'the-grey-sound',
      name: 'The Grey Sound',
      version: '0.1.0',
      kits: ['maps'],
    });
  });

  it('names the export too, with a short name that fits in 12', () => {
    expect(json(fromTemplate(TEMPLATE, 'Grey Sound'), 'export.json')).toEqual({
      name: 'Grey Sound',
      'short-name': 'Grey Sound',
      colors: { theme: '#18303d' },
    });
    // Over 12, its first words that fit, never the template's, which names its own game.
    expect(json(fromTemplate(TEMPLATE, 'The Grey Sound Salvage Co'), 'export.json')).toEqual({
      name: 'The Grey Sound Salvage Co',
      'short-name': 'The Grey',
      colors: { theme: '#18303d' },
    });
  });

  it('makes short names of whole words, or the first 12 characters of one long word', () => {
    expect(shortNameOf('Nightboat')).toBe('Nightboat');
    expect(shortNameOf('Twelve chars')).toBe('Twelve chars');
    expect(shortNameOf('Salvage of the Grey Sound')).toBe('Salvage of');
    expect(shortNameOf('Unbelievablyhuge salvage')).toBe('Unbelievably');
  });

  it('keeps every other file byte for byte, and makes no export.json where the template had none', () => {
    const made = fromTemplate(TEMPLATE, 'Grey Sound');
    expect([...made.keys()].sort()).toEqual([...TEMPLATE.keys()].sort());
    for (const file of ['records/resource/debt.json', 'scenes/boarding.ink'])
      expect(made.get(file)).toBe(TEMPLATE.get(file));
    const bare = new Map([...TEMPLATE].filter(([file]) => file !== 'export.json'));
    expect(fromTemplate(bare, 'Grey Sound').has('export.json')).toBe(false);
  });

  it('refuses an empty name, or a template with no project.json', () => {
    expect(() => fromTemplate(TEMPLATE, '   ')).toThrow('A project needs a name.');
    expect(() => fromTemplate(new Map(), 'Grey Sound')).toThrow('The template has no project.json.');
  });

  it('makes ids as an empty project does', () => {
    expect(idFromName('Salvage Run!')).toBe('salvage-run');
    expect(idFromName('Café Ålesund')).toBe('cafe-alesund');
    expect(idFromName('!!!')).toBe('project');
  });
});
