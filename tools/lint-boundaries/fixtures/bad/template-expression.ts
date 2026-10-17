// Template text is blanked, but code inside ${...} is still checked.
// @expect no Date (time arrives as actions)
export const label = (name: string): string => `${name} at ${new Date().getTime()} ms`;
