# name: The keeper of the bridge
// The third dusk: the keeper of the other hall's bridge asks for one thing to be said out loud.
EXTERNAL flag_on(flag)
EXTERNAL flag_number(flag)
EXTERNAL factions_standing(faction)
-> arrival

=== arrival ===
At dusk a woman comes up the path from below, against the flow of the dead.
"I keep the bridge to the other hall. My lady would like a word with whoever sits at this desk." # speaker: keeper
{ flag_on("sent-healer"):
  "A healer crossed my bridge this morning, going the wrong way. She said a raven paid her." # speaker: keeper
}
{ flag_on("promised"):
  "And a boy in the next valley is telling everyone his sister is coming home." # speaker: keeper
}
- (ask)
* ["What does your lady want?"]
  "Someone at this gate to say that the quiet dead count." # speaker: keeper
  -> ask
* ["Who crosses your bridge?"]
  "Everyone the songs leave out." # speaker: keeper
  -> ask
* [Ask her to sit down.]
  She sits, which surprises you both.
- -> answer

=== answer ===
"Well?" # speaker: keeper
* {flag_number("truth") >= 1} ["The quiet dead count."]
  # fx: change-standing(faction: hel, by: 3)
  You say it out loud, with the whole queue listening{factions_standing("odin") >= 4:, and up the hill a door bangs shut|}.
  -> farewell
* ["Odin decides who counts."]
  # fx: change-standing(faction: odin, by: 1)
  "Then Odin can find somewhere to put them." # speaker: keeper
  -> END
* [Say nothing.]
  She waits a little longer, then nods as if you'd answered anyway.
  -> farewell

=== farewell ===
"Thank you." # speaker: keeper
She goes back down the path, and doesn't hurry.
-> END
