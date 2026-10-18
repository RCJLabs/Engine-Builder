/**
 * What `import … from 'eb'` gives a script (M3.2, D38): the sim's own API, and nothing that
 * reaches the host. Types are erased by sucrase, so `import type { Module } from 'eb'` costs
 * nothing here. A name added here is a promise to scripts: the list is held by a test.
 */
import {
  calendarOf,
  dateAt,
  defineModule,
  engineModules,
  flagModule,
  formatRef,
  isRecordId,
  logicModule,
  parseRef,
  randomPolicy,
  rulePolicy,
  sheetModule,
  ticksOf,
  timeModule,
  turnFor,
  weightedPolicy,
} from '@eb/core';

export const EB_MODULE: Readonly<Record<string, unknown>> = Object.freeze({
  defineModule,
  // The engine's modules: a game names one to place it among its own, or gets it first (D38).
  engineModules,
  logicModule,
  flagModule,
  sheetModule,
  timeModule,
  // Bots, for Run and eb sim.
  randomPolicy,
  weightedPolicy,
  rulePolicy,
  turnFor,
  // Ids and references, as content writes them.
  isRecordId,
  parseRef,
  formatRef,
  // Calendars.
  calendarOf,
  dateAt,
  ticksOf,
});
