import { useEffect } from 'preact/hooks';
import { Panel } from './Panel.tsx';
import { SHEET_BODY_ID, sheetOpen } from './panelControl.ts';

/**
 * The phone's inspector: a sheet between the panel and the tab bar. Its handle is one 44 px
 * button that opens and closes it, and Escape closes it, so it needs no drag to work.
 */
export function InspectorSheet() {
  const open = sheetOpen.value;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // An open dialog (the palette) takes Escape for itself.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) sheetOpen.value = false;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section class="sheet" data-open={open ? 'true' : 'false'} aria-label="Inspector">
      <button
        type="button"
        class="sheet-handle"
        aria-expanded={open}
        aria-controls={SHEET_BODY_ID}
        onClick={() => {
          sheetOpen.value = !open;
        }}
      >
        <span class="sheet-grip" aria-hidden="true" />
        Inspector
      </button>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the sheet's body scrolls, so keyboard users must reach it (axe scrollable-region-focusable) */}
      <div id={SHEET_BODY_ID} class="sheet-body" hidden={!open} tabIndex={0}>
        {/* Shut, the inspector isn't built at all, so its forms (M2.4) don't run out of sight. */}
        {open ? <Panel id="inspector" /> : null}
      </div>
    </section>
  );
}
