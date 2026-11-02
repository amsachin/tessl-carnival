import { describe, expect, it, vi } from 'vitest';
import {
  BUTTONS,
  CUSTOMERS_PER_ROUND,
  MAX_PARTICLES,
  MAX_PHYSICS_STEP,
  MAX_SCOOPS,
  TOPPINGS,
  addScoop,
  addTopping,
  buttonAt,
  chooseContainer,
  createOrder,
  createState,
  press,
  recordIfOver,
  removeTopScoop,
  scoreOrder,
  serve,
  speedBonus,
  step,
  surfaceY,
  tap,
  type Order,
} from './game';

const fixed = (value: number) => () => value;

/** Steps the game in small frames, as the animation loop does. */
function run(state: ReturnType<typeof createState>, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) step(state, 1 / 60);
}

const order: Order = { container: 'cone', scoops: ['vanilla', 'chocolate'], toppings: ['cherry'] };

describe('ice cream tent', () => {
  it('starts on the first customer with an empty build', () => {
    const state = createState(fixed(0));
    expect(state.customer).toBe(1);
    expect(state.build).toEqual({ container: null, scoops: [], toppings: [] });
    expect(state.score).toBe(0);
    expect(state.phase).toBe('playing');
  });

  it('creates orders from the random source', () => {
    expect(createOrder(fixed(0))).toEqual({
      container: 'cone',
      scoops: ['vanilla'],
      toppings: [...TOPPINGS],
    });
    expect(createOrder(fixed(0.99))).toEqual({
      container: 'cup',
      scoops: ['lemon', 'lemon', 'lemon'],
      toppings: [],
    });
  });

  it('switches between a cone and a cup', () => {
    const state = createState();
    chooseContainer(state, 'cone');
    expect(state.build.container).toBe('cone');
    chooseContainer(state, 'cup');
    expect(state.build.container).toBe('cup');
  });

  it('stacks up to 3 scoops and no more', () => {
    const state = createState();
    expect(addScoop(state, 'vanilla')).toBe(true);
    expect(addScoop(state, 'lemon')).toBe(true);
    expect(addScoop(state, 'blueberry')).toBe(true);
    expect(addScoop(state, 'chocolate')).toBe(false);
    expect(state.build.scoops).toEqual(['vanilla', 'lemon', 'blueberry']);
    expect(state.build.scoops).toHaveLength(MAX_SCOOPS);
  });

  it('removes only the top scoop', () => {
    const state = createState();
    expect(removeTopScoop(state)).toBe(false);
    addScoop(state, 'vanilla');
    addScoop(state, 'strawberry');
    expect(removeTopScoop(state)).toBe(true);
    expect(state.build.scoops).toEqual(['vanilla']);
  });

  it('adds each topping once per order', () => {
    const state = createState();
    expect(addTopping(state, 'cherry', fixed(0.5))).toBe(true);
    expect(addTopping(state, 'cherry', fixed(0.5))).toBe(false);
    expect(state.build.toppings).toEqual(['cherry']);
  });

  it('drops every topping onto the top scoop, where it stops', () => {
    const state = createState();
    addScoop(state, 'vanilla');
    addScoop(state, 'chocolate');
    for (const topping of TOPPINGS) addTopping(state, topping, Math.random);
    expect(state.particles.length).toBeGreaterThan(0);
    for (const topping of TOPPINGS) {
      expect(state.particles.some((p) => p.topping === topping)).toBe(true);
    }
    expect(state.particles.every((p) => !p.landed)).toBe(true);

    run(state, 3);
    expect(state.particles.every((p) => p.landed)).toBe(true);
    for (const p of state.particles) expect(p.y).toBe(p.restY);
    const settled = state.particles.map((p) => ({ x: p.x, y: p.y }));
    run(state, 1);
    expect(state.particles.map((p) => ({ x: p.x, y: p.y }))).toEqual(settled);
    // Everything settles within a scoop's reach of the top of the ice cream.
    const top = surfaceY(state.build);
    for (const p of state.particles) expect(Math.abs(p.y - top)).toBeLessThan(40);
  });

  it('bounces the cherry once before it lands', () => {
    const state = createState();
    addScoop(state, 'vanilla');
    addTopping(state, 'cherry', Math.random);
    const cherry = state.particles[0];
    let upward = 0;
    let wasRising = false;
    for (let i = 0; i < 180; i++) {
      step(state, 1 / 60);
      const rising = cherry.vy < 0;
      if (rising && !wasRising) upward += 1;
      wasRising = rising;
    }
    expect(upward).toBe(1);
    expect(cherry.landed).toBe(true);
  });

  it('keeps the toppings on top when a scoop is added', () => {
    const state = createState();
    addScoop(state, 'vanilla');
    addTopping(state, 'cherry', Math.random);
    run(state, 3);
    addScoop(state, 'lemon');
    expect(state.particles[0].y).toBe(state.particles[0].restY);
    expect(state.particles[0].restY).toBeLessThan(surfaceY(state.build));
  });

  it('caps the live topping particles', () => {
    const state = createState();
    for (const topping of TOPPINGS) addTopping(state, topping, Math.random);
    expect(state.particles.length).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it('scores a perfect order with the bonus', () => {
    const build = {
      container: 'cone' as const,
      scoops: order.scoops,
      toppings: ['cherry' as const],
    };
    // 10 container + 20 scoops + 5 topping + 20 perfect + 20 speed.
    expect(scoreOrder(order, build, 0)).toBe(75);
  });

  it('scores only the scoops in the right flavor and position', () => {
    const build = {
      container: 'cone' as const,
      scoops: ['vanilla' as const, 'lemon' as const],
      toppings: ['cherry' as const],
    };
    expect(scoreOrder(order, build, 20)).toBe(25);
    const swapped = { ...build, scoops: ['chocolate' as const, 'vanilla' as const] };
    expect(scoreOrder(order, swapped, 20)).toBe(15);
  });

  it('takes 5 points for a topping that was not ordered, and never goes below 0', () => {
    const build = {
      container: 'cone' as const,
      scoops: order.scoops,
      toppings: ['cherry' as const, 'sprinkles' as const],
    };
    expect(scoreOrder(order, build, 20)).toBe(30);
    const bad = {
      container: 'cup' as const,
      scoops: [],
      toppings: ['sprinkles' as const, 'chips' as const, 'cream' as const],
    };
    expect(scoreOrder(order, bad, 20)).toBe(0);
    expect(scoreOrder(order, bad, 0)).toBe(20);
  });

  it('gives no perfect bonus for an extra scoop', () => {
    const build = {
      container: 'cone' as const,
      scoops: [...order.scoops, 'lemon' as const],
      toppings: ['cherry' as const],
    };
    expect(scoreOrder(order, build, 20)).toBe(35);
  });

  it('drops the speed bonus from 20 to 0 over 20 seconds', () => {
    expect(speedBonus(0)).toBe(20);
    expect(speedBonus(10)).toBe(10);
    expect(speedBonus(20)).toBe(0);
    expect(speedBonus(60)).toBe(0);
  });

  it('times each customer from when they arrive', () => {
    const state = createState(fixed(0));
    step(state, 5);
    expect(state.elapsed).toBe(5);
    serve(state, fixed(0));
    expect(state.elapsed).toBe(0);
  });

  it('counts a slow frame in full on the clock, but caps the physics step', () => {
    const state = createState(fixed(0));
    addTopping(state, 'cherry', fixed(0));
    const cherry = state.particles[0];
    const startY = cherry.y;
    step(state, 0.5);
    expect(state.elapsed).toBe(0.5);

    const capped = createState(fixed(0));
    addTopping(capped, 'cherry', fixed(0));
    step(capped, MAX_PHYSICS_STEP);
    expect(cherry.y).toBe(capped.particles[0].y);
    expect(cherry.y).not.toBe(startY);
  });

  it('gives no speed bonus after 20 seconds of slow frames', () => {
    const state = createState(fixed(0));
    for (let i = 0; i < 200; i++) step(state, 0.1);
    expect(speedBonus(state.elapsed)).toBe(0);
  });

  it('floors container, scoop and topping points together at 0', () => {
    const plain: Order = { container: 'cone', scoops: ['vanilla'], toppings: [] };
    const build = {
      container: 'cone' as const,
      scoops: ['vanilla' as const],
      toppings: ['sprinkles' as const],
    };
    expect(scoreOrder(plain, build, 20)).toBe(15);
  });

  it('serves the next customer straight away with a fresh build', () => {
    const state = createState(fixed(0));
    chooseContainer(state, 'cone');
    addScoop(state, 'vanilla');
    for (const topping of TOPPINGS) addTopping(state, topping, Math.random);
    expect(serve(state, fixed(0))).toBe(80);
    expect(state.score).toBe(80);
    expect(state.customer).toBe(2);
    expect(state.build).toEqual({ container: null, scoops: [], toppings: [] });
    expect(state.particles).toEqual([]);
  });

  it('ends the round after the fifth customer and records the score once', () => {
    const state = createState(fixed(0));
    const record = vi.fn();
    for (let i = 0; i < CUSTOMERS_PER_ROUND - 1; i++) serve(state, fixed(0));
    expect(state.phase).toBe('playing');
    expect(recordIfOver(state, record)).toBe(false);

    serve(state, fixed(0));
    expect(state.phase).toBe('over');
    expect(serve(state, fixed(0))).toBeNull();
    expect(addScoop(state, 'vanilla')).toBe(false);

    expect(recordIfOver(state, record)).toBe(true);
    expect(recordIfOver(state, record)).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('ice-cream-tent', state.score);
  });

  it('records a finished round on the click that ends it', () => {
    const serveButton = BUTTONS.find((b) => b.action.kind === 'serve')!;
    const record = vi.fn();
    let state = createState(fixed(0));
    for (let i = 0; i < CUSTOMERS_PER_ROUND; i++) {
      state = tap(state, serveButton.x + 1, serveButton.y + 1, record, fixed(0));
    }
    expect(state.phase).toBe('over');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('ice-cream-tent', state.score);
  });

  it('records a finished round before a restart replaces it, and only once', () => {
    const record = vi.fn();
    const state = createState(fixed(0));
    for (let i = 0; i < CUSTOMERS_PER_ROUND; i++) serve(state, fixed(0));
    const next = tap(state, 5, 5, record, fixed(0));
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('ice-cream-tent', state.score);
    expect(next).not.toBe(state);
    expect(next.phase).toBe('playing');
    expect(recordIfOver(state, record)).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('finds the button under the pointer, and presses it', () => {
    const cup = BUTTONS.find((b) => b.label === 'Cup')!;
    const hit = buttonAt(cup.x + 5, cup.y + 5);
    expect(hit).toBe(cup);
    expect(buttonAt(5, 5)).toBeUndefined();

    const state = createState();
    expect(press(state, hit!.action)).toBe(true);
    expect(state.build.container).toBe('cup');
  });

  it('has a button for every action, and none overlap', () => {
    const kinds = new Set(BUTTONS.map((b) => b.action.kind));
    expect([...kinds].sort()).toEqual(['container', 'remove', 'scoop', 'serve', 'topping']);
    for (const b of BUTTONS) {
      expect(buttonAt(b.x + b.w / 2, b.y + b.h / 2)).toBe(b);
    }
  });
});
