/** The zzfx package, a dev dependency that zzfx.test.ts holds our port to, ships no types. */
declare module 'zzfx' {
  export const ZZFX: {
    buildSamples(...args: (number | undefined)[]): Float32Array;
    readonly sampleRate: number;
  };
}
