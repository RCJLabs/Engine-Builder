/**
 * What the Logic panel lists (M3.1, D36): each trigger sheet with its rows as cards in the order
 * they run, each flag with what it holds and what the lint says of it, the project's scripts
 * (M3.2) and its ink scenes (M3.11). A card opens the sheet in the inspector at its row; New sheet and New flag name a record
 * as New does in the Records panel.
 */
import { type EventCatalog, type FactCatalog, FLAG, type FlagRecord, formatRef, SHEET } from '@eb/core';
import { type Diagnostic, FLAG_TYPE, SHEET_DATA } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { recordFile } from '../forms/catalog.ts';
import { fieldToFocus } from '../forms/focusField.ts';
import type { OpenProject } from '../projects/opened.ts';
import { createRecord, openRecord } from '../records/actions.ts';
import { NameRecord } from '../records/NameRecord.tsx';
import { namesOf } from '../records/names.ts';
import type { IndexedRecord } from '../records/recordIndex.ts';
import { eventsOf, factsOf } from '../scripts/known.ts';
import { doText, ifText, whenText } from './rowText.ts';
import { ScenesSection } from './ScenesSection.tsx';
import { ScriptsSection } from './ScriptsSection.tsx';
import '../styles/logic.css';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const problemsText = (problems: readonly Diagnostic[]) => count(problems.length, 'problem');

/** Opens the sheet in the inspector with its row's first field in focus. */
function openRow(sheet: string, row: number): void {
  fieldToFocus.value = { file: recordFile(SHEET, sheet), at: `/rows/${row}` };
  openRecord(SHEET, sheet);
}

/** What a section shows of a record: its name and id, and the index's reading of it. */
interface Shown {
  readonly label: (type: string, id: string) => string;
  readonly record: (type: string, id: string) => IndexedRecord | undefined;
}

export function LogicBrowser({ project }: { project: OpenProject }) {
  const { catalog, index } = project;
  const names = namesOf(index, catalog);
  const shown: Shown = {
    record: (type, id) => index?.records.get(formatRef(type, id)),
    label: (type, id) => {
      const name = names(formatRef(type, id));
      return name ? `${name} (${id})` : id;
    },
  };
  return (
    <div class="logic-browser">
      <SheetsSection project={project} shown={shown} />
      <FlagsSection project={project} shown={shown} />
      <ScriptsSection project={project} />
      <ScenesSection project={project} />
    </div>
  );
}

function SheetsSection({ project, shown }: { project: OpenProject; shown: Shown }) {
  const [naming, setNaming] = useState(false);
  const heading = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  const sheets = project.catalog.records.get(SHEET) ?? [];
  const facts = factsOf(project.game);
  const events = eventsOf(project.game);
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Trigger sheets</h3>
        {canEdit ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New sheet
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type={SHEET}
          ids={sheets}
          label="Name of the new sheet"
          action="Create"
          done={(id, typed) => {
            setNaming(false);
            createRecord(SHEET_DATA, id, typed);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {sheets.length === 0 ? (
        <p class="muted">
          No sheets yet. A sheet’s rows say what happens: When an event is raised, If a condition holds, Do these
          effects.
        </p>
      ) : (
        <ul class="logic-list">
          {sheets.map((id) => (
            <SheetCard
              key={id}
              id={id}
              label={shown.label(SHEET, id)}
              record={shown.record(SHEET, id)}
              facts={facts}
              events={events}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FlagsSection({ project, shown }: { project: OpenProject; shown: Shown }) {
  const [naming, setNaming] = useState(false);
  const heading = useUniqueId();
  const canEdit = editing.access.value.kind === 'editing';
  const flags = project.catalog.records.get(FLAG) ?? [];
  return (
    <section class="logic-section" aria-labelledby={heading}>
      <div class="logic-head">
        <h3 id={heading}>Flags</h3>
        {canEdit ? (
          <button type="button" class="button" onClick={() => setNaming(true)}>
            New flag
          </button>
        ) : null}
      </div>
      {naming ? (
        <NameRecord
          type={FLAG}
          ids={flags}
          label="Name of the new flag"
          action="Create"
          done={(id, typed) => {
            setNaming(false);
            createRecord(FLAG_TYPE, id, typed);
          }}
          cancel={() => setNaming(false)}
        />
      ) : null}
      {flags.length === 0 ? (
        <p class="muted">No flags yet. A flag is something the game remembers: rows set it, conditions read it.</p>
      ) : (
        <ul class="logic-list">
          {flags.map((id) => (
            <FlagCard key={id} id={id} label={shown.label(FLAG, id)} record={shown.record(FLAG, id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SheetCard(props: {
  id: string;
  label: string;
  record: IndexedRecord | undefined;
  facts: FactCatalog;
  events: EventCatalog;
}) {
  const { id, label, record, facts, events } = props;
  const value = record?.value;
  const rows = isObject(value) && Array.isArray(value.rows) ? value.rows : [];
  const problems = record?.problems ?? [];
  const summary = [count(rows.length, 'row'), ...(problems.length > 0 ? [problemsText(problems)] : [])].join(' · ');
  return (
    <li class="logic-sheet">
      <button type="button" class="logic-card logic-open" onClick={() => openRecord(SHEET, id)}>
        <span class="logic-title">{label}</span>
        <span class="muted">{record?.unreadable ? 'Not JSON: open it to see why' : summary}</span>
      </button>
      {rows.length > 0 ? (
        <ol class="logic-list logic-rows" aria-label={`Rows of ${label}`}>
          {rows.map((row, i) => {
            const at = `/rows/${i}`;
            const own = problems.filter((d) => d.path === at || d.path.startsWith(`${at}/`));
            const when = isObject(row) ? row.when : undefined;
            const said = isObject(row) ? ifText(row.if, facts) : undefined;
            return (
              // Keyed by place: two rows can share an id until E024 is fixed.
              <li key={i}>
                <button type="button" class="logic-card" onClick={() => openRow(id, i)}>
                  <span class="logic-row-id">
                    {`${i + 1}. ${isObject(row) && typeof row.id === 'string' ? row.id : 'a row'}`}
                    {isObject(row) && row.once === true ? ' · once' : ''}
                  </span>
                  <span>{whenText(when, events)}</span>
                  {said ? <span>{said}</span> : null}
                  <span>{doText(isObject(row) ? row.do : undefined)}</span>
                  {own.length > 0 ? <span class="logic-problem">{problemsText(own)}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

/** "On or off: starts off", or "A number from 0 to 10: starts at 0". */
export function holdsText(value: unknown): string {
  if (!isObject(value)) return '';
  const number = (value as FlagRecord).number;
  if (!isObject(number)) return 'On or off: starts off';
  const { min, max, start } = number as { min?: number; max?: number; start?: number };
  const range =
    min !== undefined && max !== undefined
      ? ` from ${min} to ${max}`
      : min !== undefined
        ? ` from ${min} up`
        : max !== undefined
          ? ` up to ${max}`
          : '';
  return `A number${range}: starts at ${start ?? 0}`;
}

function FlagCard({ id, label, record }: { id: string; label: string; record: IndexedRecord | undefined }) {
  const problems = record?.problems ?? [];
  return (
    <li>
      <button type="button" class="logic-card" onClick={() => openRecord(FLAG, id)}>
        <span class="logic-title">{label}</span>
        <span class="muted">{record?.unreadable ? 'Not JSON: open it to see why' : holdsText(record?.value)}</span>
        {problems.map((d) => (
          <span key={`${d.code}${d.path}`} class={d.severity === 'error' ? 'logic-problem' : 'logic-warning'}>
            {d.message}
          </span>
        ))}
      </button>
    </li>
  );
}
