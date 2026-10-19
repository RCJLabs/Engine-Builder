# name: The first dusk
// Hild comes by as the first day at the gate ends. What she says turns on how the day went.
EXTERNAL factions_standing(faction)
The last of the queue shuffles through the gate as the sun touches the hill.
Hild sits on the end of your table and eats an apple, core and all.
"First day. How many did you send up the hill?" # speaker: hild
{
- factions_standing("odin") >= 3:
  "All of them up the hill, by the look of your ledger. The hall will be loud tonight." # speaker: hild
- factions_standing("hel") >= 3:
  "None of them, by the look of your ledger. The bridge will be busy." # speaker: hild
- else:
  "A few each way. You'll get faster." # speaker: hild
}
* ["Does it matter where they go?"]
  # fx: set-flag(flag: asked-hild, to: true)
  # fx: add-to-flag(flag: truth, by: 1)
  "It matters to them." # speaker: hild
  She throws the apple stalk over the gate, and doesn't watch where it lands.
* ["I did what the ledger said."]
  "The ledger is a list of names. You're the one who chooses." # speaker: hild
- (night) She hops down and goes off toward the bridge, whistling something old.
-> END
