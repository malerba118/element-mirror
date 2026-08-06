# Vendored dependencies

## `screenshot`

`vendor/screenshot` is a copy of the [`@renoun/screenshot`][upstream] source,
forked so that the rendering it gets wrong can be fixed here rather than worked
around from outside it. It is the only capture path the demo uses: `src/lib`
imports it as `@screenshot`, which `tsconfig.json` maps to
`vendor/screenshot/src/index.ts`, and Next compiles that file like any other in
the repo. The published package is no longer a dependency.

Forked from:

- Version `0.3.3`
- Tag `@renoun/screenshot@0.3.3`, commit `f7200336b9fa856c48e23413249e51f222a06085`
- Upstream path `packages/screenshot/src/index.ts`

`LICENSE.md`, `README.md`, `CHANGELOG.md`, the test suite and its fixtures and
baselines are upstream's, kept as they were.
The intent is to send these changes back upstream once the mirror is happy with
them, so the file is edited in upstream's style and stays a single module: what
goes in the pull request is a diff of one file against one tag.

### Local changes

Every fix below has a test in `src/index.test.ts` that fails without it, added
next to upstream's own cases in the `visual accuracy:` groups.

#### What it drew wrong

- **A border radius no longer clips the element's children.** The rounded clip
  was applied for the whole of an element's subtree, so a child standing proud of
  a rounded parent was shaved off even where CSS keeps it, which is what a slider
  knob on a pill-shaped track does. It now wraps the element's own background,
  border and replaced content, and is released before the children are painted.
  Descendants of an element that clips its overflow are unaffected: they were,
  and still are, clipped to the padding box further down.
- **A CSS transform on an inline `<svg>` is applied.** Transforms were skipped
  for svg roots and the raster was drawn into the transformed bounding box
  instead, which left a rotated icon upright and stretched to the diagonal of its
  own box. The canvas now carries the transform like it does for any other
  element, the raster is drawn into the untransformed box, and the root's
  `transform` attribute is stripped from the clone so it is not applied twice.
  Recovering that untransformed box needed `getLayoutRect` to invert a rotation
  rather than only a translation, which it now does for any non-HTML element.
- **Text shadows are offset and blurred by the distance CSS asks for.** Canvas
  shadow offsets and blur are in device space and ignore the transform, so a
  shadow was landing at a quarter of its distance with a quarter of its blur,
  hugging the glyphs as a fringe. `applyCanvasShadow` carries both through the
  current matrix. Upstream's own shadow baselines did not catch this: one is
  black on near-black and the other a glow too tight to see.
- **A single text shadow is painted at all.** The single-line text path drew no
  shadow, and only two or more shadows were routed to the path that does. It now
  casts them itself, which is one `fillText` per shadow rather than one per
  grapheme.
- **A range input looks like a slider rather than one solid bar.** The track was
  painted in the element's border colour, which on an unstyled input is a light
  grey, and filled in its text colour: on a dark card with `accent-color: white`
  both came out white, so the whole thing read as one bar with no travel visible.
  The accent colour now paints the filled part and the thumb, and the rest of the
  track takes whichever of the browser's two greys the accent stands out against,
  which is how the browser keeps a white accent from vanishing into a light
  track. The remaining differences from a themed slider were measured against
  Chrome rather than guessed: the track is a 4px pill spanning the padding box
  rather than a square bar inset by an invented 4px padding, the thumb is a
  14px circle in the accent colour rather than a white one ringed in the border
  colour, its centre travels between the ends inset by half its 16px box rather
  than to the very edges, and the fill follows that centre. A slider under its
  native appearance also no longer paints its own background: the theme covers
  the control, so an unstyled input's white `field` background was showing at
  both ends of the track.
- **A rounded border keeps one colour per side.** Sides were treated as one
  border whenever their widths and styles matched, on the grounds that whoever
  wrote them meant one border, and the whole ring was stroked in the top colour.
  That is exactly the shape of a spinner — a circle faint on three sides and
  bright on top, spun by an animation — so every spinner on the page came out a
  solid bright ring standing still. Sides that disagree on colour are now drawn
  one at a time, each filling the ring between the border box and the box it
  encloses within the wedge its two corner miters cut out, which is where CSS
  hands a rounded corner from one side to the next; on a circle with even
  borders those are the diagonals, so the bright part is a quarter arc. Drawing
  them as the square edges the unrounded path uses would have left the corners
  of a circle bare, since a 2px band along the top never reaches the diagonal.
  Borders whose sides agree still take the single stroke, which is a quarter of
  the work and the only path that draws dashes and dots.
- **`text-overflow: ellipsis` is honoured.** Truncation is a paint-time effect:
  layout keeps the whole string, so the renderer painted all of it and let the
  overflow clip cut the last glyph in half, with no ellipsis. Chrome reports the
  shortened line as a second client rect on the same line, and that width is what
  the text is now fitted to, broken on a grapheme boundary and finished with an
  ellipsis. Only left-aligned, left-to-right text is shortened; anything else is
  left whole rather than cut at the wrong end.

#### What it did slowly

- **Serialize the page's CSS once per set of stylesheets.** Every svg is
  rasterized by inlining the whole document's CSS into a clone of it, which was
  serialized again for every icon in every capture. On a page with a utility
  framework that is tens of milliseconds per capture. Fingerprinted by rule
  counts so a stylesheet arriving or changing still invalidates it.
- **Keep rasterized svgs, keyed by the markup they came from.** Decoding is the
  rest of the cost, and `getImage` cannot cache it because each svg is handed to
  it as a fresh blob url. The key is the serialized clone, which includes the
  target size, so anything that changes the output misses the cache.

Together these two took the demo's player card from 37ms a capture, most of it
six lucide icons, to 4.4ms. `.perf/svg.mjs` prices the steps and
`.perf/animated-svg.mjs` checks that a CSS-animated svg still moves rather than
being frozen by the raster cache.

### Diffing against upstream

```bash
git clone --filter=blob:none --sparse https://github.com/souporserious/renoun.git /tmp/renoun
git -C /tmp/renoun sparse-checkout set packages/screenshot
git -C /tmp/renoun checkout '@renoun/screenshot@0.3.3'
diff -u /tmp/renoun/packages/screenshot/src/index.ts vendor/screenshot/src/index.ts
```

Checking out a later tag in the same clone is also how to rebase this copy onto
a new release: diff both ways, take upstream's changes, keep ours.

### Running the tests

Upstream's suite is vendored with the source, since a fix here is only worth
having if it does not break one of the hundred-odd cases it already gets right.
It runs in a real Chromium through vitest's browser mode, so it needs a browser
downloaded once:

```bash
npx playwright install chromium
npm run screenshot:test
```

Most assertions read pixels back and compare them to the DOM the capture was
taken from, and the rest compare against the baselines in
`src/__screenshots__`, which came from upstream and were rendered on
chromium-darwin. Useful arguments, all passed through with `--`:

```bash
npm run screenshot:test -- -t "gradient text"          # one case
npm run screenshot:test -- --browser.headless=false    # watch it happen
npm run screenshot:test -- --update                    # accept new baselines
```

A failing case writes a side-by-side of the DOM against the canvas to
`src/__failures__`, which is gitignored and is usually enough to see what the
renderer got wrong, and vitest drops a screenshot of the page beside the
baselines as `<case>-1.png`; neither is worth committing. Treat `--update`
carefully: a baseline that changes is either a fix or the regression the baseline
existed to catch. Note that a baseline tolerates 1% of its pixels differing, so
it is a coarser instrument than it looks — a pixel assertion is the better place
to pin down a fix.

### Building it

The app needs no build step. The perf harness loads each library as a real
module from disk, so it reads a compiled copy instead:

```bash
npm run screenshot:build
```

That writes `vendor/screenshot/dist/index.js`, which is gitignored, and is the
same shape as the file the package publishes. `.perf` keeps `@renoun/screenshot`
at `0.3.3` as the unforked baseline to compare against.

[upstream]: https://github.com/souporserious/renoun/tree/main/packages/screenshot
