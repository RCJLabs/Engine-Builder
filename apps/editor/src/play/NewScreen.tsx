/**
 * New screen (M4.1; templates since M4.4, D54): a blank screen, or one of the stock screens the
 * project's kits allow, written from the project as it stands, then named. The name starts as the
 * template's, so the HUD and the ending find the pages by the ids they look for.
 */
import { screenPath } from '@eb/compiler';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { OpenProject } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { contextFrom, type Held, type StockContext, shownBy } from '../screens/stock/context.ts';
import { STOCK, type Stock, stockText } from '../screens/stock/index.ts';
import { screenTemplate } from '../screens/templates.ts';

/** The project as a template reads it: its records, its kits, its game once run, and its screens. */
async function contextOf(project: OpenProject): Promise<StockContext> {
  const { catalog, game, index } = project;
  const held: Held[] = [...(index?.records.values() ?? [])].filter((record) => record.value !== undefined);
  const modes = game.catalog
    ? {
        start: game.catalog.start,
        all: game.catalog.modes,
        endings: game.catalog.endings,
        travelling: game.catalog.travelling,
      }
    : undefined;
  return contextFrom(
    {
      game: project.summary.project?.name ?? project.label,
      kits: catalog.kits,
      ...(modes ? { modes } : {}),
      screens: catalog.screens,
      spaces: spacesOf(project),
      shown: await shownBy(catalog.screens.map(screenPath), (path) => project.source.read(path)),
    },
    held,
  );
}

const spacesOf = (project: OpenProject) =>
  project.catalog.spaces.map((entry) => ({ id: entry.id, name: entry.name ?? entry.id }));

const BLANK = 'blank';

export function NewScreen(props: {
  project: OpenProject;
  create: (path: string, text: string, label: string) => void;
  cancel: () => void;
}) {
  const { project, create, cancel } = props;
  const select = useUniqueId();
  const [picked, setPicked] = useState(BLANK);
  // Offered by the kits alone: what a template reads of the records is filled in as it is written.
  const kitsOnly = {
    game: '',
    kits: project.catalog.kits,
    records: new Map(),
    starting: [],
    screens: [],
    shown: new Set<string>(),
    spaces: spacesOf(project),
  };
  const offered = STOCK.filter((stock) => stock.offered(kitsOnly));
  const stock: Stock | undefined = offered.find((each) => each.id === picked);
  return (
    <div class="new-screen">
      <label for={select}>Template</label>
      <select
        id={select}
        class="field form-select"
        value={picked}
        aria-describedby={`${select}-about`}
        onChange={(event) => setPicked(event.currentTarget.value)}
      >
        <option value={BLANK}>Blank</option>
        {offered.map((each) => (
          <option key={each.id} value={each.id}>
            {each.name}
          </option>
        ))}
      </select>
      <p id={`${select}-about`} class="form-help">
        {stock ? stock.about : 'A title and a Close button, to build on'}
      </p>
      <NameRecord
        key={picked}
        type="screen"
        // ui/theme.json, ui/feedback.json and ui/shell.json are none of them screens, so no screen can be named so.
        ids={[...project.catalog.screens, 'theme', 'feedback', 'shell']}
        label="Name of the new screen"
        action="Create"
        {...(stock ? { initial: stock.name } : {})}
        fileOf={screenPath}
        done={(id, typed) => {
          if (stock === undefined) {
            create(screenPath(id), screenTemplate(typed), `New screen ${id}`);
            return;
          }
          void contextOf(project).then((ctx) => create(screenPath(id), stockText(stock, ctx), `New screen ${id}`));
        }}
        cancel={cancel}
      />
    </div>
  );
}
