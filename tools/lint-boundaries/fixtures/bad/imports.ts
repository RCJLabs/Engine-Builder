// @expect pure code may import only its own files and pure packages (found "node:fs")
// @expect pure code may import only its own files and pure packages (found "three")
// @expect pure code may import only its own files and pure packages (found "@eb/editor")
// @expect no eval, Function or import() (code made at run time is code no rule has read)
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
export { shell } from '@eb/editor';
export const load = async () => [readFileSync, THREE, await import('three')];
