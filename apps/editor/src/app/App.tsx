import { buildStamp } from '../build.ts';
import { UpdateToast } from '../pwa/UpdateToast.tsx';
import { Console } from './Console.tsx';
import { ZONES } from './layout.ts';
import { layout } from './state.ts';
import { Zone } from './Zone.tsx';

export function App() {
  const current = layout.value;
  return (
    <div class="shell" data-layout={current}>
      <header class="topbar">
        <h1 class="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width="28" height="28" />
          Engine-Builder
        </h1>
        <span class="stamp" title="Version and commit">
          {buildStamp()}
        </span>
      </header>
      <main class="zones">
        {ZONES[current].map(({ zone }) => (
          <Zone key={zone} zone={zone} />
        ))}
        <UpdateToast />
      </main>
      {current === 'phone' ? null : <Console />}
    </div>
  );
}
