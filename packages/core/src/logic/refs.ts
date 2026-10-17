import { pointerSegment } from '../canonical.ts';
import { isRecordId } from '../records.ts';
import type { Condition, FactCatalog } from './types.ts';

/** A record that a condition names. */
export interface ConditionRef {
  /** JSON Pointer inside the condition: an argument, or the value a ref fact is compared with. */
  readonly path: string;
  readonly type: string;
  readonly id: string;
}

/**
 * The records a condition names, for "used by" in the editor. The condition must have a sound
 * shape; references to records that don't exist are listed too, as checkCondition reports them.
 */
export function conditionRefs(condition: Condition, catalog: FactCatalog): ConditionRef[] {
  const found: ConditionRef[] = [];
  const visit = (node: Condition, path: string): void => {
    if ('all' in node || 'any' in node) {
      const kind = 'all' in node ? 'all' : 'any';
      for (const [i, part] of ('all' in node ? node.all : node.any).entries()) visit(part, `${path}/${kind}/${i}`);
      return;
    }
    if ('not' in node) {
      visit(node.not, `${path}/not`);
      return;
    }
    const info = catalog[node.fact];
    for (const [name, value] of Object.entries(node.args ?? {})) {
      const domain = info?.args?.[name];
      if (domain?.type === 'ref' && isRecordId(value)) {
        found.push({ path: `${path}/args/${pointerSegment(name)}`, type: domain.to, id: value });
      }
    }
    if (info?.domain?.type === 'ref' && isRecordId(node.value)) {
      found.push({ path: `${path}/value`, type: info.domain.to, id: node.value });
    }
  };
  visit(condition, '');
  return found;
}
