import { describe, expect, it } from 'vitest';
import {
  FLIGHT_TIME,
  HAND,
  RINGS_PER_ROUND,
  SWAY,
  bottleAt,
  createState,
  step,
  swayOffset,
  toss,
  type RingTossState,
} from './game';

/** Throws a ring that lands exactly at (x, y), whatever the sway. */
function tossAt(state: RingTossState, x: number, y: number) {
  toss(state, x - swayOffset(state.time), y);
}

describe('ring toss', () => {
  it('starts with a full set of rings, no score and no ringed bottles', () => {
    const state = createState();
    expect(state.ringsLeft).toBe(RINGS_PER_ROUND);
    expect(state.score).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.bottles).toHaveLength(15);
    expect(state.bottles.every((b) => !b.ringed)).toBe(true);
  });

  it('uses one ring per toss', () => {
    const state = createState();
    expect(toss(state, 400, 200)).toBe(true);
    expect(state.ringsLeft).toBe(RINGS_PER_ROUND - 1);
    expect(state.rings).toHaveLength(1);
  });

  it('cannot toss once the rings run out', () => {
    const state = createState();
    state.ringsLeft = 0;
    expect(toss(state, 400, 200)).toBe(false);
    expect(state.rings).toHaveLength(0);
  });

  it('never lands a ring behind the hand', () => {
    const state = createState();
    toss(state, 400, HAND.y + 100);
    expect(state.rings[0].toY).toBeLessThan(HAND.y);
  });

  it('sways the landing point sideways, never more than the sway', () => {
    expect(swayOffset(0)).toBe(0);
    for (let t = 0; t < 5; t += 0.1) {
      expect(Math.abs(swayOffset(t))).toBeLessThanOrEqual(SWAY);
    }
    const state = createState();
    state.time = 0.5;
    toss(state, 400, 200);
    expect(state.rings[0].toX).toBeCloseTo(400 + swayOffset(0.5));
  });

  it('scores nothing while the ring is still in the air', () => {
    const state = createState();
    const bottle = state.bottles[0];
    tossAt(state, bottle.x, bottle.y);
    step(state, FLIGHT_TIME / 2);
    expect(state.score).toBe(0);
    expect(state.rings).toHaveLength(1);
  });

  it('scores a ring that lands on a bottle neck', () => {
    const state = createState();
    const bottle = state.bottles[0];
    tossAt(state, bottle.x + bottle.neck - 1, bottle.y);
    step(state, FLIGHT_TIME);
    expect(state.score).toBe(bottle.points);
    expect(bottle.ringed).toBe(true);
    expect(state.rings).toHaveLength(0);
  });

  it('scores nothing for a ring that misses every neck', () => {
    const state = createState();
    tossAt(state, 5, 450);
    step(state, FLIGHT_TIME);
    expect(state.score).toBe(0);
    expect(state.misses).toHaveLength(1);
  });

  it('scores a bottle only once', () => {
    const state = createState();
    const bottle = state.bottles[0];
    tossAt(state, bottle.x, bottle.y);
    step(state, FLIGHT_TIME);
    tossAt(state, bottle.x, bottle.y);
    step(state, FLIGHT_TIME);
    expect(state.score).toBe(bottle.points);
  });

  it('scores bottles further back higher', () => {
    const state = createState();
    const back = state.bottles.reduce((a, b) => (b.y < a.y ? b : a));
    const front = state.bottles.reduce((a, b) => (b.y > a.y ? b : a));
    expect(back.points).toBeGreaterThan(front.points);
    expect(bottleAt(state, back.x, back.y)).toBe(back);
    expect(bottleAt(state, front.x, front.y + front.neck + 1)).toBeUndefined();
  });

  it('ends the round when the rings run out and the last ring has landed', () => {
    const state = createState();
    state.ringsLeft = 1;
    toss(state, 400, 200);
    step(state, FLIGHT_TIME / 2);
    expect(state.phase).toBe('playing');
    step(state, FLIGHT_TIME);
    expect(state.phase).toBe('over');
  });
});
