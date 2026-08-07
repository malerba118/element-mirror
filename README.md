# element-mirror

A monorepo around one idea: mirroring a live DOM element into a `<canvas>` at
up to 60fps, cheaply enough to leave running.

| Package | What it is |
| --- | --- |
| [`@frostin/element-mirror`](packages/element-mirror) | The React component and its capture loop: shared captures, delay trails, drag ghosts, main-thread-honest throttling. |
| [`@frostin/snapdom`](packages/snapdom) | A fork of [SnapDOM](https://github.com/zumerlab/snapdom) tuned for repeated live captures — per-node style invalidation, smaller per-frame SVGs, caller-supplied canvas. [FORK.md](packages/snapdom/FORK.md) records provenance and every change. |
| [`apps/demo`](apps/demo) | The Next.js demo: a playground for every prop, showcases for the interesting uses, and a fidelity gallery at `/gallery` pairing sixty pieces of interface with their mirrors. |
| [`.perf`](.perf) | The measurement harness. Nothing in the packages gets an optimization claim without a number from here. |

## Running it

```bash
pnpm install
pnpm dev        # the demo, on PORT or 5173
pnpm test       # the snapdom fork's suites, in real Chromium
pnpm lint
```

## Why a fork, and why this engine

Three capture engines were measured against each other on the demo's player
card (46 nodes at 2x, driven at 60fps): a fork of `@renoun/screenshot` (paints
subtrees into Canvas2D itself), `modern-screenshot`, and SnapDOM. SnapDOM held
60 captures a second at ~5ms of main thread each; modern-screenshot cost ~44ms
a capture and the renoun fork ~55ms while getting a good deal of the CSS
wrong. The losers and the comparison machinery were removed once the question
was settled — the history, including the renoun fork with its own rendering
fixes, lives in git before the monorepo restructure.

Getting SnapDOM from ~30fps delivered to 60 took work on both sides of the
package seam, and the story is written where each half lives:

- the fork's changes and the measurement lessons behind them —
  [packages/snapdom/FORK.md](packages/snapdom/FORK.md)
- the capture loop's cost model (main-thread billing, overlapped SVG decode,
  ready-gated frames) — [packages/element-mirror/README.md](packages/element-mirror/README.md)

The moral that outlived every experiment: watch freshness next to any cost
number, because a capture that got cheap by going stale is a fidelity bug
wearing a perf win's clothes.

## The harness

`.perf` holds runnable questions, each a script with its purpose in the header:

| script | answers |
| --- | --- |
| `.perf/live.mjs` | what each mirror on the real page actually receives, per second |
| `.perf/snapdom.mjs` | what a capture costs, in which half, and what it asks the DOM for |
| `.perf/anatomy.mjs` | what the per-frame SVG weighs, part by part, and decodes in |
| `.perf/pipeline.mjs` | whether serialize-then-overlapped-decode still sustains 60fps |
| `.perf/profile.mjs` | which functions, plus Chrome's recalc and layout counters |
| `.perf/fidelity.mjs` | whether a change altered any pixels, against the gallery |

plus focused checks: dirty-detection (`dirty.mjs`), idle cost (`idle.mjs`),
delay accuracy (`lag.mjs`), pause semantics (`paused.mjs`), first-frame
settling over loading images (`settle.mjs`), drag ghosts (`drag.mjs`),
overflow fidelity (`overflow.mjs`), page-wide smoke (`smoke.mjs`), and
per-section cost attribution (`cost.mjs`, `bench.mjs`).
All need the demo dev server up. `MIRROR_SNAPDOM=npm` points `snapdom.mjs` at
the published `@zumer/snapdom` as the unforked baseline.

## Publishing

Both packages are publish-ready and versioned by hand:

```bash
pnpm --filter @frostin/element-mirror build
pnpm --filter @frostin/element-mirror publish --access public
pnpm --filter @frostin/snapdom publish --access public
```

The demo consumes their TypeScript source directly (`transpilePackages`), so
development needs no build step; `publishConfig` swaps the entry points to
`dist/` at publish time for `@frostin/element-mirror`, and `@frostin/snapdom`
ships its source ESM as-is.
