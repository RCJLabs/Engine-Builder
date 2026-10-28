// The boarding deck drawn by Space-Wrecked's battle board (M7.4, D86, docs/specs/stages.md#the-demo).
// The deck's tilemap is read as Space-Wrecked reads a ship's map and built into its battle map
// (deck/battle-map.ts); each frame the board draws deep space, the floors tinted by room, the
// walls, doors and fittings standing on the deck, and the crew as Space-Wrecked's figures where
// stage2d walks them, through an orbit camera the player turns. The engine keeps the walkers,
// the clock and the uses: the stage says where each use's button goes. Since M7.5 it draws the
// boarders' battle too (deck/fight.ts), above the page's action bar, and says which tile a tap
// landed on; the crew it fights with are drawn as its units, not as walkers, while it lasts.
import { defineStage, type Frame, type Start } from 'eb/stage';
import { deckBoard } from './deck/battle-map.ts';
import { type BoardCamera, createCamera } from './deck/camera.ts';
import { type Crew, createCrew } from './deck/crew.ts';
import { boardPoint, type Deck, findDeck } from './deck/deck.ts';
import { type BoardFight, createFight, type Drawn, walkersBeside } from './deck/fight.ts';
import { battleBoxes } from './space-wrecked/render/battle-scene.ts';
import { type BattleBoard, createBattleBoard } from './space-wrecked/render/battle-view.ts';
import type { Figure } from './space-wrecked/render/figures/sprites.ts';
import { type Cam, type Rect, screenBounds } from './space-wrecked/render/orbit.ts';
import { palette } from './space-wrecked/render/palette.ts';
import type { BattleMap } from './space-wrecked/sim/map-from-ship.ts';

type Pair = readonly [number, number];

// How tall each fitting stands (battle-scene.ts's FITTINGS), so a use's button covers what it
// is on; anything else is the deck.
const STANDS: Readonly<Record<string, number>> = {
  'half cover': 0.34,
  'full cover': 0.84,
  machinery: 0.6,
  console: 0.3,
};

interface Run {
  readonly deck: Deck;
  readonly map: BattleMap;
  readonly board: BattleBoard;
  readonly camera: BoardCamera;
  readonly crew: Crew;
  readonly fight: BoardFight;
  readonly places: Readonly<Record<string, Pair>>;
  readonly uses: readonly string[];
  /** What the board was last given: the walkers' figures, and the battle's units and marks. */
  walking: Figure[];
  fought: Drawn;
}

let run: Run | undefined;

export default defineStage({
  start(s: Start) {
    const deck = findDeck(s);
    const input = deckBoard(deck.tilemap, deck.tileset);
    const board = createBattleBoard();
    board.setMap(input);
    const toBoard = (at: Pair) => boardPoint(deck, input.map.origin, at);
    run = {
      deck,
      map: input.map,
      board,
      camera: createCamera(battleBoxes(input.map)),
      crew: createCrew(toBoard, s.world.records),
      fight: createFight(input.map.origin, deck.tilemap.size, s.world.records),
      places: s.places,
      uses: Object.keys(s.world.uses).sort(),
      walking: [],
      fought: { faces: [], figures: [] },
    };
  },
  frame(g, f: Frame) {
    if (!run) return { uses: [] };
    const battle = f.battle;
    // The board above the bar while a battle is fought.
    const { cam, rect } = run.camera.frame({ ...f, h: Math.max(1, f.h - (battle?.inset ?? 0)) });
    const walking = run.crew.frame(walkersBeside(f.walkers, battle), f.still);
    const fought = run.fight.frame(battle, f.still);
    if (walking || fought) {
      run.walking = walking ?? run.walking;
      run.fought = fought ?? run.fought;
      run.board.setActors({ faces: run.fought.faces, glows: [], figures: [...run.walking, ...run.fought.figures] });
    }
    // As the fight view draws its board: space under it, the board clipped to its box.
    g.fillStyle = palette.space;
    g.fillRect(0, 0, f.w, f.h);
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    const over = battle ? (c: OffscreenCanvasRenderingContext2D) => run?.fight.overlay(c, cam, battle) : null;
    const animating = !f.still && (f.walkers.some((w) => w.moving) || battle?.playing === true);
    run.board.draw(g, cam, rect, over, { animating });
    g.restore();
    const uses = useBoxes(run, cam, rect, new Set(f.taken));
    if (!battle) return { uses };
    // The last tap on the board this frame, as the tile under it.
    let picked: Pair | undefined;
    for (const e of f.input) if (e.kind === 'tap') picked = run.fight.pick(cam, battle, e.x, e.y) ?? picked;
    return picked ? { uses, picked } : { uses };
  },
});

// Each use's button over its tile, from the deck up to what stands there, on screen; none for
// a use taken, off the board or off the screen.
function useBoxes(
  r: Run,
  cam: Cam,
  rect: Rect,
  taken: ReadonlySet<string>,
): { object: string; box: [number, number, number, number] }[] {
  const boxes: { object: string; box: [number, number, number, number] }[] = [];
  for (const object of r.uses) {
    const place = r.places[object];
    if (!place || taken.has(object)) continue;
    const [x, y] = boardPoint(r.deck, r.map.origin, place).map(Math.floor) as [number, number];
    if (x < 0 || y < 0 || x >= r.map.width || y >= r.map.height) continue;
    const kind = r.map.tiles.cells[y * r.map.width + x] as string;
    const b = screenBounds(cam, { x0: x, y0: y, x1: x + 1, y1: y + 1, z1: STANDS[kind] ?? 0 });
    if (b.x1 < rect.x || b.y1 < rect.y || b.x0 > rect.x + rect.w || b.y0 > rect.y + rect.h) continue;
    boxes.push({ object, box: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0] });
  }
  return boxes;
}
