/**
 * A list widget's checks (M4.12, moved from uiCheck.ts): the kit its source needs, a codex's type
 * and known (M4.4), and an offered list's takes (M4.12).
 */
import { type ListWidget, SOURCE_KITS, takesType } from '@eb/ui/format';
import type { DiagnosticCode } from './diagnostics.ts';
import { checkWhen } from './templateCheck.ts';
import type { UiCheckOptions } from './uiCheck.ts';

type Here = (code: DiagnosticCode, path: string, message: string) => void;

export function checkList(list: ListWidget, options: UiCheckOptions, here: Here): void {
  const kit = SOURCE_KITS[list.of];
  if (kit !== undefined && !options.kits.includes(kit)) {
    here('E049', '/of', `A list of ${list.of} needs the ${kit} kit: turn it on in project.json`);
  }
  checkCodex(list, options, here);
  checkTakes(list, options, here);
}

/** An offered list's takes (M4.12): only it has them, and each names one of the game's actions or modules. */
function checkTakes(list: ListWidget, options: UiCheckOptions, here: Here): void {
  if (list.takes === undefined) return;
  if (list.of !== 'offered') {
    here('E049', '/takes', `Only a list of offered has takes: this is a list of ${list.of}`);
    return;
  }
  const { actions } = options;
  if (actions === undefined) return;
  for (const [i, takes] of list.takes.entries()) {
    if (!actions.some((type) => takesType(takes, type))) {
      here('E049', `/takes/${i}`, `The game has no action "${takes}"`);
    }
  }
}

/** A codex's type and known (M4.4); no other list has them. */
function checkCodex(list: ListWidget, options: UiCheckOptions, here: Here): void {
  if (list.of !== 'records') {
    for (const key of ['type', 'known', 'unknown'] as const) {
      if (list[key] !== undefined)
        here('E049', `/${key}`, `Only a records list has ${key}: this is a list of ${list.of}`);
    }
    return;
  }
  if (list.type === undefined) {
    here('E049', '/of', 'A records list names the record type it lists, as type');
    return;
  }
  if (options.recordFields !== undefined && !Object.hasOwn(options.recordFields, list.type)) {
    here('E049', '/type', `The project has no record type "${list.type}"`);
    return;
  }
  if (list.known !== undefined) {
    checkWhen(list.known, options, (message) => here('E048', '/known', message), { codex: list.type });
  }
}
