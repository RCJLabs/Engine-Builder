import { render } from 'preact';
import { App } from './app/App.tsx';
import { note, watchLayout } from './app/state.ts';
import { buildStamp } from './build.ts';
import { startProjects } from './projects/session.ts';
import { startPwa } from './pwa/register.ts';
import './styles/app.css';
import './styles/projects.css';
import './styles/overlays.css';

watchLayout();
note(`Engine-Builder ${buildStamp()}.`);
const root = document.getElementById('app');
if (root) render(<App />, root);
startPwa();
void startProjects();
