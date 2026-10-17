import { signal } from '@preact/signals';

export interface Chosen {
  readonly type: string;
  readonly id: string;
}

/** The record the inspector shows. A project opening or closing clears it. */
export const chosen = signal<Chosen | null>(null);
