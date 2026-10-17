// @expect no Math.random (use a seeded rng stream)
export const roll = (): number => Math.floor(Math.random() * 6) + 1;
