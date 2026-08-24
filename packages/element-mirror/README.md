# @frostin/element-mirror

A React component that mirrors any DOM element into a `<canvas>`, repainting up
to sixty times a second. The mirror sizes the same way an `<img>` of the source
would: left alone it takes the source's own layout size, and any CSS you give
it wins from there. It lays out like the source's layout box and paints like
the source's transform: a rotating source keeps a rock-steady mirror, and a
shadow or a focus ring that spills outside the source's box spills outside the
mirror's too.

```tsx
import { ElementMirror } from '@frostin/element-mirror'

const cardRef = useRef<HTMLDivElement>(null)

<div ref={cardRef}>…</div>

<ElementMirror source={cardRef} />
```

Captures come from [`@frostin/snapdom`](https://www.npmjs.com/package/@frostin/snapdom),
a fork of [SnapDOM](https://github.com/zumerlab/snapdom) tuned for repeated
live captures: it clones the subtree into an SVG `foreignObject` and lets the
browser paint it, so masks, blend modes, filters and text shaping come out
right without anyone reimplementing them. On the demo's player card (46 nodes
at 2x) a capture costs ~5ms of main thread, and a mirror asked for 60fps gets
60 while the page keeps painting at its full refresh rate.

## Props

| Prop             | Type                                              | Default            | Notes                                                                                                |
| ---------------- | ------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `source`         | `Element \| RefObject<Element \| null> \| string` | —                  | The element to mirror, as an element, a ref, or a CSS selector.                                      |
| `fps`            | `number \| () => number`                          | `30`               | Maximum captures per second, up to the display refresh rate. A function is read every capture cycle. |
| `delay`          | `number`                                          | `0`                | Milliseconds behind the source to run.                                                               |
| `pixelRatio`     | `number`                                          | `devicePixelRatio` | Bitmap pixels captured per CSS pixel.                                                                |
| `objectPosition` | `string`                                          | `'center'`         | Where the source's box sits when CSS gives the mirror a box of a different ratio.                    |
| `background`     | `string \| null`                                  | `null`             | Fill behind the element. `null` keeps transparency.                                                  |
| `paused`         | `boolean`                                         | `false`            | Stop capturing and hold a frame. Paused before it has one, a mirror captures a single frame to hold. |

Anything else is forwarded to the element that holds the mirror's box, and
`ref` points at it. The canvas inside is positioned out of flow — what it
paints is not what the mirror occupies — and is marked `data-element-mirror`
for anything measuring a mirror from the outside.

A mirror shows nothing until its first capture arrives. Captures cannot be taken
synchronously, so a canvas that painted straight away would put an empty box on
screen for a frame; instead it holds its layout box and stays hidden until it
has something to draw, the way an image does before it loads. This is most
noticeable on mirrors that appear in response to an interaction, where that one
empty frame reads as a flicker.

When the source is itself an `<img>` or `<video>` still fetching, the first
frame also waits (up to a few seconds) for the pixels rather than capturing
nothing — they are the entire capture, and a `paused` mirror keeps its single
frame forever. That wait is deliberately shallow: a composite source — a card
with images inside — is captured as it currently looks, loading states
included, because mirroring an interface means mirroring what it shows. A live
mirror over such a source heals on each image's `load` event; to freeze a
composite only once its media has landed, run the mirror live and set `paused`
when your own readiness signal fires.

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
{[0, 250, 500, 750].map((delay) => (
  <ElementMirror key={delay} source="#card" fps={20} delay={delay} />
))}
```

Captures accumulate in a per-source timeline, and each mirror is drawn the
newest frame taken at or before its own moment. Mirrors of one element share
that history, so the four above cost the same captures as one, and delay is
paid for in memory rather than CPU. History is kept only as far back as the
furthest-behind mirror can still reach, under a ceiling on total pixels.

Two consequences worth knowing. Resolution is bounded by `fps`, so a mirror runs
between `delay` and `delay + 1000 / fps` behind in practice. And a mirror
reaching further back than the history goes shows the oldest frame it has, so a
trail starts level with the source and fans out rather than starting blank.

### Sizing

There is no sizing prop. The source supplies a natural size and an aspect ratio,
CSS decides everything else, and the rules are the ones you already use on an
image:

- nothing — the mirror comes out at the source's own width and height.
- width only — height follows the source's aspect ratio, and vice versa.
- width and height — the source's box is scaled uniformly to the largest size
  that fits inside, and `objectPosition` decides where it sits in the space it
  did not fill.

CSS wins in every case, whether it comes from a class, a stylesheet, or the
`style` prop. Sizing the mirror never changes what is captured: the bitmap is
always the source at `pixelRatio`, so a mirror left at its natural size is still
crisp on a retina display.

There is deliberately no `objectFit`: a mirror that stretched its capture to
fill a box would have to stretch the paint that left the box along with it, so
there is one fit and it is uniform. The way to cover a box is the way you would
cover it with any oversized image — size the mirror to the smallest box that
covers, and let the container crop it:

```tsx
<div className="relative aspect-video overflow-hidden">
  <ElementMirror
    source={videoRef}
    className="absolute top-1/2 left-1/2 min-h-full min-w-full"
    style={{ width: 'auto', height: 'auto', transform: 'translate(-50%, -50%)' }}
  />
</div>
```

Under the hood the wrapper holds an invisible replaced element in flow, sized
to the source, so the box resolves by replaced-element sizing — the algorithm
every engine already agrees on for an image — and any width or height from CSS
still wins, exactly as it does on one.

### The mirror's box

A mirror's box is the box the source _laid out_ in — not the box it occupies on
screen, which a `transform` moves and scales every frame. The capture is painted
wherever the source's transform put it, at the source's own scale, out of flow
and outside the box if that is where it went. A mirror of an animating element
keeps a still box while the paint moves inside and past it, which is what makes
it usable for trails, echoes and motion blur — and it is the same division CSS
itself uses, where transforms never affect layout.

The paint reaches past the box for untransformed sources too: a shadow, an
outline, a focus ring, or — the common case, since Tailwind's `ring` utilities
are box shadows — a card's border-like ring all land outside the mirror's box
in the same place the source's do.

Nothing declares how far a mirror paints. Every frame arrives with the geometry
of the capture it came from, so the canvas is sized to hold the frame before that
frame is drawn — never after one came out clipped — and it takes the room in
whole pixels, doubling while the paint keeps reaching further and giving it back
once the reach has held smaller for a while. A ring costs a pixel a side; an
animation sweeping two hundred pixels out and back costs a handful of
reallocations, which `.perf/bleed.mjs` measures along with everything else.

### Blurred backdrops

A mirror is a canvas, so CSS filters apply to it. That covers the usual way of
fitting a video into a container it does not match: fill the container with a
mirror of the video, scaled up past its edges and blurred, and let the video
itself sit on top.

```tsx
<div className="relative aspect-video overflow-hidden">
  <ElementMirror
    source={videoRef}
    pixelRatio={0.5}
    className="absolute top-1/2 left-1/2 min-h-full min-w-full"
    style={{
      width: 'auto',
      height: 'auto',
      filter: 'blur(28px)',
      transform: 'translate(-50%, -50%) scale(1.15)',
    }}
  />
  <video ref={videoRef} className="relative mx-auto h-full w-auto" … />
</div>
```

A second `<video>` would decode the same file twice and drift out of sync; the
mirror is one decode presented twice. Since the backdrop is blurred anyway, a
low `pixelRatio` keeps its capture cheap.

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

Mount the mirror hidden on pointer down and reveal it once the pointer has
travelled far enough to count as a drag: the capture gets a head start, and a
plain click lifts nothing. Keep the ghost upright and land its translation on
whole device pixels — a canvas under rotation or between pixels resamples and
visibly softens. The dragged element has to stay laid out (it is the capture
source), and its own `opacity` is captured with everything else, so draw the
empty slot as an overlay rather than fading the source.

### The text caret

A focused field's caret never appears in a mirror, because it was never in the
DOM: the browser draws it over the field at paint time, and its blink runs on
a clock the platform does not expose — so even an engine that painted a bar
where the caret sits could not blink it. `TextCaret` turns the caret into DOM
instead. It hides the native one (`caret-color: transparent`) and renders a
real element where the caret is, so it lands in captures like everything else,
blink included — the blink is a Web Animation, which the capture loop treats
as live content while it runs and stops billing for the moment the caret
hides.

```tsx
<div className="relative">
  <input ref={inputRef} type="text" … />
  <TextCaret input={inputRef} />
</div>
```

Render it inside a positioned ancestor shared with the field. Unstyled it
matches the native caret — one pixel of the field's own color, blinking on the
usual cadence, held solid for a beat after every move; `style` and `className`
land on the caret element, so width, color, glow and radius are yours, while
position and height are measured and written by the component. It follows the
same platform rule as selection capture: the field must expose the selection
API (`text`, `search`, `url`, `tel`, `password` — not `email` or `number`),
and it hides while the field is unfocused or a range is selected, which is
what the native caret does.

## Cost and rate

A capture reads computed styles over the source subtree on the main thread and
then has the browser rasterize an SVG off it, so cost tracks the subtree's size
and how much of it changed since the last capture — the engine re-reads only
what mutated. One loop drives every mirror on the page:

- Mirrors of the same element share one capture and blit from it.
- A bucket runs at `max(fps)` of its mirrors; slower ones sample.
- Clean sources are not captured; a heuristic decides, and a full re-capture
  every second bounds how wrong it can be.
- The loop bills itself only for main-thread work (the SVG decode overlaps the
  next frame) and spaces captures so capturing stays under 45% of the thread
  (`CAPTURE_DUTY_CYCLE`): an expensive source degrades to a lower rate instead
  of saturating the page.
- Mirrors stop capturing while off screen or in a hidden tab.

A requested rate is what arrives: frames are booked from when the previous one
was due, and the loop wakes on displayed frames, so a rate below the refresh
rate looks steady rather than merely being steady.

A discrete change — a keystroke, a focus ring, a selection — is captured ahead
of the fps grid rather than waiting for the next slot, but never ahead of the
mirror's own interval, so at a low idle rate the change can still sit unseen
for most of one. That is what a function `fps` is for: return a higher rate
for a beat after the user interacts and the change's own event finds the short
interval already in force. The function form exists because merely *asking*
must cost nothing — swapping a numeric `fps` re-subscribes, and a fresh
subscription captures immediately, which spends the main thread at the exact
moment the interaction's own events need it. The demo's glass-floor page runs
15fps idle and 45fps for 400ms after a touch, which is what carries a
double-click's highlight into the reflection within a frame or two.

Mirror canvases carry `data-element-mirror-ignore`, so a mirror nested inside
another capture is skipped rather than recursing visually.

## Beyond the component

`subscribeToSource` is the component's engine room and is exported for canvas
consumers that are not React components; `subscribeToCaptureStats` reports
page-wide capture accounting (captures/s, blits/s, ms per capture, main-thread
share). The demo app and perf harness in the
[repository](https://github.com/frostin/element-mirror) show both in use.
