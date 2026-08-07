# ElementMirror

A React component that mirrors any DOM element into a `<canvas>`, repainting a
few times a second. The canvas sizes the same way an `<img>` of the source
would: left alone it takes the source's own dimensions, and any CSS you give it
wins from there.

```tsx
const cardRef = useRef<HTMLDivElement>(null)

<div ref={cardRef}>…</div>

<ElementMirror source={cardRef} fps={12} />
```

Captures come from a fork of [SnapDOM](https://github.com/zumerlab/snapdom),
which clones the element's subtree into an SVG `foreignObject` and lets the
browser paint it — so masks, blend modes, filters and text shaping come out
right without anyone reimplementing them. Its source is vendored in
`vendor/snapdom` rather than installed, so its cost and its mistakes can be
fixed here; `vendor/README.md` records where the copy came from and what has
changed. Two other engines stay wired in for comparison behind
`?engine=` — a fork of
[`@renoun/screenshot`](https://github.com/souporserious/renoun), which paints
subtrees into a Canvas2D context itself, and
[`modern-screenshot`](https://github.com/qq15725/modern-screenshot). SnapDOM
won on the numbers: on the demo's player card it holds 60 captures a second at
~5ms of main thread each, where modern-screenshot costs ~44ms a capture and the
renoun fork ~55ms while getting a good deal of the CSS wrong
(`.perf/ceiling.mjs` is the referee).

## Running the demo

```bash
npm install
npm run dev
```

The dev server honours `PORT` and defaults to `5173`:

```bash
PORT=3000 npm run dev
```

## Props

| Prop             | Type                                              | Default            | Notes                                                                                                |
| ---------------- | ------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `source`         | `Element \| RefObject<Element \| null> \| string` | —                  | The element to mirror, as an element, a ref, or a CSS selector.                                      |
| `fps`            | `number`                                          | `12`               | Maximum captures per second, up to the display refresh rate.                                         |
| `delay`          | `number`                                          | `0`                | Milliseconds behind the source to run.                                                               |
| `pixelRatio`     | `number`                                          | `devicePixelRatio` | Bitmap pixels captured per CSS pixel.                                                                |
| `objectFit`      | `ObjectFit`                                       | `'fill'`           | Applies once the canvas has both a width and a height.                                               |
| `objectPosition` | `string`                                          | `'center'`         | Alignment when `objectFit` crops or letterboxes.                                                     |
| `background`     | `string \| null`                                  | `null`             | Fill behind the element. `null` keeps transparency.                                                  |
| `paused`         | `boolean`                                         | `false`            | Stop capturing and hold a frame. Paused before it has one, a mirror captures a single frame to hold. |

Anything else is forwarded to the canvas, and `ref` points at the canvas.

A mirror shows nothing until its first capture arrives. Captures cannot be taken
synchronously, so a canvas that painted straight away would put an empty box on
screen for a frame; instead it holds its layout box and stays hidden until it
has something to draw, the way an image does before it loads. This is most
noticeable on mirrors that appear in response to an interaction, where that one
empty frame reads as a flicker.

### Naming a source

`source` is resolved on every cycle rather than once, so a ref that is still
empty on the first render, a selector that starts matching later, and a source
that is swapped for another element all work without remounting the mirror.

Resolution decides sharing too: mirrors are grouped by the element they land on,
so a ref and a selector naming the same node still share a single capture.

### Running behind

`delay` shows the source as it was that many milliseconds ago, which is what
makes trails and echoes possible:

```tsx
{
  [0, 250, 500, 750].map((delay) => (
    <ElementMirror key={delay} source="#card" fps={20} delay={delay} />
  ));
}
```

Captures accumulate in a per-source timeline, and each mirror is drawn the
newest frame taken at or before its own moment. Mirrors of one element share
that history, so the four above cost the same captures as one, and delay is
paid for in memory rather than CPU. History is kept only as far back as the
furthest-behind mirror can still reach, under a ceiling on total pixels.

Two consequences worth knowing. Resolution is bounded by `fps`, so a mirror runs
between `delay` and `delay + 1000 / fps` behind in practice; measured against a
source whose position encodes the time, mirrors asked for 0, 250, 500 and 750ms
came in at 35, 300, 560 and 825ms at 20fps. And a mirror reaching further back
than the history goes shows the oldest frame it has, so a trail starts level
with the source and fans out rather than starting blank.

Skipping captures does not punch holes in the past. A cycle is only skipped when
the source is unchanged, so the frame before a gap still depicts every moment
inside it, and a still source correctly serves every delay from a single frame.
The same measurement against a source that changes only every 800ms returns the
same lags.

### Sizing

There is no sizing prop. The source supplies a natural size and an aspect ratio,
CSS decides everything else, and the rules are the ones you already use on an
image:

- nothing — the canvas comes out at the source's own width and height.
- width only — height follows the source's aspect ratio, and vice versa.
- width and height — `objectFit` decides between cropping (`cover`) and
  letterboxing (`contain`), and `objectPosition` decides what survives it.

CSS wins in every case, whether it comes from a class, a stylesheet, or the
`style` prop. Sizing the canvas never changes what is captured: the bitmap is
always the source at `pixelRatio`, so a mirror left at its natural size is still
crisp on a retina display.

Getting that to hold took a small trick. A canvas's intrinsic size is its bitmap
size, and the bitmap is the source scaled by `pixelRatio`, so an unsized mirror
would lay out at twice the intended size on a 2× display. Setting an explicit
width and height inline would fix that but would also beat every class and
stylesheet rule, which is the opposite of how an image behaves. Instead the
canvas declares an intrinsic size and nothing more:

```css
contain: size;
contain-intrinsic-size: <source width>px <source height>px;
```

Size containment tells the browser to ignore the bitmap when sizing the element,
and `contain-intrinsic-size` supplies the source's dimensions in its place. That
only sets a natural size, so any width or height from CSS still wins. Browsers
that support `contain: size` but not `contain-intrinsic-size` would collapse the
canvas to nothing, so both are applied only where the pair is supported;
elsewhere the mirror falls back to sizing from its bitmap and wants an explicit
width.

### Blurred backdrops

A mirror is a canvas, so CSS filters apply to it. That covers the usual way of
fitting a video into a container it does not match: fill the container with a
mirror of the video, scaled up past its edges and blurred, and let the video
itself sit on top.

```tsx
<div className="relative aspect-video overflow-hidden">
  <ElementMirror
    source={videoRef}
    objectFit="cover"
    pixelRatio={0.5}
    className="absolute inset-0 h-full w-full"
    style={{ filter: 'blur(28px)', transform: 'scale(1.15)' }}
  />
  <video ref={videoRef} className="relative mx-auto h-full w-auto" … />
</div>
```

A second `<video>` would decode the same file twice and drift out of sync; the
mirror is one decode presented twice. Since the backdrop is blurred anyway, a
low `pixelRatio` keeps its capture cheap.

Native video controls never reach the mirror: the browser draws them outside the
DOM, and a video is captured by painting its current frame.

### Drag ghosts

The thing that follows the cursor during a drag is normally a clone of the
element or a bitmap frozen at drag start. A mirror is neither. Give it no CSS
size and it comes out at the dragged element's exact size, so all that is left
is a transform:

```tsx
const [drag, setDrag] = useState<HTMLElement | null>(null)

<div onPointerDown={(event) => setDrag(event.currentTarget)}>…</div>

{drag ? (
  <div ref={ghostRef} className="pointer-events-none fixed top-0 left-0">
    <ElementMirror source={drag} fps={15} />
  </div>
) : null}
```

Moving the ghost is a transform on its wrapper, so it tracks the pointer at
pointer speed regardless of how slowly the mirror behind it captures. Cloning
the node instead would duplicate a subtree along with its ids and its React
state, and restart its animations from zero; `setDragImage` takes its bitmap
once, so it cannot keep up with an element that changes mid-drag.

Mount the mirror before you show it. A capture takes a few milliseconds to
arrive, so a ghost that mounts and appears in the same instant is empty for a
frame. Mounting it hidden on pointer down and revealing it once the pointer has
travelled far enough to count as a drag gives the capture a head start, and
stops a plain click from lifting anything:

```tsx
// hidden while the press might still be a click, capturing the whole time
<div className={active ? undefined : "opacity-0"}>
  <ElementMirror source={drag} sizing="source" />
</div>
```

Keep the ghost upright and on whole device pixels. Both matter more than they
sound. A DOM node under a rotation gets its text re-rasterised at the new angle,
while a canvas has only pixels to resample, so a tilted ghost visibly softens.
On the demo card a 2.5° tilt was enough to blur the type, and doubling
`pixelRatio` to resample from a denser bitmap barely recovered it. Landing the
translation between device pixels costs sharpness the same way:

```tsx
const density = window.devicePixelRatio || 1;
const snap = (value: number) => Math.round(value * density) / density;
ghost.style.transform = `translate3d(${snap(x)}px, ${snap(y)}px, 0)`;
```

Upright and snapped, the ghost measures within half a percent of the element it
is mirroring. Lift is better expressed with a shadow, which costs nothing.

Two more things to keep in mind. The dragged element has to stay laid out, since
it is the capture source — hiding it leaves the ghost holding its last frame.
And its own `opacity` is captured with everything else, so fading it to leave a
gap behind fades the ghost too; draw the empty slot as an overlay on top of it
instead.

### Cost

A capture walks the source subtree and reads a computed style per node, so its
cost tracks the size of that subtree and barely responds to `pixelRatio`.
Measured on this demo, a small card costs a few milliseconds per capture while
drawing the resulting bitmap costs about a thousandth of that. Everything below
follows from that gap.

One node type is worth knowing about: an inline `<svg>` costs several
milliseconds on its own, far out of proportion to the handful of elements it
contains. `@renoun/screenshot` rasterises each one by cloning it, inlining every
rule of every stylesheet on the page into the clone, serialising that and
decoding it as an image. On this demo that is 90KB of CSS per icon per frame, and
the clone has had its classes stripped by then so almost none of it can apply.
The player card is six lucide icons, which cost 37ms a capture against 3ms for
everything else in it put together — enough that backpressure held the whole card
to 2.5fps.

`.perf/svg.mjs` prices each step. The vendored copy in `vendor/screenshot` fixes
it, by serialising the page's CSS once per distinct set of stylesheets rather than
once per icon, and keeping rasterised svgs keyed by the markup they came from. An
icon that has not changed then costs nothing to redraw, and the card is back to
4.4ms a capture and a held 30fps. That fix belongs upstream, which is why the
copy is kept as a diffable fork of one released tag.

Rendering fidelity is the other thing the vendored copy is for. A child that
overflows a parent with a `border-radius` used to be clipped to it, though CSS
only clips when the parent asks for `overflow: hidden`: the player card's
progress knob is a circle standing proud of a 4px rounded track, and it was
shaved into the bar until the knob was moved out to a square-cornered parent.
That, a CSS transform being dropped from an inline `<svg>`, text shadows landing
a quarter of the distance from their text, `text-overflow: ellipsis` being
painted as a glyph cut in half, a range input's track coming out a single solid
bar, and a spinner's ring coming out bright the whole way round rather than
bright on one side are all fixed in `vendor/screenshot`, each with a test;
`vendor/README.md` explains what each one was. `.perf/overflow.mjs` is how the
clipping one was found: it captures the knob against a rounded track and a
square one, and reports how much of the overflowing part survived.

One loop in `src/lib/mirror-capture.ts` drives every mirror on the page. Each
cycle resolves each mirror's source and buckets the mirrors by the element they
landed on, and each bucket is serviced once:

- **One capture per element.** Mirrors of the same element each blit from a
  single capture, so eight mirrors cost one capture per frame rather than eight.
  They also stay frame-consistent, which independent loops did not.
- **The fastest subscriber sets the pace.** A bucket runs at `max(fps)` rather
  than the sum, and slower mirrors sample every nth frame.
- **Clean sources are not captured.** A cycle with nothing to redraw is skipped,
  which is the difference between a still source costing milliseconds a second
  and costing nothing. There is no prop to force a capture, so deciding that
  nothing changed has to be right. Three mechanisms decide it together:
  - _Observers_, for changes to the tree. A `MutationObserver` and a
    `ResizeObserver` watch the subtree's children, attributes, text and size,
    and attribute changes on `<html>`/`<body>` catch theme switching.
  - _Polling_, for content that repaints under its own power: running CSS
    animations and transitions, other canvases, and video. Video is tracked by
    `currentTime`, which covers playback and seeking while paused, and lets a
    paused video's mirror fall idle.
  - _Listeners_, for changes that leave no trace in the DOM at all. A typed
    value lives on the property rather than the attribute, and a scroll offset
    is not DOM state in the first place, so neither reaches an observer. The
    source gets capture-phase listeners for `input`, `change`, `scroll`,
    `pointerover`/`pointerout` (`:hover`), `focusin`/`focusout` (focus rings)
    and `load` (images arriving late), plus a page-level hook for webfonts
    swapping in.

  None of that is provably exhaustive, so a source is re-captured every second
  regardless. Undercapturing is the worse failure: a needless capture costs a
  few milliseconds, while a change nobody noticed leaves every mirror of that
  source wrong until something else happens to it. The insurance costs about one
  capture per second per still source, and a mirror that has not painted yet
  always captures, so joining a static source still gives it a first frame.

- **Delayed mirrors cost history, not captures.** Captures accumulate in a
  per-source timeline and each mirror is drawn the frame matching its own
  `delay`, which is why a trail of eight ghosts is still one capture per frame.
  Frames are recycled through a pool and captured straight into the next slot,
  so history costs no copying, and the timeline is trimmed to what the
  furthest-behind mirror can still reach.
- **Videos that cannot draw are waited for.** A seeking or buffering video drops
  below `HAVE_CURRENT_DATA`, and capturing then paints a hole where the video
  sits. Those captures are skipped, so mirrors hold their last frame exactly as
  the video element does, and capture again as soon as it recovers.
- **The loop backs off.** Each capture reports its cost, and the element's next
  capture is delayed so capturing stays under `CAPTURE_DUTY_CYCLE` (45%) of the
  main thread. An expensive source degrades to a lower frame rate instead of
  saturating the page. The cost that counts is main-thread work only: SnapDOM's
  captures come in two phases — building the SVG holds the thread, decoding it
  is the browser working off-thread — and the engine reports the first while
  the loop overlaps the second with the next frame (`CaptureHandle` in
  `src/lib/mirror-engines.ts`). Billing the wall clock for the decode wait is
  the mistake this replaces: it throttled a 60fps mirror to 30 while the main
  thread sat idle. The judgement runs on a rolling average of the last few
  captures rather than the last one, since dropping a frame from a rate the
  source can sustain is worse than answering a real slowdown a few frames late.

  This share, rather than the `fps` a mirror asks for, is what decides the rate
  it gets, and it is worth knowing that the two interact: a capture pays for the
  style and layout its source invalidated since the last one, so capturing more
  often makes each capture cheaper. A share set low therefore settles at a rate
  lower than the source could hold, on a cost that would not have applied at the
  higher rate.

### What a capture costs, and what caps the rate

Measured on this machine with SnapDOM, which is the default engine. Costs differ
per source, so a number here always names the one it was measured on: the
playground's player card (`#playground-source`, 46 nodes, a CSS animation and
text on a timer). Asked for 60fps on the live demo page, that card delivers 60
blits a second at ~5ms of main thread per capture — about 31% of the thread —
while the page keeps painting at its full refresh rate. `.perf/live.mjs` is the
measurement: it counts the frames each mirror canvas actually receives on the
real page, which is the number every other number here exists to serve.

Getting there took work on both sides of the engine seam, and the split is
worth knowing when something regresses:

- **Main-thread cost is the style reads.** The fork's per-node snapshot
  invalidation (PERF-5 in `vendor/README.md`) means a capture re-reads only the
  nodes that changed — on the player card, the five animating equalizer bars
  and the clock — instead of all ~340 properties of all 46 nodes.
- **Wall-clock cost is the SVG decode, and it overlaps.** Each frame's SVG is
  decoded by the browser off the main thread while the loop moves on
  (`CaptureHandle`); frames join the timeline in capture order and present when
  their pixels land. Decode time scales with SVG bytes, which is why the fork
  also shrinks the CSS it emits (PERF-6) — `.perf/anatomy.mjs` breaks the
  bytes and their decode cost down.
- **Each further source needs its own slice of the thread.** Mirrors of the
  _same_ source are free, since they share captures. A page showing one source
  at 60fps is a different proposition from a page showing six.

#### What was tried on the engine

An earlier pass concluded captures were rasterize-bound and patching SnapDOM
was a dead end. That conclusion was an artifact of two measurement errors —
the baseline was taking a Chrome rasterization-cache discount on stale frames,
and costs were timed across an `await` that is mostly off-thread wait — and it
reversed on honest numbers. The full story, with the fork's changes and the
failed first attempt, is in `vendor/README.md`; the moral that survives is to
watch the `fresh` column next to any cost number, because a capture that got
cheap by going stale is a fidelity bug wearing a perf win's clothes.

The harness, which is what to reach for before optimizing anything:

| script                | answers                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `.perf/live.mjs`      | what each mirror on the real page actually receives, per second   |
| `.perf/snapdom.mjs`   | what a capture costs, in which half, and what it asks the DOM for |
| `.perf/anatomy.mjs`   | what the per-frame SVG weighs, part by part, and decodes in       |
| `.perf/pipeline.mjs`  | whether serialize-then-overlapped-decode still sustains 60fps     |
| `.perf/profile.mjs`   | which functions, plus Chrome's recalc and layout counters         |
| `.perf/ceiling.mjs`   | what rate each engine can hold on a given source                  |
| `.perf/engines.mjs`   | that every engine still delivers, delayed mirrors included        |
| `.perf/fidelity.mjs`  | whether a change altered any pixels, against the gallery          |

### Rate

A requested rate is what arrives. Two things in the loop are there for that.

Each frame is booked from the time the previous one was **due**, not from the
time its capture finished. Anchoring on completion folds the cost of capturing
into the period, so a source taking 4ms would serve a requested 30fps at 27, and
any variation in that cost would surface as jitter in a rate that was supposed to
be fixed.

The loop then wakes on displayed frames rather than on a timer, and a frame due
before the next one is due now. Timers fire on a clock of their own, and near the
refresh rate that leaves a capture finishing just after a paint went out and
waiting for the following one — two frames one refresh apart, then one three
refreshes later. Evenly captured, unevenly seen. Aligning to the display makes a
rate below the refresh rate look steady rather than merely be steady, and it is
why the refresh rate is the ceiling: rates that divide into it (30 and 60 on a
60Hz display) land evenly, and rates that do not are spaced as evenly as whole
frames allow.

Mirrors also stop capturing while scrolled out of view (via
`IntersectionObserver`) or while the tab is hidden. A capture's main-thread
phase never overlaps another's — only its off-thread rasterization runs while
the loop moves on — and `background` is applied when blitting so that mirrors
with different backgrounds still share one capture.

Mirrors carry `data-screenshot-ignore`, so a mirror nested inside another
capture is skipped rather than recursing visually.

## Layout

```
src/
  lib/
    mirror-capture.ts    shared capture scheduling for all mirrors
  components/
    element-mirror.tsx   the component
    demo/                the demo page's sections
    ui/                  shadcn/ui primitives
  app/
    page.tsx             demo page
```

Built with Next.js, Tailwind CSS v4, and shadcn/ui.
