import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const RINGS_PER_ROUND = 10;
/** Seconds a ring spends in the air. */
export const FLIGHT_TIME = 0.5;
/** How far, in pixels, the throwing hand sways either side of the aim. */
export const SWAY = 26;
/** How fast the hand sways, in radians per second. */
export const SWAY_SPEED = 2.6;
export const HAND = { x: WIDTH / 2, y: HEIGHT - 40 } as const;
const COLUMNS = 5;
/** Back row first. A ring has to land within `neck` pixels of a bottle's neck. */
const ROWS = [
  { y: 130, neck: 11, points: 30 },
  { y: 205, neck: 14, points: 20 },
  { y: 280, neck: 17, points: 10 },
];

export interface Bottle {
  x: number;
  y: number;
  /** How close to the neck a ring has to land, in pixels. */
  neck: number;
  points: number;
  ringed: boolean;
}

export interface Ring {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Seconds since the throw. */
  age: number;
}

export interface Miss {
  x: number;
  y: number;
  age: number;
}

export interface RingTossState {
  bottles: Bottle[];
  rings: Ring[];
  misses: Miss[];
  ringsLeft: number;
  score: number;
  /** Seconds since the round began; drives the sway. */
  time: number;
  phase: 'playing' | 'over';
}

export function createState(): RingTossState {
  const spacing = WIDTH / (COLUMNS + 1);
  const bottles = ROWS.flatMap((row) =>
    Array.from({ length: COLUMNS }, (_, i) => ({
      x: spacing * (i + 1),
      y: row.y,
      neck: row.neck,
      points: row.points,
      ringed: false,
    })),
  );
  return {
    bottles,
    rings: [],
    misses: [],
    ringsLeft: RINGS_PER_ROUND,
    score: 0,
    time: 0,
    phase: 'playing',
  };
}

/** How far the hand has swayed sideways from the aim at this moment. */
export function swayOffset(time: number): number {
  return SWAY * Math.sin(time * SWAY_SPEED);
}

/** The bottle a ring landing at (x, y) goes over, if any. */
export function bottleAt(state: RingTossState, x: number, y: number): Bottle | undefined {
  return state.bottles.find((b) => Math.hypot(x - b.x, y - b.y) <= b.neck);
}

/** Throws one ring at the aim point, pushed sideways by the sway. Returns false if nothing was thrown. */
export function toss(state: RingTossState, aimX: number, aimY: number): boolean {
  if (state.phase !== 'playing' || state.ringsLeft === 0) return false;
  state.rings.push({
    fromX: HAND.x,
    fromY: HAND.y,
    toX: aimX + swayOffset(state.time),
    toY: Math.min(aimY, HAND.y - 1),
    age: 0,
  });
  state.ringsLeft -= 1;
  return true;
}

/** Where a ring is now: part way from the hand to where it lands. */
export function ringPosition(ring: Ring): { x: number; y: number } {
  const t = Math.min(ring.age / FLIGHT_TIME, 1);
  return {
    x: ring.fromX + (ring.toX - ring.fromX) * t,
    y: ring.fromY + (ring.toY - ring.fromY) * t,
  };
}

/** Advances the game by `dt` seconds. */
export function step(state: RingTossState, dt: number): void {
  state.time += dt;
  for (const miss of state.misses) miss.age += dt;
  state.misses = state.misses.filter((m) => m.age < 0.5);

  const flying: Ring[] = [];
  for (const ring of state.rings) {
    ring.age += dt;
    if (ring.age < FLIGHT_TIME) {
      flying.push(ring);
      continue;
    }
    const bottle = bottleAt(state, ring.toX, ring.toY);
    if (bottle && !bottle.ringed) {
      bottle.ringed = true;
      state.score += bottle.points;
    } else {
      state.misses.push({ x: ring.toX, y: ring.toY, age: 0 });
    }
  }
  state.rings = flying;

  if (state.ringsLeft === 0 && state.rings.length === 0) state.phase = 'over';
}

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, state: RingTossState, aim: { x: number; y: number }) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Booth awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  // Shelves, back to front, each with its points.
  for (const row of ROWS) {
    ctx.fillStyle = colors.wood;
    ctx.fillRect(40, row.y + 40, WIDTH - 80, 8);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    ctx.textAlign = 'left';
    ctx.fillText(`${row.points}`, 48, row.y + 30);
  }

  for (const bottle of state.bottles) {
    const scale = bottle.neck / 14;
    ctx.fillStyle = colors.water;
    ctx.fillRect(bottle.x - 14 * scale, bottle.y + 10, 28 * scale, 30);
    ctx.fillRect(bottle.x - 5 * scale, bottle.y - 6, 10 * scale, 18);
    ctx.fillStyle = colors.surface;
    ctx.fillRect(bottle.x - 5 * scale, bottle.y - 8, 10 * scale, 4);
    if (bottle.ringed) drawRing(ctx, bottle.x, bottle.y + 6, bottle.neck);
  }

  ctx.strokeStyle = colors.danger;
  ctx.lineWidth = 2;
  for (const miss of state.misses) {
    ctx.globalAlpha = 1 - miss.age / 0.5;
    ctx.beginPath();
    ctx.ellipse(miss.x, miss.y, 12 + miss.age * 30, 5 + miss.age * 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const ring of state.rings) {
    const { x, y } = ringPosition(ring);
    // The ring arcs up and shrinks as it flies away from the hand.
    const t = Math.min(ring.age / FLIGHT_TIME, 1);
    drawRing(ctx, x, y - Math.sin(t * Math.PI) * 60, 22 - t * 8);
  }

  // Where the next ring will land, sway included.
  if (state.phase === 'playing' && state.ringsLeft > 0) {
    const x = aim.x + swayOffset(state.time);
    const y = Math.min(aim.y, HAND.y - 1);
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
    drawRing(ctx, HAND.x, HAND.y, 22);
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Rings ${state.ringsLeft}/${RINGS_PER_ROUND}`, WIDTH - 16, HEIGHT - 20);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Out of rings! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const ringToss: CarnivalGame = {
  id: 'ring-toss',
  name: 'Ring Toss',
  description: 'Land rings on the bottle necks. Bottles further back score more.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    let scoreRecorded = false;
    const aim = { x: WIDTH / 2, y: ROWS[1].y };

    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onMove = (event: PointerEvent) => Object.assign(aim, toCanvas(event));
    const onDown = (event: PointerEvent) => {
      Object.assign(aim, toCanvas(event));
      if (state.phase === 'over') {
        state = createState();
        scoreRecorded = false;
      } else {
        toss(state, aim.x, aim.y);
      }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      if (state.phase === 'over' && !scoreRecorded) {
        recordScore(ringToss.id, state.score);
        scoreRecorded = true;
      }
      draw(ctx, state, aim);
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

export default ringToss;
