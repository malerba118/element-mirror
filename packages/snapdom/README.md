# @frostin/snapdom

A fork of [SnapDOM](https://github.com/zumerlab/snapdom) (`@zumer/snapdom`
v2.23.1) tuned for **repeated live captures** — the workload of
[`@frostin/element-mirror`](https://www.npmjs.com/package/@frostin/element-mirror),
which re-captures the same element up to sixty times a second. Upstream is
built for one-shot screenshots; this fork keeps its fidelity and makes the
repeat case cheap:

- **Per-node style invalidation.** Upstream throws away every cached style
  snapshot whenever anything in the document mutates, so on a live page every
  capture re-reads ~340 computed properties per node. Here a mutation
  invalidates only what it can restyle, running animations invalidate their
  targets, and a one-second age bound turns detection holes into moments of
  staleness rather than wrong captures.
- **A pseudo-element skip cache** on the same invalidation, since checking
  `::before`/`::after`/`::first-letter` on nodes that render neither is most of
  what that pass costs.
- **Smaller per-frame SVGs** — factored base-reset CSS, logical properties
  dropped when their physical twin carries the identical value — because the
  browser re-parses the SVG on every rasterization, so bytes are decode time.
- **`toCanvas({ canvas })`** draws into a canvas you provide instead of a fresh
  one, sparing a full-canvas copy per frame in capture loops.

The API is upstream's — `snapdom(element, options)`, `snapdom.toCanvas`,
`preCache`, the exporters — plus the `canvas` option above. Anything not
listed in [FORK.md](./FORK.md) behaves exactly as documented by
[upstream](https://github.com/zumerlab/snapdom); their README ships alongside
as `README.upstream.md` in the repo.

```js
import { snapdom } from '@frostin/snapdom'

const snapshot = await snapdom(element, { dpr: devicePixelRatio, embedFonts: true })
await snapshot.toCanvas({ canvas: myCanvas })
```

[FORK.md](./FORK.md) records the provenance, every local change, and the
measurement story behind them. MIT, like upstream — the original license ships
with the package.
