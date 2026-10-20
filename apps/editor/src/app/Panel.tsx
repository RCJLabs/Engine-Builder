import { AssetsPanel } from '../assets/AssetsPanel.tsx';
import { InspectorPanel } from '../forms/InspectorPanel.tsx';
import { LogicPanel } from '../logic/LogicPanel.tsx';
import { WorldPanel } from '../maps/WorldPanel.tsx';
import { PlayPanel } from '../play/PlayPanel.tsx';
import { ProblemsPanel } from '../problems/ProblemsPanel.tsx';
import { RecordsPanel } from '../records/RecordsPanel.tsx';
import { Console } from './Console.tsx';
import type { PanelId } from './layout.ts';
import { ProjectPanel } from './ProjectPanel.tsx';

/**
 * A panel: the Project panel (M2.1), the Inspector (M2.4), the Records panel (M2.5), the Assets
 * panel (M2.7), Problems and the Console (M2.8), Logic (M3.1), Play (M4.1) and World (M4.6). The
 * phases to come grow these; More's list still says what each will hold (panels.ts).
 */
export function Panel({ id }: { id: PanelId }) {
  if (id === 'project') return <ProjectPanel />;
  if (id === 'inspector') return <InspectorPanel />;
  if (id === 'records') return <RecordsPanel />;
  if (id === 'assets') return <AssetsPanel />;
  if (id === 'problems') return <ProblemsPanel />;
  if (id === 'logic') return <LogicPanel />;
  if (id === 'play') return <PlayPanel />;
  if (id === 'world') return <WorldPanel />;
  // In a zone (a phone's tab) the zone's tabpanel already names it, as the dock's group does.
  return <Console docked />;
}
