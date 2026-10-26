/**
 * Tags in the inspector (M6.7, D79): what was typed tidied into a file's words, why one can't be
 * added, the project's tags the box offers, and where the writer puts a space's and an object's.
 */
import { describe, expect, it } from 'vitest';
import { withSpaceTags } from './spaceEdits.ts';
import { spaceText } from './spaceFile.ts';
import { projectTags, TAGS_MOST, tagProblem, tidyTag } from './tags.ts';

describe('tags in the inspector', () => {
  it('tidies what was typed into a file’s words', () => {
    expect(tidyTag('  Bandit Den ')).toBe('bandit-den');
    expect(tidyTag('boss_chest')).toBe('boss-chest');
    expect(tidyTag('-cave--mouth-')).toBe('cave-mouth');
    expect(tidyTag('   ')).toBe('');
  });

  it('says why a tag can’t be added', () => {
    expect(tagProblem('cave', [])).toBeUndefined();
    expect(tagProblem('', [])).toBeUndefined();
    expect(tagProblem('café', [])).toBe('A tag is lowercase words joined by hyphens');
    expect(tagProblem('cave', ['cave'])).toBe('It is tagged cave already');
    const full = Array.from({ length: TAGS_MOST }, (_, i) => `t${i}`);
    expect(tagProblem('more', full)).toBe(`${TAGS_MOST} tags at most`);
  });

  it('offers every tag the project carries, once each, sorted', () => {
    expect(projectTags(undefined)).toEqual([]);
    expect(
      projectTags({
        spaces: new Map([
          ['mine', ['cave', 'deep']],
          ['barrow', ['cave']],
        ]),
        objects: new Map([['mine', new Map([['stash/chest', ['cache', 'old']]])]]),
        actors: new Map([['wick', ['chief']]]),
      }),
    ).toEqual(['cache', 'cave', 'deep', 'old']);
  });

  it('writes a space’s tags after its name, an object’s after its name, and none when taken off', () => {
    const tagged = withSpaceTags(
      { name: 'Cave', objects: [{ id: 'chest', name: 'Chest', tags: ['cache'], shape: 'box' }] },
      ['cave'],
    );
    expect(spaceText(tagged)).toBe(
      '{\n  "name": "Cave",\n  "tags": ["cave"],\n  "objects": [\n    { "id": "chest", "name": "Chest", "tags": ["cache"], "shape": "box" }\n  ]\n}\n',
    );
    expect(withSpaceTags(tagged, [])).toEqual({ name: 'Cave', objects: tagged.objects });
  });
});
