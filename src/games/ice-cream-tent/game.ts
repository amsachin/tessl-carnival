import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;
const { colors } = theme;

export const CUSTOMERS_PER_ROUND = 5;
export const MAX_SCOOPS = 3;
export const MAX_PARTICLES = 150;
export const SPEED_BONUS = 20;
export const SPEED_BONUS_SECONDS = 20;
export const POINTS = { container: 10, scoop: 10, topping: 5, extraTopping: -5, perfect: 20 };

export const FLAVORS = ['vanilla', 'strawberry', 'chocolate', 'blueberry', 'lemon'] as const;
export const TOPPINGS = ['sprinkles', 'cherry', 'chips', 'cream'] as const;
export type Flavor = (typeof FLAVORS)[number];
export type Topping = (typeof TOPPINGS)[number];
export type Container = 'cone' | 'cup';

export const FLAVOR_COLORS: Record<Flavor, string> = {
  vanilla: colors.stripeB,
  strawberry: colors.danger,
  chocolate: colors.wood,
  blueberry: colors.water,
  lemon: colors.accent,
};
const SPRINKLE_COLORS = [colors.danger, colors.water, colors.accent, colors.stripeB];
const TOPPING_COLORS: Record<Topping, string> = {
  sprinkles: colors.accent,
  cherry: colors.stripeA,
  chips: colors.wood,
  cream: colors.stripeB,
};
const FLAVOR_NAMES: Record<Flavor, string> = {
  vanilla: 'Vanilla',
  strawberry: 'Strawberry',
  chocolate: 'Chocolate',
  blueberry: 'Blueberry',
  lemon: 'Lemon',
};
const TOPPING_NAMES: Record<Topping, string> = {
  sprinkles: 'Sprinkles',
  cherry: 'Cherry',
  chips: 'Choc chips',
  cream: 'Whipped cream',
};

export interface Order {
  container: Container;
  /** Bottom to top. */
  scoops: Flavor[];
  toppings: Topping[];
}

export interface Build {
  container: Container | null;
  /** Bottom to top. */
  scoops: Flavor[];
  toppings: Topping[];
}

export interface Particle {
  topping: Topping;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where it settles; it lands once it falls to this height. */
  restY: number;
  /** Seconds before it starts moving and shows. */
  delay: number;
  /** How many more times it bounces before it lands. */
  bounces: number;
  landed: boolean;
}

export interface IceCreamState {
  customer: number;
  order: Order;
  build: Build;
  /** Seconds since the current customer arrived. */
  elapsed: number;
  /** Seconds since the last scoop was added, for the drop and squash. */
  scoopAge: number;
  particles: Particle[];
  score: number;
  lastOrderScore: number | null;
  phase: 'playing' | 'over';
  recorded: boolean;
}

// Where the ice cream is built.
export const BUILD_X = 400;
const CONTAINER_TOP = 360;
const SCOOP_RADIUS = 34;
const SCOOP_SPACING = 42;
const GRAVITY = 900;
// The longest physics step, so a slow frame doesn't teleport the toppings.
export const MAX_PHYSICS_STEP = 0.05;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(Math.floor(random() * items.length), items.length - 1)];
}

/** A random order: a cone or cup, 1 to 3 scoops and any of the toppings. */
export function createOrder(random: () => number = Math.random): Order {
  const container: Container = random() < 0.5 ? 'cone' : 'cup';
  const count = 1 + Math.min(Math.floor(random() * MAX_SCOOPS), MAX_SCOOPS - 1);
  const scoops = Array.from({ length: count }, () => pick(FLAVORS, random));
  const toppings = TOPPINGS.filter(() => random() < 0.5);
  return { container, scoops, toppings };
}

export function createState(random: () => number = Math.random): IceCreamState {
  return {
    customer: 1,
    order: createOrder(random),
    build: { container: null, scoops: [], toppings: [] },
    elapsed: 0,
    scoopAge: Infinity,
    particles: [],
    score: 0,
    lastOrderScore: null,
    phase: 'playing',
    recorded: false,
  };
}

/** The height of the top of the ice cream, where toppings settle. */
export function surfaceY(build: Build): number {
  if (build.scoops.length === 0) return CONTAINER_TOP;
  return CONTAINER_TOP - (build.scoops.length - 1) * SCOOP_SPACING - SCOOP_RADIUS;
}

/** Moves every topping by `dy`, so toppings stay on top when the stack changes. */
function shiftToppings(state: IceCreamState, dy: number): void {
  for (const p of state.particles) {
    p.y += dy;
    p.restY += dy;
  }
}

export function chooseContainer(state: IceCreamState, container: Container): boolean {
  if (state.phase !== 'playing') return false;
  state.build.container = container;
  return true;
}

/** Adds a scoop on top. Returns false when the stack is full. */
export function addScoop(state: IceCreamState, flavor: Flavor): boolean {
  if (state.phase !== 'playing' || state.build.scoops.length >= MAX_SCOOPS) return false;
  const before = surfaceY(state.build);
  state.build.scoops.push(flavor);
  shiftToppings(state, surfaceY(state.build) - before);
  state.scoopAge = 0;
  return true;
}

/** Removes the top scoop. Returns false when there is none. */
export function removeTopScoop(state: IceCreamState): boolean {
  if (state.phase !== 'playing' || state.build.scoops.length === 0) return false;
  const before = surfaceY(state.build);
  state.build.scoops.pop();
  shiftToppings(state, surfaceY(state.build) - before);
  state.scoopAge = Infinity;
  return true;
}

function spawnParticles(state: IceCreamState, topping: Topping, random: () => number): void {
  const room = MAX_PARTICLES - state.particles.length;
  const top = surfaceY(state.build);
  const add = (p: Omit<Particle, 'topping' | 'landed'>) => {
    if (state.particles.length < MAX_PARTICLES)
      state.particles.push({ topping, landed: false, ...p });
  };
  const spread = () => (random() - 0.5) * SCOOP_RADIUS * 1.4;

  if (topping === 'sprinkles') {
    // Scatter from above and settle across the top scoop.
    for (let i = 0; i < Math.min(40, room); i++) {
      const restX = BUILD_X + spread();
      const x = restX + (random() - 0.5) * 120;
      add({
        color: pick(SPRINKLE_COLORS, random),
        x,
        y: top - 140 - random() * 40,
        // Drift sideways onto the spot it settles on.
        vx: (restX - x) / 0.55,
        vy: 0,
        restY: top + 4 + random() * 10,
        delay: random() * 0.3,
        bounces: 0,
      });
    }
  } else if (topping === 'cherry') {
    add({
      color: TOPPING_COLORS.cherry,
      x: BUILD_X,
      y: top - 180,
      vx: 0,
      vy: 0,
      restY: top - 6,
      delay: 0,
      bounces: 1,
    });
  } else if (topping === 'chips') {
    // A short burst, falling straight down.
    for (let i = 0; i < Math.min(16, room); i++) {
      add({
        color: TOPPING_COLORS.chips,
        x: BUILD_X + spread(),
        y: top - 120 - random() * 30,
        vx: 0,
        vy: 0,
        restY: top + 2 + random() * 8,
        delay: i * 0.03,
        bounces: 0,
      });
    }
  } else {
    // Swirl up from the top scoop in a tightening spiral.
    const count = Math.min(14, room);
    for (let i = 0; i < count; i++) {
      const height = 4 + i * 2;
      const lift = Math.sqrt(2 * GRAVITY * (height + 10));
      const radius = 22 * (1 - i / count);
      add({
        color: TOPPING_COLORS.cream,
        x: BUILD_X + Math.cos(i * 1.6) * radius,
        y: top,
        vx: 0,
        vy: -lift,
        restY: top - height,
        delay: i * 0.04,
        bounces: 0,
      });
    }
  }
}

/** Adds a topping and starts it falling. Each topping goes on once per order. */
export function addTopping(
  state: IceCreamState,
  topping: Topping,
  random: () => number = Math.random,
): boolean {
  if (state.phase !== 'playing' || state.build.toppings.includes(topping)) return false;
  state.build.toppings.push(topping);
  spawnParticles(state, topping, random);
  return true;
}

/** Up to 20 points, falling to 0 over 20 seconds from when the customer arrived. */
export function speedBonus(elapsed: number): number {
  return Math.round(SPEED_BONUS * Math.max(0, 1 - elapsed / SPEED_BONUS_SECONDS));
}

export function scoreOrder(order: Order, build: Build, elapsed: number): number {
  let points = 0;
  const rightContainer = build.container === order.container;
  if (rightContainer) points += POINTS.container;
  const rightScoops = build.scoops.filter((flavor, i) => order.scoops[i] === flavor).length;
  points += rightScoops * POINTS.scoop;
  const rightToppings = build.toppings.filter((t) => order.toppings.includes(t)).length;
  const extraToppings = build.toppings.length - rightToppings;
  points += rightToppings * POINTS.topping + extraToppings * POINTS.extraTopping;
  points = Math.max(0, points);

  const perfect =
    rightContainer &&
    rightScoops === order.scoops.length &&
    build.scoops.length === order.scoops.length &&
    rightToppings === order.toppings.length &&
    extraToppings === 0;
  if (perfect) points += POINTS.perfect;
  return points + speedBonus(elapsed);
}

/** Hands the order over and scores it; the next customer arrives straight away. */
export function serve(state: IceCreamState, random: () => number = Math.random): number | null {
  if (state.phase !== 'playing') return null;
  const points = scoreOrder(state.order, state.build, state.elapsed);
  state.score += points;
  state.lastOrderScore = points;
  state.build = { container: null, scoops: [], toppings: [] };
  state.particles = [];
  state.scoopAge = Infinity;
  state.elapsed = 0;
  if (state.customer >= CUSTOMERS_PER_ROUND) {
    state.phase = 'over';
  } else {
    state.customer += 1;
    state.order = createOrder(random);
  }
  return points;
}

/**
 * Advances the customer's timer by `dt` seconds, and the falling toppings by
 * at most `MAX_PHYSICS_STEP`, so a slow frame still counts in full on the clock.
 */
export function step(state: IceCreamState, elapsedDt: number): void {
  if (state.phase !== 'playing') return;
  state.elapsed += elapsedDt;
  const dt = Math.min(elapsedDt, MAX_PHYSICS_STEP);
  state.scoopAge += dt;

  for (const p of state.particles) {
    if (p.landed) continue;
    if (p.delay > 0) {
      p.delay = Math.max(0, p.delay - dt);
      continue;
    }
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.vy > 0 && p.y >= p.restY) {
      p.y = p.restY;
      if (p.bounces > 0) {
        p.bounces -= 1;
        p.vy = -p.vy * 0.4;
      } else {
        p.vx = 0;
        p.vy = 0;
        p.landed = true;
      }
    }
  }
}

/**
 * Brings the state's clock from `last` up to `now`, both in milliseconds, and
 * returns the new `last`. `start` calls it on every frame and before every
 * click, so a serve scores the full wait and the next customer starts from the
 * click. The clock never runs backwards.
 */
export function advance(state: IceCreamState, last: number, now: number): number {
  if (now <= last) return last;
  step(state, (now - last) / 1000);
  return now;
}

/** Records the score once, after the fifth customer. Returns true when it recorded. */
export function recordIfOver(
  state: IceCreamState,
  record: (gameId: string, score: number) => unknown = recordScore,
): boolean {
  if (state.phase !== 'over' || state.recorded) return false;
  record(iceCreamTent.id, state.score);
  state.recorded = true;
  return true;
}

export type Action =
  | { kind: 'container'; container: Container }
  | { kind: 'scoop'; flavor: Flavor }
  | { kind: 'remove' }
  | { kind: 'topping'; topping: Topping }
  | { kind: 'serve' };

export interface Button {
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: Action;
}

const COL_A = 540;
const COL_B = 665;
const BUTTON_W = 115;
const BUTTON_H = 36;
const button = (label: string, color: string, x: number, y: number, action: Action): Button => ({
  label,
  color,
  x,
  y,
  w: BUTTON_W,
  h: BUTTON_H,
  action,
});

export const BUTTONS: readonly Button[] = [
  button('Cone', colors.wood, COL_A, 70, { kind: 'container', container: 'cone' }),
  button('Cup', colors.stripeA, COL_B, 70, { kind: 'container', container: 'cup' }),
  ...FLAVORS.map((flavor, i) =>
    button(
      FLAVOR_NAMES[flavor],
      FLAVOR_COLORS[flavor],
      i % 2 ? COL_B : COL_A,
      140 + Math.floor(i / 2) * 44,
      {
        kind: 'scoop',
        flavor,
      },
    ),
  ),
  button('Remove top', colors.surface, COL_B, 228, { kind: 'remove' }),
  ...TOPPINGS.map((topping, i) =>
    button(
      TOPPING_NAMES[topping],
      TOPPING_COLORS[topping],
      i % 2 ? COL_B : COL_A,
      298 + Math.floor(i / 2) * 44,
      {
        kind: 'topping',
        topping,
      },
    ),
  ),
  {
    label: 'Serve',
    color: colors.accent,
    x: COL_A,
    y: 400,
    w: COL_B + BUTTON_W - COL_A,
    h: 50,
    action: { kind: 'serve' },
  },
];

export function buttonAt(x: number, y: number): Button | undefined {
  return BUTTONS.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

/** Runs a button's action. Returns false when it did nothing. */
export function press(
  state: IceCreamState,
  action: Action,
  random: () => number = Math.random,
): boolean {
  switch (action.kind) {
    case 'container':
      return chooseContainer(state, action.container);
    case 'scoop':
      return addScoop(state, action.flavor);
    case 'remove':
      return removeTopScoop(state);
    case 'topping':
      return addTopping(state, action.topping, random);
    case 'serve':
      return serve(state, random) !== null;
  }
}

/**
 * Handles a click at (x, y) in canvas coordinates and returns the state to
 * play on. A finished round is recorded right away, before a restart can
 * replace it.
 */
export function tap(
  state: IceCreamState,
  x: number,
  y: number,
  record: (gameId: string, score: number) => unknown = recordScore,
  random: () => number = Math.random,
): IceCreamState {
  if (state.phase === 'over') {
    recordIfOver(state, record);
    return createState(random);
  }
  const hit = buttonAt(x, y);
  if (hit) press(state, hit.action, random);
  recordIfOver(state, record);
  return state;
}

function drawContainer(
  ctx: CanvasRenderingContext2D,
  container: Container | null,
  x: number,
  top: number,
  scale = 1,
) {
  if (!container) return;
  ctx.beginPath();
  if (container === 'cone') {
    ctx.fillStyle = colors.wood;
    ctx.moveTo(x - 30 * scale, top);
    ctx.lineTo(x + 30 * scale, top);
    ctx.lineTo(x, top + 100 * scale);
  } else {
    ctx.fillStyle = colors.stripeA;
    ctx.moveTo(x - 36 * scale, top);
    ctx.lineTo(x + 36 * scale, top);
    ctx.lineTo(x + 26 * scale, top + 56 * scale);
    ctx.lineTo(x - 26 * scale, top + 56 * scale);
  }
  ctx.closePath();
  ctx.fill();
}

function drawScoop(
  ctx: CanvasRenderingContext2D,
  flavor: Flavor,
  x: number,
  y: number,
  r: number,
  squash = 0,
) {
  ctx.fillStyle = FLAVOR_COLORS[flavor];
  ctx.beginPath();
  ctx.ellipse(x, y + r * squash * 0.5, r * (1 + squash * 0.5), r * (1 - squash), 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrderCard(ctx: CanvasRenderingContext2D, order: Order) {
  ctx.fillStyle = colors.surface;
  ctx.fillRect(20, 60, 220, 390);
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('Order', 36, 90);

  // A small picture of the order.
  drawContainer(ctx, order.container, 130, 250, 0.5);
  order.scoops.forEach((flavor, i) => drawScoop(ctx, flavor, 130, 250 - i * 21, 17));

  ctx.font = canvasFont('small');
  ctx.fillStyle = colors.text;
  ctx.fillText(order.container === 'cone' ? 'In a cone' : 'In a cup', 36, 330);
  ctx.fillText(`Scoops: ${order.scoops.map((f) => FLAVOR_NAMES[f]).join(', ')}`, 36, 352, 196);
  ctx.fillStyle = colors.muted;
  ctx.fillText('(bottom to top)', 36, 372);
  ctx.fillStyle = colors.text;
  const toppings = order.toppings.map((t) => TOPPING_NAMES[t]);
  ctx.fillText('Toppings:', 36, 400);
  ctx.fillText(toppings.length ? toppings.slice(0, 2).join(', ') : 'none', 36, 420, 196);
  if (toppings.length > 2) ctx.fillText(toppings.slice(2).join(', '), 36, 440, 196);
}

function draw(ctx: CanvasRenderingContext2D, state: IceCreamState) {
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Tent awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  drawOrderCard(ctx, state.order);

  // Counter.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(260, 470, 260, 10);

  const { build } = state;
  drawContainer(ctx, build.container, BUILD_X, CONTAINER_TOP);
  build.scoops.forEach((flavor, i) => {
    let y = CONTAINER_TOP - i * SCOOP_SPACING;
    let squash = 0;
    if (i === build.scoops.length - 1 && state.scoopAge < 0.35) {
      // Drop in, then squash a little as it lands.
      const t = state.scoopAge;
      if (t < 0.15) y -= (1 - t / 0.15) * 80;
      else squash = 0.18 * Math.sin(((t - 0.15) / 0.2) * Math.PI);
    }
    drawScoop(ctx, flavor, BUILD_X, y, SCOOP_RADIUS, squash);
  });

  for (const p of state.particles) {
    if (p.delay > 0) continue;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    if (p.topping === 'sprinkles') ctx.fillRect(p.x - 3, p.y - 1, 6, 2);
    else if (p.topping === 'cherry') ctx.arc(p.x, p.y - 10, 10, 0, Math.PI * 2);
    else if (p.topping === 'chips') ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    else ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of BUTTONS) {
    const chosen =
      (b.action.kind === 'container' && build.container === b.action.container) ||
      (b.action.kind === 'topping' && build.toppings.includes(b.action.topping));
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (chosen) {
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    }
    const light =
      b.color === colors.stripeB || b.color === colors.accent || b.color === colors.water;
    ctx.fillStyle = light ? colors.background : colors.text;
    ctx.font = canvasFont(b.action.kind === 'serve' ? 'body' : 'small', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
  }
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'left';
  ctx.fillText('Container', COL_A, 62);
  ctx.fillText(`Scoops (${build.scoops.length}/${MAX_SCOOPS})`, COL_A, 132);
  ctx.fillText('Toppings', COL_A, 290);

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 260, 70);
  ctx.textAlign = 'right';
  ctx.fillText(`Customer ${state.customer}/${CUSTOMERS_PER_ROUND}`, 520, 70);
  ctx.font = canvasFont('small');
  ctx.fillText(`Speed bonus ${speedBonus(state.elapsed)}`, 520, 94);
  if (state.lastOrderScore !== null) {
    ctx.textAlign = 'left';
    ctx.fillText(`Last order +${state.lastOrderScore}`, 260, 94);
  }

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Tent closed! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const iceCreamTent: CarnivalGame = {
  id: 'ice-cream-tent',
  name: 'Ice Cream Tent',
  description:
    'Build each customer’s order: cone or cup, scoops and toppings. Quick and right scores most.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();

    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      // Bring the clock up to the click, so the time so far goes to this customer.
      last = advance(state, last, performance.now());
      state = tap(state, x, y);
    };
    let frame = 0;
    let last = performance.now();
    canvas.addEventListener('pointerdown', onDown);

    const loop = (time: number) => {
      // step caps the physics itself; the customer's clock gets the real time.
      last = advance(state, last, time);
      draw(ctx, state);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      recordIfOver(state);
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
    };
  },
};

export default iceCreamTent;
