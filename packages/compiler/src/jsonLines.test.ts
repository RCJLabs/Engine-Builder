import { describe, expect, it } from 'vitest';
import { placeOfPointer } from './jsonLines.ts';

const text = [
  '{',
  '  "title": "The hut",',
  '  "main": {',
  '    "widget": "stack",',
  '    "children": [',
  '      { "widget": "text", "txt": "a/b" },',
  '      { "widget": "button", "label": "Go \\"on\\"" }',
  '    ]',
  '  },',
  '  "a~b": 1,',
  '  "c/d": [true, null]',
  '}',
].join('\n');

describe('placeOfPointer', () => {
  it('places a field at its key and an item at its start', () => {
    expect(placeOfPointer(text, '')).toEqual({ line: 1, column: 1 });
    expect(placeOfPointer(text, '/title')).toEqual({ line: 2, column: 3 });
    expect(placeOfPointer(text, '/main/children/0')).toEqual({ line: 6, column: 7 });
    expect(placeOfPointer(text, '/main/children/0/txt')).toEqual({ line: 6, column: 27 });
    expect(placeOfPointer(text, '/main/children/1/label')).toEqual({ line: 7, column: 29 });
  });

  it('reads escaped keys, as JSON Pointer escapes them', () => {
    expect(placeOfPointer(text, '/a~0b')).toEqual({ line: 10, column: 3 });
    expect(placeOfPointer(text, '/c~1d/1')).toEqual({ line: 11, column: 17 });
  });

  it('places a field that isn’t there at the object that should hold it', () => {
    expect(placeOfPointer(text, '/main/children/0/text')).toEqual({ line: 6, column: 7 });
    expect(placeOfPointer(text, '/nowhere/at/all')).toEqual({ line: 1, column: 1 });
  });

  it('places nothing past where text that isn’t JSON goes wrong', () => {
    expect(placeOfPointer('{ "a": ', '/a')).toEqual({ line: 1, column: 3 });
    expect(placeOfPointer('', '/a')).toEqual({ line: 1, column: 1 });
  });
});
