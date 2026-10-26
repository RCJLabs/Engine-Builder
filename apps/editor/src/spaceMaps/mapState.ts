/**
 * Bake map's state (M6.6, D78): a bake under way and what the last one said, by the space's file.
 */
import { signal } from '@preact/signals';

/** The last bake of the space at `path`: under way, its words, or why it failed. */
export const mapBaking = signal<{ readonly path: string; readonly words: string; readonly busy: boolean } | null>(null);
