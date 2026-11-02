import { describe, expect, it } from 'vitest';
import {
  POINTS_PER_WHACK,
  ROUND_SECONDS,
  SPAWN_INTERVAL,
  UP_TIME,
  createState,
  popUp,
  spawnInterval,
  step,
  timeLeft,
  upTime,
  whack,
} from './game';

const first = () => 0;

describe('whack-a-mole', () => {
  it('starts with every mole down, no score and the full clock', () => {
    const state = createState();
    expect(state.holes).toHaveLength(9);
    expect(state.holes.every((h) => h.up === 0)).toBe(true);
    expect(state.score).toBe(0);
    expect(timeLeft(state)).toBe(ROUND_SECONDS);
    expect(state.phase).toBe('playing');
  });

  it('pops a mole up after the first interval', () => {
    const state = createState();
    step(state, SPAWN_INTERVAL.start - 0.01, first);
    expect(state.holes.filter((h) => h.up > 0)).toHaveLength(0);
    step(state, 0.02, first);
    expect(state.holes.filter((h) => h.up > 0)).toHaveLength(1);
  });

  it('drops a mole back down when its time is up', () => {
    const state = createState();
    state.nextPop = 100;
    popUp(state, first);
    step(state, UP_TIME.start + 0.01);
    expect(state.holes[0].up).toBe(0);
  });

  it('scores for whacking a mole that is up, and puts it down', () => {
    const state = createState();
    popUp(state, first);
    const hole = state.holes[0];
    expect(whack(state, hole.x, hole.y)).toBe(true);
    expect(state.score).toBe(POINTS_PER_WHACK);
    expect(hole.up).toBe(0);
  });

  it('scores nothing for whacking an empty hole or a miss', () => {
    const state = createState();
    const hole = state.holes[0];
    expect(whack(state, hole.x, hole.y)).toBe(false);
    popUp(state, first);
    expect(whack(state, hole.x + 200, hole.y)).toBe(false);
    expect(state.score).toBe(0);
  });

  it('only pops moles from empty holes', () => {
    const state = createState();
    for (let i = 0; i < state.holes.length; i++) expect(popUp(state, first)).toBe(true);
    expect(popUp(state, first)).toBe(false);
  });

  it('pops moles up faster and for less time as the round goes on', () => {
    const state = createState();
    expect(spawnInterval(state)).toBeCloseTo(SPAWN_INTERVAL.start);
    expect(upTime(state)).toBeCloseTo(UP_TIME.start);
    state.elapsed = ROUND_SECONDS / 2;
    expect(spawnInterval(state)).toBeLessThan(SPAWN_INTERVAL.start);
    expect(upTime(state)).toBeLessThan(UP_TIME.start);
    state.elapsed = ROUND_SECONDS;
    expect(spawnInterval(state)).toBeCloseTo(SPAWN_INTERVAL.end);
    expect(upTime(state)).toBeCloseTo(UP_TIME.end);
  });

  it('ends the round when the clock runs out, and ignores whacks after', () => {
    const state = createState();
    for (let t = 0; t < ROUND_SECONDS + 1; t += 0.05) step(state, 0.05, first);
    expect(state.phase).toBe('over');
    expect(timeLeft(state)).toBe(0);
    expect(state.holes.every((h) => h.up === 0)).toBe(true);
    state.holes[0].up = 1;
    expect(whack(state, state.holes[0].x, state.holes[0].y)).toBe(false);
    expect(state.score).toBe(0);
  });
});
