// @expect pure code may import only its own files and pure packages (found "node:fs")
// @expect pure code may import only its own files and pure packages (found "three")
// @expect pure code may import only its own files and pure packages (found "@eb/editor")
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
export { shell } from '@eb/editor';
export const load = async () => [readFileSync, THREE, await import('three')];
