import { useEffect } from 'preact/hooks';
import { buildStamp } from '../build.ts';
import { current as openProject } from '../projects/session.ts';
import { UpdateToast } from '../pwa/UpdateToast.tsx';
import { CommandPalette, paletteOpen } from './CommandPalette.tsx';
import { Console } from './Console.tsx';
import { DesktopLayout } from './DesktopLayout.tsx';
import { CommandsIcon } from './icons.tsx';
import { ZONES } from './layout.ts';
import { layout } from './state.ts';
import { UndoButtons } from './UndoButtons.tsx';
import { Zone } from './Zone.tsx';

/** Ctrl+K, or ⌘K on a Mac, opens the command palette from anywhere. */
function usePaletteShortcut(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        paletteOpen.value = true;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const current = layout.value;
  usePaletteShortcut();
  return (
    <div class="shell" data-layout={current}>
      <header class="topbar">
        <h1 class="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="28" height="28" />
          Engine-Builder
        </h1>
        <span class="topbar-end" data-project={openProject.value ? 'open' : undefined}>
          <span class="stamp" title="Version and commit">
            {buildStamp()}
          </span>
          <UndoButtons />
          <button
            type="button"
            class="icon-button"
            aria-label="Commands"
            aria-keyshortcuts="Control+K Meta+K"
            title="Commands (Ctrl+K or ⌘K)"
            onClick={() => {
              paletteOpen.value = true;
            }}
          >
            <CommandsIcon />
          </button>
        </span>
      </header>
      {current === 'desktop' ? (
        <DesktopLayout />
      ) : (
        <>
          <main class="zones">
            {ZONES[current].map(({ zone }) => (
              <Zone key={zone} zone={zone} />
            ))}
          </main>
          {current === 'tablet' ? <Console /> : null}
        </>
      )}
      <UpdateToast />
      <CommandPalette />
    </div>
  );
}
