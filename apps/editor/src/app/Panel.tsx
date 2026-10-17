import { BUILD, buildStamp } from '../build.ts';
import type { PanelId } from './layout.ts';
import { PANELS } from './panels.ts';

/** A Phase 0 placeholder: what the panel will hold and which phase builds it. */
export function Panel({ id }: { id: PanelId }) {
  const info = PANELS[id];
  return (
    <div class="panel" data-panel={id}>
      <header class="panel-head">
        <h2>{info.label}</h2>
        <span class="badge">{info.phase}</span>
      </header>
      <p>{info.summary}</p>
      <ul class="coming">
        {info.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {id === 'project' ? (
        <dl class="build">
          <dt>Build</dt>
          <dd>{buildStamp()}</dd>
          <dt>Built</dt>
          <dd>{BUILD.built.slice(0, 16).replace('T', ' ')} UTC</dd>
        </dl>
      ) : null}
    </div>
  );
}
