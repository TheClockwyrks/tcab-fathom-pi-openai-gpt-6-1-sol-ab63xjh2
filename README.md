# Fathom · Kindle

**Hunt in the dark.** A bioluminescent maze chase in the deep sea. Graze every
plankton mote to descend, but remember: growing your light also makes you easier
to find. Your explored terrain stays in memory, visible only inside the circle
you carry.

Amber jellyfish may be meals or disguised Lanternjaws. Eyeless Gloamfins hunt
sound, while Flarefish expose whole chambers in a hot flash. Sonar maps the
corridors, but announces your presence. Ink buys breathing room against the
light hunters, not the listeners.

## Run

Requires Node.js 22.12+ (or a compatible newer Node release).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No server-side services, credentials,
external fonts, or runtime internet connection are needed.

## Production

```sh
npm run build
npm run preview
```

`dist/index.html` is the entry point. Serve **all of `dist/`** with any static
HTTP server, at its root or beneath a sub-path. Asset URLs are page-relative.

## Controls

| Input | Action |
| --- | --- |
| Arrows / WASD | Hold to swim; release to stop |
| Space | Sonar pulse |
| Shift | Ink cloud |
| P / Escape | Pause / resume |
| M | Mute |
| Up / Down | Choose menu item |
| Enter / Space | Confirm |
| Escape | Back |
| Pointer / touch | Select and activate menus |
| Backtick | Read-only diagnostics |

On touch devices, the engine supplies a directional pad and sonar/ink buttons.
A turn can be requested before a junction; reversals happen immediately.
Three reserve lives mean four attempts. Cleared mazes add hunters and shorten
sonar range, down to five corridor steps.

## Development checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests run the real Simple 2D engine on a native canvas with scripted clocks and
injected input. The simulation runs at 120 ticks per second independently of
render rate. State transitions copy the current value; sensing and movement
never read the renderer. `src/game.ts` exports the game, its state/debug types,
and stage background. The engine owns loading, fitting, input, audio, and the
debug overlay.

The debug API returned by initialization supports isolated poses and a plain
JSON snapshot. Use `engine.apply(s => engine.debug.setScreen(s, "playing"))`
and `engine.debug.snapshot(engine.state)`; the production page installs no
global debug handle.

See [the showcase](showcase/showcase.md) for the player-facing presentation.
To reproduce its browser captures, run Vite, then `node scripts/capture.mjs`.
