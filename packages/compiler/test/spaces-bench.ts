/**
 * Times the space checks M5.2 adds (D64): a project with 200 keepers and a space of 1,000 objects,
 * each with components, a third placed records with overrides and a third placed houses whose
 * door and host they override, compiled with and without the space. The instrument behind the
 * "space checks" reading in ROADMAP.md.
 *
 *   node packages/compiler/test/spaces-bench.ts
 */
import { compileProject } from '../src/compile.ts';
import { memorySource } from '../src/source.ts';

const json = (value: unknown) => JSON.stringify(value);
const RUNS = 5;

function files(objects: number): Record<string, string> {
  const out: Record<string, string> = {
    'project.json': json({ format: 1, id: 'bench', name: 'Bench', version: '0.1.0' }),
    'types/keeper.json': json({
      title: 'Keeper',
      nameField: 'name',
      fields: { name: { kind: 'text' }, greeting: { kind: 'text', optional: true } },
    }),
    'components/hold.json': json({ title: 'Hold', fields: { grip: { kind: 'enum', values: ['jug', 'crimp'] } } }),
    'prefabs/door.json': json({ name: 'Door', objects: [{ id: 'knob', shape: 'sphere' }] }),
    'prefabs/house.json': json({
      name: 'House',
      objects: [
        { id: 'walls', shape: 'box', components: { collider: {} } },
        { id: 'door', prefab: 'door' },
        { id: 'host', record: 'keeper:k0' },
        { id: 'lamp', shape: 'sphere', components: { light: { range: 6 } } },
      ],
    }),
  };
  for (let i = 0; i < 200; i++) out[`records/keeper/k${i}.json`] = json({ name: `Keeper ${i}` });
  if (objects === 0) return out;
  out['spaces/town.json'] = json({
    name: 'Town',
    objects: Array.from({ length: objects }, (_, i) => {
      const at = [i % 40, 0, Math.floor(i / 40)];
      if (i % 3 === 0) return { id: `k${i}`, record: `keeper:k${i % 200}`, at, overrides: { greeting: `Hi ${i}` } };
      if (i % 3 === 1)
        return {
          id: `h${i}`,
          prefab: 'house',
          at,
          overrides: {
            door: { overrides: { knob: { color: '#c0a040' } } },
            host: { overrides: { greeting: 'Come in' } },
            lamp: { components: { light: { intensity: 2 } } },
          },
        };
      return { id: `b${i}`, shape: 'box', at, components: { hold: { grip: 'jug' }, collider: { shape: 'box' } } };
    }),
  });
  return out;
}

async function median(objects: number): Promise<{ median: number; low: number; high: number; problems: number }> {
  const source = memorySource(files(objects));
  const times: number[] = [];
  let problems = 0;
  for (let run = 0; run < RUNS + 1; run++) {
    const start = performance.now();
    const result = await compileProject(source, []);
    const took = performance.now() - start;
    problems = result.diagnostics.length;
    // The first run warms the JIT and is left out.
    if (run > 0) times.push(took);
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(RUNS / 2)] ?? 0, low: times[0] ?? 0, high: times.at(-1) ?? 0, problems };
}

for (const objects of [0, 1000]) {
  const { median: m, low, high, problems } = await median(objects);
  console.log(
    `${objects} objects: median ${m.toFixed(0)} ms (${low.toFixed(0)} to ${high.toFixed(0)}), ${problems} problems, N=${RUNS}`,
  );
}
