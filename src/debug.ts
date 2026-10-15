import * as C from "./constants";
import type {
  Direction,
  FathomDebugApi,
  FathomState,
  Predator,
  ReadState,
} from "./types";
import {
  center,
  copy,
  fresh,
  layer,
  open,
  predator,
  put,
  reconcile,
  roster,
  screen,
} from "./world";
export const menuItems = (s: ReadState) =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export function menuItemRect(s: ReadState, i: number) {
  return Number.isInteger(i) && i >= 0 && i < menuItems(s).length
    ? { x: 470, y: 410 + i * 62, w: 340, h: 50 }
    : null;
}
function assert(v: unknown, message = "Invalid debug argument"): asserts v {
  if (!v) throw new RangeError(message);
}
function num(v: number, min = 0, max = Infinity, integer = false) {
  assert(
    Number.isFinite(v) &&
      v >= min &&
      v <= max &&
      (!integer || Number.isInteger(v)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  num(x, 0, C.GRID_COLS - 1, true);
  num(y, 0, C.GRID_ROWS - 1, true);
  assert(open(s, x, y, den), "Tile is closed");
}
function dir(d: Direction) {
  assert(["up", "down", "left", "right"].includes(d));
}
function pose(s: ReadState, fn: (n: FathomState) => void) {
  const n = copy(s);
  fn(n);
  return reconcile(n);
}
function pred(
  s: ReadState,
  i: number,
  fn: (p: Predator, n: FathomState) => void,
) {
  num(i, 0, s.predators.length - 1, true);
  return pose(s, (n) => fn(n.predators[i], n));
}
function drifterFlag(
  s: ReadState,
  i: number,
  v: boolean,
  key: "mind" | "travel",
) {
  num(i, 0, s.drifters.length - 1, true);
  assert(typeof v === "boolean");
  return pose(s, (n) => {
    n.drifters[i][key] = v;
  });
}
export const debug: FathomDebugApi = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s) => fresh(s.assets as FathomState["assets"], s.muted),
  snapshot: (s) => {
    const n = copy(s);
    const {
      assets: _a,
      accumulator: _b,
      screenTime: _c,
      playTime: _d,
      seed: _e,
      desired: _f,
      start: _g,
      pointerDown: _h,
      pendingSonar: _i,
      pendingInk: _j,
      ...rest
    } = n;
    void [_a, _b, _c, _d, _e, _f, _g, _h, _i, _j];
    return {
      ...rest,
      drifters: n.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: n.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: n.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
    };
  },
  reconcile: (s) => reconcile(copy(s)),
  setScreen: (s, v) => {
    assert(
      [
        "title",
        "howto",
        "countdown",
        "playing",
        "paused",
        "cleared",
        "gameover",
      ].includes(v),
    );
    return pose(s, (n) => screen(n, v));
  },
  setMenuIndex: (s, v) => {
    num(v, 0, menuItems(s).length - 1, true);
    return pose(s, (n) => {
      n.menuIndex = v;
    });
  },
  setTitleIndex: (s, v) => {
    num(v, 0, C.TITLE_ITEMS.length - 1, true);
    return pose(s, (n) => {
      n.titleIndex = v;
    });
  },
  menuItemRect,
  setScore: (s, v) => {
    num(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.score = v;
    });
  },
  setLives: (s, v) => {
    num(v, 0, Infinity, true);
    return pose(s, (n) => {
      n.lives = v;
    });
  },
  setDepth: (s, v) => {
    num(v, 1, Infinity, true);
    return pose(s, (n) => {
      n.depth = v;
      n.predators = roster(v);
    });
  },
  setMaze: (s, rows) => {
    assert(
      rows.length === C.GRID_ROWS &&
        rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
    );
    const str = rows.join("");
    assert(!/[dg]/.test(str) || str.split("g").length === 2);
    return pose(s, (n) => {
      n.tiles = [...rows];
    });
  },
  setPlankton: (s, x, y, p) => {
    tile(s, x, y);
    assert(typeof p === "boolean");
    return pose(s, (n) => put(n.plankton, x, y, p ? "*" : "-"));
  },
  clearPlankton: (s) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s) =>
    pose(s, (n) => {
      n.visibility = layer("u");
    }),
  setForagerTile: (s, x, y) => {
    tile(s, x, y);
    return pose(s, (n) => {
      Object.assign(n.forager, center(x, y), { moving: false });
    });
  },
  setForagerDir: (s, d) => {
    dir(d);
    return pose(s, (n) => {
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    });
  },
  setBrightness: (s, v) => {
    num(v, 0, 1);
    return pose(s, (n) => {
      n.brightness = v;
    });
  },
  setBrightHold: (s, v) => {
    num(v, 0, C.BRIGHT_HOLD);
    return pose(s, (n) => {
      n.brightHold = v;
    });
  },
  clearPredators: (s) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s, k, x, y) => {
    assert(C.DEN_ORDER.includes(k));
    tile(s, x, y);
    return pose(s, (n) => {
      n.predators.push(predator(k, x, y));
    });
  },
  setPredatorTile: (s, i, x, y) => {
    tile(s, x, y, true);
    return pred(s, i, (p) => {
      Object.assign(p, center(x, y));
    });
  },
  setPredatorDir: (s, i, d) => {
    dir(d);
    return pred(s, i, (p) => {
      p.dir = d;
    });
  },
  setPredatorState: (s, i, v) =>
    pred(s, i, (p, n) => {
      assert(["den", "wander", "chase"].includes(v));
      assert(
        v === "den"
          ? ["d", "g"].includes(n.tiles[p.ty][p.tx])
          : n.tiles[p.ty][p.tx] === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.alert = false;
      p.alertLeft = 0;
      p.hearingLock = p.kind === "gloamfin" ? false : null;
    }),
  setPredatorReleased: (s, i, v) => {
    assert(typeof v === "boolean");
    return pred(s, i, (p) => {
      p.released = v;
    });
  },
  setPredatorMind: (s, i, v) => {
    assert(typeof v === "boolean");
    return pred(s, i, (p) => {
      p.mind = v;
    });
  },
  setPredatorTravel: (s, i, v) => {
    assert(typeof v === "boolean");
    return pred(s, i, (p) => {
      p.travel = v;
    });
  },
  spawnDrifter: (s, x, y) => {
    tile(s, x, y);
    return pose(s, (n) => {
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    });
  },
  clearDrifters: (s) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s, i, v) => drifterFlag(s, i, v, "mind"),
  setDrifterTravel: (s, i, v) => drifterFlag(s, i, v, "travel"),
  setDrifterIn: (s, v) => {
    num(v, 0, C.DRIFTER_INTERVAL);
    return pose(s, (n) => {
      n.drifterIn = v;
    });
  },
  setSonarCooldown: (s, v) => {
    num(v);
    return pose(s, (n) => {
      n.sonar.cooldown = v;
    });
  },
  setInkCooldown: (s, v) => {
    num(v);
    return pose(s, (n) => {
      n.ink.cooldown = v;
    });
  },
};
