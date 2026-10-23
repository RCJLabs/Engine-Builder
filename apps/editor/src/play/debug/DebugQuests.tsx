/**
 * Each quest and why it hasn't moved on (M4.9): its state, what stands in its way with each
 * condition's truth now, and a stage set, or the quest started, as a debug step.
 */
import { useState } from 'preact/hooks';
import { useUniqueId } from '../../app/ids.ts';
import type { QuestWhy } from './quests.ts';
import { debugBusy, runEffects } from './tools.ts';
import { holdsWords } from './words.ts';

export function DebugQuests({ quests }: { quests: readonly QuestWhy[] }) {
  return (
    <ul class="debug-body debug-quests">
      {quests.map((quest) => (
        <QuestItem key={quest.quest} quest={quest} />
      ))}
    </ul>
  );
}

function QuestItem({ quest }: { quest: QuestWhy }) {
  const id = useUniqueId();
  const [stage, setStage] = useState(quest.stage ?? quest.stages[0] ?? '');
  const busy = debugBusy.value;
  const where = quest.stage === undefined ? '' : ` at ${quest.stage}`;
  return (
    <li class="debug-quest">
      <p>
        <strong>{quest.name}</strong>
        {` · ${quest.state}${where}`}
      </p>
      <ul class="debug-why">
        {quest.why.map((line, i) => {
          const holds = holdsWords(line.holds);
          // Lines have no id; their place under the quest is theirs.
          return <li key={i}>{holds === '' ? line.text : `${line.text} (${holds})`}</li>;
        })}
      </ul>
      <div class="form-actions">
        <label for={`${id}-stage`}>{`${quest.name}’s stage`}</label>
        <select
          id={`${id}-stage`}
          class="field form-select"
          value={stage}
          onChange={(event) => setStage(event.currentTarget.value)}
        >
          {quest.stages.map((each) => (
            <option key={each} value={each}>
              {each}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="button"
          disabled={busy || stage === ''}
          onClick={() =>
            void runEffects([{ effect: 'set-stage', quest: quest.quest, stage }], `${quest.name} set to ${stage}.`)
          }
        >
          Set stage
        </button>
        {quest.state === 'waiting' ? (
          <button
            type="button"
            class="button"
            disabled={busy}
            onClick={() => void runEffects([{ effect: 'start-quest', quest: quest.quest }], `${quest.name} started.`)}
          >
            Start it
          </button>
        ) : null}
      </div>
    </li>
  );
}
