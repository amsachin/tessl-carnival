# Hook a Duck

Rubber ducks float round a stream. Drop your hook on one as it passes to catch it.

## How to play

- Eight rubber ducks float round an oval stream in a loop.
- Move the pointer to line up the rod, then click where you want the hook to
  land. The hook takes a moment to go down, so aim a little ahead of a duck.
- If the hook lands within reach of a duck, it catches it and brings it up. A
  caught duck leaves the stream for the rest of the round.
- You get 5 casts. The round ends when the last cast comes back up.
- Click again on the game over screen to play another round.

## Scoring

Each duck has a number on its base, and catching it scores that number. The
ducks are numbered 1, 1, 2, 2, 3, 5, 5 and 10, shuffled each round, so you
can't tell which is which until you catch it. A cast that misses scores nothing.

Your final score is saved to the carnival's score board when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `step`, `cast`, `catchAt`,
  `duckPosition`, `hookY`) and the `hookADuck` entry, the default export the
  midway finds.
- `game.test.ts`: tests for the game logic.
