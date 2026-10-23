/**
 * The fight above an encounter's form (M4.7, D57, docs/specs/encounters.md#the-editor): each result
 * with its chance, what the party loses and who falls, worked out as the sim works it out, against
 * the encounter's fighters or the roster's start at full health, or one actor picked. It changes
 * as the form is typed in.
 */
import { formatRef } from '@eb/core';
import { ACTOR } from '@eb/kits';
import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { OpenProject } from '../projects/opened.ts';
import { actorsIn, fightFor, outcomeWords, type Party } from './fightPreview.ts';
import '../styles/encounters.css';

interface Props {
  readonly id: string;
  readonly value: unknown;
  readonly kits: readonly string[];
  readonly project: OpenProject;
}

export function FightPreview({ id, value, kits, project }: Props) {
  const [party, setParty] = useState<Party>({ as: 'written' });
  const picker = useUniqueId();
  const records = project.index?.records;
  const held = useMemo(() => [...(records?.values() ?? [])], [records]);
  const worked = useMemo(() => fightFor(held, kits, id, value, party), [held, kits, id, value, party]);
  const nameOf = (actor: string) => {
    const record = records?.get(formatRef(ACTOR, actor))?.value as { name?: unknown } | undefined;
    return typeof record?.name === 'string' && record.name !== '' ? record.name : actor;
  };
  const health = 'table' in worked ? worked.table.match.health : '';
  const healthName = (records?.get(formatRef('stat', health))?.value as { name?: string } | undefined)?.name ?? health;
  return (
    <section class="fight-preview" aria-label="How the fight goes">
      <h4>How the fight goes</h4>
      <div class="fight-party">
        <label for={picker}>Who fights</label>
        <select
          id={picker}
          class="form-select"
          value={party.as === 'one' ? party.actor : ''}
          onChange={(event) => {
            const actor = event.currentTarget.value;
            setParty(actor === '' ? { as: 'written' } : { as: 'one', actor });
          }}
        >
          <option value="">As written</option>
          {actorsIn(held).map((actor) => (
            <option key={actor} value={actor}>
              {nameOf(actor)} alone
            </option>
          ))}
        </select>
      </div>
      {'why' in worked ? (
        <p class="muted fight-note">{worked.why}</p>
      ) : (
        <>
          <p class="muted fight-note">
            {worked.against.length === 0
              ? 'Nobody fights for the player, so the fight is lost at once.'
              : `${worked.against.map(nameOf).join(', ')}, at full health, as the game works it out.`}
          </p>
          <ul class="fight-outcomes">
            {worked.table.outcomes.map((outcome) => {
              const words = outcomeWords(outcome, healthName);
              return (
                <li key={outcome.result} class={`fight-outcome fight-${outcome.result}`}>
                  <span class="fight-head">{words.head}</span>
                  <span class="fight-bar" aria-hidden="true" style={{ width: `${outcome.chance}%` }} />
                  <span class="fight-then">{words.after}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
