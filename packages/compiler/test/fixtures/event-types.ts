/**
 * The sample record types plus an event type with conditions, and the facts to check them
 * against. The CLI tests pass this file as `--types`, which reads both exports.
 */
export { eventTypes as recordTypes, facts } from '../../../schema/test/events.ts';
