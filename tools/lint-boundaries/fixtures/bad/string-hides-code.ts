// A comment regex reads the // in this URL as a comment and misses the call after it.
// @expect no Math.random (use a seeded rng stream)
export const pick = (): [string, number] => ['https://example.org/', Math.random()];
