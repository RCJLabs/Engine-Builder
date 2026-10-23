/**
 * Saves (M4.3, docs/specs/shell.md#saves): every slot that holds a save, to load, save out as a
 * file or a code, or delete on a second press; a save brought in; and the saves set aside. A slot
 * whose summary can't be read is listed as such, never as empty.
 */
import type { SaveFile } from '@eb/core';
import { encodeSaveCode } from '@eb/platform';
import { useState } from 'preact/hooks';
import { copyText, saveText } from './files.ts';
import { ImportSave } from './ImportSave.tsx';
import { SetAside } from './SetAside.tsx';
import { type ScreenMemory, ShellScreen } from './ShellScreen.tsx';
import { isNumbered, type SlotInfo, slotName } from './slots.ts';
import type { OpenedGame } from './types.ts';
import { useSecondPress } from './useSecondPress.ts';
import type { ShellState } from './useShell.ts';

interface SavesProps {
  readonly state: ShellState;
  readonly opened: OpenedGame;
  readonly memory: ScreenMemory;
  readonly back: () => void;
}

/** A code, or why there is none: a save that isn't JSON has no code, though its file can still go. */
function codeOf(raw: string): string | undefined {
  try {
    return encodeSaveCode(JSON.parse(raw) as SaveFile);
  } catch {
    return undefined;
  }
}

export function SavesScreen({ state, opened, memory, back }: SavesProps) {
  const second = useSecondPress();
  const [said, setSaid] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState<{ readonly slot: string; readonly code: string } | undefined>(undefined);
  const slots = [...(state.slots ?? [])].sort((a, b) => order(a) - order(b) || (a.slot < b.slot ? -1 : 1));
  const raw = async (slot: string) => {
    const text = await state.saves.raw(slot);
    if (text === undefined) setSaid(`${slotName(slot)} is empty now.`);
    return text;
  };
  const saveFile = async (slot: string) => {
    const text = await raw(slot);
    if (text !== undefined) saveText(`${opened.game}-${slot}.save.json`, text);
  };
  const copyCode = async (slot: string) => {
    const text = await raw(slot);
    const code = text === undefined ? undefined : codeOf(text);
    if (code === undefined) return setSaid(`${slotName(slot)} can’t be read, so it has no code. Save it as a file.`);
    if (await copyText(code)) setSaid(`${slotName(slot)}’s code is copied.`);
    else setShown({ slot, code });
  };
  const remove = (slot: string) =>
    second.press(`delete:${slot}`, async () => {
      const removed = await state.saves.remove(slot);
      setSaid(removed.ok ? `${slotName(slot)} is deleted.` : `Not deleted: ${removed.message}`);
      await state.refresh();
    });
  return (
    <ShellScreen
      name="saves"
      title="Saves"
      memory={memory}
      bottom={
        <button type="button" class="eb-button" data-key="back" onClick={back}>
          Back
        </button>
      }
    >
      {slots.length === 0 ? <p class="eb-text eb-empty">No saves yet.</p> : null}
      <ul class="eb-list eb-shell-saves">
        {slots.map((info) => (
          <li key={info.slot} class="eb-panel eb-shell-save">
            <p class="eb-text">
              <strong>{slotName(info.slot)}</strong>
              {` · ${info.readable ? info.line : 'Its summary can’t be read'}`}
            </p>
            {info.readable && info.debugged ? (
              <p class="eb-text eb-shell-debugged">
                Changed by the debug tools, so it stays here: it can’t be saved out.
              </p>
            ) : null}
            <div class="eb-shell-row">
              <button
                type="button"
                class="eb-button"
                data-key={`load:${info.slot}`}
                disabled={state.busy}
                onClick={() => void state.resume(info.slot, info.readable ? info.daily : undefined)}
              >
                {`Load ${slotName(info.slot)}`}
              </button>
              {info.readable && info.debugged ? null : (
                <>
                  <button
                    type="button"
                    class="eb-button"
                    data-key={`file:${info.slot}`}
                    onClick={() => void saveFile(info.slot)}
                  >
                    Save file
                  </button>
                  <button
                    type="button"
                    class="eb-button"
                    data-key={`code:${info.slot}`}
                    onClick={() => void copyCode(info.slot)}
                  >
                    Copy code
                  </button>
                </>
              )}
              <button
                type="button"
                class="eb-button"
                data-key={`delete:${info.slot}`}
                disabled={state.play?.slot === info.slot}
                onClick={() => remove(info.slot)}
              >
                {second.armed === `delete:${info.slot}` ? 'Press again to delete' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {shown ? <ShownCode slot={shown.slot} code={shown.code} /> : null}
      <p class="eb-text eb-shell-notice" role="status">
        {second.armed?.startsWith('delete:')
          ? `Press again to delete ${slotName(second.armed.slice('delete:'.length))}. It can’t be undone.`
          : (said ?? state.notice ?? '')}
      </p>
      <ImportSave state={state} opened={opened} />
      <SetAside state={state} opened={opened} />
    </ShellScreen>
  );
}

// Numbered slots first, then the Daily, then the rest.
const order = (info: SlotInfo) => (isNumbered(info.slot) ? 0 : info.slot === 'daily' ? 1 : 2);

/** A code the clipboard refused, shown to copy by hand. */
function ShownCode({ slot, code }: { readonly slot: string; readonly code: string }) {
  return (
    <label class="eb-shell-field">
      <span class="eb-text">{`${slotName(slot)}’s code: copy it from here`}</span>
      <textarea class="eb-shell-code" readOnly rows={3} value={code} />
    </label>
  );
}
