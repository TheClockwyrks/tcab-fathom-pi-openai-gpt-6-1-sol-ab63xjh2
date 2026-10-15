import * as C from "./constants";
import type {
  Body,
  Direction,
  FathomState,
  Predator,
  PredatorKind,
  ReadState,
  Screen,
} from "./types";
export const directions: Direction[] = ["up", "right", "down", "left"];
export const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Direction): Direction =>
  directions[(directions.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
  y: C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
  tx,
  ty,
});
export function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export const layer = (c: string) =>
  Array.from({ length: C.GRID_ROWS }, () => c.repeat(C.GRID_COLS));
export function put(rows: string[], x: number, y: number, c: string) {
  rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
}
export function maze(): string[] {
  const m = layer("#");
  for (let y = 1; y < C.GRID_ROWS - 1; y++)
    for (let x = 1; x < C.GRID_COLS - 1; x++) {
      if (
        [1, 5, 11, 16].includes(y) ||
        [1, 5, 9, 13, 22, 26, 30, 34].includes(x) ||
        ([16, 19].includes(x) && (y < 6 || y > 10)) ||
        ([3, 14].includes(y) && ((x >= 5 && x <= 13) || (x >= 22 && x <= 30)))
      )
        put(m, x, y, ".");
    }
  for (let x = 0; x <= 13; x++) {
    put(m, x, 8, ".");
    put(m, C.GRID_COLS - 1 - x, 8, ".");
  }
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) put(m, x, y, "d");
  put(m, 17, 6, "g");
  return m;
}
export function predator(kind: PredatorKind, tx: number, ty: number): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    flareFade: 0,
    releaseAt: null,
  };
}
export function roster(depth: number): Predator[] {
  const kinds = [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ];
  return kinds.map((k, i) => ({
    ...predator(k, 16 + (i % 4), 7 + Math.floor(i / 4)),
    state: "den",
    released: false,
    releaseAt: i * C.DEN_RELEASE_GAP,
  }));
}
export function fresh(
  assets: FathomState["assets"] = {},
  muted = false,
): FathomState {
  const tiles = maze();
  const s: FathomState = {
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/\./g, "*").replace(/[^*]/g, "-")),
    visibility: layer("u"),
    forager: { ...center(16, 14), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    assets,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    seed: 7319,
    desired: "left",
    start: { tx: 16, ty: 14 },
    pointerDown: null,
    pendingSonar: false,
    pendingInk: false,
  };
  return reconcile(s);
}
// Bitmaps are immutable resources: clone only simulation data, never browser objects.
export function copy(s: ReadState): FathomState {
  return {
    ...s,
    assets: s.assets as FathomState["assets"],
    grid: { ...s.grid },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    start: { ...s.start },
    drifters: s.drifters.map((b) => ({ ...b })),
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
  };
}
export function reconcile(s: FathomState): FathomState {
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  locate(s.forager);
  s.drifters.forEach(locate);
  s.predators.forEach((p) => {
    locate(p);
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
    p.speed =
      p.kind === "lanternjaw" && p.state !== "chase"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
  });
  return s;
}
export function screen(s: FathomState, v: Screen) {
  s.screen = v;
  s.screenTime = 0;
  s.menuIndex =
    v === "title"
      ? s.titleIndex
      : ["paused", "gameover"].includes(v)
        ? 0
        : null;
  if (v === "playing" && s.predators.every((p) => !p.released)) s.playTime = 0;
}
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  d: Direction,
): [number, number] {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (
    ny >= 0 &&
    ny < C.GRID_ROWS &&
    s.tiles[ny][0] === "." &&
    s.tiles[ny][C.GRID_COLS - 1] === "."
  )
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  return [nx, ny];
}
export const open = (s: ReadState, x: number, y: number, den = false) =>
  den ? [".", "d", "g"].includes(s.tiles[y]?.[x]) : s.tiles[y]?.[x] === ".";
export function exits(s: ReadState, b: Body, den = false) {
  return directions.filter((d) => open(s, ...neighbor(s, b.tx, b.ty, d), den));
}
export function random(s: FathomState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function wander(s: FathomState, b: Body, den = false): Direction {
  const e = exits(s, b, den);
  const a = e.filter((d) => d !== opposite(b.dir));
  const choices = a.length ? a : e;
  return choices[Math.floor(random(s) * choices.length)] ?? b.dir;
}
export function distances(
  s: ReadState,
  tx: number,
  ty: number,
  den = false,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!open(s, tx, ty, den)) return map;
  const q: [[number, number]] = [[tx, ty]];
  map.set(`${tx},${ty}`, 0);
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const n = map.get(`${x},${y}`)!;
    for (const d of directions) {
      const [nx, ny] = neighbor(s, x, y, d);
      const key = `${nx},${ny}`;
      if (open(s, nx, ny, den) && !map.has(key)) {
        map.set(key, n + 1);
        q.push([nx, ny]);
      }
    }
  }
  return map;
}
export function route(
  s: ReadState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
): Direction | null {
  const ds = distances(s, target.tx, target.ty, den);
  const here = ds.get(`${b.tx},${b.ty}`);
  if (here === undefined || here === 0) return null;
  return (
    directions.find((d) => {
      const n = neighbor(s, b.tx, b.ty, d);
      return ds.get(n.join(",")) === here - 1;
    }) ?? null
  );
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export function los(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  endRock = false,
) {
  // Traverse every grid interval crossed by the segment, not sampled pixels.
  const ax = (a.x - C.GRID_ORIGIN_X) / C.TILE,
    ay = (a.y - C.GRID_ORIGIN_Y) / C.TILE;
  const bx = (b.x - C.GRID_ORIGIN_X) / C.TILE,
    by = (b.y - C.GRID_ORIGIN_Y) / C.TILE;
  let x = Math.floor(ax),
    y = Math.floor(ay);
  const ex = Math.floor(bx),
    ey = Math.floor(by),
    dx = bx - ax,
    dy = by - ay;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const ix = dx === 0 ? Infinity : Math.abs(1 / dx),
    iy = dy === 0 ? Infinity : Math.abs(1 / dy);
  let nextX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 : x) - ax) / dx;
  let nextY = dy === 0 ? Infinity : ((dy > 0 ? y + 1 : y) - ay) / dy;
  for (let step = 0; step < C.GRID_COLS + C.GRID_ROWS + 2; step++) {
    if (s.tiles[y]?.[x] === "#" && !(endRock && x === ex && y === ey))
      return false;
    if (x === ex && y === ey) return true;
    if (Math.abs(nextX - nextY) < 1e-10) {
      x += sx;
      y += sy;
      nextX += ix;
      nextY += iy;
    } else if (nextX < nextY) {
      x += sx;
      nextX += ix;
    } else {
      y += sy;
      nextY += iy;
    }
  }
  return false;
}
export function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Travel consumes a distance budget, stopping exactly at centers before deciding turns. */
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  choose: () => Direction | null,
  den = false,
) {
  if (!open(s, b.tx, b.ty, den)) return false;
  let left = speed * C.TICK_DT,
    moved = false;
  while (left > 1e-8) {
    const cx = center(b.tx, b.ty);
    const at = Math.abs(cx.x - b.x) < 1e-7 && Math.abs(cx.y - b.y) < 1e-7;
    if (at) {
      const d = choose();
      if (d === null || !open(s, ...neighbor(s, b.tx, b.ty, d), den)) break;
      b.dir = d;
    }
    const [dx, dy] = vectors[b.dir];
    let to = dx
      ? dx > 0
        ? cx.x - b.x
        : b.x - cx.x
      : dy > 0
        ? cx.y - b.y
        : b.y - cx.y;
    if (to < 1e-7) to += C.TILE;
    const step = Math.min(to, left);
    b.x += dx * step;
    b.y += dy * step;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
    left -= step;
    moved = true;
  }
  return moved;
}
