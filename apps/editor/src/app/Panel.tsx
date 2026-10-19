import { AssetsPanel } from '../assets/AssetsPanel.tsx';
import { InspectorPanel } from '../forms/InspectorPanel.tsx';
import { LogicPanel } from '../logic/LogicPanel.tsx';
import { PlayPanel } from '../play/PlayPanel.tsx';
import { ProblemsPanel } from '../problems/ProblemsPanel.tsx';
import { RecordsPanel } from '../records/RecordsPanel.tsx';
import { Console } from './Console.tsx';
import type { PanelId } from './layout.ts';
import { ProjectPanel } from './ProjectPanel.tsx';
import { PANELS } from './panels.ts';

/**
 * A panel: the Project panel (M2.1), the Inspector (M2.4), the Records panel (M2.5), the Assets
 * panel (M2.7), Problems and the Console (M2.8), Logic (M3.1) and Play (M4.1) are real; the rest still say
 * what they will hold and which phase builds it.
 */
export function Panel({ id }: { id: PanelId }) {
  if (id === 'project') return <ProjectPanel />;
  if (id === 'inspector') return <InspectorPanel />;
  if (id === 'records') return <RecordsPanel />;
  if (id === 'assets') return <AssetsPanel />;
  if (id === 'problems') return <ProblemsPanel />;
  if (id === 'logic') return <LogicPanel />;
  if (id === 'play') return <PlayPanel />;
  // In a zone (a phone's tab) the zone's tabpanel already names it, as the dock's group does.
  if (id === 'console') return <Console docked />;
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
