export { ActionError, createGame, type Game, type GameDefinition } from './game.ts';
export { MigrationError, type MigrationReport } from './migrate.ts';
export {
  type ActionPayload,
  type ActionRun,
  type ActionSpec,
  defineModule,
  type EffectRun,
  type EffectSpec,
  type FactArgs,
  type FactRead,
  type FactSpec,
  type FactView,
  type InitContext,
  type ModeControl,
  type ModeDef,
  type Module,
  type ModuleContext,
  type ModuleDef,
  type OptionsView,
  type PreviewContext,
} from './module.ts';
export { factCatalog } from './registry.ts';
export { createSession, type Session } from './session.ts';
export type {
  Action,
  Attempt,
  Beat,
  DeepReadonly,
  Effect,
  EffectPreview,
  GameState,
  KernelState,
  ModeFrame,
  RejectedBeat,
  SimContext,
  Step,
} from './types.ts';
