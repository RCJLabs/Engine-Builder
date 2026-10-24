import { useEffect } from 'preact/hooks';
import { openSpace, sheetTab } from '../spaces/state.ts';
import { useUniqueId } from './ids.ts';
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
        {open ? openSpace.value ? <SheetTabs /> : <Panel id="inspector" /> : null}
      </div>
    </section>
  );
}

/** While a space is open, a phone's sheet holds the outliner too, as a tab beside the inspector (D63). */
function SheetTabs() {
  const tab = sheetTab.value;
  const id = useUniqueId();
  const tabs = ['inspector', 'outliner'] as const;
  return (
    <>
      <div class="tabs sheet-tabs" role="tablist" aria-label="Inspector or outliner">
        {tabs.map((each) => (
          <button
            key={each}
            id={`${id}-${each}`}
            type="button"
            role="tab"
            class="tab"
            aria-selected={each === tab}
            aria-controls={`${id}-panel`}
            tabIndex={each === tab ? 0 : -1}
            onClick={() => {
              sheetTab.value = each;
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = each === 'inspector' ? 'outliner' : 'inspector';
              sheetTab.value = next;
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            <span class="tab-label">{each === 'inspector' ? 'Inspector' : 'Outliner'}</span>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        <Panel id={tab} />
      </div>
    </>
  );
}
