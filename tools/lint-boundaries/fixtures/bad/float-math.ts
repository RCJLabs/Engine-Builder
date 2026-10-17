// @expect no transcendental Math (results differ between JS engines)
// @expect no ** operator (floating-point pow)
export const falloff = (d: number): number => Math.exp(-d) + d ** 2;
