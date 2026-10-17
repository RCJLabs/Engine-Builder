import type { PanelId } from './layout.ts';
import { ProjectPanel } from './ProjectPanel.tsx';
import { PANELS } from './panels.ts';

/** A panel: the Project panel is real (M2.1); the rest still say what they will hold and which phase builds it. */
export function Panel({ id }: { id: PanelId }) {
  if (id === 'project') return <ProjectPanel />;
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
