import { badgeText, problemCount } from './count.ts';

/** How many problems the open project has, on the Problems tab: red while any is an error (M2.8). */
export function ProblemBadge() {
  const counts = problemCount.value;
  const text = badgeText(counts);
  if (!text || !counts) return null;
  return <span class={counts.errors > 0 ? 'tab-badge error' : 'tab-badge'}>{text}</span>;
}
