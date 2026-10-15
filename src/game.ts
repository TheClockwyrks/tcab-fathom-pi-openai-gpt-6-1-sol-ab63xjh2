import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { FathomState, FathomDebugApi } from "./types";
import { debug } from "./debug";
import { fresh } from "./world";
import { update } from "./simulation";
import { render } from "./render";
export * from "./types";
export { BACKGROUND } from "./render";
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const tones = [880, 420, 90, 260, 140, 180, 660];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 2 ? "triangle" : "sine",
        freq: tones[i],
        freqTo: tones[i] * (i % 2 ? 0.35 : 1.8),
        durationMs: 70 + i * 34,
        gain: 0.09,
      }),
    );
    const sheets: Record<string, number> = {
      glimmerfin: 8,
      lanternjaw: 16,
      gloamfin: 8,
      flarefish: 8,
      drifter: 8,
      "flare-bloom": 8,
      "trench-walls": 19,
    };
    const assets = Object.fromEntries(
      await Promise.all(
        Object.entries(sheets).map(async ([name, n]) => [
          name,
          await Promise.all(
            Array.from({ length: n }, (_, i) =>
              api.assets.loadImage(`${name}/${i}.png`),
            ),
          ),
        ]),
      ),
    );
    api.diagnostics.register(
      "dive",
      (s) =>
        `${s.screen} / depth ${s.depth} / ${s.score} pts / ${s.lives} lives`,
    );
    api.diagnostics.register(
      "senses",
      (s) =>
        `G ${s.brightness.toFixed(2)} V ${s.visionRadius.toFixed(0)} R ${s.windowRadius.toFixed(0)}`,
    );
    api.diagnostics.register(
      "tools",
      (s) =>
        `sonar ${s.sonar.cooldown.toFixed(2)} ink ${s.ink.cooldown.toFixed(2)} plankton ${s.planktonRemaining}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.ROSTER_CAP * C.DEN_ORDER.length; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(0)} alert ${p.alert}`
          : "—";
      });
    return [fresh(assets), debug];
  },
  update,
  render,
};
