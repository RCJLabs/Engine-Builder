/**
 * A battle on a 2D stage (M7.5, D87, docs/specs/tactics.md#the-stage; after space-wrecked's src/ui/fight/fight.js):
 * each frame it reads the battle the sim has, plays a step's beats back once (the foes' whole turn among them,
 * taps waiting for it), and keeps the selection and the preview true to the view. Taps and the keys come in
 * as tiles; the bar's buttons, the arrows' cursor, Enter and Escape do the rest. What it sends is exactly an
 * action the sim offered. stage2d's drawer draws it (draw.ts); a stage in code reads it from `world.battle`.
 */
import type { Action, PackTiles, Tile } from '@eb/core';
import type { BattleView, UnitView } from '@eb/kits';
import type { BattleShown, Sent } from '@eb/ui';
import { type BarButton, type BarModel, createBattleBar } from './bar.ts';
import {
  actionOf,
  cancel,
  choicesOf,
  choose,
  confirm,
  type Picked,
  type Picking,
  type Preview,
  previewsOf,
  settle,
  stepCursor,
  tap,
} from './pick.ts';
import { type Act, actsOf, type Played, playAt, type Shown } from './playback.ts';
import { beatLine, namesOf, oddsText, previewLine } from './words.ts';

const ARROWS: Readonly<Record<string, Tile>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export interface BattleNow {
  readonly view: BattleView;
  readonly units: ReadonlyMap<string, Shown>;
  readonly picking: Picking;
  readonly playing: boolean;
  readonly shot?: Played['shot'];
}

export interface Battle2d {
  /** Once a frame: the battle now, or none to draw. */
  frame(now: number): BattleNow | undefined;
  /** A tap or a click on a tile, or Enter on the cursor's. */
  tapTile(tile: Tile): void;
  /** A key on the stage; true when the battle took it. */
  key(e: KeyboardEvent): boolean;
  hook(): unknown;
  /** The bar's height in CSS pixels, 0 when there is none. */
  barHeight(): number;
  stop(): void;
}

export interface BattleOptions {
  readonly box: HTMLElement;
  readonly battle: () => BattleShown | undefined;
  readonly send: (action: Action) => Promise<Sent>;
  readonly tiles: PackTiles;
  readonly actorName: (actor: string) => string | undefined;
  readonly still: boolean;
  /** The battle began or ended: the stage hides its uses' buttons while one is fought. */
  readonly fighting: (on: boolean) => void;
}

const shownOf = (units: readonly UnitView[]) =>
  new Map(units.map((u) => [u.id, { at: [u.at[0], u.at[1]] as const, status: u.status, hp: u.hp }]));

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function createBattle2d(o: BattleOptions): Battle2d {
  const bar = createBattleBar(o.box);
  let picking: Picking = {};
  let played = -1;
  let acts: Act[] = [];
  let began = 0;
  let before = new Map<string, Shown>();
  let last: BattleView | undefined;
  let now: BattleNow | undefined;
  let sending = false;
  // The step last played when an accepted action was sent: its own beats are still to come.
  let awaiting: number | undefined;
  let line = '';
  let said = 0;
  let fighting = false;
  const sent: { action: Action; sent: string }[] = [];

  const names = () => (last ? namesOf(last, o.actorName) : (id: string) => id);
  const ready = () =>
    now !== undefined && !now.playing && !sending && awaiting === undefined && now.view.side === 'crew';

  const send = (action: Action) => {
    sending = true;
    const entry = { action, sent: 'waiting' };
    sent.push(entry);
    const from = played;
    void o.send(action).then((answer) => {
      entry.sent = answer;
      sending = false;
      // An accepted action always raises beats; the view the answer outran comes with them.
      if (answer === 'accepted') awaiting = from;
      else line = 'That can’t be done now.';
    });
  };
  // Every change of the state goes through here, and the bar is drawn again at once, so a second press in
  // the same frame acts on what the bar shows now rather than on the frame before's.
  const update = (next: Picking) => {
    picking = next;
    if (now) {
      now = { ...now, picking };
      bar.show(model(now.view));
    }
  };
  const apply = (result: Picked) => {
    update(result.picking);
    if (picking.preview && last) line = previewLine(picking.preview, last, names());
    if (result.send) send(result.send);
  };

  const button = (key: string, label: string, kind: string, preview: Preview): BarButton => ({
    key,
    label,
    kind,
    pressed:
      picking.preview !== undefined && JSON.stringify(actionOf(picking.preview)) === JSON.stringify(actionOf(preview)),
    press: () => {
      if (ready()) apply(choose(picking, preview));
    },
  });

  function model(view: BattleView): BarModel {
    const name = names();
    const crew: BarButton[] = view.choices.map((c) => ({
      key: `unit:${c.unit}`,
      label: name(c.unit),
      kind: 'unit',
      pressed: c.unit === picking.selected,
      press: () => {
        if (!ready()) return;
        const { preview: _, ...rest } = picking;
        update({ ...rest, selected: c.unit });
      },
    }));
    const chosen = choicesOf(view, picking.selected);
    const unit = view.units.find((u) => u.id === picking.selected);
    const actions: BarButton[] = [];
    for (const p of chosen ? previewsOf(chosen) : []) {
      if (p.kind === 'move' || p.kind === 'shoot' || p.kind === 'end') continue;
      if (p.kind === 'watch') actions.push(button('watch', 'Watch', 'watch', p));
      if (p.kind === 'reload') actions.push(button('reload', 'Reload', 'reload', p));
      if (p.kind === 'steady') actions.push(button(`steady:${p.target}`, `Steady ${name(p.target)}`, 'steady', p));
      if (p.kind === 'open') actions.push(button(`open:${p.side}`, `Open the ${p.side} door`, 'open', p));
      if (p.kind === 'order') {
        const kind = unit?.order?.name ?? capital(unit?.order?.kind ?? 'order');
        const at = p.order.target !== undefined ? ` ${name(p.order.target)}` : p.order.side ? ` ${p.order.side}` : '';
        actions.push(button(`order:${p.order.target ?? p.order.side ?? ''}`, `${kind}${at}`, 'order', p));
      }
    }
    if (view.side === 'crew') actions.push(button('end', 'End turn', 'end', { kind: 'end' }));
    // Always there on the crew's turn, so the bar keeps its height as a preview comes and goes.
    if (view.side === 'crew') {
      actions.push({
        key: 'confirm',
        label: 'Confirm',
        kind: 'confirm',
        disabled: !picking.preview,
        press: () => ready() && apply(confirm(picking)),
      });
      actions.push({
        key: 'cancel',
        label: 'Cancel',
        kind: 'cancel',
        disabled: !picking.preview && !picking.selected,
        press: () => update(cancel(picking)),
      });
    }
    const targets = (chosen?.shots ?? []).map((shot) =>
      button(`shoot:${shot.target}`, `${name(shot.target)}: ${oddsText(shot)}`, 'shoot', {
        kind: 'shoot',
        unit: chosen?.unit as string,
        shot,
      }),
    );
    const who = unit
      ? `${name(unit.id)}: ${unit.ap} action point${unit.ap === 1 ? '' : 's'}, ${unit.ammo} of ${unit.clip} shots`
      : view.side === 'foes'
        ? 'The enemy’s turn.'
        : '';
    const none = view.side === 'crew' && chosen ? 'No foe in sight.' : '';
    return { line, who, actions: [...crew, ...actions], targets, none };
  }

  const tapTile = (tile: Tile) => {
    if (ready() && now) apply(tap(now.view, picking, tile));
  };

  return {
    frame(t) {
      const shown = o.battle();
      if (shown && shown.step !== played && shown.told.length > 0) {
        played = shown.step;
        awaiting = undefined;
        before = last ? shownOf(last.units) : shownOf(shown.view?.units ?? []);
        acts = actsOf(shown.told, o.still);
        began = t;
        said = 0;
      }
      const back = acts.length > 0 ? playAt(acts, before, t - began) : undefined;
      const name = names();
      // Each beat's line as it begins: the live region says the latest.
      if (back && back.begun > said) {
        const beat = acts[back.begun - 1]?.beat;
        if (beat) line = beatLine(beat, shown?.view ? namesOf(shown.view, o.actorName) : name);
        said = back.begun;
      }
      const playing = back !== undefined && !back.done;
      if (!playing) {
        acts = [];
        last = shown?.view;
      }
      const view = playing ? (last ?? shown?.view) : shown?.view;
      if (!view) {
        now = undefined;
        bar.show(undefined);
        if (fighting) {
          fighting = false;
          o.fighting(false);
        }
        return undefined;
      }
      if (!fighting) {
        fighting = true;
        o.fighting(true);
      }
      if (!playing) picking = settle(view, picking);
      now = {
        view,
        units: playing && back ? back.units : shownOf(view.units),
        picking,
        playing,
        ...(playing && back?.shot ? { shot: back.shot } : {}),
      };
      bar.show(model(view));
      return now;
    },
    tapTile,
    key(e) {
      if (!now) return false;
      const by = ARROWS[e.key];
      if (by) {
        update(stepCursor(now.view, picking, by, o.tiles.size));
        return true;
      }
      if (e.key === 'Enter' && picking.cursor) {
        tapTile(picking.cursor);
        return true;
      }
      // Escape only while there is something to take back: otherwise it is the shell's.
      if (e.key === 'Escape' && (picking.preview || picking.selected)) {
        update(cancel(picking));
        return true;
      }
      return false;
    },
    hook: () => ({
      view: now?.view,
      units: now ? [...now.units].map(([id, u]) => ({ id, ...u })) : [],
      selected: picking.selected,
      preview: picking.preview ? actionOf(picking.preview) : undefined,
      cursor: picking.cursor,
      playing: now?.playing === true,
      waiting: sending || awaiting !== undefined,
      played,
      line: bar.line(),
      bar: bar.shown(),
      sent: sent.map((s) => ({ ...s })),
    }),
    barHeight: () => bar.height(),
    stop() {
      bar.stop();
    },
  };
}
