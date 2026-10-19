/**
 * The player page's worker (M4.1, D51): the game's scripts run here, never on the page, with the
 * host's ways out taken away first (lockDown.ts), as the editor's Play worker does.
 */
import type { PlayReply, PlayRequest } from '@eb/ui/session';
import { playHost } from '@eb/ui/session';
import { lockDown } from '../scripts/lockDown.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PlayRequest>) => void) | null;
  postMessage(reply: PlayReply): void;
};
// Taken before any script runs: a script may change the global, not this.
const post = scope.postMessage.bind(scope);
lockDown(scope);
const host = playHost();
scope.onmessage = ({ data }) => post(host(data));
