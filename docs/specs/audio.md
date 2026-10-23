# Audio and haptics (M4.8, D58)

How a game sounds and buzzes: sound effects as layered ZzFX voices, ambience synthesised from data, music as file stems, all as records; cues on the feedback lines; buses and the player's volumes. The survey behind it is [research/audio.md](../research/audio.md). The sim never reads any of it: the worker sends what a step's beats call for, and the page plays it.

## Records

Three engine types, which every project has, as it has flags and sheets: `sound`, `ambience` and `music`. They have forms, pickers, used-by and renames as any type does, and their tables in Records come after a project's own types (flags and sheets stay in the Logic panel). A new record's id comes from its name, as any record's does.

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

- **Starts on the first gesture:** a press, a key or a pad's button makes the audio context, or resumes it. Opening a game is not one; raising Sound from 0 in the settings is, since it is a press.
- **A hidden tab** suspends it; a shown one resumes it.
- **Buzzes** wait for the page's first activation and need `navigator.vibrate`; with Vibration off, none. They don't need the context: with Sound at 0 a step still buzzes.
- **The hook:** `window.__ebAudio` holds what the player is doing: `{ context, ambience, music, levels, buses, played }`, `context` one of `none`, `running` and `suspended`, `buses` each bus's gain as set (empty with no context), `played` the last 50 sounds and buzzes, each `{ kind, id, at }`. The editor's previews note what they play there too. The e2e reads it; nothing else does.

## Checks

- **The records** by their type files (E001), with an ambience's sounds and a music's assets as references (E005, E018).
- **E049** for a screen's `ambience` or `music`, a feedback line's `sound` or a theme's sound that names no such record.
- **E047** for a feedback line with none of `say`, `sound` and `buzz`, or with `to` and no `say`.

## Packing

- **Format 8** carries the audio files any music names, as base64 by path, `audio: { "audio/hut-theme.wav": "UklGR…" }`, so an exported game plays its music offline. A pack without music keeps its format and hash.

## The editor

- **Above a sound's form:** Play; the samples drawn; its length and peak as played; Start from, which fills its voices from a preset (Blip, Pickup, Jump, Hit, Laser, Explosion, Power-up, Step), each drawn from its own ranges; Vary, which moves each number a voice sets by up to a tenth either way, in bounds, keeping its shape and start; and Paste as a new voice, which takes what ZzFX's designer copies (`zzfx(...[…])`, `zzfx(…)`, a bare array or bare numbers), holes as ZzFX's defaults, and adds it as a voice, up to three. Each is one step of undo; Vary and Paste work on the voices as the file holds them, so nothing half typed is lost. A sound plays in the editor through a context of its own, at ZzFX's level.
- **Above an ambience's or a music's form:** Play and Stop, through the game's own player, and a box for each layer, sound now and then or stem with a condition, to hear it as if the condition held. A music's files are read from the project as Play is pressed.
- **The screen designer** gains Ambience and Music pickers in the screen's own form, written after the screen's parts; **the theme designer** gains Interface sounds: A press, A screen opening and Back. The designer's pickers name records as the record form's do, "Hut (hut)".
- **Feedback** stays JSON, its new fields checked at their lines.

## Where it lives

- `packages/ui/src/format/audio.ts`: the records' shapes, the buzzes, `zzfxArgs` and `voiceFromZzfx`.
- `packages/ui/src/audio/`: `zzfx.ts` (the port), `render.ts` (a sound, a layer), `mix.ts` (`mixOf`, `audioConditions` and `heaviest`, pure), `player.ts` (Web Audio, and the buzzes), `hook.ts` (`window.__ebAudio`), `useAudio.ts`.
- `packages/ui/src/session/`: `audioPack.ts` (the records as the page plays them), the cues in `say.ts`, `play.ts` and the `stepped` reply.
- `packages/schema/src/audioTypes.ts`: the three type files; `uiCheck.ts` and `feedbackCheck.ts` gain the references.
- `packages/core/src/pack.ts`: format 8. `packages/compiler/src/audioFiles.ts`: the files packed.
- `apps/editor/src/audio/`: the previews above the forms (`SoundPreview.tsx`, `LoopPreview.tsx`) and what they do as plain functions (`soundEdits.ts`: the presets, Vary, Paste; `loopParts.ts`: the parts and the mix a preview plays).

## The gate

- **The hut** gains five sounds (a load, a coin, a chime, a door and a click), two ambiences (the hut's wind, with rain from day 4 and the door now and then, and the storm's), a music of one stem (an arpeggio the engine's own synth rendered, `tools/cli/test/fixtures/hut-theme.ts`, logged as the project's own), sounds and buzzes on four feedback lines, and the theme's click. The Phase 3 spec builds them in the editor: the stem imported in Assets with its provenance, each sound pasted in voice by voice as ZzFX's designer copies it, the ambiences and the music made with their forms, each landing as the fixture holds it; the export is still the fixture file for file, the stem byte for byte.
- **Desktop** (`audio.spec.ts`): the hut played in the Play panel and at `/play/`; the hook shows no context until the first press, the hut's ambience and music at the start, the storm's ambience while the storm screen is up, the rain once day 4 comes, quiet once the hut is shut, each feedback line's sound as its beat comes and its buzz caught from `navigator.vibrate`; Sound at 0 makes no context, though a step still buzzes; Music at 0 sets its bus to 0; a hidden page suspends. Above a sound's form Play plays it (the hook shows it), Start from fills it, Paste ZzFX refuses what isn't ZzFX and adds a voice, one undo taking it back; above an ambience's, Play and a condition ticked; above a music's, Play.
- **Phones** (`audioPhone.spec.ts`), at 360×740, 390×844 and 844×390: the settings' volumes by touch, each in reach with no target under 44 px and nothing axe finds, the buses following; a sound's preview played and varied by touch in the inspector's sheet.
- **Node:** `zzfx.test.ts`, our port against the `zzfx` package's `buildSamples`, byte for byte over 200 random sounds; `mix.test.ts`, the mix, the heaviest buzz, voices at their starts, layers that meet themselves; `hutAudio.test.ts`, the hut's pack at format 8 with its stem byte for byte, every hut sound and layer rendering to its pinned hash under full scale as played, and a carried load's cues and the mix through the worker's host.

## Open questions

1. Ducking music and ambience under a talk, as Dirtbag and Chooser do.
2. A lint for a sound a phone's speaker can't play: most of its energy below 500 Hz (Rule or Drool's model).
3. Whether stems should be Ogg or WAV: Ogg is a tenth of the size, but Safari before 18.4 can't play Ogg Opus.
4. The provenance form offers Tool only for generated art, so the hut's stem, the project's own work made with the engine's synth, names its tool in its source line. Whether own work should have a Tool box too.
