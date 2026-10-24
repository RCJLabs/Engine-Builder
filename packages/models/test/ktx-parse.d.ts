/** What the tests use of three's copy of ktx-parse, which ships no types (M5.5): the KTX2 writer. */
declare module 'three/examples/jsm/libs/ktx-parse.module.js' {
  export interface KTX2Sample {
    bitOffset: number;
    bitLength: number;
    channelType: number;
    samplePosition: number[];
    sampleLower: number;
    sampleUpper: number;
  }
  export interface KTX2DataFormat {
    colorModel: number;
    transferFunction: number;
    bytesPlane: number[];
    samples: KTX2Sample[];
  }
  export interface KTX2Container {
    vkFormat: number;
    pixelWidth: number;
    pixelHeight: number;
    levelCount: number;
    levels: { levelData: Uint8Array; uncompressedByteLength: number }[];
    dataFormatDescriptor: KTX2DataFormat[];
  }
  export function createDefaultContainer(): KTX2Container;
  export function write(container: KTX2Container): Uint8Array;
  export const VK_FORMAT_R8G8B8A8_SRGB: number;
  export const KHR_DF_MODEL_RGBSDA: number;
  export const KHR_DF_TRANSFER_SRGB: number;
  export const KHR_DF_SAMPLE_DATATYPE_LINEAR: number;
  export const KHR_DF_CHANNEL_RGBSDA_RED: number;
  export const KHR_DF_CHANNEL_RGBSDA_GREEN: number;
  export const KHR_DF_CHANNEL_RGBSDA_BLUE: number;
  export const KHR_DF_CHANNEL_RGBSDA_ALPHA: number;
}
