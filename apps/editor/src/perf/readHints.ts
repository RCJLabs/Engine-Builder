/**
 * The device's hints for Auto's first tier (M5.7, D69), read in the browser: the GPU's name from
 * WebGPU's adapter, asked for apart from three's (which keeps its own to itself), or from WebGL's
 * unmasked renderer string in a context made and let go at once; the memory and cores where the
 * browser says; and whether the main pointer is a finger.
 */
import type { Hints } from './hints.ts';

type GpuNavigator = Navigator & {
  readonly gpu?: { requestAdapter(): Promise<{ readonly info?: Record<string, string> } | null> };
  readonly deviceMemory?: number;
};

/** How long the adapter is waited for: a browser whose WebGPU never answers still gets a view. */
const ADAPTER_WAIT = 1500;

async function webgpuName(nav: GpuNavigator): Promise<string | null> {
  try {
    const asked = nav.gpu?.requestAdapter() ?? Promise.resolve(null);
    const late = new Promise<null>((done) => window.setTimeout(() => done(null), ADAPTER_WAIT));
    const info = (await Promise.race([asked, late]))?.info;
    const name = [info?.vendor, info?.architecture, info?.device, info?.description].filter(Boolean).join(' ');
    return name || null;
  } catch {
    return null;
  }
}

function webglName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name || null;
  } catch {
    return null;
  }
}

export async function readHints(): Promise<Hints> {
  const nav = navigator as GpuNavigator;
  return {
    gpu: (await webgpuName(nav)) ?? webglName(),
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    coarse: window.matchMedia?.('(pointer: coarse)').matches === true,
  };
}
