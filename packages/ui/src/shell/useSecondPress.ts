/**
 * A second press for what can't be taken back: New over a save, Delete, a save brought in over
 * another (Space-Wrecked's title.js). Not confirm(), which some browsers suppress (Wasteland
 * Protocol). The first press arms the button for a few seconds and says so; pressing another
 * disarms it.
 */
import { useEffect, useState } from 'preact/hooks';

export const ARMED_MS = 4000;

export function useSecondPress() {
  const [armed, setArmed] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (armed === undefined) return;
    const timer = setTimeout(() => setArmed(undefined), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  return {
    armed,
    /** Arms `key`, or, when it is armed already, does `then`. */
    press(key: string, then: () => void) {
      if (armed === key) {
        setArmed(undefined);
        then();
      } else setArmed(key);
    },
    disarm: () => setArmed(undefined),
  };
}
