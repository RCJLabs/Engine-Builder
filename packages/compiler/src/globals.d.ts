// Every engine the compiler runs in (browsers, workers, Node) has these, but neither ES2023's lib
// nor this package's types declares them: the package leaves out DOM and Node types on purpose,
// so code that needs one platform fails typecheck here.
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
