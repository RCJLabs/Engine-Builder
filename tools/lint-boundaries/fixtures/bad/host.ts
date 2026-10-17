// @expect no DOM or host globals
// @expect no Intl or localeCompare (locale-dependent)
export const width = (): number => globalThis.innerWidth as number;
export const byName = (a: string, b: string): number => a.localeCompare(b);
