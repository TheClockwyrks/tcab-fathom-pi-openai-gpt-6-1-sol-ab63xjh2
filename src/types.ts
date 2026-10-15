import type { DeepReadonly } from "ts-essentials";
import type { PredatorKind } from "./constants";
export type { PredatorKind } from "./constants";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Forager extends Body {
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  chaseSpeed: number;
  flareIn: number;
  flareAge: number;
  flareFade: number;
  releaseAt: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export type PredatorSnapshot = Pick<
  Predator,
  | "kind"
  | "x"
  | "y"
  | "tx"
  | "ty"
  | "dir"
  | "state"
  | "released"
  | "mind"
  | "travel"
  | "speed"
  | "alert"
  | "lit"
  | "detectRange"
  | "hearingRange"
  | "hearingLock"
  | "flareCharging"
  | "flaring"
  | "flareRadius"
>;
export type DrifterSnapshot = Pick<
  Drifter,
  "x" | "y" | "tx" | "ty" | "lit" | "mind" | "travel"
>;
export type PulseSnapshot = Pick<
  Pulse,
  "source" | "tint" | "ox" | "oy" | "front" | "range"
>;
export interface Snapshot {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Forager;
  drifters: DrifterSnapshot[];
  predators: PredatorSnapshot[];
  pulses: PulseSnapshot[];
  inkClouds: InkCloud[];
  simTime: number;
}
export interface FathomState extends Snapshot {
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  assets: Record<string, ImageBitmap[]>;
  accumulator: number;
  screenTime: number;
  playTime: number;
  seed: number;
  desired: Direction;
  start: { tx: number; ty: number };
  pointerDown: number | null;
  pendingSonar: boolean;
  pendingInk: boolean;
}
export type ReadState = DeepReadonly<FathomState>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FathomDebugApi {
  version: number;
  reset(s: ReadState): FathomState;
  snapshot(s: ReadState): Snapshot;
  reconcile(s: ReadState): FathomState;
  setScreen(s: ReadState, v: Screen): FathomState;
  setMenuIndex(s: ReadState, v: number): FathomState;
  setTitleIndex(s: ReadState, v: number): FathomState;
  menuItemRect(s: ReadState, i: number): Rect | null;
  setScore(s: ReadState, v: number): FathomState;
  setLives(s: ReadState, v: number): FathomState;
  setDepth(s: ReadState, v: number): FathomState;
  setMaze(s: ReadState, rows: readonly string[]): FathomState;
  setPlankton(s: ReadState, x: number, y: number, p: boolean): FathomState;
  clearPlankton(s: ReadState): FathomState;
  clearFog(s: ReadState): FathomState;
  setForagerTile(s: ReadState, x: number, y: number): FathomState;
  setForagerDir(s: ReadState, d: Direction): FathomState;
  setBrightness(s: ReadState, v: number): FathomState;
  setBrightHold(s: ReadState, v: number): FathomState;
  clearPredators(s: ReadState): FathomState;
  addPredator(s: ReadState, k: PredatorKind, x: number, y: number): FathomState;
  setPredatorTile(s: ReadState, i: number, x: number, y: number): FathomState;
  setPredatorDir(s: ReadState, i: number, d: Direction): FathomState;
  setPredatorState(
    s: ReadState,
    i: number,
    v: "den" | "wander" | "chase",
  ): FathomState;
  setPredatorReleased(s: ReadState, i: number, v: boolean): FathomState;
  setPredatorMind(s: ReadState, i: number, v: boolean): FathomState;
  setPredatorTravel(s: ReadState, i: number, v: boolean): FathomState;
  spawnDrifter(s: ReadState, x: number, y: number): FathomState;
  clearDrifters(s: ReadState): FathomState;
  setDrifterMind(s: ReadState, i: number, v: boolean): FathomState;
  setDrifterTravel(s: ReadState, i: number, v: boolean): FathomState;
  setDrifterIn(s: ReadState, v: number): FathomState;
  setSonarCooldown(s: ReadState, v: number): FathomState;
  setInkCooldown(s: ReadState, v: number): FathomState;
}
