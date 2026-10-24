// draco3d ships no types; the tests and the fixtures' script use only these.
declare module 'draco3d' {
  const draco3d: {
    createDecoderModule(): Promise<unknown>;
    createEncoderModule(): Promise<unknown>;
  };
  export default draco3d;
}
