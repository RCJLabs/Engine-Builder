/**
 * The page's audio (M4.8, D58, docs/specs/audio.md#the-player): buses, sounds rendered once and
 * played through them, the ambience's loops and the music's stems faded to the mix, and buzzes.
 * Nothing is made until a gesture unlocks it with Sound above 0 (landnam's and chooser's rule); a
 * hidden page suspends it (dirtbag's). Every call does nothing where there is no Web Audio.
 */
import { type AudioPack, BUZZES, type Buzz, type Cue, type Layer, type UiSound } from '../format/audio.ts';
import { noteAudio, notePlayed } from './hook.ts';
import { heaviest, type Mix } from './mix.ts';
import { LOOP_RATE, renderLayer, renderSound } from './render.ts';
import { ZZFX_RATE, ZZFX_VOLUME } from './zzfx.ts';

export const HEADROOM = { music: 0.6, ambience: 0.7, effects: 1, interface: 0.6 } as const;
type Bus = keyof typeof HEADROOM;
const AMBIENCE_FADE = 1.2;
const MUSIC_FADE = 1.5;
/** How fast a layer or a stem follows its condition, in seconds. */
const EASE = 0.4;

export interface Volumes {
  readonly sound: number;
  readonly music: number;
  readonly ambience: number;
  readonly effects: number;
  readonly vibration: boolean;
}

/** Each bus's gain: Sound for the master, the rest their headroom times their volume. */
export function busGains(v: Volumes): Record<'master' | Bus, number> {
  return {
    master: v.sound / 100,
    music: (HEADROOM.music * v.music) / 100,
    ambience: (HEADROOM.ambience * v.ambience) / 100,
    effects: (HEADROOM.effects * v.effects) / 100,
    interface: (HEADROOM.interface * v.effects) / 100,
  };
}

interface Playing {
  readonly id: string;
  readonly output: GainNode;
  readonly gains: Map<string, GainNode>;
  readonly sources: AudioBufferSourceNode[];
  readonly timers: ReturnType<typeof setTimeout>[];
}

const hasAudio = () => typeof AudioContext !== 'undefined';

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

export class AudioPlayer {
  #audio: AudioPack;
  #uiSounds: Partial<Record<UiSound, string>>;
  #volumes: Volumes;
  #ctx: AudioContext | undefined;
  #buses: Record<'master' | Bus, GainNode> | undefined;
  #buffers = new Map<string, AudioBuffer>();
  #files = new Map<string, Promise<AudioBuffer | undefined>>();
  #mix: Mix = { levels: {} };
  #ambience: Playing | undefined;
  #music: Playing | undefined;
  #hidden = false;

  constructor(audio: AudioPack, uiSounds: Partial<Record<UiSound, string>>, volumes: Volumes) {
    this.#audio = audio;
    this.#uiSounds = uiSounds;
    this.#volumes = volumes;
    this.#note();
  }

  /** A gesture: makes the context the first time Sound is above 0, and wakes it after. */
  unlock(): void {
    if (this.#volumes.sound === 0 || !hasAudio()) return;
    if (!this.#ctx) {
      const ctx = new AudioContext();
      this.#ctx = ctx;
      ctx.onstatechange = () => this.#note();
      const make = (to: AudioNode, gain: number) => {
        const node = ctx.createGain();
        node.gain.value = gain;
        node.connect(to);
        return node;
      };
      const gains = busGains(this.#volumes);
      const master = make(ctx.destination, gains.master);
      this.#buses = {
        master,
        music: make(master, gains.music),
        ambience: make(master, gains.ambience),
        effects: make(master, gains.effects),
        interface: make(master, gains.interface),
      };
      this.#follow();
    }
    if (this.#ctx.state === 'suspended' && !this.#hidden) void this.#ctx.resume();
    this.#note();
  }

  setVolumes(volumes: Volumes): void {
    this.#volumes = volumes;
    const ctx = this.#ctx;
    if (ctx && this.#buses) {
      const gains = busGains(volumes);
      for (const [bus, node] of Object.entries(this.#buses))
        node.gain.setTargetAtTime(gains[bus as Bus], ctx.currentTime, 0.02);
      if (volumes.sound === 0) void ctx.suspend();
    }
    this.#note();
  }

  setMix(mix: Mix): void {
    this.#mix = mix;
    this.#follow();
    this.#note();
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    if (!this.#ctx) return;
    if (hidden) void this.#ctx.suspend();
    else if (this.#volumes.sound > 0) void this.#ctx.resume();
  }

  /** A step's cues: every sound, and the heaviest buzz. */
  cue(cues: readonly Cue[]): void {
    for (const cue of cues) if (cue.sound !== undefined) this.play(cue.sound);
    const buzz = heaviest(cues);
    if (buzz !== undefined) this.buzz(buzz);
  }

  /** The interface's sound for a press, a screen opening or Back, if the theme names one. */
  ui(kind: UiSound): void {
    const id = this.#uiSounds[kind];
    if (id !== undefined) this.play(id, 'interface');
  }

  play(id: string, bus?: Bus): void {
    const sound = this.#audio.sounds[id];
    const ctx = this.#ctx;
    if (!sound || !ctx || !this.#buses || ctx.state !== 'running') return;
    let buffer = this.#buffers.get(`sound:${id}`);
    if (!buffer) {
      const samples = renderSound(sound);
      buffer = ctx.createBuffer(1, Math.max(1, samples.length), ZZFX_RATE);
      buffer.copyToChannel(samples, 0);
      this.#buffers.set(`sound:${id}`, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // ZZFXSound's randomness: every voice moves together, by up to the first voice's, either way.
    const randomness = sound.voices[0]?.randomness ?? 0.05;
    source.playbackRate.value = 1 + randomness * (Math.random() * 2 - 1);
    const gain = ctx.createGain();
    gain.gain.value = ZZFX_VOLUME;
    source.connect(gain).connect(this.#buses[bus ?? sound.bus ?? 'effects']);
    source.start();
    notePlayed('sound', id);
  }

  buzz(name: Buzz): void {
    if (!this.#volumes.vibration || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    const activation = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation && !activation.hasBeenActive) return;
    navigator.vibrate([...BUZZES[name]]);
    notePlayed('buzz', name);
  }

  dispose(): void {
    for (const playing of [this.#ambience, this.#music]) if (playing) this.#stop(playing, 0);
    void this.#ctx?.close();
    this.#ctx = undefined;
    this.#buses = undefined;
    noteAudio({ context: 'none', levels: {}, buses: {} });
  }

  /** Brings the ambience and music playing to the mix. */
  #follow(): void {
    const ctx = this.#ctx;
    if (!ctx || !this.#buses) return;
    const mix = this.#mix;
    if (this.#ambience?.id !== mix.ambience) {
      if (this.#ambience) this.#stop(this.#ambience, AMBIENCE_FADE);
      this.#ambience = mix.ambience === undefined ? undefined : this.#startAmbience(mix.ambience, ctx);
    }
    const music = mix.music === undefined ? undefined : this.#audio.music[mix.music];
    if (this.#music?.id !== mix.music) {
      if (this.#music) this.#stop(this.#music, music?.fade ?? MUSIC_FADE);
      this.#music = mix.music === undefined ? undefined : this.#startMusic(mix.music, ctx);
    }
    for (const playing of [this.#ambience, this.#music])
      for (const [key, gain] of playing?.gains ?? [])
        gain.gain.setTargetAtTime(mix.levels[key] ?? 0, ctx.currentTime, EASE / 3);
  }

  #playing(id: string, ctx: AudioContext, bus: Bus, fade: number): Playing {
    const output = ctx.createGain();
    output.gain.value = 0;
    output.gain.setTargetAtTime(1, ctx.currentTime, fade / 3);
    output.connect((this.#buses as Record<Bus, GainNode>)[bus]);
    return { id, output, gains: new Map(), sources: [], timers: [] };
  }

  #loop(playing: Playing, key: string, buffer: AudioBuffer, ctx: AudioContext, at?: number): void {
    const gain = ctx.createGain();
    gain.gain.value = this.#mix.levels[key] ?? 0;
    gain.connect(playing.output);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(at);
    playing.gains.set(key, gain);
    playing.sources.push(source);
  }

  #startAmbience(id: string, ctx: AudioContext): Playing | undefined {
    const ambience = this.#audio.ambience[id];
    if (!ambience) return undefined;
    const playing = this.#playing(id, ctx, 'ambience', AMBIENCE_FADE);
    for (const [n, layer] of ambience.layers.entries()) {
      this.#loop(playing, `layer/${n}`, this.#layerBuffer(id, n, layer, ctx), ctx);
    }
    (ambience['now-and-then'] ?? []).forEach((then, n) => {
      const next = () => {
        const wait = then['every-min'] + Math.random() * Math.max(0, then['every-max'] - then['every-min']);
        playing.timers.push(
          setTimeout(() => {
            if ((this.#mix.levels[`then/${n}`] ?? 0) > 0 && this.#ambience === playing)
              this.play(then.sound, 'ambience');
            if (this.#ambience === playing) next();
          }, wait * 1000),
        );
      };
      next();
    });
    return playing;
  }

  #layerBuffer(id: string, n: number, layer: Layer, ctx: AudioContext): AudioBuffer {
    const key = `layer:${id}/${n}:${JSON.stringify(layer)}`;
    let buffer = this.#buffers.get(key);
    if (!buffer) {
      const samples = renderLayer(layer, `${id}/${n}`);
      buffer = ctx.createBuffer(1, samples.length, LOOP_RATE);
      buffer.copyToChannel(samples, 0);
      this.#buffers.set(key, buffer);
    }
    return buffer;
  }

  #startMusic(id: string, ctx: AudioContext): Playing | undefined {
    const music = this.#audio.music[id];
    if (!music) return undefined;
    const playing = this.#playing(id, ctx, 'music', music.fade ?? MUSIC_FADE);
    // Stems start together once every file is ready, so they stay in step (chooser's beds.ts).
    void Promise.all(music.stems.map((stem) => this.#file(stem.asset, ctx))).then((buffers) => {
      if (this.#music !== playing) return;
      const at = ctx.currentTime + 0.05;
      buffers.forEach((buffer, n) => {
        if (buffer) this.#loop(playing, `stem/${n}`, buffer, ctx, at);
      });
    });
    return playing;
  }

  #file(path: string, ctx: AudioContext): Promise<AudioBuffer | undefined> {
    let decoded = this.#files.get(path);
    if (!decoded) {
      const base64 = this.#audio.files[path];
      decoded =
        base64 === undefined ? Promise.resolve(undefined) : ctx.decodeAudioData(bytesOf(base64)).catch(() => undefined);
      this.#files.set(path, decoded);
    }
    return decoded;
  }

  #stop(playing: Playing, fade: number): void {
    const ctx = this.#ctx;
    for (const timer of playing.timers) clearTimeout(timer);
    if (!ctx) return;
    playing.output.gain.setTargetAtTime(0, ctx.currentTime, Math.max(fade, 0.01) / 3);
    for (const source of playing.sources) source.stop(ctx.currentTime + fade + 0.1);
  }

  #note(): void {
    const ctx = this.#ctx;
    const gains = busGains(this.#volumes);
    noteAudio({
      context: !ctx ? 'none' : ctx.state === 'running' ? 'running' : 'suspended',
      ...(this.#mix.ambience !== undefined ? { ambience: this.#mix.ambience } : { ambience: undefined }),
      ...(this.#mix.music !== undefined ? { music: this.#mix.music } : { music: undefined }),
      levels: this.#mix.levels,
      buses: ctx ? gains : {},
    });
  }
}
