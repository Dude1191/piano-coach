# Piano Coach

Oliver's piano coach. It listens to the real piano through the phone's mic and teaches one small step at a time:
a one-line why, a demo from your seat, your turn, one fix, three clean in a row, then a cold check the next day.

Open it on an iPhone at **https://dude1191.github.io/piano-coach/**, then in Safari tap Share → Add to Home Screen.

## What's in the test version (0.1)

- **Hearing test**: 4 checks (every note, catching a wrong note, counting out loud, headphones). Results copy out for Claude.
- **Lesson 1: Your map**: the black-key map, find D, find C, right hand home, left hand home, moving to G, both hands together.
- **Cold check**: the next day, each locked piece once, no warm-up.
- **Free play**: shows the notes it hears.

## How it hears

`js/ears.js` finds each key strike (spectral flux), works out its pitch (YIN candidates checked against the
harmonics of the newly struck sound), and can check whether an expected note was freshly struck at a moment.
`js/grade.js` lines the take up against the expected notes and is slow to accuse: before calling a note wrong it
checks the audio for the right one, and before calling one skipped it searches the gap for it.

Everything runs on the phone. Progress is saved on the phone only (localStorage). Nothing is uploaded.

Built with Claude in the Piano chat.
