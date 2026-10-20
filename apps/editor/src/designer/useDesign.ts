/**
 * What the frame draws, kept up to date (M4.5): the moment's view for the screen as it stands,
 * looked at again when what the screen names changes, when a file outside ui/ does, and when the
 * Play panel takes a step; samples where the moment has nothing. And the images the screen shows,
 * read from assets/ as object URLs while it is open.
 */

import type { Screen } from '@eb/ui/format';
import { wantsOf, widgetsOf } from '@eb/ui/format';
import type { View } from '@eb/ui/session';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { assetFile } from '../assets/assetEdits.ts';
import { mimeOf } from '../assets/media.ts';
import { playMoment } from '../play/moment.ts';
import { gameRevision, type OpenProject } from '../projects/opened.ts';
import { type Looked, lookAt, type Standing } from './moment.ts';
import { sampleView, withSamples } from './samples.ts';

export function useDesignView(project: OpenProject, screen: Screen): { view: View; standing: Standing | null } {
  const wants = useMemo(() => wantsOf([screen]), [screen]);
  const key = JSON.stringify(wants);
  const [looked, setLooked] = useState<Looked | null>(null);
  const status = project.game.status;
  const changed = gameRevision.value;
  const moment = playMoment.value;
  useEffect(() => {
    let live = true;
    void lookAt(project, wants).then((result) => {
      if (live) setLooked(result);
    });
    return () => {
      live = false;
    };
  }, [key, status, changed, moment, project.source]);
  const view = useMemo(() => (looked?.view ? withSamples(looked.view, screen) : sampleView(screen)), [looked, screen]);
  return { view, standing: looked?.standing ?? null };
}

/** Object URLs for the images a screen shows, by their paths under assets/; let go when no longer shown. */
export function useImages(project: OpenProject, screen: Screen): (path: string) => string | undefined {
  const paths = useMemo(
    () =>
      [...new Set(widgetsOf(screen).flatMap((w) => (w.widget === 'image' && w.asset !== '' ? [w.asset] : [])))].sort(),
    [screen],
  );
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  const changed = gameRevision.value;
  useEffect(() => {
    let live = true;
    const made = new Map<string, string>();
    void Promise.all(
      paths.map(async (path) => {
        const bytes = await project.source.read(assetFile(path));
        if (bytes) made.set(path, URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) })));
      }),
    ).then(() => live && setUrls(made));
    return () => {
      live = false;
      for (const url of made.values()) URL.revokeObjectURL(url);
    };
  }, [paths.join('\n'), changed, project.source]);
  return (path) => urls.get(path);
}
