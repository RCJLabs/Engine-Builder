/**
 * What an exported game's page holds in `#eb-game` (docs/specs/export.md#the-runtime): the
 * edition, which names its saves' storage, the pack, and whether to register the service worker;
 * for a game with spaces, where walk.js is (M5.8).
 */
export interface Boot {
  readonly edition: string;
  readonly pack: unknown;
  readonly sw: boolean;
  /** walk.js's file beside the page, or "#eb-walk", the page's element that holds it. */
  readonly walk?: string;
}

/** Only the names Export writes: the boot JSON never points the page at another script. */
const WALK = /^(#eb-walk|walk\.[0-9a-f]{8}\.js)$/;

export type BootRead = { readonly ok: true; readonly boot: Boot } | { readonly ok: false; readonly message: string };

export function readBoot(text: string | null | undefined): BootRead {
  if (!text?.trim()) return { ok: false, message: 'This page holds no game: Export writes the page with one.' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This page’s game isn’t JSON: export it again.' };
  }
  const boot = value as Partial<Boot> | null;
  if (typeof boot?.edition !== 'string' || typeof boot.sw !== 'boolean' || typeof boot.pack !== 'object') {
    return { ok: false, message: 'This page’s game is missing its edition or pack: export it again.' };
  }
  if (boot.walk !== undefined && (typeof boot.walk !== 'string' || !WALK.test(boot.walk))) {
    return { ok: false, message: 'This page’s game names a walk Export doesn’t write: export it again.' };
  }
  return { ok: true, boot: boot as Boot };
}
