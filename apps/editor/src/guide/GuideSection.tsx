/**
 * The Project panel's Make it yours section (M4.11, D61): guide.json's steps, each with an Open
 * button to the place it names, and Remove the guide. A project without guide.json shows nothing.
 * The steps don't tick themselves off: they open places, and the author reads, changes and plays.
 */
import { GUIDE_FILE } from '@eb/compiler';
import { editing } from '../editing/current.ts';
import { useFile } from '../forms/useFile.ts';
import { openPlace } from '../problems/open.ts';
import type { OpenProject } from '../projects/opened.ts';
import { REMOVE_GUIDE, readGuide, stepPlace } from './guideSteps.ts';
import '../styles/guide.css';

export function GuideSection({ project }: { project: OpenProject }) {
  const loaded = useFile(project, GUIDE_FILE);
  if (loaded === null || loaded.kind === 'missing') return null;
  const guide = loaded.kind === 'ok' ? readGuide(loaded.value) : null;
  const canEdit = editing.access.value.kind === 'editing';
  const remove = () =>
    void editing.edit(REMOVE_GUIDE.label, async (copy) => {
      const before = await copy.read(REMOVE_GUIDE.file);
      return before === undefined ? [] : [{ path: REMOVE_GUIDE.file, before, after: null }];
    });
  return (
    <section class="project-guide" aria-label={guide?.title ?? 'Make it yours'}>
      <h4>{guide?.title ?? 'Make it yours'}</h4>
      {guide ? (
        <ol class="guide-steps">
          {guide.steps.map((step) => {
            const place = stepPlace(step, project.catalog);
            return (
              <li key={step.id} class="guide-step">
                <span class="guide-step-text">
                  <strong>{step.title}</strong>
                  <span class="muted">{step.text}</span>
                </span>
                <button
                  type="button"
                  class="button"
                  disabled={place === null}
                  aria-label={`Open: ${step.title}`}
                  onClick={() => place && openPlace(place)}
                >
                  Open
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p class="field-problem">guide.json can’t be read: see Problems.</p>
      )}
      <button type="button" class="button" disabled={!canEdit} onClick={remove}>
        Remove the guide
      </button>
    </section>
  );
}
