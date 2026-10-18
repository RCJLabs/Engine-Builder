import { useEffect, useRef, useState } from 'preact/hooks';
import { Console } from './Console.tsx';
import { ZONES } from './layout.ts';
import { setDock } from './panelControl.ts';
import { noteError } from './state.ts';
import { Zone } from './Zone.tsx';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Desktop: the dock, loaded on first use. If its code can't load, the desktop zones stand in, so the editor still works. */
export function DesktopLayout() {
  const host = useRef<HTMLElement>(null);
  const [state, setState] = useState<'loading' | 'docked' | 'failed'>('loading');

  useEffect(() => {
    let gone = false;
    let dispose: (() => void) | null = null;
    import('./dock/desktopDock.tsx')
      .then(({ mountDock }) => {
        if (gone || !host.current) return;
        const handle = mountDock(host.current, storage());
        setDock(handle);
        dispose = () => {
          setDock(null);
          handle.dispose();
        };
        setState('docked');
      })
      .catch((error: unknown) => {
        noteError(`The dockable layout didn’t load, so the panels sit in fixed zones (${String(error)}).`);
        if (!gone) setState('failed');
      });
    return () => {
      gone = true;
      dispose?.();
    };
  }, []);

  if (state === 'failed') {
    return (
      <>
        <main class="zones">
          {ZONES.desktop.map(({ zone }) => (
            <Zone key={zone} zone={zone} />
          ))}
        </main>
        <Console />
      </>
    );
  }
  return <main class="dock-host" ref={host} data-dock={state} aria-busy={state === 'loading'} />;
}
