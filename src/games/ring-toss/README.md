# Ring Toss

Land rings on the necks of the bottles at the back of the booth.

## How to play

- Move the mouse to aim, and click to throw a ring. The cross shows where the
  ring will land.
- Your hand sways from side to side, so the cross drifts: time your throw.
- You have 10 rings. The round ends when you run out and the last ring has landed.
- Click again on the game over screen to play another round.

## Scoring

A ring scores when it lands on a bottle's neck. There are three rows of five
bottles. Bottles further back score more, and their necks are harder to hit:

| Row    | Points | Lands within |
| ------ | ------ | ------------ |
| Back   | 30     | 11 px        |
| Middle | 20     | 14 px        |
| Front  | 10     | 17 px        |

Each bottle takes one ring. A ring that lands on a bottle already ringed scores
nothing.

Your final score is saved to the carnival's score board when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `toss`, `step`, `bottleAt`,
  `swayOffset`) and the `ringToss` entry, the default export the midway finds.
- `game.test.ts`: tests for the game logic.
