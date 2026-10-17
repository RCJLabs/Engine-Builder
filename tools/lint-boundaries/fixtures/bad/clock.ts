// @expect no Date (time arrives as actions)
// @expect no timers or clocks
export const stamp = (): number => Date.now();
export const later = (fn: () => void): void => {
  setTimeout(fn, 10);
};
