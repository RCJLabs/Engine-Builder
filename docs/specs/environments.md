# Environments (M5.4, D66)

M5.4 is Phase 5's fourth milestone. It gives a space its look outdoors or in: a sky, a sun that follows the hour, light, fog, and rain or snow. An environment is a record of the engine's `environment` type; a space names the one it uses. Seven presets start one off.

Nothing here runs in a game yet. M5.4 makes environments data, checks, forms and drawing in the editor's view; from M5.8 a game's clock drives the hour. The files are those of [viewport.md](viewport.md), [components.md](components.md) and [terrain.md](terrain.md), which this spec extends.

## The environment record

`records/environment/<id>.json`, of the engine's `environment` type, in every project, as flags, sheets and sounds are. Every field is optional; what is left out is the value in the last column.

| Field | Holds | Left out |
| --- | --- | --- |
| `name` | text | the id |
| `hour` | number, 0 to 24: the time of day, 12 noon | 12 |
| `sky` | `physical`, `gradient` or `colour` | `physical` |
| `turbidity` | number, 1 to 20: the physical sky's haze | 2 |
| `zenith` | colour: a gradient's top, or a `colour` sky's only colour | `#3a6ea5` |
| `horizon` | colour: a gradient's colour at the horizon | `#c9d6df` |
| `ground` | colour: a gradient's colour below the horizon | `#5b5346` |
| `sun` | colour: the sunlight's | `#fff4e0` |
| `sun-strength` | number, 0 to 4: the sunlight at noon; 0 is no sun | 2.2 |
| `ambient` | colour: the light from the sky | `#ffffff` |
| `ambient-strength` | number, 0 to 4: that light at noon | 1.6 |
| `fog` | a group of `color`, `near` and `far` (metres, 0 to 10,000) | no fog |
| `weather` | `none`, `rain` or `snow` | `none` |
| `weather-amount` | number, 0 to 1 | 0.5 |

## A space's environment

A space's JSON gains `environment`, the id of an environment record, written after `name`:

```json
{ "name": "Fell", "environment": "fell-dusk", "terrain": { … }, "objects": [] }
```

- **A space has at most one; a prefab has none.** A prefab with `environment` is E058, as one with a terrain is.
- **Without one,** the view keeps M5.1's editor lighting and grey background.
- **Renames follow.** Renaming the record rewrites every space that names it; the record's form lists them under In spaces, as M5.2's placed records do.

## The sun

The hour sets where the sun is. It rises due east at 6, stands highest in the south at 12, and sets due west at 18; in between it sweeps the sky's half. All plain arithmetic of the hour:

- **Its height** above the horizon is `60° × sin(π × (hour − 6) / 12)` from 6 to 18. At night it is below the horizon and gives no light.
- **Its bearing** runs from 90° (east) at 6 to 270° (west) at 18, 15° an hour. North is −z and east +x, as three's view has them; the sun's direction is `(cos h · sin b, sin h, −cos h · cos b)` for height `h` and bearing `b`.
- **Its light** is `sun-strength`, falling to 0 as the sun reaches the horizon (by `sin h`, doubled and held at 1). Within 20° of the horizon its colour moves toward `#ff9a4a`, so dawn and dusk are warm.
- **The sky's light** is `ambient-strength` by day, falling to a fifth at night.

A `sun-strength` of 0 is a cave or an interior: no sunlight at any hour, and the sky's light at its full strength all day.

## The sky

| `sky` | Draws |
| --- | --- |
| `physical` | three's physical sky (the Preetham model, as its `SkyMesh` draws it) with the sun where the hour puts it and the record's `turbidity`. Dark at night |
| `gradient` | a sphere around the view: `ground` below the horizon, `horizon` at it, rising to `zenith` overhead, with a disc of the sun's colour where the sun is, by day |
| `colour` | the view's background, `zenith` |

The sky is never fogged: fog lies on the ground and the objects.

## Fog and weather

- **Fog** is three's linear fog: none nearer than `near`, all of its colour at `far` and beyond. A `near` not below its `far` is E068.
- **Rain** is up to 3,000 streaks, and **snow** up to 2,000 flakes, by `weather-amount`. They fall in a box 60 m across around where the camera looks: rain at 9 m a second, snow at 1 m a second, drifting. While there is weather, the view draws every frame. With reduced motion asked for, it draws them standing still, once.

## The presets

Start from, above an environment's form, writes one of these over the record's fields, as a sound's Start from does. One step of undo.

| Preset | Sky | Hour | Sun, sky light | Fog | Weather |
| --- | --- | --- | --- | --- | --- |
| Desert | physical, turbidity 6 | 14 | `#fff0d0` 2.6, `#f2e2c4` 1.4 | `#d9c3a0` 120–600 m | none |
| Coast | physical, turbidity 3 | 9 | `#fff4e0` 2.2, `#dfeaf2` 1.6 | `#b8c8d4` 80–500 m | none |
| Forest | physical, turbidity 4 | 16 | `#fff1d6` 1.8, `#cfe0c4` 1.4 | `#8fa38a` 30–220 m | none |
| Snow | gradient `#8fb0d0`, `#e6eef5`, `#f4f7fa` | 11 | `#ffffff` 2.0, `#e8f0f8` 1.8 | `#e6edf3` 20–160 m | snow, 0.6 |
| Cave | colour `#0d0f12` | 12 | none, `#8a7f70` 0.6 | `#0d0f12` 5–60 m | none |
| Sci-fi interior | colour `#10161d` | 12 | none, `#cfe3ff` 1.2 | none | none |
| Town | physical, turbidity 4 | 18.5 | `#ffd8a8` 2.0, `#d8c8b8` 1.2 | `#c7a88a` 60–400 m | rain, 0.4 |

## Checks

| Code | When |
| --- | --- |
| E058 | (M5.1's) a prefab names an environment |
| E068 | an environment's fog has `near` not below `far` |
| E069 | a space names an environment that isn't a record of the `environment` type |

Out-of-range numbers, unknown enum values and colours that aren't `#rrggbb` are the record type's own problems (E001), as any record's are. `eb validate` and the Problems panel report them all.

## The editor

- **Records** lists Environment beside Sound, Ambience and Music. An environment's form has Start from above it, with the seven presets.
- **A space's inspector,** with nothing chosen, has an Environment field before the terrain's form: a picker of the project's environments, New environment (a record from a preset, named in the space) and Open environment (its form). Its hour, fog and weather can be changed there too, as the record's own fields; every change is to the record, shared by every space that names it.
- **The view** draws the space's environment as it is after each change: the sky, the sun's light and direction, the sky's light, fog and weather. The editor's grid stays, under the fog.
- **The view's hook** (`window.__ebViewport`, for the e2e) adds `environment()`: the sky's kind, the sun's direction and strength, the sky light's strength, the fog's near and far, the weather's kind and how many particles fall, and whether the view is drawing every frame.

## The gate

- **`environments.spec.ts`** on desktop, by mouse and keys, and **`environmentsPhone.spec.ts`** by touch at 360×740, 390×844 and 844×390 start from an empty project and make a space. They:
  - give it a new environment from each preset in turn, each seen in the view: the hook's sky, fog and weather as the preset has them, and the canvas's colour above the horizon. A colour sky's pixels are its colour; a gradient's, near its zenith; a physical noon's, blue over red;
  - move the hour from noon to dawn: the sun lower, warmer and dimmer, the physical sky darker above;
  - set fog and weather: the hook's fog and particle count follow;
  - reload, and find the record, the space and the view as they were.
- **`tools/cli/test/environment.test.ts`** holds a fixture with environments to `eb validate`, clean, and finds each check in a copy broken once for each.

## Open questions

1. Should the hour follow the game's calendar (M3.5) from M5.8, or a clock of its own for each space?
2. Should a space be able to override its environment's hour, so two spaces can share a look at different times of day?
3. Should weather fall only where the camera can see the sky, once M5.9 brings interiors and roofs?
