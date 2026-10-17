/** localStorage for the tests, which Node lacks. Setting `failOn` to a key makes writing that key run out of space. */
export class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  failOn: string | undefined;

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (key === this.failOn)
      throw Object.assign(new Error('The quota has been exceeded'), { name: 'QuotaExceededError' });
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  [name: string]: unknown;
}
