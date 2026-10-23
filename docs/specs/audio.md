# Audio and haptics (M4.8, D58)

How a game sounds and buzzes: sound effects as layered ZzFX voices, ambience synthesised from data, music as file stems, all as records; cues on the feedback lines; buses and the player's volumes. The survey behind it is [research/audio.md](../research/audio.md). The sim never reads any of it: the worker sends what a step's beats call for, and the page plays it.

## Records

Three engine types, which every project has, as it has flags and sheets: `sound`, `ambience` and `music`. They have forms, the Records table, pickers, used-by and renames as any type does.

### Sound

```json
{
  "name": "Door",
  "bus": "effects",
  "voices": [
    { "frequency": 180, "release": 0.25, "shape": "triangle", "slide": -1 },
    { "at": 0.08, "frequency": 90, "noise": 0.6, "release": 0.3, "shape": "noise", "volume": 0.6 }
  ]
}
```

- **`bus`** (optional): `effects`, the default, or `interface`, for a game's buttons and screens.
- **`voices`**, one to three, mixed into one sound. Each voice is ZzFX 1.4.0's parameters as named fields, every one optional, with ZzFX's default:

| Field | Default | | Field | Default |
| --- | --- | --- | --- | --- |
| `at` (s, ours: when it starts) | 0 | | `pitch-jump-time` (s) | 0 |
| `volume` | 1 | | `repeat-time` (s) | 0 |
| `randomness` | 0.05 | | `noise` | 0 |
| `frequency` (Hz) | 220 | | `modulation` (Hz) | 0 |
| `attack` (s) | 0 | | `bit-crush` | 0 |
| `sustain` (s) | 0 | | `delay` (s) | 0 |
| `release` (s) | 0.1 | | `sustain-volume` | 1 |
| `shape` | `sine` | | `decay` (s) | 0 |
| `shape-curve` | 1 | | `tremolo` | 0 |
| `slide` | 0 | | `filter` (Hz) | 0 |
| `delta-slide` | 0 | | | |
| `pitch-jump` (Hz) | 0 | | | |

`shape` is ZzFX's number by name: `sine` 0, `triangle` 1, `saw` 2, `tan` 3, `noise` 4, `square` 5. `filter` is ZzFX's: above 0 it cuts what is below it, under 0 what is above it, 0 is none.

**Rendering** (`renderSound`): each voice is rendered at 44,100 Hz by our port of ZzFX's `buildSamples`, with no randomness, and added into one buffer at its `at`. The port is ZzFX's loop as written, with its MIT notice; its one `Math.random` call is the caller's roll, which is 0.5 (no change) when rendering. A sound renders to the same samples every time, in the editor, on the player page and in Node.

**Playing:** at ZzFX's own level, 0.3, so a pasted sound is as loud as in ZzFX's designer, through its bus. Each play's pitch moves by up to the first voice's `randomness`, both ways, as ZZFX's `ZZFXSound` does, by its playback rate, so every voice moves together.

### Ambience

```json
{
  "name": "Wind at the hut",
  "layers": [
    { "kind": "noise", "colour": "brown", "filter": "lowpass", "frequency": 500, "gain": 0.6, "sway": 0.4 },
    { "kind": "noise", "colour": "pink", "filter": "bandpass", "frequency": 1800, "gain": 0.3, "when": "flag.on(flag: storm)" },
    { "kind": "drone", "shape": "sine", "frequency": 55, "gain": 0.15 }
  ],
  "now-and-then": [{ "sound": "creak", "every-min": 8, "every-max": 20 }]
}
```

- **A layer** is `noise` (white, pink or brown, through a `lowpass`, `highpass` or `bandpass` filter at `frequency` with `q`, or `none`) or a `drone` (`sine`, `triangle` or `saw` at `frequency`). `gain` is 0 to 1; `sway` (0 to 1) is how far its level wanders. A layer with `when` plays only while its condition holds.
- **Rendering** (`renderLayer`): each layer is an 8-second loop at 22,050 Hz. Its noise comes from a generator seeded by the ambience's id and the layer's place, its filter is the RBJ biquad, its drone's frequency is moved to the nearest that fits whole cycles in the loop, its sway is two slow sines with whole periods in the loop, and its last quarter second is faded over its first, so the loop has no seam.
- **Now and then:** each plays its sound at a random time between `every-min` and `every-max` seconds after the last, while its `when` holds.

### Music

```json
{
  "name": "At the hut",
  "stems": [
    { "asset": "audio/hut-theme.wav", "gain": 0.8 },
    { "asset": "audio/hut-wind.wav", "gain": 0.5, "when": "time.day >= 3" }
  ],
  "fade": 2
}
```

- **Stems** are audio files in `assets/`, each logged in the provenance log. They start together and loop, so they stay in step; each plays at `gain` while its `when` holds and at 0 otherwise, easing over `fade` seconds (1.5 by default). A music with no stems is silence.

## What plays

- **The top screen says.** A screen names its `ambience` and `music` by id. Of the screens on the stack, drawn or not, the topmost that names one plays it, so a journal opened over the hut keeps the hut's wind; a screen that names neither keeps what the screens under it play. With none, nothing plays.
- **Changing** crossfades: ambience over 1.2 s, music over its `fade`.
- **The mix is a pure function**, `mixOf(the stack's screens, the view's conditions, the audio)`: which ambience and music, and each layer's, sound's and stem's level. The player applies it.

## Cues

A feedback line ([input.md](input.md#feedback)) gains `sound` and `buzz`, and `say` becomes optional:

```json
{ "on": "hut/carried", "say": "Up the path with a load.", "sound": "load", "buzz": "knock" }
```

- **`sound`** names a sound; **`buzz`** is one of `tap` (12 ms), `knock` (30 ms), `thud` (70 ms), `double` (30, 60, 30) and `alarm` (90, 60, 90). A line needs at least one of `say`, `sound` and `buzz`; `to` goes only with `say`.
- **Each beat is felt by the first line that matches it**, as it is said: a line that only sounds still ends the search.
- **The worker sends the step's cues** with its words, `cues: [{ sound?, buzz? }]` in the beats' order.
- **One buzz a step,** the heaviest: `alarm`, then `thud`, `double`, `knock`, `tap`. Every sound plays.
- **The theme's sounds:** `ui/theme.json` may name `sounds: { press, open, back }`: a button that takes an action, a button that opens a screen, and Back or a Close.

## Buses and volumes

- **Buses:** master, then `music` (headroom 0.6), `ambience` (0.7), `effects` (1) and `interface` (0.6).
- **The player's volumes** are settings ([shell.md](shell.md#settings)): Sound (master), Music, Ambience and Effects, each 0 to 100 in tens, Sound 80 and the rest 100 to start; and Vibration, on to start, shown only where the device can vibrate. Each bus's gain is its headroom times its volume over 100; Effects sets both `effects` and `interface`.
- **With Sound at 0, nothing is made:** no audio context, no buffers.

## The player

- **Starts on the first gesture:** a press, a key or a pad's button makes the audio context, or resumes it.
- **A hidden tab** suspends it; a shown one resumes it.
- **Buzzes** wait for the page's first activation and need `navigator.vibrate`; with Vibration off, none.
- **The hook:** `window.__ebAudio` holds what the player is doing: `{ context, ambience, music, levels, volumes, played }`, `played` the last 50 sounds and buzzes, each `{ kind, id, at }`. The e2e reads it; nothing else does.

## Checks

- **The records** by their type files (E001), with an ambience's sounds and a music's assets as references (E005, E018).
- **E049** for a screen's `ambience` or `music`, a feedback line's `sound` or a theme's sound that names no such record.
- **E047** for a feedback line with none of `say`, `sound` and `buzz`, or with `to` and no `say`.

## Packing

- **Format 8** carries the audio files any music names, as base64 by path, `audio: { "audio/hut-theme.wav": "UklGR…" }`, so an exported game plays its music offline. A pack without music keeps its format and hash.

## The editor

- **Above a sound's form:** Play; the samples drawn; its length and peak; Start from, which fills its voices from a preset (Blip, Pickup, Jump, Hit, Laser, Explosion, Power-up, Step); Vary, which nudges each set field a little; and Paste ZzFX, which takes `zzfx(...[…])` or a bare array into a voice.
- **Above an ambience's or a music's form:** Play and Stop, and a box for each layer, each sound now and then, or each stem with a condition, to hear it as if the condition held.
- **The screen designer** gains Ambience and Music pickers in the screen's own form; **the theme designer** gains Press, Open and Back.
- **Feedback** stays JSON, its new fields checked at their lines.

## Where it lives

- `packages/ui/src/audio/`: `zzfx.ts` (the port), `render.ts` (a sound, a layer), `mix.ts` (`mixOf`, pure), `buzz.ts`, `player.ts` (Web Audio), `useAudio.ts`.
- `packages/schema/src/audioTypes.ts`: the three type files; `uiCheck.ts` and `feedbackCheck.ts` gain the references.
- `packages/core/src/pack.ts`: format 8. `packages/compiler/src/ui.ts`: the files packed.
- `apps/editor/src/audio/`: the previews above the forms, the presets, Paste ZzFX.

## The gate

- **The hut** gains sounds, two ambiences (the hut's wind, with rain while the storm is on, and the storm's), a music of one stem (a loop the engine's own synth rendered, logged as the project's own), buzzes on its feedback, and the theme's sounds. The Phase 3 spec builds them in the editor with forms, and the export is still the fixture file for file.
- **Desktop** (`audio.spec.ts`): the hut played in the Play panel and at `/play/`; the hook shows no context until the first press, the hut's ambience and music at the start, the storm's ambience while the storm screen is up, each feedback line's sound as its beat comes and its buzz caught from `navigator.vibrate`; Sound at 0 makes no context; Music at 0 sets its bus to 0; a hidden tab suspends. Above a sound's form Play plays it (the hook shows it), Paste ZzFX fills a voice, and Start from fills a sound.
- **Phones** (`audioPhone.spec.ts`), at 360×740, 390×844 and 844×390: the settings' volumes by touch, each in reach with no target under 44 px and nothing axe finds; a sound's preview by touch in the inspector's sheet.
- **Node** (`audio.test.ts`): our port matches the `zzfx` package's `buildSamples` sample for sample over random parameters; every hut sound and ambience layer renders to its golden hash, peaks under 1, loops without a seam.

## Open questions

1. Ducking music and ambience under a talk, as Dirtbag and Chooser do.
2. A lint for a sound a phone's speaker can't play: most of its energy below 500 Hz (Rule or Drool's model).
3. Whether stems should be Ogg or WAV: Ogg is a tenth of the size, but Safari before 18.4 can't play Ogg Opus.
