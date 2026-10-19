# name: An evening at the hut
EXTERNAL factions_standing(faction)
The bunk room fills after dark. Boots steam by the stove.
"Is it true you climbed the north face?" # speaker: climber
* [Tell them about the north face.]
  # fx: change-standing(faction: guild, by: 1)
  "Then we'll try it in the morning." # speaker: climber
* [Say it was a long time ago.]
- { factions_standing("village") >= 2: Someone from the village has left bread on the table. }
The stove ticks as it cools.
-> END
