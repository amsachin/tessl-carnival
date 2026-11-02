import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const ROUND_SECONDS = 30;
export const POINTS_PER_WHACK = 10;
/** Seconds between pop-ups at the start and at the end of a round. */
export const SPAWN_INTERVAL = { start: 1.1, end: 0.35 } as const;
/** Seconds a mole stays up at the start and at the end of a round. */
export const UP_TIME = { start: 1.4, end: 0.6 } as const;
export const HOLE_RADIUS = 46;
const COLUMNS = 3;
const ROWS = 3;

export interface Hole {
  x: number;
  y: number;
  /** Seconds the mole in this hole stays up; 0 when it is down. */
  up: number;
}

export interface Bonk {
  x: number;
  y: number;
  age: number;
}

export interface WhackAMoleState {
  holes: Hole[];
  bonks: Bonk[];
  /** Seconds since the round started. */
  elapsed: number;
  /** Seconds until the next mole pops up. */
  nextPop: number;
  score: number;
  phase: 'playing' | 'over';
}

export function createState(): WhackAMoleState {
  const spacingX = WIDTH / (COLUMNS + 1);
  const holes: Hole[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      holes.push({ x: spacingX * (column + 1), y: 140 + row * 115, up: 0 });
    }
  }
  return {
    holes,
    bonks: [],
    elapsed: 0,
    nextPop: SPAWN_INTERVAL.start,
    score: 0,
    phase: 'playing',
  };
}

/** How far through the round we are, from 0 at the start to 1 at the end. */
function progress(state: WhackAMoleState): number {
  return Math.min(state.elapsed / ROUND_SECONDS, 1);
}

/** Moles pop up more often as the round goes on. */
export function spawnInterval(state: WhackAMoleState): number {
  return SPAWN_INTERVAL.start + (SPAWN_INTERVAL.end - SPAWN_INTERVAL.start) * progress(state);
}

/** Moles also drop back down sooner as the round goes on. */
export function upTime(state: WhackAMoleState): number {
  return UP_TIME.start + (UP_TIME.end - UP_TIME.start) * progress(state);
}

export function timeLeft(state: WhackAMoleState): number {
  return Math.max(ROUND_SECONDS - state.elapsed, 0);
}

/** Pops a mole up from a random empty hole. Returns false if every hole is busy. */
export function popUp(state: WhackAMoleState, random: () => number = Math.random): boolean {
  const empty = state.holes.filter((hole) => hole.up === 0);
  if (empty.length === 0) return false;
  const hole = empty[Math.min(Math.floor(random() * empty.length), empty.length - 1)];
  hole.up = upTime(state);
  return true;
}

/** Whacks at a point. Returns true if it hit a mole that was up. */
export function whack(state: WhackAMoleState, x: number, y: number): boolean {
  if (state.phase !== 'playing') return false;
  const hole = state.holes.find((h) => h.up > 0 && Math.hypot(x - h.x, y - h.y) <= HOLE_RADIUS);
  if (!hole) return false;
  hole.up = 0;
  state.score += POINTS_PER_WHACK;
  state.bonks.push({ x: hole.x, y: hole.y, age: 0 });
  return true;
}

/** Advances the game by `dt` seconds. */
export function step(state: WhackAMoleState, dt: number, random: () => number = Math.random): void {
  for (const bonk of state.bonks) bonk.age += dt;
  state.bonks = state.bonks.filter((b) => b.age < 0.3);

  if (state.phase !== 'playing') return;

  state.elapsed += dt;
  if (state.elapsed >= ROUND_SECONDS) {
    state.elapsed = ROUND_SECONDS;
    for (const hole of state.holes) hole.up = 0;
    state.phase = 'over';
    return;
  }

  for (const hole of state.holes) hole.up = Math.max(hole.up - dt, 0);

  state.nextPop -= dt;
  while (state.nextPop <= 0) {
    popUp(state, random);
    state.nextPop += spawnInterval(state);
  }
}

function draw(ctx: CanvasRenderingContext2D, state: WhackAMoleState) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Booth awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  for (const hole of state.holes) {
    if (hole.up > 0) {
      // The mole: a wooden head with eyes and a nose, rising out of the hole.
      ctx.fillStyle = colors.wood;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y - 18, 32, Math.PI, 0);
      ctx.lineTo(hole.x + 32, hole.y);
      ctx.lineTo(hole.x - 32, hole.y);
      ctx.fill();
      ctx.fillStyle = colors.text;
      ctx.beginPath();
      ctx.arc(hole.x - 11, hole.y - 26, 5, 0, Math.PI * 2);
      ctx.arc(hole.x + 11, hole.y - 26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.stripeA;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y - 14, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // The front lip of the hole, drawn over the bottom of the mole.
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.ellipse(hole.x, hole.y + 6, HOLE_RADIUS, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 4;
  for (const bonk of state.bonks) {
    ctx.globalAlpha = 1 - bonk.age / 0.3;
    ctx.beginPath();
    ctx.arc(bonk.x, bonk.y - 18, 20 + bonk.age * 120, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Time ${Math.ceil(timeLeft(state))}s`, WIDTH - 16, HEIGHT - 20);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Time's up! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const whackAMole: CarnivalGame = {
  id: 'whack-a-mole',
  name: 'Whack-a-Mole',
  description: 'Whack the moles before they duck back down. They get faster as the clock runs out.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    let scoreRecorded = false;

    const onDown = (event: PointerEvent) => {
      if (state.phase === 'over') {
        state = createState();
        scoreRecorded = false;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      whack(
        state,
        ((event.clientX - rect.left) / rect.width) * WIDTH,
        ((event.clientY - rect.top) / rect.height) * HEIGHT,
      );
    };
    canvas.addEventListener('pointerdown', onDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't skip the round.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      if (state.phase === 'over' && !scoreRecorded) {
        recordScore(whackAMole.id, state.score);
        scoreRecorded = true;
      }
      draw(ctx, state);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
    };
  },
};

export default whackAMole;
