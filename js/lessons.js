/* What Piano Coach teaches. Every chunk: a one-line why, a demo from your seat, your turn,
   one fix at a time, three clean in a row, then a cold check the next day. */

const RH = [60, 62, 64, 65, 67, 65, 64, 62, 60];
const LH = [48, 50, 52, 53, 55, 53, 52, 50, 48];
const RHG = [67, 69, 71, 72, 74, 72, 71, 69, 67];
const F_R = [1, 2, 3, 4, 5, 4, 3, 2, 1];
const F_L = [5, 4, 3, 2, 1, 2, 3, 4, 5];

export const LESSON1 = {
  id: 'l1',
  title: 'Lesson 1: Your map',
  sub: 'The black keys, and both hands’ home spots',
  card: {
    title: 'The black keys are your map',
    lines: [
      'Black keys come in groups of 2 and 3, all the way up the piano.',
      'Every white key has a fixed spot next to them, so you never have to count keys.',
      'C is just left of the 2. D is right between them.'
    ],
    kb: [47, 77],
    marks: [[48, 'C', 'mapc'], [60, 'C', 'mapc'], [72, 'C', 'mapc'], [50, 'D', 'mapd'], [62, 'D', 'mapd'], [74, 'D', 'mapd']]
  },
  chunks: [
    {
      id: 'd', title: 'Find D', kind: 'hunt', p: 2, n: 3, kb: [45, 79], bpm: 50,
      why: 'D sits right between the two black keys, so you can find it anywhere on the piano without counting.',
      task: 'Play 3 different D’s, low to high.',
      demo: [[50], [62], [74]], labels: ['D', 'D', 'D'], cls: 'mapd'
    },
    {
      id: 'c', title: 'Find C', kind: 'hunt', p: 0, n: 3, kb: [45, 79], bpm: 50,
      why: 'C is just left of the two black keys, and the C closest to the middle, middle C, is home base for both hands.',
      task: 'Play 3 different C’s, low to high.',
      demo: [[48], [60], [72]], labels: ['C', 'C', 'C'], cls: 'mapc'
    },
    {
      id: 'rh', title: 'Right hand home', kind: 'seq', hand: 'R', kb: [55, 74], bpm: 80,
      why: 'Thumb on middle C, one finger per key. Once each finger owns a key, your eyes can stop hunting and your ears take over.',
      task: 'Right thumb on middle C. Play up to G and back down, one finger per key.',
      E: RH, fingers: F_R
    },
    {
      id: 'lh', title: 'Left hand home', kind: 'seq', hand: 'L', kb: [43, 62], bpm: 80,
      why: 'Your left hand plays the low part in both your songs, and its fingers count the other way: the pinky is 5.',
      task: 'Left pinky on the C below middle C. Play up to G and back down.',
      E: LH, fingers: F_L
    },
    {
      id: 'g', title: 'Move it to G', kind: 'seq', hand: 'R', kb: [60, 79], bpm: 80,
      why: 'Your songs make your hand jump to new spots. Moving the whole hand as one block, same shape, is how you land clean.',
      task: 'Move your right thumb to the G above middle C. Same shape: up to D and back.',
      E: RHG, fingers: F_R
    },
    {
      id: 'both', title: 'Both hands, same notes', kind: 'seq', hand: 'B', kb: [45, 72], bpm: 72,
      why: 'Both hands doing the same thing is the first step to both hands doing different things, and that’s exactly where your hands get stuck now.',
      task: 'Both hands at home: left pinky on the low C, right thumb on middle C. Play up and back together.',
      E: RH, fingers: F_R, left: LH, leftFingers: F_L
    }
  ]
};

export const HEARING = [
  {
    id: 'h1', title: 'Every note',
    why: 'First I have to prove I can hear every note you play.',
    task: 'Right thumb on middle C. Play C D E F G and back down to C, slowly: about one note a second.',
    E: RH, fingers: F_R
  },
  {
    id: 'h2', title: 'Catch a mistake', wantMiss: true,
    why: 'An app that says great job no matter what is useless. Let’s see if I catch you.',
    task: 'Same thing, but hit one wrong key on purpose, somewhere in the middle.',
    E: RH, fingers: F_R
  },
  {
    id: 'h3', title: 'Counting out loud',
    why: 'Counting out loud is how you’ll lock in the waltz beat, so I have to hear the piano through your voice.',
    task: 'Same thing again, and count out loud the whole time: “1, 2, 3, 1, 2, 3…”',
    E: RH, fingers: F_R
  },
  {
    id: 'h4', title: 'Headphones', duet: true,
    why: 'Later I’ll play your other hand while you play yours. That only works if your headphones sound clean and on time.',
    task: 'Put on headphones or one earbud. I’ll play a low C on every beat. Play the same C D E F G and back, one note per beat.',
    E: RH, fingers: F_R
  }
];
