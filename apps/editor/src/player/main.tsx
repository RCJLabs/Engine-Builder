/**
 * The player page at /play/ (M4.1, D51): a game file that the editor's Export game wrote, opened
 * from the device and played through its screens inside the play shell (M4.3), offline. Nothing
 * leaves the browser: the file is read here and played in a worker. A page that is a single file
 * comes with M4.10's export.
 */
import { render } from 'preact';
import { Player } from './Player.tsx';
import { startPlayerPwa } from './pwa.ts';
import './player.css';

const root = document.getElementById('player');
if (root) render(<Player />, root);
// The editor's service worker covers this page too, so a game opened once plays offline after.
startPlayerPwa();
