import { describe, expect, it } from 'vitest';
import { editJson, layoutOf, readJson, writeJson } from './jsonText.ts';

// Built from its code: a formatter may turn the escape into an invisible character.
const BOM = String.fromCharCode(0xfeff);
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(b);
const rename = (value: unknown) => ({ ...(value as object), name: 'Renamed' });

// The layouts the round-trip fixture and real repos hold.
const LAYOUTS: Record<string, string> = {
  'two spaces': '{\n  "id": "a",\n  "name": "Old",\n  "list": [\n    1,\n    2\n  ]\n}\n',
  'a BOM and Windows line ends': `${BOM}{\r\n  "format": 1,\r\n  "name": "Ünïcødé ✓"\r\n}\r\n`,
  tabs: '{\n\t"name": "Rook",\n\t"deep": {\n\t\t"x": 1\n\t}\n}\n',
  'four spaces, no last newline': '{\n    "name": "Old"\n}',
  'one line': '{"name":"Médkit ✓","heal":5}',
};

describe('layoutOf and writeJson', () => {
  it('write an unedited file back byte for byte, in every layout', () => {
    for (const [name, original] of Object.entries(LAYOUTS)) {
      const { value, layout } = readJson(bytes(original));
      expect(writeJson(value, layout), name).toBe(original);
    }
  });

  it('read the layout from the first indented line and the line ends', () => {
    expect(layoutOf(LAYOUTS.tabs as string)).toEqual({ bom: false, eol: '\n', indent: '\t', finalNewline: true });
    expect(layoutOf(LAYOUTS['a BOM and Windows line ends'] as string)).toEqual({
      bom: true,
      eol: '\r\n',
      indent: '  ',
      finalNewline: true,
    });
    expect(layoutOf('{"a":1}')).toEqual({ bom: false, eol: '\n', indent: '', finalNewline: false });
  });

  it('keep newlines inside strings escaped, whatever the line ends', () => {
    const layout = { bom: false, eol: '\r\n' as const, indent: '  ', finalNewline: true };
    expect(writeJson({ note: 'one\ntwo' }, layout)).toBe('{\r\n  "note": "one\\ntwo"\r\n}\r\n');
  });
});

describe('editJson', () => {
  it('changes only the edited line, keeping the BOM and Windows line ends', () => {
    const original = LAYOUTS['a BOM and Windows line ends'] as string;
    const edited = text(editJson(bytes(original), rename));
    expect(edited).toBe(`${BOM}{\r\n  "format": 1,\r\n  "name": "Renamed"\r\n}\r\n`);
    const changed = edited.split('\r\n').filter((line, i) => line !== original.split('\r\n')[i]);
    expect(changed).toEqual(['  "name": "Renamed"']);
  });

  it('gives back the same bytes when the value comes out unchanged', () => {
    const original = bytes(LAYOUTS['one line'] as string);
    expect(editJson(original, (value) => value)).toBe(original);
    expect(editJson(original, (value) => ({ ...(value as object) }))).toBe(original);
  });

  it('sees a change made in place', () => {
    const edited = editJson(bytes(LAYOUTS.tabs as string), (value) => {
      (value as { name: string }).name = 'Edited';
      return value;
    });
    expect(text(edited)).toContain('\t"name": "Edited",\n');
  });

  it('refuses bytes that aren’t UTF-8 or JSON', () => {
    expect(() => editJson(new Uint8Array([0x7b, 0xff, 0x7d]), rename)).toThrow();
    expect(() => editJson(bytes('{"name":'), rename)).toThrow();
  });
});
