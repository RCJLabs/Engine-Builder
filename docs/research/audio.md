# Audio in the games we have (M4.8)

A survey of how eleven of Evan's browser games make and play sound, read for M4.8 ([D58](../decisions.md)). It records what the code does, with where; what we infer from it is marked as such. No game's story is quoted.

## What they make

- **Every game synthesises its sound, and none ships a sample file.**
  - Dirtbag: 34 cues, each a closure over a `tone` (wave, frequency, glide, length, gain, delay, attack) and a filtered noise `burst` (`app/src/audio/voices.ts`).
  - Landnam: 23 cues written as data: tone and noise layers with wave, frequency, glide, filter, q, sweep, gain, attack and decay, each with a note saying what it is (`src/data/sounds.ts`).
  - Chooser of the Dead: 12 recipes as closures, with recorded files able to take a recipe's place (`packages/ui/src/audio.ts`, `sound/beds.ts`).
  - Spliceworld: 19 stingers as data arrays through one voice shape (`audio/sfx.js`).
  - Wasteland Protocol: a table of 21 voices `{wave, from, to, dur, gain, noise, filter, chord}` (`game.js:5125`).
  - Afterglass: 58 sounds, each with a group, a rate limit, a level, a haptic and a label, but played by code (`prototype/src/slice/sound.js`).
  - 2060td, Rule or Drool, Project Ascent, Sandbagged and Ludus: tone and noise helpers called from a switch or from game code.
  - Space-Wrecked has no audio yet; its roadmap plans ZzFX.
- **None uses ZzFX itself.** Spliceworld planned it and wrote its own synth. Space-Wrecked plans it. ZzFX 1.4.0 (Frank Force, MIT) has 21 parameters, renders to a sample buffer in one loop, and calls `Math.random` once, for a sound's pitch randomness; its noise is a function of the sample index (`ZzFX.js`, `buildSamples`).
- **Randomness:** Landnam, Chooser, Spliceworld and Sandbagged seed their noise; Dirtbag, Wasteland Protocol, 2060td, Ludus and Afterglass by default use `Math.random`.

## Ambience and music

- **Ambience is filtered noise and drones, from data:**
  - Dirtbag: six noise layers per place, wandering slowly, and seven kinds of sound now and then at a rate (`ambience.ts`); night and rain change the levels (`beds.ts`); fades with a 0.4 s time constant.
  - Landnam: one wind bed, its level a pure function of terrain and season (`audio/ambience.ts`), eased over 1.5 s.
  - Wasteland Protocol: nine beds `{drone, interval, voice, cutoff, hiss, sway, mote…}` (`game.js:5297`).
  - Sandbagged: six beds crossfading over 1.4 s, which bed a pure function of the game state, tested (`engine.ts:1660`).
- **Music:**
  - Dirtbag generates it: six moods of tempo, root, scale and four chords, picked by place, hour and season, played in stretches of 16 to 32 bars with quiet between (`moods.ts`, `music.ts`). Its roadmap says no one has heard it in the game yet.
  - 2060td's moods and battle steps are data, the step rising at most every 2 s and falling only after 4 s (`content/score.ts`).
  - Chooser's beds are file stems in `sound.yaml`, started on the same sample so they stay in step, a tension stem following how much of the day has gone, crossfading over 1.2 s (`beds.ts`, `mix.ts`). No files exist yet.
- **Which plays is a pure function** in Landnam, Sandbagged and Chooser (`mixFor`), which their tests hold. (Inferred:) that is the shape a data-driven engine wants.

## Buses and settings

- **Buses:** Dirtbag has master, effects, ambience (0.7) and music (0.6), and ducks ambience and music under talk. Afterglass adds a reverb send and a limiter. Several have no buses at all.
- **Settings vary widely:** on and off switches (Dirtbag, Rule or Drool, Sandbagged, Landnam's mute), steps (Spliceworld's Full, Half and Quiet, deliberately not a slider; Wasteland Protocol's four; 2060td's five), and sliders (Chooser's 0 to 1 in tenths; Afterglass's 0 to 100 in fives). Most keep them outside the save; Spliceworld and Sandbagged keep them in it.
- **Volume 0 makes nothing:** in Landnam and Chooser a muted game makes no audio context and no nodes, and their tests check it.

## Cues

- **From game code** in Dirtbag, Rule or Drool, Sandbagged and Ludus; **from a pure diff of two states** in Landnam (`cuesFor(before, after, action)`) and Spliceworld; **from the sim's events** in Project Ascent and Afterglass, whose sim raises cues on a side channel that is never saved and whose test checks that listening changes nothing (`sim.js:354`).
- **Throttles:** 2060td gives each sound a minimum gap; Afterglass limits groups to one every 80, 300 or 600 ms and drops small sounds past 18 voices; Landnam tolls its knell once however many die; Rule or Drool sounds a danger cue only as a meter crosses the line.

## Haptics

- **Read from the same cues** in Landnam (`haptics.ts`: a priority list, one buzz a step, the heaviest, nothing longer than 200 ms) and Spliceworld (patterns in `voice.json` by cue name); named by meaning in 2060td (tap, commit, deny, land, warn, breach, loss).
- **Only after a touch and where they work:** 2060td waits for `userActivation.hasBeenActive`; it and Afterglass show the switch only where the device can vibrate, since iOS can't. Landnam turns them off under reduced motion.

## Unlocking, hidden tabs and phones

- **Every game starts its audio context on the first gesture**, and every call does nothing when there is none.
- **A hidden tab** suspends the context in Dirtbag, Chooser, Afterglass and Sandbagged; 2060td's music skips ahead rather than playing what it missed.
- **Phone speakers:** Rule or Drool tests every cue through a model of a phone speaker (two high-pass filters at 500 Hz), which must lose under 15 dB; Wasteland Protocol lifted its beds' voices above 260 Hz after four of seven measured under 100 Hz; Afterglass measured above a 300 Hz high-pass. Chooser notes Safari before 18.4 can't play Ogg Opus.

## Tests

- **Fakes:** Landnam, Spliceworld and Rule or Drool drive the real synth through a fake audio context and check what was built.
- **Offline renders that assert nothing:** Dirtbag's sound sheet and Wasteland Protocol's `render-audio.js` render every sound through `OfflineAudioContext` for listening or for numbers.
- **Hooks for the e2e:** Chooser reads a dev-only `__cotsSound` for the mix and each layer's level; Wasteland Protocol keeps a log of the last 40 sounds played.
- **Names:** Wasteland Protocol checks that every sound named exists and every sound is reached; 2060td's `never` switch makes a name without a sound a type error.

## What M4.8 takes (inference)

- ZzFX's parameters for a voice, rendered by our own port with the randomness passed in, so the editor, the player and a Node test render the same samples; Landnam's layering, so one sound can be more than one voice.
- Cues as data on the feedback lines, matched on the sim's events, never read by the sim (Afterglass's side channel, here the beats the sim already gives).
- Landnam's haptic rules: named buzzes, one a step, the heaviest, short, only after a touch and only where the device can.
- Chooser's pure mix with timed crossfades and stems started together; Sandbagged's and Dirtbag's synthesised beds as data.
- Landnam's and Chooser's "volume 0 makes no context"; Dirtbag's and Chooser's suspend in a hidden tab.
- A hook the e2e reads, as Chooser's and Wasteland Protocol's, and hashes of rendered samples, which none of them has.

## Open questions

1. No game here has a phone-speaker check that fails a build. Rule or Drool's model could become a lint on a sound whose energy sits below 500 Hz.
2. Ducking music under a talk (Dirtbag, Chooser) isn't in M4.8.
