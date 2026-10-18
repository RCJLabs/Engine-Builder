/**
 * The Logic panel's scripts (M3.2, D38): each script, opening in the inspector; what the game they
 * make declares, or why it hasn't run; and Run. A project from a zip or a folder asks once before
 * its scripts run. Starting a game writes game.ts and a first module that run as they stand.
 */
import { GAME_SCRIPT, scriptPath } from '@eb/script';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { type OpenProject, runScripts } from '../projects/opened.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import type { GameState } from '../scripts/gameState.ts';
import { openScript } from '../scripts/open.ts';
import { createScripts } from '../scripts/scriptEdits.ts';
import { moduleTemplate, startFiles } from '../scripts/templates.ts';
import { trust } from '../scripts/trust.ts';
import { RunGame } from './RunGame.tsx';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A project's first script is its author's own: from then on its scripts run here (D38). */
function trustFirst(project: OpenProject): void {
  if (project.game.ids.length === 0) trust.trust(project.trustKey);
}

function startGame(project: OpenProject): void {
  trustFirst(project);
  void editing
    .edit('Start the game’s scripts', (copy) => createScripts(copy, startFiles(project.game.ids)))
    .then(() => openScript(GAME_SCRIPT));
}

function newScript(project: OpenProject, id: string): void {
  trustFirst(project);
  void editing
    .edit(`New script ${id}`, (copy) => createScripts(copy, [[scriptPath(id), moduleTemplate(id)]]))
    .then(() => openScript(id));
}

/** What the game is, or why there is none to play, in a sentence. */
export function gameText(game: GameState): string {
  const { status, catalog, problems } = game;
  if (status === 'no-game') return 'There is no scripts/game.ts, so nothing runs these scripts yet.';
  if (status === 'untrusted') return 'The game hasn’t run here yet, so content is checked as if it had none.';
  if (status === 'broken') return 'The game can’t run until its scripts’ errors are fixed: see Problems.';
  if (status === 'failed') {
    const failed = problems.find((p) => p.code === 'E031' || p.code === 'E032');
    return `The game failed as it loaded: ${failed?.message ?? 'see Problems'}.`;
  }
  if (!catalog) return '';
  const own = catalog.modules.filter((m) => !['logic', 'flag', 'sheet'].includes(m));
  const bots = catalog.policies.length > 0 ? `bots ${catalog.policies.join(', ')}` : 'no bots of its own';
  return `The game: ${own.length > 0 ? own.join(', ') : 'the engine’s modules alone'}, starting in ${catalog.start}; ${count(catalog.actions.length, 'action')}; ${bots}.`;
}

export function ScriptsSection({ project }: { project: OpenProject }) {
  const { game } = project;
  const heading = useUniqueId();
  const [naming, setNaming] = useState(false);
  const canEdit = editing.access.value.kind === 'editing';
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Scripts</h3>
        {canEdit && game.ids.length > 0 ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New script
          </button>
        ) : null}
      </div>
      {game.status === 'untrusted' ? <TrustBanner /> : null}
      {naming ? (
        <NameRecord
          type="script"
          // game.ts is made by Start a game, never as a module.
          ids={[...game.ids, GAME_SCRIPT]}
          label="Name of the new script"
          action="Create"
          fileOf={scriptPath}
          done={(id) => {
            setNaming(false);
            newScript(project, id);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      <ScriptList game={game} />
      {canEdit && !game.ids.includes(GAME_SCRIPT) ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => startGame(project)}>
            Start a game
          </button>
        </div>
      ) : null}
      {game.status === 'loaded' && game.catalog ? <RunGame project={project} catalog={game.catalog} /> : null}
    </section>
  );
}

/** Asked once, of a project from a zip or a folder, before its scripts run (D38). */
function TrustBanner() {
  return (
    <div class="logic-trust">
      <p>
        This project came from a zip or a folder, so its scripts haven’t run in this browser. A script can do anything
        this editor can: run them only if you trust where the project came from.
      </p>
      <button type="button" class="button primary" onClick={runScripts}>
        Run its scripts
      </button>
    </div>
  );
}

/** The game in a sentence, then each script, or what scripts are for when there are none. */
function ScriptList({ game }: { game: GameState }) {
  if (game.ids.length === 0) {
    return (
      <p class="muted">
        No scripts yet. A game’s code is TypeScript in scripts/: game.ts lists the modules it is made of, the mode it
        starts in and the bots that play it.
      </p>
    );
  }
  const problemsOf = (id: string) => game.problems.filter((p) => p.file === scriptPath(id)).length;
  return (
    <>
      <p class="logic-game">{gameText(game)}</p>
      <ul class="logic-list">
        {game.ids.map((id) => (
          <ScriptCard key={id} id={id} problems={problemsOf(id)} />
        ))}
      </ul>
    </>
  );
}

function ScriptCard({ id, problems }: { id: string; problems: number }) {
  return (
    <li>
      <button type="button" class="logic-card" onClick={() => openScript(id)}>
        <span class="logic-title">{`${id}.ts`}</span>
        <span class="muted">
          {[
            ...(id === GAME_SCRIPT ? ['The game'] : []),
            problems > 0 ? count(problems, 'problem') : 'No problems',
          ].join(' · ')}
        </span>
      </button>
    </li>
  );
}
