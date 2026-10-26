# Research: real-time combat for M6.4

What RCJ Labs' own games do for fights, read in October 2026 for [specs/combat.md](../specs/combat.md)
and D76. landnam-ue, mythos-clash and dirtbag-ue were left out, as for every milestone.

## What the games have

- **Only 2060td fights in real time** in a way worth copying, and it is a tower defence: no swing
  arcs, wind-ups, hurtboxes, lock-on or touch attack button anywhere in the folder. M6.4 designs
  those from scratch.
- **afterglass** has a light real-time fight on one axis: a unit strikes the nearest foe within a
  reach, for damage a second; a foe climbing out of its rift is a telegraph that can be hit.
- **project-ascent** is a dodger: box hits with the player's box shrunk by a stat, 900 ms of
  invulnerability after a hit, and a press during a move queued until it ends.
- **Turn-based elsewhere:** landnam (initiative tactics, strike, thrust and throw), space-wrecked
  (action points, overwatch, line of sight, weighted drops), wasteland-protocol and spliceworld
  (turn orders), ludus (bouts worked out in rounds). The engine's encounters kit covers these.

## What 2060td does that M6.4 keeps

- **The sim at a fixed rate, inputs stamped with the step they apply on,** so a seed and the inputs
  give the same state; M6.4's sim hears only what the stage found (a hit, a shot loosed) and its
  own effects, so replays are exact without the sim knowing positions.
- **A combat roll on its own stream,** so adding one doesn't move other rolls. M6.4 has no roll
  (D76), so needs none.
- **Hitscan for guns, landing ticks for shells:** a shell stores where it lands and when, its arc
  drawn only by the renderer. M6.4's arrows are moved by the stage under gravity because the
  physics that stops them (walls, crates) is the stage's.
- **A fine damage spread averages out** and barely changes outcomes (its own notes say so): one
  reason D76 keeps damage exact.
- **Telegraphs by delay:** a called strike lands 0.7 to 1.6 s after it is shown. M6.4's wind-ups
  are 250 ms (the player's sword) and longer for heavier weapons, shown on the figure.

## Numbers seen

| Game | Thing | Value |
| --- | --- | --- |
| 2060td | rifle | 10 damage, 3 shots a second, range 4.5 cells |
| 2060td | mortar | 38 damage, one shot per 3.8 s, range 3 to 8.5, flight 1.3 s |
| 2060td | infantry | 70 hp, 2.3 cells a second, 12 damage a second in melee |
| afterglass | a shade's reach | 6 (11 for the Reckless trait), 1 damage a second |
| project-ascent | invulnerable after a hit | 900 ms |

## Open questions

1. Whether a short invulnerability after the player is hit (project-ascent's 900 ms) is needed once
   two foes strike together; untested for feel.
