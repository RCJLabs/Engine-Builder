# name: A letter from home
// The second dusk: a letter about your brother's cough. Rings can buy the healer.
EXTERNAL flag_on(flag)
EXTERNAL economy_amount(resource)
A raven lands on the gatepost with a letter in your mother's hand.
"Your brother has the cough again. The healer in the next valley wants five rings to come out." # speaker: mother
{ flag_on("asked-hild"):
  You think of Hild, and of who does the choosing.
}
* [Send the five rings. # cost: rings 5]
  # fx: set-flag(flag: sent-healer, to: true)
  You wrap the rings in the letter, and the raven weighs it with one claw before it goes.
* [Write that you'll come yourself when the season turns.]
  # fx: set-flag(flag: promised, to: true)
  ** ["Tell him to rest."]
     You write it twice, the second time larger.
  ** ["Tell him I'm proud of him."]
     # fx: add-to-flag(flag: truth, by: 1)
     You have never written that before, and your hand isn't sure of it.
  -- The raven takes the letter and doesn't look back.
* {economy_amount("rings") < 5} [Write that you have nothing to send.]
  It is true, and it is the hardest line you write all day.
- The lamp gutters. Tomorrow there will be more names.
-> END
