import { AssetsPanel } from '../assets/AssetsPanel.tsx';
import { InspectorPanel } from '../forms/InspectorPanel.tsx';
import { RecordsPanel } from '../records/RecordsPanel.tsx';
import type { PanelId } from './layout.ts';
import { ProjectPanel } from './ProjectPanel.tsx';
import { PANELS } from './panels.ts';

/**
 * A panel: the Project panel (M2.1), the Inspector (M2.4), the Records panel (M2.5) and the
 * Assets panel (M2.7) are real; the rest still say what they will hold and which phase builds it.
 */
export function Panel({ id }: { id: PanelId }) {
  if (id === 'project') return <ProjectPanel />;
  if (id === 'inspector') return <InspectorPanel />;
  if (id === 'records') return <RecordsPanel />;
  if (id === 'assets') return <AssetsPanel />;
  const info = PANELS[id];
  return (
    <div class="panel" data-panel={id}>
      <header class="panel-head">
        <h2>{info.label}</h2>
        <span class="badge">{info.phase}</span>
      </header>
      <p>{info.summary}</p>
      <ul class="coming">
        {info.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
