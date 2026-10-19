/**
 * What a new scene holds (M3.11, D49): ink that compiles as it stands, a line, two choices and a
 * gather, with the talk's name from what was typed and an EXTERNAL showing how a scene names a
 * fact of the game.
 */

/** A name as a `# name:` tag holds it: on one line, with no # to start another tag. */
const tagged = (name: string): string => name.replace(/[\r\n#{}]+/g, ' ').trim();

export const sceneTemplate = (name: string): string => `# name: ${tagged(name)}
// A scene in ink: what is said, what the player can say back, and where each leads.
// Name a fact of the game to read it, as EXTERNAL flag_on(flag) does for flag.on.
EXTERNAL flag_on(flag)

The first line of the scene.
* [Something to say back.]
  What that leads to.
* [Something else.]
- And then the scene ends.
-> END
`;
