# Ice Cream Tent

Serve five customers by building each one's order: a cone or a cup, the scoops
and the toppings.

## How to play

- Each customer shows an order card on the left: a cone or a cup, the scoops
  from bottom to top, and the toppings.
- Click **Cone** or **Cup** to pick the container. You can switch at any time
  before you serve.
- Click a flavor to add a scoop on top, up to 3 scoops. The flavors are
  vanilla, strawberry, chocolate, blueberry and lemon. **Remove top** takes the
  top scoop off.
- Click a topping to add it: sprinkles, cherry, choc chips or whipped cream.
  Each topping goes on once per order. Sprinkles scatter and settle on the top
  scoop, the cherry drops and bounces once, chips fall in a short burst, and
  whipped cream swirls up on top.
- Click **Serve** to hand the order over. The next customer arrives straight
  away. The round ends after the fifth customer.
- Click again on the game over screen to play another round.

## Scoring

Each served order scores:

- 10 points for the right cone or cup.
- 10 points for each scoop with the right flavor in the right position.
- 5 points for each right topping, and minus 5 for each topping that was not
  ordered. These points never go below 0.
- 20 bonus points for a perfect order: the right container, exactly the right
  scoops in order, and exactly the right toppings.
- A speed bonus of up to 20 points, falling evenly to 0 over 20 seconds from
  when the customer arrived, rounded to the nearest point.

Your final score is the total of the five orders, and it is saved to the
carnival's score board when the round ends.

## Files

- `game.ts`: the game logic (`createOrder`, `createState`, `chooseContainer`,
  `addScoop`, `removeTopScoop`, `addTopping`, `step`, `scoreOrder`,
  `speedBonus`, `serve`, `recordIfOver`, `buttonAt`, `press`) and the
  `iceCreamTent` entry, the default export the midway finds.
- `game.test.ts`: tests for the game logic.
