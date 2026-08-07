# Fork provenance and local changes

`packages/snapdom` is a copy of [SnapDOM][snapdom]'s source, forked because it
is the engine [`@frostin/element-mirror`](../element-mirror) runs on, so its
cost and its mistakes should be editable here. It is published as
`@frostin/snapdom`, plain ESM straight from `src/` with upstream's types — no
build step.

Forked from:

- Version `2.23.1`
- Tag `v2.23.1`, commit `4ef7f1fe7b2cf80d7fdf433d8d87364e9b8c6b35`
- Upstream path `src/`

`LICENSE`, `README.upstream.md`, `CHANGELOG.md`, `types/`,
`esbuild.config.mjs` and the test suite are upstream's, kept as they were.
`src/index.d.ts` is ours: it points TypeScript at upstream's types for deep
imports. The published `@zumer/snapdom` is still a dependency of the `.perf`
harness, which loads it as the unforked baseline — that is what
`MIRROR_SNAPDOM=npm` selects in `.perf/snapdom.mjs`.

## Local changes

Tagged `PERF-5` and `PERF-6` in comments where they land. Verified three ways:
`.perf/fidelity.mjs` pixel-matches the demo gallery against a pre-change
baseline, `pnpm test` runs the vendored suites nearest these files in real
Chromium, and `.perf/live.mjs` reports what each mirror on the live demo page
actually receives.

- **Style snapshots are invalidated per node rather than per document**
  (`src/modules/styles.js`, PERF-5). Upstream's `bumpEpoch` threw away every
  element's snapshot whenever anything in the document mutated, so on a live
  page the cache never hit and every capture re-read ~340 computed properties
  per node. A mutation now invalidates the target's parent's subtree — which is
  as far as descendant selectors, inheritance and sibling combinators reach —
  plus each ancestor's own snapshot, which is what `:has()` needs (shadcn cards
  pad themselves by their children). Running animations and transitions
  invalidate their targets each capture, capture-phase listeners catch the
  restyles that mutate nothing (`:hover`, focus, typed values), and the
  document-wide epoch remains for stylesheet, font and viewport changes. What
  none of that can see — `:has()` restyling a cousin, shadow-root internals,
  CSSOM edits — is bounded by `MAX_SNAPSHOT_AGE_MS`: every snapshot expires
  after a second, so a hole is a moment of staleness rather than a wrong mirror.
- **The pseudo-element pass remembers which nodes render nothing**
  (`src/modules/pseudo.js`, PERF-5). Checking `::before`/`::after`/
  `::first-letter` read half a dozen properties per pseudo per node every
  capture; a node whose pass rendered nothing and touched no counter now skips
  it while its stamp is current, on exactly the invalidation above.
- **The base reset CSS is factored** (`generateDedupedBaseCSS`, PERF-6). Tag
  defaults are ~300 properties each and overwhelmingly identical across tags;
  the shared declarations now go out once in a grouped rule with per-tag
  overrides after it. 33kb of the demo player card's SVG became 9kb, and the
  SVG is re-parsed by every rasterization, so bytes are decode time.
- **Logical properties that duplicate their physical twin are not emitted**
  (`isRedundantLogicalProp` in `src/utils/css.js`, PERF-6). Computed-style
  enumeration lists both forms of every box property. A logical longhand is
  dropped only when the same style map holds its physical counterpart with a
  byte-identical value — Chrome genuinely resolves the forms differently in
  places (`min-width` reports `0px` where `min-inline-size` reports `auto`),
  and there the logical declaration is load-bearing. A blanket name-based drop
  was tried first and broke switch and tab layout in exactly that way.
- **The zero-border normalization (#362) also deletes the logical border
  longhands**, which otherwise survive it and re-declare a zero-width solid
  border after the `border: none` it emits.
- **`toCanvas` accepts a `canvas` option** (`src/exporters/toCanvas.js`,
  PERF-6) and draws into it instead of a freshly created one, so a caller
  looping captures does not pay a full-canvas copy per frame.
- **The used-tag walk is memoized per capture root** (`src/core/capture.js`,
  PERF-6), validated by the root's style stamp, since the tag set only changes
  when nodes are added or removed and any such mutation stamps the root.
- **The computed declaration's length is read once per element rather than once
  per property.** A live `CSSStyleDeclaration` answers `length` by going back
  into style, and the property loop asked on every iteration: about fifteen
  thousand round trips a capture on a card of fifty nodes. Worth a few tenths of
  a millisecond, no more, since the work per property is much larger than the
  read.

## Where its time goes

`.perf/snapdom.mjs` prices the options and takes a capture apart;
`.perf/anatomy.mjs` breaks the SVG itself down by bytes and decode cost. On the
demo's player card, 46 nodes at 2x, before the changes above: ~6ms of
serialization (dominated by computed-style reads, with the pseudo pass second)
and ~2 of rasterization per capture, with SnapDOM's own options worth nothing —
`fast` saves half a millisecond, `cache: 'full'` is slower than the default,
`preCache` makes no difference, and `embedFonts: false` saves money the text
cannot afford. After them: ~5ms of serialization on honestly fresh frames, and
a 141kb SVG (69kb of it fonts) decoding in ~6.

## The earlier attempt, and why this one paid

Narrowing the snapshot invalidation was tried once before, worked mechanically,
and was taken out again because captures got *slower*: 21ms against 14. That
result was real but its lesson was misread, and both halves are worth keeping:

- **The baseline it lost to was being paid in stale frames.** Chrome caches SVG
  rasterization by url, and upstream produced a byte-identical capture — a
  frozen equalizer, a stopped clock — about half the time on this card, taking
  a 10x rasterization discount on every one. The honest configuration was never
  in the race. `.perf/snapdom.mjs` prints freshness (`fresh`) next to cost
  precisely so a cheap-but-stale configuration disqualifies itself.
- **The cost being optimized was half wait.** A capture was timed across the
  `await` on the browser's rasterizer, which runs off the main thread. Billing
  wall clock made style reads look like a minority of a 14ms capture; on the
  main thread they were the majority of ~6ms. The mirror's loop now bills
  main-thread time only (`CaptureHandle` in
  `packages/element-mirror/src/snapdom-engine.ts`) and overlaps the decode
  with the next frame.
- **The pseudo pass was the other half of the reads** and the first attempt
  never touched it; it is cached now (above).
- **`getAnimations()` flushes style to answer**, so the per-capture animation
  sweep is kept cheap: it runs once per capture at the root, not per node.

So the standing conclusion flipped: a capture of a live source is
style-read-bound on the main thread and decode-bound on wall clock, and both
were worth attacking. `.perf/profile.mjs` is still the referee — it reports
Chrome's recalc and layout counters next to JavaScript self time, because the
rasterization work is charged to `(program)` and no JavaScript profile will
name it.

[snapdom]: https://github.com/zumerlab/snapdom

## Diffing against upstream

```bash
git clone --filter=blob:none https://github.com/zumerlab/snapdom.git /tmp/snapdom
git -C /tmp/snapdom checkout v2.23.1
diff -ru /tmp/snapdom/src packages/snapdom/src
```

## Running the tests

The suites nearest the local changes — capture, clone, cache, styles, css
utils, pseudo, toCanvas, and the API — run in real Chromium via
`vitest.config.ts` in this package:

```bash
pnpm --filter @frostin/snapdom test
```

The rest of upstream's suite expects jsdom and `@zumer/snapdiff` visual
baselines, neither of which this repo has configured. A change here is also
checked with `.perf/fidelity.mjs` against the demo gallery (diffed against a
baseline run) and `.perf/snapdom.mjs` for cost and freshness.
