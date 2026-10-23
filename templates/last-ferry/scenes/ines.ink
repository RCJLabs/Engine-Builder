# name: Ines
EXTERNAL flag_on(flag)
Ines grips the gunwale and watches the far bank as if she could pull it closer.
"There's a girl in labour at the mill house, and I'm the only midwife this side of the hills. How long?" # speaker: ines
The slow water is safe and takes an hour. The weir channel is a quarter of that, if the current doesn't take you onto the stones.
* [Take the weir channel.]
  # fx: set-flag(flag: ines-in-time, to: true)
  The ferry bucks and spins and the stones go by close enough to touch. Then you're through, in still water, nearly there.
  "Thank you," she says, and doesn't let go of the gunwale. # speaker: ines
* [Keep to the slow water.]
  # fx: set-flag(flag: ines-late, to: true)
  "Babies wait for nobody," she says, and then nothing at all. # speaker: ines
- The mill-house light shows on the bank, small and yellow.
-> END
