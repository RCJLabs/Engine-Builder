/** Fields every kit's types share (M3.3, M3.4): a record's name, description and tags. */
import type { FieldDef } from './typeFile.ts';

export const NAME: FieldDef = { kind: 'text', optional: true, label: 'Name' };
export const DESCRIPTION: FieldDef = { kind: 'text', multiline: true, optional: true, label: 'Description' };
export const TAGS: FieldDef = { kind: 'list', min: 1, of: { kind: 'text', min: 1 }, optional: true, label: 'Tags' };
