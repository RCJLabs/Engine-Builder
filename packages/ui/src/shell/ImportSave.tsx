/**
 * Bringing in a save (M4.3): a code pasted or a file picked, then a slot chosen for it. A full slot
 * asks again, and its save goes to the slot's backup. A save of another game or edition is refused,
 * naming it, as the platform's write refuses it.
 */
import type { SaveFile } from '@eb/core';
import { decodeSaveCode } from '@eb/platform';
import { useState } from 'preact/hooks';
import { shellSettings } from '../format/shell.ts';
import { pickText } from './files.ts';
import { slotIds, slotName } from './slots.ts';
import type { OpenedGame } from './types.ts';
import { useSecondPress } from './useSecondPress.ts';
import type { ShellState } from './useShell.ts';

type Candidate = { readonly ok: true; readonly file: unknown } | { readonly ok: false; readonly message: string };

/** A save code, or a save file's text. */
function candidateOf(text: string, game: string): Candidate {
  const trimmed = text.trim();
  if (trimmed.startsWith('EB1')) return decodeSaveCode(trimmed, game);
  try {
    return { ok: true, file: JSON.parse(trimmed) };
  } catch {
    return { ok: false, message: 'That is neither a save code nor a save file' };
  }
}

export function ImportSave({ state, opened }: { readonly state: ShellState; readonly opened: OpenedGame }) {
  const [code, setCode] = useState('');
  const [file, setFile] = useState<unknown>(undefined);
  const [said, setSaid] = useState<string | undefined>(undefined);
  const second = useSecondPress();
  const { slots } = shellSettings(opened.shell, opened.name);
  const held = new Set((state.slots ?? []).map((info) => info.slot));
  const take = (text: string) => {
    const found = candidateOf(text, opened.game);
    setFile(found.ok ? found.file : undefined);
    setSaid(found.ok ? 'Choose a slot for it.' : `${found.message}.`);
  };
  const put = async (slot: string) => {
    try {
      const written = await state.saves.write(slot, file as SaveFile);
      setSaid(written.ok ? `It is in ${slotName(slot)} now.` : `Not brought in: ${written.message}`);
      if (written.ok) setFile(undefined);
      await state.refresh();
    } catch (error) {
      setSaid(`Not brought in: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <section class="eb-shell-part" aria-label="Bring in a save">
      <h3 class="eb-text eb-heading">Bring in a save</h3>
      <label class="eb-shell-field">
        <span class="eb-text">A save code</span>
        <textarea class="eb-shell-code" rows={3} value={code} onInput={(event) => setCode(event.currentTarget.value)} />
      </label>
      <div class="eb-shell-row">
        <button
          type="button"
          class="eb-button"
          data-key="use-code"
          disabled={code.trim() === ''}
          onClick={() => take(code)}
        >
          Use the code
        </button>
        <button type="button" class="eb-button" data-key="open-file" onClick={() => pickText((text) => take(text))}>
          Open a save file
        </button>
      </div>
      {file !== undefined ? (
        <div class="eb-shell-row">
          {slotIds(slots).map((slot) => (
            <button
              key={slot}
              type="button"
              class="eb-button"
              data-key={`into:${slot}`}
              onClick={() => (held.has(slot) ? second.press(slot, () => void put(slot)) : void put(slot))}
            >
              {second.armed === slot ? `Press again to replace ${slotName(slot)}` : `Put it in ${slotName(slot)}`}
            </button>
          ))}
        </div>
      ) : null}
      <p class="eb-text eb-shell-notice" role="status">
        {second.armed
          ? `Press again to replace the save in ${slotName(second.armed)}. It goes to the slot’s backup.`
          : (said ?? '')}
      </p>
    </section>
  );
}
