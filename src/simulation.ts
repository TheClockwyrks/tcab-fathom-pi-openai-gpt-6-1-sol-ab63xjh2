import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { menuItems, menuItemRect } from "./debug";
import type { FathomState, Predator, Pulse, ReadState } from "./types";
import {
  center,
  copy,
  directions,
  distance,
  distances,
  fresh,
  los,
  move,
  neighbor,
  open,
  opposite,
  put,
  reconcile,
  roster,
  route,
  screen,
  segmentDistance,
  wander,
} from "./world";
const dt = C.TICK_DT;
const down = (v: number) => (v <= dt + 1e-10 ? 0 : v - dt);
export function acquire(s: FathomState, p: Predator) {
  if (p.state !== "chase") {
    p.alertLeft = p.kind === "lanternjaw" ? 0 : C.ALERT_TIME;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    p.alert = p.alertLeft > 0;
  }
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.linger = C.LINGER_TIME;
  const next = route(s, p, p.fix);
  if (next === opposite(p.dir)) p.dir = next;
  if (p.kind === "flarefish") {
    if (p.flaring) p.flareFade = 0.35;
    p.flareAge = -1;
    p.flaring = false;
    p.flareCharging = false;
    p.flareRadius = 0;
  }
}
function drop(p: Predator) {
  if (p.state === "wander") return;
  p.state = "wander";
  p.fix = null;
  p.flareIn = C.FLARE_INTERVAL;
  p.flareAge = -1;
}
function cast(s: FathomState, owner: number | null, tint: Pulse["tint"]) {
  const b = owner === null ? s.forager : s.predators[owner];
  s.pulses.push({
    source: owner === null ? "forager" : "gloamfin",
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: owner === null ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    caught: false,
  });
}
export function lighting(s: FathomState) {
  const blooms = s.predators.filter((p) => p.flaring && p.state !== "den");
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const pt = center(x, y);
      const lit =
        (distance(pt, s.forager) <= s.visionRadius &&
          los(s, s.forager, pt, true)) ||
        blooms.some((p) => distance(p, pt) <= C.FLARE_RADIUS);
      const old = s.visibility[y][x];
      put(s.visibility, x, y, lit ? "l" : old === "u" ? "u" : "r");
    }
  for (const b of [...s.drifters, ...s.predators]) {
    b.lit =
      (distance(s.forager, b) <= s.visionRadius && los(s, s.forager, b)) ||
      blooms.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  }
  for (const p of s.predators) {
    p.alert = p.alertLeft > 0;
    p.lit =
      p.state !== "den" &&
      (p.lit || p.alert || (p.kind !== "lanternjaw" && p.mark > 0));
  }
}
function fronts(s: FathomState) {
  for (const pulse of s.pulses) {
    const prev = pulse.front;
    pulse.front += C.SONAR_WAVE_SPEED * dt;
    const ds = distances(s, pulse.ox, pulse.oy, true);
    const reached = (x: number, y: number) => {
      const v = ds.get(`${x},${y}`);
      return (
        v !== undefined &&
        v <= pulse.range &&
        v <= pulse.front &&
        (v > prev || (prev === 0 && v === 0))
      );
    };
    if (pulse.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (reached(x, y)) {
            put(s.visibility, x, y, "l");
            for (const d of directions) {
              const [nx, ny] = neighbor(s, x, y, d);
              if (s.tiles[ny]?.[nx] === "#") put(s.visibility, nx, ny, "l");
            }
          }
      for (const p of s.predators)
        if (p.state !== "den" && reached(p.tx, p.ty)) {
          if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
          if (p.kind === "gloamfin" && p.mind) acquire(s, p);
        }
    } else if (!pulse.caught && reached(s.forager.tx, s.forager.ty)) {
      const p = pulse.owner === null ? undefined : s.predators[pulse.owner];
      if (p?.mind && p.state !== "den") acquire(s, p);
      pulse.caught = true;
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
function hunters(s: FathomState, cues: Set<C.CueName>) {
  s.predators.forEach((p, i) => {
    p.mark = down(p.mark);
    p.flareFade = down(p.flareFade);
    p.alertLeft = down(p.alertLeft);
    if (
      p.state === "den" &&
      p.releaseAt !== null &&
      s.playTime + 1e-8 >= p.releaseAt
    )
      p.released = true;
    if (!p.mind) return;
    if (p.state === "den") {
      if (!s.tiles.some((r) => r.includes("d"))) return;
      if (p.releaseAt !== null && s.playTime + 1e-8 >= p.releaseAt)
        p.released = true;
      if (!p.released) return;
      const gy = s.tiles.findIndex((r) => r.includes("g"));
      if (gy < 0) return;
      const gx = s.tiles[gy].indexOf("g");
      const target = { tx: gx, ty: gy - 1 };
      if (p.travel) move(s, p, p.speed, () => route(s, p, target, true), true);
      if (s.tiles[p.ty]?.[p.tx] === ".") p.state = "wander";
      return;
    }
    if (p.kind === "gloamfin") {
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * dt) /
            C.GLOAMFIN_RAMP_TIME,
      );
      const was = p.hearingLock;
      p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
      if (p.hearingLock) acquire(s, p);
      p.pingIn = down(p.pingIn);
      p.sincePing += dt;
      if (p.state === "search") {
        p.searchTime += dt;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
      }
      const guaranteed =
        p.state === "search" &&
        p.searchTime >= C.GLOAMFIN_SEARCH_DELAY &&
        !p.searchPing;
      if (
        !p.hearingLock &&
        p.sincePing + 1e-8 >= C.GLOAMFIN_PING_MIN_GAP &&
        (p.pingIn === 0 || guaranteed || was)
      ) {
        cast(s, i, guaranteed ? "orange" : "violet");
        if (guaranteed) p.searchPing = true;
        p.pingIn = C.GLOAMFIN_PING_INTERVAL;
        p.sincePing = 0;
        cues.add(C.CUES.predatorPing);
      }
    } else {
      const blind = s.inkClouds.some(
        (c) => segmentDistance(c, p, s.forager) <= c.radius,
      );
      const sensed =
        !blind &&
        ((distance(p, s.forager) <= (p.detectRange ?? 0) &&
          los(s, p, s.forager)) ||
          (p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS));
      if (sensed) acquire(s, p);
      else if (blind) drop(p);
      else if (p.state === "chase") {
        p.linger = down(p.linger);
        if (p.linger === 0) drop(p);
      }
      if (p.kind === "flarefish") {
        if (p.state === "wander" && p.flareAge < 0) {
          p.flareIn = down(p.flareIn);
          if (p.flareIn === 0) p.flareAge = 0;
        }
        if (p.flareAge >= 0) {
          const previous = p.flareAge;
          p.flareAge += dt;
          if (previous < C.FLARE_CHARGE && p.flareAge >= C.FLARE_CHARGE)
            cues.add(C.CUES.flare);
          if (p.flareAge >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
            p.flareFade = 0.35;
            p.flareAge = -1;
            p.flareIn = C.FLARE_INTERVAL;
          }
        }
        p.flareCharging = p.flareAge >= 0 && p.flareAge < C.FLARE_CHARGE;
        p.flaring = p.flareAge >= C.FLARE_CHARGE;
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
      }
    }
    reconcile(s);
    if (p.travel) {
      const old = p.dir;
      move(s, p, p.speed, () => {
        if (p.state === "chase" && p.fix) return route(s, p, p.fix);
        if (
          p.state === "search" &&
          p.fix &&
          (distances(s, p.fix.tx, p.fix.ty).get(`${p.tx},${p.ty}`) ??
            Infinity) >= C.GLOAMFIN_SEARCH_ROAM
        )
          return route(s, p, p.fix);
        return wander(s, p);
      });
      if (
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        p.dir !== old &&
        p.dir !== opposite(old)
      )
        p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
    }
    if (
      p.kind === "gloamfin" &&
      p.state === "chase" &&
      p.fix &&
      p.tx === p.fix.tx &&
      p.ty === p.fix.ty &&
      !p.hearingLock &&
      (p.tx !== s.forager.tx || p.ty !== s.forager.ty)
    ) {
      p.state = "search";
      p.searchTime = 0;
      p.searchPing = false;
    }
  });
}
function attempt(s: FathomState) {
  Object.assign(s.forager, center(s.start.tx, s.start.ty), {
    moving: false,
    dir: "left",
  });
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.playTime = 0;
  screen(s, "countdown");
}
function freshDive(s: FathomState, title = false) {
  const n = fresh(s.assets, s.muted);
  n.simTime = s.simTime;
  n.accumulator = s.accumulator;
  n.titleIndex = s.titleIndex;
  screen(n, title ? "title" : "countdown");
  return n;
}
function menuInput(
  s: FathomState,
  edges: Set<string>,
  api: UpdateApi,
): FathomState {
  const original = s.screen;
  if (original === "paused" && (edges.has("pause") || edges.has("back"))) {
    screen(s, "playing");
    return s;
  }
  let confirm = edges.has("confirm");
  for (const sample of api.input.pointerSamples().filter((p) => p.primary)) {
    const index = menuItems(s).findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return (
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (index >= 0 && (sample.type === "move" || sample.type === "down"))
      s.menuIndex = index;
    if (sample.type === "down")
      s.pointerDown = original === "howto" ? -2 : index;
    if (sample.type === "up") {
      if (original === "howto" && s.pointerDown === -2) confirm = true;
      else if (index >= 0 && index === s.pointerDown) {
        s.menuIndex = index;
        confirm = true;
      }
      s.pointerDown = null;
    }
  }
  if (original === "howto") {
    if (confirm || edges.has("back")) return freshDive(s, true);
    return s;
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (edges.has("up"))
    s.menuIndex = ((s.menuIndex ?? 0) + items.length - 1) % items.length;
  if (edges.has("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % items.length;
  if (edges.has("back") && original === "gameover") return freshDive(s, true);
  if (!confirm) return s;
  const i = s.menuIndex;
  if (original === "title") {
    s.titleIndex = i ?? 0;
    if (i === 1) screen(s, "howto");
    else return freshDive(s);
  } else if (original === "paused") {
    if (i === 0) screen(s, "playing");
    else return freshDive(s, i === 2);
  } else if (original === "gameover") return freshDive(s, i === 1);
  return s;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  elapsed: number,
): FathomState {
  let s = copy(state);
  const edges = new Set(C.ACTIONS.filter((a) => api.input.pressed(a)));
  if (edges.has("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  const prior = s.screen;
  if (s.screen === "playing" && edges.has("pause")) screen(s, "paused");
  else s = menuInput(s, edges, api);
  if (s.screen === "playing" && prior === "playing") {
    s.pendingSonar ||= edges.has("a");
    s.pendingInk ||= edges.has("b");
  } else {
    s.pendingSonar = false;
    s.pendingInk = false;
  }
  const held = directions.filter((d) => api.input.value(d) > 0);
  if (s.playTime === 0 && held.length) s.desired = held[held.length - 1];
  for (const d of held) if (edges.has(d)) s.desired = d;
  s.accumulator += elapsed;
  while (s.accumulator + 1e-10 >= dt) {
    s.accumulator = Math.max(0, s.accumulator - dt);
    s.simTime += dt;
    s.screenTime += dt;
    const cues = new Set<C.CueName>();
    const sonar = s.pendingSonar,
      ink = s.pendingInk;
    s.pendingSonar = false;
    s.pendingInk = false;
    if (s.screen === "countdown") {
      lighting(reconcile(s));
      if (s.screenTime + 1e-10 >= 1.8) screen(s, "playing");
    } else if (s.screen === "cleared" && s.screenTime + 1e-10 >= 1.8) {
      const depth = s.depth + 1;
      const n = fresh(s.assets, s.muted);
      n.score = s.score;
      n.lives = s.lives;
      n.depth = depth;
      n.predators = roster(depth);
      n.titleIndex = s.titleIndex;
      n.simTime = s.simTime;
      n.accumulator = s.accumulator;
      screen(n, "countdown");
      s = reconcile(n);
    } else if (s.screen === "playing") {
      s.playTime += dt;
      s.sonar.cooldown = down(s.sonar.cooldown);
      s.ink.cooldown = down(s.ink.cooldown);
      if (sonar && s.sonar.cooldown === 0) {
        cast(s, null, "cyan");
        s.sonar.cooldown = C.SONAR_COOLDOWN;
        cues.add(C.CUES.sonar);
      }
      if (ink && s.ink.cooldown === 0) {
        s.inkClouds.push({
          x: s.forager.x,
          y: s.forager.y,
          radius: C.INK_RADIUS,
          remaining: C.INK_LIFE,
        });
        s.ink.cooldown = C.INK_COOLDOWN;
        cues.add(C.CUES.ink);
      }
      const decay = Math.max(0, dt - s.brightHold);
      s.brightHold = down(s.brightHold);
      s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
      const f = s.forager;
      if (held.length) {
        if (s.desired === opposite(f.dir)) f.dir = s.desired;
        f.moving = move(s, f, C.FORAGER_SPEED, () =>
          open(s, ...neighbor(s, f.tx, f.ty, s.desired)) ? s.desired : f.dir,
        );
      } else f.moving = false;
      if (s.tiles[f.ty]?.[f.tx] === "." && s.plankton[f.ty][f.tx] === "*") {
        put(s.plankton, f.tx, f.ty, "-");
        s.planktonRemaining--;
        s.score += C.SCORE_PLANKTON;
        s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
        s.brightHold = C.BRIGHT_HOLD;
        cues.add(C.CUES.eat);
        if (s.planktonRemaining === 0) {
          s.score += C.SCORE_CLEAR;
          screen(s, "cleared");
          cues.add(C.CUES.descend);
        }
      }
      if (s.screen === "playing") {
        reconcile(s);
        hunters(s, cues);
        for (const b of s.drifters)
          if (b.mind && b.travel)
            move(
              s,
              b,
              C.DRIFTER_SPEED,
              () => wander(s, b),
              s.tiles[b.ty]?.[b.tx] === "g",
            );
        s.drifters = s.drifters.filter((b) => {
          if (b.tx === f.tx && b.ty === f.ty) {
            s.score += C.SCORE_DRIFTER;
            return false;
          }
          return true;
        });
        s.drifterIn = down(s.drifterIn);
        if (
          s.drifterIn === 0 &&
          s.drifters.length < C.DRIFTER_MAX &&
          s.planktonRemaining > 0
        ) {
          const gy = s.tiles.findIndex((r) => r.includes("g"));
          if (gy >= 0) {
            const gx = s.tiles[gy].indexOf("g");
            s.drifters.push({
              ...center(gx, gy),
              dir: "up",
              lit: false,
              mind: true,
              travel: true,
            });
            s.drifterIn = C.DRIFTER_INTERVAL;
          }
        }
        s.inkClouds = s.inkClouds
          .map((c) => ({ ...c, remaining: down(c.remaining) }))
          .filter((c) => c.remaining > 0);
        lighting(reconcile(s));
        fronts(s);
        for (const p of s.predators)
          if (p.state !== "den" && p.kind !== "lanternjaw" && p.mark > 0)
            p.lit = true;
        if (
          s.predators.some(
            (p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty,
          )
        ) {
          cues.add(C.CUES.caught);
          if (s.lives > 0) {
            s.lives--;
            attempt(s);
          } else screen(s, "gameover");
        }
      }
    }
    for (const cue of cues) api.audio.play(cue);
  }
  return reconcile(s);
}
