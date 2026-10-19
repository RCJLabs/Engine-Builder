/**
 * The quests kit's metrics (M3.9, docs/specs/quests.md#the-bots): each quest's state at the runs'
 * end, named by the quest, and none with the kit off, when "quest" may be a project's own type.
 */
import { createRecordStore } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { RECORDS } from '../../test/dock.ts';
import { kitMetrics } from './metrics.ts';

const content = createRecordStore(RECORDS as unknown as Record<string, Record<string, unknown>>);

describe('the kits’ metrics', () => {
  it('are each quest’s state, in the order of their ids, with the quests kit on', () => {
    const metrics = kitMetrics(['time', 'quests'], content);
    expect(metrics.slice(0, 2)).toEqual([
      { fact: 'quests.state', args: { quest: 'bounty' }, label: 'Drone bounty (bounty)' },
      { fact: 'quests.state', args: { quest: 'courier' }, label: 'The courier run (courier)' },
    ]);
    expect(metrics).toHaveLength(content.ids('quest').length);
  });

  it('are none with the kit off, though the content has quest records', () => {
    expect(kitMetrics(['inventory', 'events'], content)).toEqual([]);
  });
});
