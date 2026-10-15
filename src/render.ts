import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { Direction, ReadState } from "./types";
import { center, directions, distances, neighbor } from "./world";
import { menuItems, menuItemRect } from "./debug";
export const BACKGROUND = "#03060c";
const cyan = "#8cf5e5",
  dim = "#507c84",
  white = "#d2eee8",
  amber = "#ff986d";
const mono = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
function text(
  ctx: CanvasRenderingContext2D,
  v: string,
  x: number,
  y: number,
  size = 16,
  color = white,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${mono}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(v, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  xx: number,
  yy: number,
  color = dim,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(xx, yy);
  ctx.stroke();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "#00000000");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function image(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  sheet: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const img = s.assets[sheet]?.[frame];
  if (img)
    ctx.drawImage(img as ImageBitmap, x - size / 2, y - size / 2, size, size);
}
function pair(dir: Direction) {
  return { down: 0, up: 2, left: 4, right: 6 }[dir];
}
function terrain(s: ReadState, ctx: CanvasRenderingContext2D, all = false) {
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const vis = s.visibility[y][x];
      if (!all && vis === "u") continue;
      const c = s.tiles[y][x];
      let frame = c === "g" ? 18 : 16;
      if (c === "#") {
        frame = 0;
        directions.forEach((d, i) => {
          const [nx, ny] = neighbor(s, x, y, d);
          if (s.tiles[ny]?.[nx] === "#") frame += 1 << i;
        });
      }
      const p = center(x, y);
      ctx.globalAlpha = all ? 0.25 : vis === "l" ? 1 : 0.24;
      image(s, ctx, "trench-walls", frame, p.x, p.y);
      if (s.plankton[y][x] === "*") {
        ctx.fillStyle = cyan;
        ctx.shadowColor = cyan;
        ctx.shadowBlur = vis === "l" ? 9 : 0;
        circle(ctx, p.x, p.y, C.PLANKTON_DOT / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  ctx.globalAlpha = 1;
}
function amberMote(ctx: CanvasRenderingContext2D, x: number, y: number) {
  glow(ctx, x, y, 22, "#ff6a322f");
  ctx.fillStyle = amber;
  ctx.shadowColor = "#ff6940";
  ctx.shadowBlur = 10;
  circle(ctx, x, y, 3);
  ctx.fill();
  ctx.shadowBlur = 0;
}
function mazeView(s: ReadState, ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  // The supplied fog frame is featureless, so one stretched blit is exactly
  // equivalent to tiling it, including outside the moving vision window.
  const fog = s.assets["trench-walls"]?.[17];
  if (fog)
    ctx.drawImage(
      fog as ImageBitmap,
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
  ctx.save();
  circle(ctx, s.forager.x, s.forager.y, s.windowRadius);
  ctx.clip();
  terrain(s, ctx);
  glow(ctx, s.forager.x, s.forager.y, s.windowRadius, "#1ab8b317");
  for (const b of [
    ...s.drifters,
    ...s.predators.filter((p) => p.kind === "lanternjaw" && p.state !== "den"),
  ])
    amberMote(ctx, b.x, b.y);
  ctx.restore();
  for (const p of s.predators.filter((p) => p.flaring)) {
    ctx.save();
    circle(ctx, p.x, p.y, C.FLARE_RADIUS);
    ctx.clip();
    terrain(s, ctx);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  for (const disc of [
    { ...s.forager, radius: s.windowRadius },
    ...s.predators
      .filter((p) => p.flaring)
      .map((p) => ({ ...p, radius: C.FLARE_RADIUS })),
  ]) {
    ctx.moveTo(disc.x + disc.radius, disc.y);
    ctx.arc(disc.x, disc.y, disc.radius, 0, Math.PI * 2);
  }
  ctx.clip();
  for (const c of s.inkClouds) {
    glow(ctx, c.x, c.y, c.radius, "#000106ef");
    ctx.strokeStyle = "#122b39";
    ctx.lineWidth = 1;
    circle(ctx, c.x, c.y, c.radius);
    ctx.stroke();
  }
  ctx.restore();
  for (const pulse of s.pulses) {
    const ds = distances(s, pulse.ox, pulse.oy, true);
    const color =
      pulse.tint === "cyan"
        ? cyan
        : pulse.tint === "violet"
          ? "#c19cff"
          : "#ff9e5b";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    for (const [key, n] of ds) {
      if (n > pulse.front || n < pulse.front - 1 || n > pulse.range) continue;
      const [x, y] = key.split(",").map(Number);
      const pt = center(x, y);
      const t = pulse.front - n;
      ctx.globalAlpha = (1 - t) * 0.15;
      ctx.fillRect(pt.x - 14, pt.y - 14, 28, 28);
      for (const d of directions) {
        const [nx, ny] = neighbor(s, x, y, d);
        if (ds.get(`${nx},${ny}`) !== n + 1) continue;
        const v = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[
          d
        ];
        const px = pt.x + v[0] * t * C.TILE,
          py = pt.y + v[1] * t * C.TILE;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - v[1] * 12, py + v[0] * 12);
        ctx.lineTo(px + v[1] * 12, py - v[0] * 12);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  for (const b of s.drifters)
    if (b.lit)
      image(s, ctx, "drifter", Math.floor(s.playTime * 8) % 8, b.x, b.y);
  for (const p of s.predators) {
    if (p.state === "den") continue;
    if (p.kind === "flarefish" && p.flareAge >= 0) {
      const charge = p.flareCharging;
      const f = charge
        ? Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3))
        : 3 +
          Math.min(
            2,
            Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
          );
      image(s, ctx, "flare-bloom", f, p.x, p.y, C.FLARE_RADIUS * 2);
    }
    if (p.flareFade > 0) {
      ctx.globalAlpha = p.flareFade / 0.35;
      image(
        s,
        ctx,
        "flare-bloom",
        p.flareFade > 0.175 ? 6 : 7,
        p.x,
        p.y,
        C.FLARE_RADIUS * 2,
      );
      ctx.globalAlpha = 1;
    }
    if (p.lit) {
      ctx.globalAlpha =
        p.mark > 0 && !p.alert ? Math.max(0.5, p.mark / C.SONAR_MARK_TIME) : 1;
      const f =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.playTime * 8) % 8)
          : pair(p.dir) + (Math.floor(s.playTime * 7) % 2);
      image(s, ctx, p.kind, f, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (p.alert) {
      const t = 1 - p.alertLeft / C.ALERT_TIME;
      ctx.strokeStyle = p.kind === "gloamfin" ? "#c19cff" : amber;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - t;
      circle(ctx, p.x, p.y, 18 + t * 32);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(a) * 20,
          p.y + Math.sin(a) * 20,
          p.x + Math.cos(a) * (30 + t * 35),
          p.y + Math.sin(a) * (30 + t * 35),
          ctx.strokeStyle,
        );
      }
      ctx.globalAlpha = 1;
    }
  }
  glow(ctx, s.forager.x, s.forager.y, 44, "#68ffe53a");
  image(
    s,
    ctx,
    "glimmerfin",
    pair(s.forager.dir) +
      (s.forager.moving ? Math.floor(s.playTime * 9) % 2 : 0),
    s.forager.x,
    s.forager.y,
  );
  ctx.restore();
  ctx.strokeStyle = "#193039";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    C.GRID_ORIGIN_X - 1,
    C.GRID_ORIGIN_Y - 1,
    C.GRID_COLS * C.TILE + 2,
    C.GRID_ROWS * C.TILE + 2,
  );
  for (
    let x = C.GRID_ORIGIN_X;
    x <= C.GRID_ORIGIN_X + C.GRID_COLS * C.TILE;
    x += C.TILE * 3
  ) {
    line(ctx, x, 74, x, 78, "#25454c");
    line(ctx, x, 659, x, 663, "#25454c");
  }
  text(ctx, "N", 39, 96, 11, dim);
  text(ctx, "↓", 39, 118, 15, dim);
}
function gauge(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  v: number,
  color: string,
) {
  text(ctx, label, x, 681, 12, dim);
  ctx.fillStyle = "#132731";
  ctx.fillRect(x, 693, 160, 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, 693, 160 * Math.max(0, Math.min(1, v)), 4);
  text(
    ctx,
    v >= 1 ? "READY" : "RECHARGING",
    x + 170,
    697,
    11,
    v >= 1 ? color : dim,
  );
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D) {
  text(ctx, C.TITLE_TEXT, 64, 31, 16, cyan);
  text(ctx, `${C.DIVE_LABEL} / DEEP-SEA SURVEY`, 64, 53, 11, dim);
  text(ctx, String(s.score).padStart(6, "0"), 640, 56, 48, white, "center");
  text(ctx, "PLANKTON", 1216, 27, 11, dim, "right");
  text(
    ctx,
    String(s.planktonRemaining).padStart(3, "0"),
    1216,
    55,
    24,
    cyan,
    "right",
  );
  text(ctx, `DEPTH ${s.depth}`, 64, 696, 18, white);
  for (let i = 0; i < s.lives; i++)
    image(s, ctx, "glimmerfin", 6, 216 + i * 29, 689, 24);
  gauge(
    ctx,
    "SPACE / SONAR",
    430,
    1 - s.sonar.cooldown / C.SONAR_COOLDOWN,
    cyan,
  );
  gauge(
    ctx,
    "SHIFT / INK",
    770,
    1 - s.ink.cooldown / C.INK_COOLDOWN,
    "#a2aedb",
  );
  text(ctx, s.muted ? "M / MUTED" : "M / SOUND", 1216, 696, 11, dim, "right");
}
function surround(ctx: CanvasRenderingContext2D, s: ReadState) {
  for (let i = 0; i < 75; i++) {
    const x = (i * 173 + 71) % C.STAGE_W,
      y = (i * 97 + 31) % C.STAGE_H;
    ctx.fillStyle = i % 5 === 0 ? "#446a703f" : "#24495130";
    circle(ctx, x, y, i % 4 === 0 ? 1.4 : 0.7);
    ctx.fill();
  }
  text(ctx, "F / 01", 64, 49, 12, dim);
  text(ctx, "ABYSSAL FIELD NOTES", 1216, 49, 12, dim, "right");
  line(ctx, 64, 65, 1216, 65, "#173038");
  text(ctx, "36° N   /   NO SURFACE SIGNAL", 64, 683, 11, dim);
  text(ctx, "M / SOUND     ·     ↵ / SELECT", 1216, 683, 11, dim, "right");
  // Bathymetric rings, deliberately still: only the diver carries light.
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = "#16434b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(640, 310, 200 + i * 56, 100 + i * 36, -0.12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, 640, 290, 340, "#07535730");
  void s;
}
function menus(s: ReadState, ctx: CanvasRenderingContext2D) {
  menuItems(s).forEach((label, i) => {
    const r = menuItemRect(s, i)!;
    const selected = i === s.menuIndex;
    ctx.fillStyle = selected ? "#102e35" : "#06131a";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? "#62cabc" : "#19353f";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (selected) {
      ctx.fillStyle = cyan;
      ctx.fillRect(r.x, r.y, 3, r.h);
      text(ctx, "›", r.x + 22, r.y + 32, 24, cyan);
    }
    text(
      ctx,
      label,
      r.x + r.w / 2,
      r.y + 31,
      17,
      selected ? cyan : dim,
      "center",
    );
    text(
      ctx,
      `0${i + 1}`,
      r.x + r.w - 21,
      r.y + 30,
      10,
      selected ? cyan : dim,
      "right",
    );
  });
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (["playing", "paused", "countdown", "cleared"].includes(s.screen)) {
    mazeView(s, ctx);
    hud(s, ctx);
    if (s.screen === "playing") {
      text(ctx, "WASD / SWIM     ·     P / PAUSE", 640, 714, 10, dim, "center");
      return;
    }
    if (s.screen === "countdown" || s.screen === "cleared") {
      ctx.fillStyle = "#02090eb5";
      ctx.fillRect(400, 285, 480, 145);
      text(
        ctx,
        s.screen === "countdown" ? "DIVE" : `DEPTH ${s.depth} CLEARED`,
        640,
        345,
        36,
        cyan,
        "center",
      );
      text(
        ctx,
        s.screen === "countdown"
          ? `${Math.max(1, Math.ceil(1.8 - s.screenTime))}  /  INTO THE DARK`
          : `+${C.SCORE_CLEAR}  ·  DESCENDING`,
        640,
        385,
        14,
        dim,
        "center",
      );
      return;
    }
    ctx.fillStyle = "#02090ed9";
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    text(ctx, "HOLDING DEPTH", 640, 280, 13, dim, "center");
    text(ctx, "PAUSED", 640, 347, 56, white, "center");
    menus(s, ctx);
    return;
  }
  surround(ctx, s);
  if (s.screen === "title") {
    text(
      ctx,
      "B I O L U M I N E S C E N T   S U R V I V A L",
      640,
      176,
      12,
      dim,
      "center",
    );
    ctx.shadowColor = "#40e7d36f";
    ctx.shadowBlur = 28;
    text(ctx, C.TITLE_TEXT, 640, 288, 112, white, "center");
    ctx.shadowBlur = 0;
    text(ctx, C.TAGLINE_TEXT.split("").join(" "), 640, 332, 16, cyan, "center");
    line(ctx, 570, 365, 710, 365, "#32736f");
    menus(s, ctx);
    image(s, ctx, "glimmerfin", 6, 299, 437, 64);
    glow(ctx, 299, 437, 80, "#62ffcf22");
    text(ctx, "THE FORAGER", 299, 500, 11, dim, "center");
    text(ctx, "Your light is a lifeline.", 299, 528, 12, white, "center");
    text(ctx, "And an invitation.", 299, 548, 12, dim, "center");
    amberMote(ctx, 981, 436);
    text(ctx, "AN AMBER GLIMMER", 981, 500, 11, dim, "center");
    text(ctx, "A meal. Or a mouth.", 981, 528, 12, white, "center");
    text(ctx, "Get closer to find out.", 981, 548, 12, dim, "center");
    text(ctx, "GRAZE   /   LISTEN   /   VANISH", 640, 600, 11, dim, "center");
  } else if (s.screen === "gameover") {
    text(ctx, "SIGNAL LOST", 640, 219, 16, amber, "center");
    text(ctx, "THE DEEP KEEPS YOU", 640, 291, 46, white, "center");
    text(
      ctx,
      `${String(s.score).padStart(6, "0")} POINTS   /   DEPTH ${s.depth}`,
      640,
      350,
      22,
      cyan,
      "center",
    );
    menus(s, ctx);
  } else {
    text(ctx, "FIELD GUIDE", 90, 125, 12, cyan);
    text(ctx, "Learn the dark.", 90, 177, 46, white);
    const rows = [
      [
        "01  SWIM",
        "Arrow keys / WASD",
        "Hold to swim. Release to stop. Turns wait for a junction.",
      ],
      [
        "02  LISTEN",
        "Space / sonar",
        "Flood the corridors. Remember the rock. Sound attracts Gloamfins.",
      ],
      [
        "03  VANISH",
        "Shift / ink",
        "Break the light hunters’ sight. Sound still gets through.",
      ],
    ];
    rows.forEach(([n, k, d], i) => {
      const y = 236 + i * 94;
      text(ctx, n, 90, y, 16, cyan);
      text(ctx, k, 90, y + 25, 13, white);
      text(ctx, d, 90, y + 48, 12, dim);
    });
    const ps = [
      [
        "lanternjaw",
        "LANTERNJAW",
        "Follows your light. That amber jelly may have teeth.",
      ],
      [
        "gloamfin",
        "GLOAMFIN",
        "Hears through rock. Violet pings listen; orange pings search.",
      ],
      [
        "flarefish",
        "FLAREFISH",
        "Hunts your glow. A warm charge warns of its revealing flare.",
      ],
    ];
    ps.forEach(([sheet, name, desc], i) => {
      const y = 240 + i * 94;
      image(s, ctx, sheet, 0, 770, y + 6, 48);
      text(ctx, name, 810, y, 16, sheet === "gloamfin" ? "#c19cff" : amber);
      const words = desc.split(". ");
      words.forEach((t, j) => text(ctx, t, 810, y + 25 + j * 20, 11, dim));
    });
    line(ctx, 90, 534, 1190, 534, "#1b3e47");
    text(
      ctx,
      "Eat plankton to grow your light. Clear every mote to descend.",
      90,
      568,
      15,
      white,
    );
    text(
      ctx,
      "Explored ground stays in memory — but only inside your circle. Outside it: nothing.",
      90,
      597,
      13,
      dim,
    );
    text(
      ctx,
      "P / PAUSE    M / MUTE     ·     ENTER, ESC OR TAP TO RETURN",
      640,
      642,
      12,
      cyan,
      "center",
    );
  }
}
