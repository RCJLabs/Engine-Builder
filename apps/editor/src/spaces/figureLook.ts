/**
 * An NPC's look as plain values (M6.1, D73, docs/specs/npcs.md#the-look): a placed actor through
 * its placement's overrides, drawn as its model when it names one, else as the engine's figure,
 * whose height also sets where its Talk is measured from and the size of its solid.
 */
import { type Fields, isFields, recordHere } from '@eb/compiler';

/** The record type an NPC is placed as. */
export const ACTOR = 'actor';

/** The figure's size and its colours left out: a grey-blue coat, a brown trim and a mid skin. */
export const FIGURE = {
  height: 1.75,
  lowest: 0.5,
  highest: 2.5,
  radius: 0.3,
  clothes: '#4a6378',
  trim: '#6b4a2f',
  skin: '#c99a76',
} as const;

export interface FigureLook {
  readonly height: number;
  readonly clothes: string;
  readonly trim: string;
  readonly skin: string;
}

/** What draws a placed record as a figure, by its key and what its placement passes on: null for anything else. */
export type FigureOf = (key: string, passed: readonly Fields[]) => FigureLook | null;

const COLOUR = /^#[0-9a-fA-F]{6}$/;
const colour = (value: unknown, fallback: string) =>
  typeof value === 'string' && COLOUR.test(value) ? value : fallback;

/** A placed actor's height in metres, with or without a model: its figure's, 1.75 when left out. */
export function heightOf(value: unknown, passed: readonly Fields[]): number {
  const figure = recordHere(value, passed).figure;
  const height = isFields(figure) ? figure.height : undefined;
  if (typeof height !== 'number' || !Number.isFinite(height)) return FIGURE.height;
  return Math.min(FIGURE.highest, Math.max(FIGURE.lowest, height));
}

/** The figure a placed record draws as: an actor's, when it names no model; else null. */
export function figureOf(key: string, value: unknown, passed: readonly Fields[]): FigureLook | null {
  if (!key.startsWith(`${ACTOR}:`)) return null;
  const here = recordHere(value, passed);
  if (typeof here.model === 'string') return null;
  const figure = isFields(here.figure) ? here.figure : {};
  return {
    height: heightOf(value, passed),
    clothes: colour(figure.clothes, FIGURE.clothes),
    trim: colour(figure.trim, FIGURE.trim),
    skin: colour(figure.skin, FIGURE.skin),
  };
}

/** Where an NPC's Talk is measured from, above its feet: its chest, at two thirds of its height. */
export const chestOf = (height: number): number => (height * 2) / 3;

/** A records lookup made into a FigureOf: the Scene panel's index's, or a pack's world's. */
export const figuresFrom =
  (value: (key: string) => unknown): FigureOf =>
  (key, passed) =>
    key.startsWith(`${ACTOR}:`) ? figureOf(key, value(key), passed) : null;

/** What the walk needs of a placed actor: its figure, or null when it draws as a model, and its height. */
export interface Npc {
  readonly figure: FigureLook | null;
  readonly height: number;
}

/** A placed record as an NPC, by its key and what its placement passes on: null for a record that isn't an actor. */
export type NpcOf = (key: string, passed: readonly Fields[]) => Npc | null;

export const npcsFrom =
  (value: (key: string) => unknown): NpcOf =>
  (key, passed) =>
    key.startsWith(`${ACTOR}:`)
      ? { figure: figureOf(key, value(key), passed), height: heightOf(value(key), passed) }
      : null;
