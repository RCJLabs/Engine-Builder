/** The player's settings for this game, read once from its store and written as they change (M4.3). */
import type { Store } from '@eb/platform';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, readSettings, type Settings, settingsKey } from './settings.ts';

export function useSettings(store: Store, game: string, edition: string) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const key = settingsKey(game, edition);
  useEffect(() => {
    let live = true;
    void store.get(key).then(
      (text) => live && setSettings(readSettings(text)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, key]);
  const change = (next: Settings) => {
    setSettings(next);
    // A setting that isn't kept still applies for this visit.
    void store.write({ [key]: JSON.stringify(next) }).catch(() => undefined);
  };
  return [settings, change] as const;
}
