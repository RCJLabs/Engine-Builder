import { render } from 'preact';
import { App } from './app/App.tsx';
import { note, watchLayout } from './app/state.ts';
import { buildStamp } from './build.ts';
import { startPwa } from './pwa/register.ts';
import './styles/app.css';

watchLayout();
note(`Engine-Builder ${buildStamp()}. Phase 0 shell: no project loaded yet.`);
const root = document.getElementById('app');
if (root) render(<App />, root);
startPwa();
