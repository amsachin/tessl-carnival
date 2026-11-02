import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const CASTS_PER_ROUND = 5;
/** The numbers on the ducks' bases, one per duck, shuffled each round. */
export const DUCK_VALUES = [1, 1, 2, 2, 3, 5, 5, 10] as const;
/** How far, in radians per second, the ducks float round the loop. */
export const DUCK_SPEED = 0.5;
/** Seconds the hook takes to go down, and again to come back up. */
export const CAST_SECONDS = 0.45;
/** How close the hook has to land to a duck to catch it. */
export const CATCH_RADIUS = 30;
/** The stream: an oval loop the ducks follow. */
export const STREAM = { x: WIDTH / 2, y: 290, rx: 300, ry: 140 } as const;
/** Where the hook hangs while it waits for a cast. */
export const HOOK_REST_Y = 60;

export interface Duck {
  /** Where the duck is on the loop, in radians. */
  angle: number;
  value: number;
  caught: boolean;
}

export interface Hook {
  x: number;
  /** Where the hook is heading when it goes down. */
  targetY: number;
  phase: 'ready' | 'lowering' | 'raising';
  /** Seconds into the current lowering or raising. */
  t: number;
  /** The duck on the hook, while it comes back up. */
  duck?: Duck;
}

export interface Reveal {
  x: number;
  y: number;
  value: number;
  age: number;
}

export interface HookADuckState {
  ducks: Duck[];
  hook: Hook;
  reveals: Reveal[];
  castsLeft: number;
  score: number;
  phase: 'playing' | 'over';
}

export function createState(random: () => number = Math.random): HookADuckState {
  const values: number[] = [...DUCK_VALUES];
  // Shuffle so nobody can learn which duck is worth the most.
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(random() * (i + 1)), i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return {
    ducks: values.map((value, i) => ({
      angle: (i / values.length) * Math.PI * 2,
      value,
      caught: false,
    })),
    hook: { x: WIDTH / 2, targetY: HOOK_REST_Y, phase: 'ready', t: 0 },
    reveals: [],
    castsLeft: CASTS_PER_ROUND,
    score: 0,
    phase: 'playing',
  };
}

export function duckPosition(duck: Duck): { x: number; y: number } {
  return {
    x: STREAM.x + Math.cos(duck.angle) * STREAM.rx,
    y: STREAM.y + Math.sin(duck.angle) * STREAM.ry,
  };
}

/** Where the hook is now, part way down or up. */
export function hookY(hook: Hook): number {
  const f = Math.min(hook.t / CAST_SECONDS, 1);
  if (hook.phase === 'lowering') return HOOK_REST_Y + (hook.targetY - HOOK_REST_Y) * f;
  if (hook.phase === 'raising') return hook.targetY + (HOOK_REST_Y - hook.targetY) * f;
  return HOOK_REST_Y;
}

/** Casts the hook down to a point. Returns false if it can't cast right now. */
export function cast(state: HookADuckState, x: number, y: number): boolean {
  if (state.phase !== 'playing' || state.hook.phase !== 'ready' || state.castsLeft <= 0) {
    return false;
  }
  state.castsLeft -= 1;
  state.hook = { x, targetY: Math.max(y, HOOK_REST_Y), phase: 'lowering', t: 0 };
  return true;
}

/** Hooks the nearest free duck within reach of the point, if there is one. */
export function catchAt(state: HookADuckState, x: number, y: number): Duck | undefined {
  let best: Duck | undefined;
  let bestDistance = CATCH_RADIUS;
  for (const duck of state.ducks) {
    if (duck.caught) continue;
    const pos = duckPosition(duck);
    const distance = Math.hypot(x - pos.x, y - pos.y);
    if (distance <= bestDistance) {
      best = duck;
      bestDistance = distance;
    }
  }
  if (best) {
    best.caught = true;
    state.score += best.value;
    state.reveals.push({ x, y, value: best.value, age: 0 });
  }
  return best;
}

function moveDucks(state: HookADuckState, dt: number): void {
  for (const duck of state.ducks) {
    if (!duck.caught) duck.angle = (duck.angle + DUCK_SPEED * dt) % (Math.PI * 2);
  }
}

/**
 * Advances the game by `dt` seconds. The frame is split where the hook
 * reaches the bottom or the top, so a catch uses where the ducks are at that
 * moment and the rest of the frame carries on into the next part of the cast.
 */
export function step(state: HookADuckState, dt: number): void {
  for (const reveal of state.reveals) reveal.age += dt;
  state.reveals = state.reveals.filter((r) => r.age < 1);

  let left = dt;
  while (state.phase === 'playing' && state.hook.phase !== 'ready') {
    const { hook } = state;
    const toBoundary = CAST_SECONDS - hook.t;
    if (left < toBoundary) {
      moveDucks(state, left);
      hook.t += left;
      return;
    }
    moveDucks(state, toBoundary);
    left -= toBoundary;
    hook.t = 0;

    if (hook.phase === 'lowering') {
      hook.duck = catchAt(state, hook.x, hook.targetY);
      hook.phase = 'raising';
      continue;
    }

    // The hook is back up: the cast is over.
    hook.phase = 'ready';
    hook.duck = undefined;
    if (state.castsLeft === 0) state.phase = 'over';
  }
  moveDucks(state, left);
}

function drawDuck(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const { colors } = theme;
  // Body, head and beak.
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.ellipse(x, y, 22, 14, 0, 0, Math.PI * 2);
  ctx.arc(x + 12, y - 16, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.stripeA;
  ctx.beginPath();
  ctx.moveTo(x + 20, y - 18);
  ctx.lineTo(x + 30, y - 14);
  ctx.lineTo(x + 20, y - 11);
  ctx.fill();
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.arc(x + 14, y - 19, 2, 0, Math.PI * 2);
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D, state: HookADuckState, aimX: number) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Booth awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  // The stream: a ring of water round a wooden island.
  ctx.fillStyle = colors.water;
  ctx.beginPath();
  ctx.ellipse(STREAM.x, STREAM.y, STREAM.rx + 40, STREAM.ry + 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.wood;
  ctx.beginPath();
  ctx.ellipse(STREAM.x, STREAM.y, STREAM.rx - 40, STREAM.ry - 40, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const duck of state.ducks) {
    if (duck.caught) continue;
    const pos = duckPosition(duck);
    drawDuck(ctx, pos.x, pos.y);
  }

  // The rod's line and hook. While ready, it follows the pointer.
  const { hook } = state;
  const x = hook.phase === 'ready' ? aimX : hook.x;
  const y = hookY(hook);
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 40);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y + 6, 6, 0, Math.PI);
  ctx.stroke();
  if (hook.duck) drawDuck(ctx, x, y + 26);

  ctx.textAlign = 'center';
  ctx.font = canvasFont('title', 'bold');
  for (const reveal of state.reveals) {
    ctx.globalAlpha = 1 - reveal.age;
    ctx.fillStyle = colors.text;
    ctx.fillText(`+${reveal.value}`, reveal.x, reveal.y - 40 - reveal.age * 40);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Casts ${state.castsLeft}`, WIDTH - 16, HEIGHT - 20);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Out of casts! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const hookADuck: CarnivalGame = {
  id: 'hook-a-duck',
  name: 'Hook a Duck',
  description: 'Drop your hook on a passing rubber duck. The number on its base is your score.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    let scoreRecorded = false;
    let aimX = WIDTH / 2;

    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onMove = (event: PointerEvent) => {
      aimX = toCanvas(event).x;
    };
    const onDown = (event: PointerEvent) => {
      if (state.phase === 'over') {
        state = createState();
        scoreRecorded = false;
        return;
      }
      const point = toCanvas(event);
      aimX = point.x;
      cast(state, point.x, point.y);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't skip a cast.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      if (state.phase === 'over' && !scoreRecorded) {
        recordScore(hookADuck.id, state.score);
        scoreRecorded = true;
      }
      draw(ctx, state, aimX);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
    };
  },
};

export default hookADuck;
