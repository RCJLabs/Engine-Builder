/** A fact catalog for the condition tests, shaped like salvage run's modules. */
import { createRecordStore, type FactCatalog } from '../src/index.ts';

export const catalog: FactCatalog = {
  'hold.count': {
    args: { item: { type: 'ref', to: 'item' } },
    domain: { type: 'int', min: 0, max: 99 },
    describe: (test) =>
      test.op === '>=' && typeof test.value === 'number'
        ? `needs ${test.value} ${test.args?.item}${test.value === 1 ? '' : 's'}`
        : undefined,
  },
  'hold.credits': { domain: { type: 'int', min: 0 }, label: 'credits' },
  'voyage.night': { domain: { type: 'bool' }, label: 'night' },
  'voyage.sector': { domain: { type: 'enum', values: ['core', 'rim', 'void'] }, label: 'sector' },
  'voyage.leader': { domain: { type: 'ref', to: 'actor' }, label: 'leader' },
  'crew.hp': { args: { member: { type: 'ref', to: 'actor' } }, domain: { type: 'int', min: 0, max: 10 } },
  'crew.trait': { args: { member: { type: 'ref', to: 'actor' }, trait: { type: 'text' } }, domain: { type: 'bool' } },
  'crew.morale': { domain: { type: 'number', min: -1, max: 1 } },
  'crew.mood': {},
  'crew.slot': { args: { index: { type: 'int', min: 0, max: 3 } }, domain: { type: 'bool' } },
};

export const records = createRecordStore({
  item: { medkit: {}, salvage: {} },
  actor: { kit: {}, mara: {}, rook: {} },
});
