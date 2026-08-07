# @frostin/element-mirror

A React component that mirrors any DOM element into a `<canvas>`, repainting up
to sixty times a second. The canvas sizes the same way an `<img>` of the source
would: left alone it takes the source's own dimensions, and any CSS you give it
wins from there.

```tsx
import { ElementMirror } from '@frostin/element-mirror'

const cardRef = useRef<HTMLDivElement>(null)

<div ref={cardRef}>…</div>

<ElementMirror source={cardRef} fps={12} />
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

The first frame also waits, up to a few seconds, for a source that is still
settling — images mid-fetch, a video buffering toward its first frame, webfonts
loading — rather than baking placeholders into it. A live mirror would heal
from that on the `load` event anyway; a `paused` mirror keeps its single frame
forever, so the frame it keeps is taken after the pixels arrive.

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

- nothing — the canvas comes out at the source's own width and height.
- width only — height follows the source's aspect ratio, and vice versa.
- width and height — `objectFit` decides between cropping (`cover`) and
  letterboxing (`contain`), and `objectPosition` decides what survives it.

CSS wins in every case, whether it comes from a class, a stylesheet, or the
`style` prop. Sizing the canvas never changes what is captured: the bitmap is
always the source at `pixelRatio`, so a mirror left at its natural size is still
crisp on a retina display.

Under the hood the canvas declares only an intrinsic size (`contain: size` +
`contain-intrinsic-size`), so any width or height from CSS still wins, exactly
as it does on an image.

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

Mirror canvases carry `data-element-mirror-ignore`, so a mirror nested inside
another capture is skipped rather than recursing visually.

## Beyond the component

`subscribeToSource` is the component's engine room and is exported for canvas
consumers that are not React components; `subscribeToCaptureStats` reports
page-wide capture accounting (captures/s, blits/s, ms per capture, main-thread
share). The demo app and perf harness in the
[repository](https://github.com/frostin/element-mirror) show both in use.
