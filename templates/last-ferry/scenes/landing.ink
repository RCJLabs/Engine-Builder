# name: Landing
// Which ending the night has: the patrol finds Tomas; or everyone came through; or neither.
EXTERNAL flag_on(flag)
The ferry grinds onto the shingle of the far bank.
{
- not flag_on("tomas-hidden"):
  # fx: set-flag(flag: ending, to: 2)
  The patrol's lantern comes down the bank, and the soldiers don't have to look hard. They take Tomas up the hill without a word.
- flag_on("ines-in-time") and flag_on("marta-stopped"):
  # fx: set-flag(flag: ending, to: 1)
  Up the bank the mill-house window is lit, and somewhere a baby is crying. Tomas slips off into the reeds. Every light ashore is one you brought.
- else:
  # fx: set-flag(flag: ending, to: 3)
  Your passengers go up the bank one by one, and none of them looks back.
}
When you turn round, the stranger's seat is empty. Their coin is still warm in your pocket.
-> END
