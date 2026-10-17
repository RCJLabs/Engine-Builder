// Integer math, Math.imul and correctly rounded operations are deterministic.
import { fnv1a32 } from '@eb/core';
import { helper } from './helper.ts';

export const mix = (a: number, b: number): number => (Math.imul(a ^ b, 0x01000193) >>> 0) + Math.sqrt(4);
export const half = (n: number): number => Math.floor(n / 2) + helper(fnv1a32('x'));
