/** A seed for a new game: each game played differs, as a game's own start would. The player page's and an exported game's. */
export function freshSeed(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(bytes, (n) => n.toString(36)).join('');
}
