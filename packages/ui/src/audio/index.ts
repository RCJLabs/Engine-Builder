/** A game's audio (M4.8, D58): the ZzFX port, what renders and what plays. */
export { type AudioState, audioState, noteAudio, notePlayed, PLAYED_KEPT, type Played } from './hook.ts';
export { audioConditions, heaviest, type Mix, mixOf } from './mix.ts';
export { AudioPlayer, busGains, HEADROOM, type Volumes } from './player.ts';
export { LOOP_RATE, LOOP_SECONDS, peakOf, renderLayer, renderSound } from './render.ts';
export { useAudio } from './useAudio.ts';
export { buildSamples, ZZFX_RATE, ZZFX_VOLUME } from './zzfx.ts';
