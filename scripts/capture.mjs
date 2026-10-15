/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";

// Capture the real renderer with a counted clock. No production global is added.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto("http://localhost:5173");
  await page.waitForTimeout(500);
  await mkdir("showcase", { recursive: true });
  await page.screenshot({ path: "showcase/title.png" });
  const recording = await page.evaluate(async () => {
    const { createEngine, ConstantClock } =
      await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
    const { game, BACKGROUND } = await import("/src/game.ts");
    const { STAGE_W, STAGE_H, LAYOUT } = await import("/src/constants.ts");
    document.body.replaceChildren();
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100vw;height:100vh;display:block";
    document.body.append(canvas);
    const engine = createEngine({
      canvas,
      game,
      width: STAGE_W,
      height: STAGE_H,
      background: BACKGROUND,
      layout: LAYOUT,
      clock: new ConstantClock(1000 / 60),
    });
    await engine.initialize();
    const d = engine.debug;
    const pose = (fn) => engine.apply(fn);
    const key = (code, type = "keydown") =>
      document.dispatchEvent(new KeyboardEvent(type, { code }));
    async function swim(code, frames) {
      key(code);
      await engine.advance(frames);
      key(code, "keyup");
    }
    async function ping() {
      key("Space");
      await engine.advance(1);
      key("Space", "keyup");
    }
    pose((s) => d.setScreen(s, "playing"));
    pose((s) => d.clearPredators(s));
    pose((s) => d.setForagerTile(s, 13, 16));
    await ping();
    await swim("ArrowUp", 75);
    await swim("ArrowLeft", 60);
    await ping();
    await swim("ArrowUp", 45);
    await swim("ArrowRight", 60);
    await swim("ArrowDown", 45);
    pose((s) => d.setForagerTile(s, 13, 11));
    pose((s) => d.addPredator(s, "flarefish", 26, 11));
    pose((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(360);
    pose((s) => d.addPredator(s, "lanternjaw", 9, 11));
    pose((s) => d.addPredator(s, "gloamfin", 5, 8));
    pose((s) => d.spawnDrifter(s, 13, 5));
    engine.startRecording();
    await ping();
    await swim("ArrowRight", 100);
    const still = canvas.toDataURL("image/png");
    await swim("ArrowRight", 35);
    await swim("ArrowUp", 90);
    await ping();
    key("ShiftLeft");
    await engine.advance(1);
    key("ShiftLeft", "keyup");
    await swim("ArrowLeft", 60);
    if (engine.state.screen !== "playing")
      throw new Error("Capture left live play");
    return { replay: engine.stopRecording(), still };
  });
  await writeFile(
    "showcase/dive.json.gz",
    gzipSync(JSON.stringify(recording.replay)),
  );
  await writeFile(
    "showcase/kindle.png",
    Buffer.from(recording.still.split(",")[1], "base64"),
  );
} finally {
  await browser.close();
}
