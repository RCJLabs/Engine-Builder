/** Mentions of Math.random, Date, window and 2 ** 3 in comments are fine. */
// setTimeout(() => {}, 0) in a line comment is fine too.
export const advice = 'Never call Math.random or new Date() in the sim; see https://example.org/rules';
export const quoted = "a ** b, globalThis, Intl, performance.now()";
export const template = `Math.random() in template text is fine: ${advice.length} chars`;
export const re = /Date|Math\.random|\*\*/g;
export const ratio = (a: number, b: number): number => a / b / 2;
