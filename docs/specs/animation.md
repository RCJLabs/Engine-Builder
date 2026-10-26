# Animation: the rig, clips and animators (M6.5)

How people move in a walked space, as D77 settles it:
- every character shares the engine's one humanoid rig;
- a starter character generated in code is the figure everyone wears until a project brings its own;
- clips made for other skeletons are carried onto the rig as they are imported;
- an `animator` record is the state machine the stage runs over two layers: the whole body, and the upper body for attacks.

It builds on [models](models.md) (the import and the model worker), [npcs](npcs.md) (the figure),
[movement](movement.md) (the character controller) and [combat](combat.md) (a swing's phases).

## The rig

- **The engine's rig** is VRM 1.0's humanoid.
  - Required bones, VRM's fifteen:
    - the trunk: `hips`, `spine`, `head`;
    - each side's arm: `leftUpperArm`, `leftLowerArm`, `leftHand` and the right's;
    - each side's leg: `leftUpperLeg`, `leftLowerLeg`, `leftFoot` and the right's.
  - Kept when there: `chest`, `upperChest`, `neck`, both `Shoulder`s and `Toes`.
  - Any other joint (fingers, a jaw, a tail) is carried along but shared with no other model.
  - Metres, +y up, facing −z, as every placed thing faces.
- **A normalised skeleton.** At rest every bone's world rotation is the identity, in a T-pose:
  - the arms along ±x;
  - the legs and the spine along y;
  - the feet along −z.
  - A clip is then a bone's rotation away from that rest, the same on any model, so clips are shared by name alone.

## Importing a rigged model

The model worker (D67) does this once, as it packs the file:

1. **Map.**
   - Each joint of the first skin is matched to a humanoid bone by name:
     - VRM's own names;
     - Mixamo's `mixamorig:`;
     - Unreal's `pelvis`, `spine_01`, `upperarm_l`;
     - Quaternius's and KayKit's;
     - Blender's `.L`/`.R`;
     - then by left/right patterns.
   - The model record's `rig.bones` keeps the map, and the model's form changes it.
   - A model with a skin but some required bones unmapped is W152 and imports unrigged.
2. **Find the T-pose.**
   - Each required bone's direction at rest, from its head to its child's, is turned to the T-pose's direction for it. An A-pose's arms come up 45°, say.
   - Only the bones off by more than 1° are turned.
3. **Normalise.** For each joint, `R` is its rest world rotation with that turn:
   - its node gets the identity rotation, and its offset from its parent turned by the parent's `R`
     (`R_parent · t`): the world-axis offset in the T-pose;
   - its inverse bind matrix becomes `R · IBM`, so the mesh draws as before at every pose;
   - every rotation key of a clip becomes `R_parent · q · R⁻¹`. Any constant `R` keeps every vertex
     where it was at every pose. Choosing the T-posed rest makes a clip mean the same on every model.
     A spike in Node, on an odd-framed chain at a random pose, moved no vertex more than 1e-15 m;
   - the armature's own transform (a centimetre armature's 0.01) is folded into the hips.
4. **In place.**
   - The hips' movement across x and z is taken out of every clip, its height kept.
   - The distance it covered over the clip's length is the clip's **pace**, in metres a second (0 for a clip that stays put).
5. **Record.**
   - The model record lists its clips under `clips`: each one's name, length (read from the file) and `pace`, which a form can correct.
   - A model whose file has clips but no mesh is a **clip set**: it brings clips only.

The stage loads a rigged model with `SkeletonUtils.clone` for each NPC. It scales the hips' height
keys by the model's hip height over the clip's own, so a short character's hips don't float.

## The starter character

- **`tools/starter-kit/src/character`**, run by `pnpm make:starter-character`, writes the character into `starter-character/` byte for byte, as `pnpm make:starter-kit` writes the kit:
  - a jointed mannequin of 372 triangles, 1.76 m to the top of its hair, each part moved wholly by one bone, in five material slots: clothes, trim, skin, hair and soles;
  - its skeleton on the rig, already normalised: the import maps every bone by name and turns none;
  - the clips below, sampled at 30 frames a second from formulas. Each frame's lowest point is worked out bone by bone and the hips lifted by however far under the ground it is (never lowered, so a run keeps its moment in the air): a walk's trailing toes dipped 4 cm under before;
  - its model, materials and stock animator as records, and the provenance log (CC0, RCJLabs).
- **The clips:**

  | Clip | Loops | Length | Pace |
  | --- | --- | --- | --- |
  | idle | yes | 3 s | 0 |
  | walk | yes | 1.1 s | 1.4 m/s |
  | run | yes | 0.7 s | 4.0 m/s |
  | jump | no | 0.3 s | 0 |
  | fall | yes | 0.8 s | 0 |
  | land | no | 0.3 s | 0 |
  | windup | no | 1 s, fit | 0 |
  | strike | no | 1 s, fit | 0 |
  | recover | no | 1 s, fit | 0 |
  | draw | no | 1 s, fit | 0 |
  | hold | yes | 1 s | 0 |
  | loose | no | 1 s, fit | 0 |
  | hit | no | 0.4 s | 0 |
  | fall-down | no | 0.8 s | 0 |
  | lie | yes | 2 s | 0 |
  | talk | yes | 2.5 s | 0 |

  A clip marked *fit* is stretched to the phase it plays in. The fall-down ends lying 0.55 m behind where it stood, the one clip whose hips travel; its pace is 0, as it is no walk.
- **The engine's own copy.**
  - walk.js carries it, so the figure needs no project files and plays offline.
  - An actor drawn as a figure is the starter character, scaled to its height, with its clothes, trim and skin colours on those slots.
  - The capsule the player was drawn as goes: the player is their actor's look, or the starter character when project.json names no `fighting.player`.
- **Add starter character** (the Assets panel's Add) copies it into the project at `assets/starter-character/` with its records, as Add starter kit does, for a project to change or replace.

## Animators

An `animator` record (an engine type, like `behaviour`). `clips` names the model whose clips its
states play; a state takes another model's with `from`:

```json
{
  "clips": "starter-character",
  "base": {
    "start": "idle",
    "states": [
      { "id": "idle", "clip": "idle", "loop": true },
      { "id": "walk", "clip": "walk", "loop": true, "rate": "pace" },
      { "id": "run",  "clip": "run",  "loop": true, "rate": "pace" },
      { "id": "air",  "clip": "fall", "loop": true },
      { "id": "down", "clip": "fall-down" },
      { "id": "talk", "clip": "walk", "from": "strider", "loop": true }
    ],
    "transitions": [
      { "from": "idle", "to": "walk", "when": "anim.speed > 0.2", "blend": 0.2 },
      { "from": "*", "to": "air", "when": "not anim.grounded", "blend": 0.15 },
      { "from": "*", "to": "down", "when": "anim.down", "blend": 0.3 }
    ]
  },
  "upper": {
    "start": "none",
    "states": [
      { "id": "none" },
      { "id": "windup", "clip": "windup", "rate": "fit" }
    ],
    "transitions": [
      { "from": "*", "to": "windup", "when": "anim.swing == \"windup\"", "blend": 0.1 }
    ]
  }
}
```

- **A state** has:
  - an `id`;
  - a `clip`, the clip's name in its model, and `from`, another model to take it from;
  - `loop`;
  - a `rate`: `"fixed"` (left out) plays at its `speed` (1 left out); `"pace"`, at the speed moved over the clip's pace; `"fit"`, laid on the phase, its time the clip's length times the phase's progress.
- **A transition with no `when`** comes as the playing state's clip ends: a one-shot reaching its length, or a loop wrapping. One from `"*"` needs a `when`.
- **Blends.** Over a blend the playing state's weight rises from 0 to 1 and the faded one's falls; a transition mid-blend drops the older faded state. A `fit` state fading out holds where its own phase left it.
- **A state with no clip** gives its layer no weight. The base layer's states all have clips.
- **Transitions** are checked in order each frame from the state playing, `"*"` matching any. The first whose condition holds crossfades to its `to` over `blend` seconds. A transition to the state already playing does nothing.
- **Conditions** are the engine's condition text over the stage's facts:

  | Fact | Value |
  | --- | --- |
  | `anim.speed` | metres a second across the ground |
  | `anim.grounded` | whether the controller stands on something |
  | `anim.rising` | whether it moves up |
  | `anim.swing` | `"none"`, `"windup"`, `"strike"` or `"recover"` |
  | `anim.draw` | `"none"`, `"draw"`, `"hold"` or `"loose"` |
  | `anim.weapon` | `"none"`, `"melee"` or `"ranged"` |
  | `anim.down` | whether the fight says it has fallen |
  | `anim.talking` | whether a talk with it is open |
  | `anim.hit` | true for the 0.4 s after a hit lands on it |

- **The stock animator** is the starter character's, written by the generator, and every actor with no `animator` uses it.
- **An actor's `animator`** names one. The animator plays the clips on the actor's own model (or the starter character), so one animator serves every model on the rig.

## In the walk

- **Time.** Animators step by the time the motion stepped (its fixed steps), not the frame's, so a slow frame doesn't slide the feet. Under a talk's pause the NPC talked to goes on moving; every other body holds.
- **Speed.** The player's is the controller's across the ground; an NPC's is measured from how far its node moved, smoothed over 0.15 s. The stock animator runs above 3.5 m/s and walks above 0.2: the walk's own speed is 2.5 and the run's 5.
- **Each frame** the stage:
  1. works out each animated body's facts;
  2. steps its animator, a plain function of the facts, the state and the time, which returns each layer's state, time and weights;
  3. sets three's mixer actions to match: the upper layer's actions are masked to the upper-body bones, by tracks filtered when the clip is bound.
- **Timing comes from the fight.**
  - A `fit` state's rate is its clip's length over the phase's, which comes from the weapon's `wind-up`, `strike` and `recover` (D76).
  - So the strike clip ends in the fixed step where the stage finds the hit.
- **Distance.**
  - Within 30 m an NPC's mixer runs every frame.
  - From 30 m to 60 m it runs every other frame.
  - Beyond 60 m it holds its pose.
  - The Low tier halves both distances.
- **The hook.** `window.__ebWalk.anims()` returns, for the player and each NPC built, read back from three's mixer and skeleton:
  - each layer's state, clip, time and weight;
  - the world positions of `hips`, `head`, `leftHand`, `rightHand`, `leftFoot` and `rightFoot`.
- **M6.4's leans go.** The wind-up's lean back, the strike's lean forward and lying on the back become the animator's states.

## Checks

| Code | When |
| --- | --- |
| E083 | An animator's clip names a model that isn't rigged, or a clip it doesn't have |
| E084 | An animator's states: an `id` twice, `start` not a state, a transition to or from a state that isn't there, a base state with no clip, a `speed` with a `rate` other than `"fixed"`, or a transition from `"*"` with no `when` |
| E085 | An actor's `animator` on a model that isn't rigged |
| W152 | A skinned model with required bones unmapped: it draws, unanimated |
| W153 | An animator state no transition reaches |

A transition's condition is checked as conditions are (E022, E023), against the `anim.*` facts.

## The editor

- **The import** puts a skinned model on the rig in the model worker before packing it, and writes its record's `rig` (each humanoid bone and the joint it was) and `clips` (each name, length and pace, a pace only when it moves). A skinned model starts with no LOD levels: each level would need a skeleton of its own.
- **The model's form**, for a skinned model, gains:
  - **Rig**: a map of the humanoid bones to the joints they were, as text; the joints aren't yet offered from the skeleton;
  - **Clips**: each clip's name, length and pace.
- **The animator's form** is an outline of each layer, as a behaviour's outline is (D75):
  - a row a state, the transitions it leaves by under it, numbered in the order they are read; then the transitions from any state, or from one that isn't there;
  - Starts in, a choice of the layer's states;
  - Add state (after the one chosen, playing the model's first clip; a layer that starts in no state starts in it), Add transition (from the state chosen, to the next, its condition to write), Up, Down and Remove (a state takes its transitions both ways with it, and the layer keeps one); Add upper body and Remove upper body;
  - a state's form: its name, renamed where the layer names it when the field is left; its clip, a choice of its model's clips; from, loop, rate and speed;
  - a transition's form: from and to, choices of the layer's states; when, read with the `anim.*` facts alone; blend.
- **The preview** above the form, a lazy chunk of its own:
  - it plays the animator on the starter character, its clips from the starter character or from the project's own models, decoded from their files;
  - a slider sets the speed, switches set grounded, rising, talking, down and hit, and choices set swing, bow and weapon; a swing or a draw chosen runs its phase once over half a second;
  - it runs the animator the stage runs, and says what each layer plays, read back from it (`window.__ebAnimPreview` for the e2e).
- **The actor's form** gains Animator, and Records lists animators after the engine's other types.
- **Add starter character** in the Assets panel.

## The gate

- **Headless tests:**
  - the animator as plain functions: transitions in order, `*`, blends, `pace` and `fit` rates, a layer with no clip;
  - normalising: on a foreign rig made in code (Mixamo's names, an A-pose, a centimetre armature, a walk with root motion), a skinned vertex's posed world position before and after, to 1e-5;
  - the same walk on the starter character and the foreign rig, giving the same bone directions to 1°;
  - the root motion taken out, and the pace read back to 1%.
- **The starter character** is held byte for byte to its generator, and to `eb validate` with no problems.
- **`anim.spec.ts`**, the camp walked by keys:
  - the hero and the bandits drawn as the starter character, read through `__ebWalk.anims()`;
  - idle standing; walk at a walking speed and run at a running one, each playing at the speed over its pace to within 10%;
  - the air in a jump;
  - the upper layer's windup, strike and recover lined up with the swing's phases, the strike playing in the step the hit is sent, and the right hand moving down and forward over it;
  - down when a bandit falls.
- **`animPhone.spec.ts`**: the same by touch at 360, 390 and sideways.
- **`animEditor.spec.ts`**, at 1280 and 390, in the editor alone:
  - a foreign rig's walk imported and mapped;
  - a new animator whose talk state plays it, with a transition on `anim.talking` tried in the preview;
  - given to the ford's smith and seen playing in Play as the talk opens.
- **Readings:**
  - the mixer's time a frame for the square's thirteen in Node;
  - the starter character's size, and walk.js's and the precache's growth;
  - a foreign model's import time.

## Open questions

1. Whether the generated clips read well, untested for feel; better clips (Quaternius, KayKit) can come in through the import.
2. Feet planted on slopes and steps (IK).
3. Faces: blinking, mouths with talk lines.
4. A held weapon drawn in the hand, by the model's `rightHand` bone (the item's own model, when items have models).
5. Previewing on a chosen actor's model rather than the starter character, and a model's Rig form offering the skeleton's joints to choose from.
6. Root motion kept for clips that need it (a vault, a lunge). Until then the import takes the travel out of every clip, a one-shot's too: a fall backwards imported lands where it stood, and its record gets a pace nothing reads.
7. Non-humanoid rigs (a dog, a horse) and their own clip sets.
8. A node graph for animators (Phase 8).
9. The player's look: a player actor with a model of its own is drawn as the starter character for now.
