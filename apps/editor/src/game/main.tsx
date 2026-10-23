/**
 * The runtime of an exported game (M4.10, D60): the page Export writes reads its game from
 * `#eb-game` and plays it, offline, from a web server, itch.io or the device's files. Nothing
 * leaves the browser. Built apart from the editor (vite.game.config.ts) into one script and one
 * stylesheet, which Export puts beside the page or inside it.
 */
import { render } from 'preact';
import { readBoot } from './boot.ts';
import { Game } from './Game.tsx';
import { startGamePwa } from './pwa.ts';
import './game.css';

const root = document.getElementById('game');
const read = readBoot(document.getElementById('eb-game')?.textContent);
if (root) {
  if (read.ok) render(<Game boot={read.boot} />, root);
  else render(<p class="game-note">{read.message}</p>, root);
}
if (read.ok && read.boot.sw) startGamePwa();
