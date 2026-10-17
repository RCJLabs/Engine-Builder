// Property names that look like globals are not globals.
interface Options {
  readonly window?: number;
  readonly performance?: number;
}
export const options: Options = { window: 3, performance: 1 };
export const read = (o: { document: string; process: () => void }): string => {
  o.process();
  return o.document;
};
