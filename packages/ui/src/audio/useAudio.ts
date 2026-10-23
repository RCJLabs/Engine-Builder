/**
 * The page's player for an open game (M4.8, D58): made once a game opens, given the player's
 * volumes as they change, woken by the first gesture anywhere on the page, suspended while the
 * page is hidden, and closed with the game.
 */
import { useEffect, useMemo } from 'preact/hooks';
import type { AudioPack, UiSound } from '../format/audio.ts';
import { AudioPlayer, type Volumes } from './player.ts';

export function useAudio(
  audio: AudioPack,
  uiSounds: Partial<Record<UiSound, string>> | undefined,
  volumes: Volumes,
): AudioPlayer {
  // The volumes are given below as they change, not by a new player.
  const player = useMemo(() => new AudioPlayer(audio, uiSounds ?? {}, volumes), [audio, uiSounds]);
  useEffect(() => {
    // A gesture is the only time a page may start its audio: a press, a key or a pad's button.
    const unlock = () => player.unlock();
    const visible = () => player.setHidden(document.visibilityState === 'hidden');
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('gamepadconnected', unlock);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('gamepadconnected', unlock);
      document.removeEventListener('visibilitychange', visible);
      player.dispose();
    };
  }, [player]);
  const { sound, music, ambience, effects, vibration } = volumes;
  useEffect(() => {
    player.setVolumes({ sound, music, ambience, effects, vibration });
    // Raising Sound from 0 is itself a press: it may start the audio.
    if (sound > 0) player.unlock();
  }, [player, sound, music, ambience, effects, vibration]);
  return player;
}
