/**
 * What the editor's tabs tell each other about a project, over a BroadcastChannel: a save, so a
 * tab showing the project read only shows it as saved (from who-am-i-'s answers store, which
 * reloads when another tab says it changed the data); a request to hand editing over; and a
 * refusal when the editing tab can't save first.
 */
export type TabMessage =
  /** `paths` are the files the save wrote; an editor from before M2.5 leaves them out. */
  | { readonly kind: 'saved'; readonly lock: string; readonly paths?: readonly string[] }
  | { readonly kind: 'hand-over'; readonly lock: string }
  | { readonly kind: 'refused'; readonly lock: string; readonly reason: string };

export interface Tabs {
  post(message: TabMessage): void;
  listen(handler: (message: TabMessage) => void): () => void;
}

export const CHANNEL = 'eb-editor';

/** The browser's channel, or one that goes nowhere where there is none. */
export function browserTabs(): Tabs {
  if (typeof BroadcastChannel === 'undefined') return { post: () => undefined, listen: () => () => undefined };
  const channel = new BroadcastChannel(CHANNEL);
  return {
    post: (message) => channel.postMessage(message),
    listen: (handler) => {
      const listener = (event: MessageEvent<TabMessage>) => handler(event.data);
      channel.addEventListener('message', listener);
      return () => channel.removeEventListener('message', listener);
    },
  };
}
