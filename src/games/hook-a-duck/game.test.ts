import { describe, expect, it } from 'vitest';
import {
  CASTS_PER_ROUND,
  CAST_SECONDS,
  CATCH_RADIUS,
  DUCK_SPEED,
  DUCK_VALUES,
  HOOK_REST_Y,
  cast,
  catchAt,
  createState,
  duckPosition,
  hookY,
  step,
  type HookADuckState,
} from './game';

/** Lowers the hook and brings it back up. */
function finishCast(state: HookADuckState) {
  step(state, CAST_SECONDS);
  step(state, CAST_SECONDS);
}

describe('hook-a-duck', () => {
  it('starts with every duck in the stream, no score and every cast left', () => {
    const state = createState();
    expect(state.ducks).toHaveLength(DUCK_VALUES.length);
    expect(state.ducks.every((d) => !d.caught)).toBe(true);
    expect(state.ducks.map((d) => d.value).sort((a, b) => a - b)).toEqual([...DUCK_VALUES]);
    expect(state.score).toBe(0);
    expect(state.castsLeft).toBe(CASTS_PER_ROUND);
    expect(state.hook.phase).toBe('ready');
    expect(state.phase).toBe('playing');
  });

  it('floats the ducks round the loop', () => {
    const state = createState();
    const before = state.ducks[0].angle;
    step(state, 1);
    expect(state.ducks[0].angle).toBeCloseTo(before + DUCK_SPEED);
  });

  it('scores the number on a duck the hook lands on', () => {
    const state = createState();
    const duck = state.ducks[0];
    const pos = duckPosition(duck);
    expect(catchAt(state, pos.x + CATCH_RADIUS - 1, pos.y)).toBe(duck);
    expect(duck.caught).toBe(true);
    expect(state.score).toBe(duck.value);
  });

  it('misses when no duck is within reach', () => {
    const state = createState();
    expect(catchAt(state, 400, 290)).toBeUndefined();
    expect(state.score).toBe(0);
  });

  it('catches a duck only once', () => {
    const state = createState();
    const pos = duckPosition(state.ducks[0]);
    catchAt(state, pos.x, pos.y);
    const score = state.score;
    expect(catchAt(state, pos.x, pos.y)).toBeUndefined();
    expect(state.score).toBe(score);
  });

  it('lowers the hook, checks for a duck at the bottom, then raises it', () => {
    const state = createState();
    // Aim where the first duck will be once the hook reaches the water.
    const later = { ...state.ducks[0], angle: state.ducks[0].angle + DUCK_SPEED * CAST_SECONDS };
    const target = duckPosition(later);
    expect(cast(state, target.x, target.y)).toBe(true);
    expect(state.castsLeft).toBe(CASTS_PER_ROUND - 1);

    step(state, CAST_SECONDS / 2);
    expect(state.hook.phase).toBe('lowering');
    expect(hookY(state.hook)).toBeCloseTo((HOOK_REST_Y + target.y) / 2);
    expect(state.score).toBe(0);

    step(state, CAST_SECONDS / 2);
    expect(state.hook.phase).toBe('raising');
    expect(state.hook.duck).toBe(state.ducks[0]);
    expect(state.score).toBe(state.ducks[0].value);

    step(state, CAST_SECONDS);
    expect(state.hook.phase).toBe('ready');
    expect(state.hook.duck).toBeUndefined();
  });

  it('catches the same duck however the frames fall across the bottom of the cast', () => {
    for (const [frames, dt] of [
      [16, 0.03],
      [12, 0.04],
    ] as const) {
      const state = createState();
      // Aim just inside reach of where the third duck will be when the hook lands.
      const later = { ...state.ducks[2], angle: state.ducks[2].angle + DUCK_SPEED * CAST_SECONDS };
      const target = duckPosition(later);
      cast(state, target.x + CATCH_RADIUS - 1, target.y);
      for (let i = 0; i < frames; i++) step(state, dt);
      expect(state.ducks[2].caught).toBe(true);
      expect(state.hook.phase).toBe('raising');
      // The time past the bottom carries on into raising the hook.
      expect(state.hook.t).toBeCloseTo(frames * dt - CAST_SECONDS);
    }
  });

  it('carries a long frame through the whole cast', () => {
    const state = createState();
    cast(state, 400, 290);
    step(state, CAST_SECONDS * 2 + 0.1);
    expect(state.hook.phase).toBe('ready');
    expect(state.hook.t).toBe(0);
  });

  it('casts only once the hook is back up', () => {
    const state = createState();
    cast(state, 100, 300);
    expect(cast(state, 200, 300)).toBe(false);
    expect(state.castsLeft).toBe(CASTS_PER_ROUND - 1);
  });

  it('ends the round when the last cast comes back up', () => {
    const state = createState();
    for (let i = 0; i < CASTS_PER_ROUND; i++) {
      expect(state.phase).toBe('playing');
      expect(cast(state, 400, 290)).toBe(true);
      finishCast(state);
    }
    expect(state.castsLeft).toBe(0);
    expect(state.phase).toBe('over');
    expect(cast(state, 400, 290)).toBe(false);
  });
});
