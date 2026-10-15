/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type FathomState,
  type FathomDebugApi,
} from "./game";
import * as C from "./constants";
import {
  center,
  directions,
  distances,
  exits,
  maze,
  neighbor,
  open,
} from "./world";
let active: Engine<FathomState, FathomDebugApi>[] = [];
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
afterEach(() => {
  active.forEach((e) => e.destroy());
  active = [];
});
async function setup(ms = 1000 / C.TICK_HZ) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  active.push(e);
  await e.initialize();
  const key = (code: string, type = "keydown") =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const tap = async (code: string) => {
    key(code);
    await e.advance(1);
    key(code, "keyup");
  };
  const pose = (
    f: (
      s: Parameters<FathomDebugApi["reset"]>[0],
      d: FathomDebugApi,
    ) => FathomState,
  ) => e.apply((s) => f(s, e.debug));
  const play = () => {
    pose((s, d) => d.setScreen(s, "playing"));
    pose((s, d) => d.clearPredators(s));
    pose((s, d) => d.clearPlankton(s));
  };
  return { e, canvas, target, key, tap, pose, play };
}
function fixture(rows: Record<number, string>) {
  const m = Array.from({ length: C.GRID_ROWS }, () => "#".repeat(C.GRID_COLS));
  for (const [y, r] of Object.entries(rows))
    m[Number(y)] = r.padEnd(C.GRID_COLS, "#");
  return m;
}
const hall = fixture({ 5: "#........................." });
describe("the laid-out trench", () => {
  it("is connected, symmetric, narrow, looped, and meets the proportions", () => {
    const m = maze();
    expect(m).toHaveLength(C.GRID_ROWS);
    let total = 0,
      n = 0;
    const fake = { tiles: m } as FathomState;
    const reached = distances(fake, 1, 1);
    const twos = new Set<string>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const c = m[y][x],
          mirror = m[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(c) && !"dg".includes(mirror)) expect(c).toBe(mirror);
        if (c !== ".") continue;
        n++;
        const e = exits(fake, { ...center(x, y), dir: "up" });
        expect(e.length).toBeGreaterThanOrEqual(2);
        total += e.length;
        expect(reached.has(`${x},${y}`)).toBe(true);
        if (e.length === 2) twos.add(`${x},${y}`);
        expect(
          m[y + 1]?.[x] === "." &&
            m[y]?.[x + 1] === "." &&
            m[y + 1]?.[x + 1] === ".",
        ).toBe(false);
      }
    expect(total / n).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(total / n).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(n / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2))).toBeGreaterThanOrEqual(
      C.MAZE_DENSITY_MIN,
    );
    const runs: number[] = [];
    while (twos.size) {
      const queue = [twos.values().next().value!];
      twos.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i].split(",").map(Number);
        for (const d of directions) {
          const k = neighbor(fake, x, y, d).join(",");
          if (twos.delete(k)) queue.push(k);
        }
      }
      runs.push(queue.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
  it("initializes the entire contract, resources and pure diagnostics", async () => {
    const { e } = await setup();
    expect(e.state.screen).toBe("title");
    expect(e.state.predators.map((p) => p.kind)).toEqual(C.DEN_ORDER);
    expect(Object.keys(e.state.assets)).toHaveLength(7);
    expect(e.state.visibility.every((r) => /^u+$/.test(r))).toBe(true);
    expect(e.state.lives).toBe(C.START_LIVES);
    expect(e.diagnostics().every((r) => !r.error)).toBe(true);
    expect(() => JSON.stringify(e.debug.snapshot(e.state))).not.toThrow();
  });
});
describe("travel and the fixed clock", () => {
  it("moves continuously, stops on release, reverses immediately and keeps old states immutable", async () => {
    const { e, pose, play, key } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 5, 5));
    const old = e.state;
    key("ArrowRight");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(old.forager.x + 16);
    expect(old.forager.x).toBe(center(5, 5).x);
    key("ArrowRight", "keyup");
    await e.advance(20);
    expect(e.state.forager.x).toBeCloseTo(old.forager.x + 16);
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(old.forager.x);
  });
  it("buffers a perpendicular turn until the junction center", async () => {
    const { e, pose, play, key } = await setup();
    play();
    const m = fixture({ 4: "#####.##", 5: "#.......", 6: "#####.##" });
    pose((s, d) => d.setMaze(s, m));
    pose((s, d) => d.setForagerTile(s, 4, 5));
    key("ArrowRight");
    await e.advance(12);
    key("ArrowUp");
    await e.advance(1);
    key("ArrowUp", "keyup");
    await e.advance(17);
    expect(e.state.forager.x).toBeCloseTo(center(5, 5).x);
    expect(e.state.forager.y).toBeCloseTo(center(5, 5).y);
    await e.advance(12);
    expect(e.state.forager.y).toBeCloseTo(center(5, 5).y - 12.8);
  });
  it("crosses a wrap step in exactly one tile of travel", async () => {
    const { e, pose, play, key } = await setup();
    play();
    pose((s, d) => d.setMaze(s, fixture({ 5: ".".repeat(C.GRID_COLS) })));
    pose((s, d) => d.setForagerTile(s, 0, 5));
    key("ArrowLeft");
    await e.advance(30);
    expect(e.state.forager.x).toBeCloseTo(center(C.GRID_COLS - 1, 5).x);
    expect(e.state.forager.tx).toBe(C.GRID_COLS - 1);
  });
  it("produces the same simulation at different render rates", async () => {
    const a = await setup(1000 / 30),
      b = await setup(1000 / 144);
    for (const h of [a, b]) {
      h.play();
      h.pose((s, d) => d.setMaze(s, hall));
      h.pose((s, d) => d.setForagerTile(s, 2, 5));
      h.key("ArrowRight");
    }
    await a.e.advance(30);
    await b.e.advance(144);
    expect(a.e.debug.snapshot(a.e.state)).toEqual(
      b.e.debug.snapshot(b.e.state),
    );
  });
});
describe("screens and menus", () => {
  it("remembers the title item and handles every keyboard menu", async () => {
    const { e, tap } = await setup();
    await tap("ArrowDown");
    await tap("Enter");
    expect(e.state.screen).toBe("howto");
    await tap("Escape");
    expect(e.state.menuIndex).toBe(1);
    await tap("ArrowDown");
    await tap("Enter");
    expect(e.state.screen).toBe("countdown");
    await e.advance(220);
    expect(e.state.screen).toBe("playing");
    await tap("Escape");
    expect(e.state.screen).toBe("paused");
    await tap("Escape");
    expect(e.state.screen).toBe("playing");
    await tap("KeyP");
    await tap("ArrowUp");
    expect(e.state.menuIndex).toBe(2);
    await tap("Enter");
    expect(e.state.screen).toBe("title");
    expect(e.state.score).toBe(0);
  });
  it("freezes the whole maze on pause but not simulation time", async () => {
    const { e, pose, play, tap } = await setup();
    play();
    pose((s, d) => d.setSonarCooldown(s, 8));
    await tap("KeyP");
    const old = e.debug.snapshot(e.state);
    await e.advance(120);
    const now = e.debug.snapshot(e.state);
    expect({ ...now, simTime: old.simTime }).toEqual(old);
    expect(e.state.simTime).toBeGreaterThan(old.simTime as number);
  });
  it("requires matching pointer press and release regions", async () => {
    const { e, target } = await setup();
    await e.advance(1);
    const pointer = (type: string, x: number, y: number, buttons: number) =>
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons,
        }),
      );
    const r = e.debug.menuItemRect(e.state, 1)!;
    pointer("pointerdown", r.x + 10, r.y + 10, 1);
    await e.advance(1);
    pointer("pointerup", 0, 0, 0);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    pointer("pointerdown", r.x + 10, r.y + 10, 1);
    pointer("pointerup", r.x + 10, r.y + 10, 0);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
  });
});
describe("grazing and sensing", () => {
  it("scores only eating, holds brightness, decays exponentially and descends", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.setPlankton(s, s.forager.tx, s.forager.ty, true));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    expect(e.state.screen).toBe("cleared");
    await e.advance(220);
    expect(e.state.depth).toBe(2);
    expect(e.state.predators).toHaveLength(4);
    expect(e.state.screen).toBe("countdown");
  });
  it("holds then halves brightness, updates both radii and preserves fog outside the window", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.setBrightness(s, 1));
    pose((s, d) => d.setBrightHold(s, C.BRIGHT_HOLD));
    await e.advance(120);
    expect(e.state.brightness).toBeCloseTo(1);
    await e.advance(108);
    expect(e.state.brightness).toBeCloseTo(0.5);
    expect(e.state.windowRadius).toBeCloseTo(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * 0.5,
    );
    const old = e.state.visibility;
    pose((s, d) => d.setForagerTile(s, 1, 1));
    await e.advance(1);
    expect(old.join("")).toContain("l");
    expect(e.state.visibility.join("")).toContain("r");
  });
  it("sonar travels corridors, hears Gloamfin on arrival and leaves amber bodies unresolved", async () => {
    const { e, pose, play, tap } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 2, 5));
    pose((s, d) => d.addPredator(s, "gloamfin", 9, 5));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    pose((s, d) => d.addPredator(s, "lanternjaw", 10, 5));
    pose((s, d) => d.setPredatorMind(s, 1, false));
    await tap("Space");
    expect(e.state.predators[0].state).toBe("wander");
    await e.advance(70);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].lit).toBe(true);
    expect(e.state.predators[1].lit).toBe(false);
    expect(e.state.visibility[5][10]).not.toBe("u");
  });
  it("ink immediately drops light fixes but not hearing", async () => {
    const { e, pose, play, tap } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 5, 5));
    for (const k of C.DEN_ORDER) pose((s, d) => d.addPredator(s, k, 7, 5));
    for (let i = 0; i < 3; i++)
      pose((s, d) => d.setPredatorTravel(s, i, false));
    await e.advance(1);
    expect(e.state.predators.every((p) => p.state === "chase")).toBe(true);
    await tap("ShiftLeft");
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[1].state).toBe("chase");
    expect(e.state.predators[2].state).toBe("wander");
    expect(e.state.inkClouds).toHaveLength(1);
  });
  it("releases the den roster on staggered times and reveals a flare through rock", async () => {
    const { e, pose } = await setup(1000 / 60);
    pose((s, d) => d.clearPlankton(s));
    pose((s, d) => d.setScreen(s, "playing"));
    for (let i = 0; i < 3; i++)
      pose((s, d) => d.setPredatorTravel(s, i, false));
    await e.advance(1);
    expect(e.state.predators.map((p) => p.released)).toEqual([
      true,
      false,
      false,
    ]);
    await e.advance(300);
    expect(e.state.predators[1].released).toBe(true);
    pose((s, d) => d.clearPredators(s));
    pose((s, d) => d.setForagerTile(s, 1, 1));
    pose((s, d) => d.addPredator(s, "flarefish", 26, 11));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(455);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.visibility[10][26]).toBe("l");
    expect(e.state.predators[0].flareRadius).toBe(C.FLARE_RADIUS);
  });
  it("loses a reserve on tile contact and ends the final attempt", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.lives).toBe(C.START_LIVES - 1);
    expect(e.state.screen).toBe("countdown");
    pose((s, d) => d.setLives(s, 0));
    pose((s, d) => d.setScreen(s, "playing"));
    pose((s, d) => d.clearPredators(s));
    pose((s, d) => d.addPredator(s, "gloamfin", s.forager.tx, s.forager.ty));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
  });
  it("admits and eats bonus drifters and plays distinct engine cues even muted", async () => {
    const { e, pose, play, tap } = await setup();
    play();
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    pose((s, d) => d.setPlankton(s, 1, 1, true));
    pose((s, d) => d.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    pose((s, d) => d.spawnDrifter(s, s.forager.tx, s.forager.ty));
    pose((s, d) => d.setDrifterMind(s, 1, false));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_DRIFTER);
    await tap("KeyM");
    await tap("Space");
    await tap("ShiftLeft");
    expect(e.state.muted).toBe(true);
    expect(cues).toContain(C.CUES.sonar);
    expect(cues).toContain(C.CUES.ink);
  });
});
describe("hunter edge cases and the render mask", () => {
  it("paths a fixed target around rock rather than steering through it", async () => {
    const { e, pose, play } = await setup();
    play();
    const m = fixture({ 5: "#.#######.", 6: "#.#######.", 7: "#........." });
    pose((s, d) => d.setMaze(s, m));
    pose((s, d) => d.setForagerTile(s, 9, 5));
    pose((s, d) => d.addPredator(s, "gloamfin", 1, 5));
    pose((s, d) => d.setPredatorDir(s, 0, "right"));
    pose((s, d) => d.setPredatorState(s, 0, "chase"));
    await e.advance(30);
    expect(e.state.predators[0].x).toBe(center(1, 5).x);
    expect(e.state.predators[0].y).toBeGreaterThan(center(1, 5).y);
    expect(e.state.predators[0].dir).toBe("down");
    expect(e.state.predators[0].speed).toBeLessThan(C.FORAGER_SPEED);
  });
  it("lingers on the last light fix, then forgets it", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 5, 5));
    pose((s, d) => d.addPredator(s, "lanternjaw", 7, 5));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    pose((s, d) => d.setForagerTile(s, 20, 5));
    await e.advance(239);
    expect(e.state.predators[0].state).toBe("chase");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].speed).toBe(C.DRIFTER_SPEED);
  });
  it("searches a stale sound fix and casts its one orange ping", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 7, 5));
    pose((s, d) => d.addPredator(s, "gloamfin", 5, 5));
    pose((s, d) => d.setPredatorState(s, 0, "chase"));
    pose((s, d) => d.setForagerTile(s, 24, 5));
    await e.advance(250);
    expect(e.state.predators[0].state).toBe("search");
    expect(e.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    expect(e.state.predators[0].searchPing).toBe(true);
    await e.advance(420);
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("locks through rock during the bloom and extinguishes it at acquisition", async () => {
    const { e, pose, play } = await setup();
    play();
    pose((s, d) => d.setForagerTile(s, 16, 5));
    pose((s, d) => d.addPredator(s, "flarefish", 16, 11));
    pose((s, d) => d.setPredatorTravel(s, 0, false));
    await e.advance(910);
    const p = e.state.predators[0];
    expect(p.state).toBe("chase");
    expect(p.alert).toBe(true);
    expect(p.flaring).toBe(false);
    expect(p.flareRadius).toBe(0);
  });
  it("never lights behind a rock and blacks out remembered terrain beyond a true circle", async () => {
    const { e, pose, play, canvas } = await setup();
    play();
    pose((s, d) => d.setMaze(s, hall));
    pose((s, d) => d.setForagerTile(s, 10, 5));
    await e.advance(1);
    expect(e.state.visibility[3][10]).toBe("u");
    expect(e.state.visibility[4][10]).toBe("l");
    pose((s, d) => d.setForagerTile(s, 1, 5));
    await e.advance(1);
    expect(e.state.visibility[5][10]).toBe("r");
    const pt = center(10, 5);
    expect([
      ...canvas.getContext("2d").getImageData(pt.x, pt.y, 1, 1).data,
    ]).toEqual([3, 6, 12, 255]);
  });
  it("keeps press edges across a frame that completes no simulation tick", async () => {
    const { e, pose, play, tap } = await setup(1000 / 480);
    play();
    pose((s, d) => d.setForagerTile(s, 1, 1));
    await tap("Space");
    expect(e.state.pulses).toHaveLength(0);
    await e.advance(3);
    expect(e.state.pulses).toHaveLength(1);
    expect(e.state.sonar.cooldown).toBe(C.SONAR_COOLDOWN);
  });
  it("does not spend cooldowns, animation, or den schedule during countdown", async () => {
    const { e, pose } = await setup();
    pose((s, d) => d.setScreen(s, "countdown"));
    pose((s, d) => d.setInkCooldown(s, 9));
    await e.advance(120);
    expect(e.state.ink.cooldown).toBe(9);
    expect(e.state.predators.every((p) => !p.released)).toBe(true);
    expect(e.state.playTime).toBe(0);
    expect(e.state.visibility.join("")).toContain("l");
  });
});

describe("poses", () => {
  it("poses selections, facings, flags and drifters independently", async () => {
    const { e, pose } = await setup();
    const initial = e.state;
    pose((s, d) => d.setMenuIndex(s, 1));
    pose((s, d) => d.setTitleIndex(s, 0));
    expect(e.state.menuIndex).toBe(1);
    expect(initial.menuIndex).toBe(0);
    pose((s, d) => d.setForagerDir(s, "right"));
    expect(e.state.forager.dir).toBe("right");
    expect(e.state.forager.moving).toBe(false);
    pose((s, d) => d.setPredatorDir(s, 0, "left"));
    pose((s, d) => d.setPredatorReleased(s, 0, true));
    pose((s, d) => d.setPredatorMind(s, 0, false));
    expect(e.state.predators[0].state).toBe("den");
    expect(e.state.predators[0].released).toBe(true);
    pose((s, d) => d.setPredatorTile(s, 0, 1, 1));
    pose((s, d) => d.setPredatorState(s, 0, "wander"));
    expect(e.state.predators[0].dir).toBe("left");
    expect(() => pose((s, d) => d.setPredatorState(s, 0, "den"))).toThrow();
    pose((s, d) => d.spawnDrifter(s, 5, 1));
    pose((s, d) => d.setDrifterTravel(s, 0, false));
    pose((s, d) => d.setDrifterMind(s, 0, false));
    pose((s, d) => d.clearPlankton(s));
    pose((s, d) => d.setScreen(s, "playing"));
    const body = e.state.predators[0],
      drifter = e.state.drifters[0];
    await e.advance(120);
    expect(e.state.predators[0].x).toBe(body.x);
    expect(e.state.predators[0].dir).toBe(body.dir);
    expect(e.state.drifters[0].x).toBe(drifter.x);
    pose((s, d) => d.clearDrifters(s));
    expect(e.state.drifters).toHaveLength(0);
    expect(e.debug.menuItemRect(e.state, 0)).toBeNull();
  });
  it("restarts and returns from the game-over and pause menus", async () => {
    const { e, pose, tap } = await setup();
    pose((s, d) => d.setScreen(s, "gameover"));
    await tap("Enter");
    expect(e.state.screen).toBe("countdown");
    pose((s, d) => d.setScreen(s, "paused"));
    pose((s, d) => d.setMenuIndex(s, 1));
    await tap("Enter");
    expect(e.state.screen).toBe("countdown");
    pose((s, d) => d.setScreen(s, "gameover"));
    await tap("Escape");
    expect(e.state.screen).toBe("title");
    pose((s, d) => d.setScreen(s, "gameover"));
    pose((s, d) => d.setMenuIndex(s, 1));
    await tap("Enter");
    expect(e.state.screen).toBe("title");
  });
  it("validates domains without imposing gameplay prerequisites", async () => {
    const { e, pose } = await setup();
    expect(() => pose((s, d) => d.setBrightness(s, 2))).toThrow();
    expect(() => pose((s, d) => d.setPredatorTravel(s, 9, false))).toThrow();
    expect(() => pose((s, d) => d.setMaze(s, ["bad"]))).toThrow();
    expect(() => pose((s, d) => d.setForagerTile(s, 0, 0))).toThrow();
    pose((s, d) => d.setDepth(s, 99));
    expect(e.state.predators).toHaveLength(6);
    expect(e.state.sonar.range).toBe(C.SONAR_RANGE_MIN);
    pose((s, d) => d.setSonarCooldown(s, 999));
    expect(e.state.sonar.cooldown).toBe(999);
    for (let i = 0; i < 4; i++) pose((s, d) => d.spawnDrifter(s, 1, 1));
    expect(e.state.drifters).toHaveLength(4);
  });
  it("reconciles without sensing and resets everything while retaining mute", async () => {
    const { e, pose, tap } = await setup();
    await tap("KeyM");
    pose((s, d) => d.clearFog(s));
    const before = e.state;
    pose((s, d) => d.reconcile(s));
    expect(e.state).toEqual(before);
    pose((s, d) => d.setScore(s, 999));
    pose((s, d) => d.setTitleIndex(s, 1));
    pose((s, d) => d.reset(s));
    expect(e.state.titleIndex).toBe(0);
    expect(e.state.score).toBe(0);
    expect(e.state.muted).toBe(true);
    expect(e.state.simTime).toBe(0);
    expect(e.state.visibility.every((r) => /^u+$/.test(r))).toBe(true);
  });
  it("accepts disconnected fixtures and holds closed bodies in place", async () => {
    const { e, pose, play } = await setup();
    play();
    const m = fixture({ 5: "#####.##" });
    pose((s, d) => d.setMaze(s, m));
    pose((s, d) => d.setForagerTile(s, 5, 5));
    pose((s, d) => d.addPredator(s, "gloamfin", 5, 5));
    pose((s, d) => d.setPredatorTile(s, 0, 5, 5));
    pose((s, d) => d.setForagerTile(s, 5, 5));
    pose((s, d) => d.clearPredators(s));
    pose((s, d) => d.setMaze(s, fixture({})));
    await e.advance(1);
    expect(open(e.state, 5, 5)).toBe(false);
    expect(e.state.forager.x).toBe(center(5, 5).x);
  });
});
