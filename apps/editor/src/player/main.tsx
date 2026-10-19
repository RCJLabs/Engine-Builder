/**
 * The player page at /play/ (M4.1, D51): a game file that the editor's Export game wrote, opened
 * from the device and played through its screens, offline. Nothing leaves the browser: the file
 * is read here and played in a worker. A page that is a single file comes with M4.9's export.
 */
import { render } from 'preact';
import { Player } from './Player.tsx';
import './player.css';

const root = document.getElementById('player');
if (root) render(<Player />, root);
// The editor's service worker covers this page too, so a game opened once plays offline after.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
}
