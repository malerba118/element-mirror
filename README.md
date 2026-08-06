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

Captures come from [`@renoun/screenshot`](https://github.com/souporserious/renoun),
which paints the element's subtree straight into a Canvas2D context by reading
live computed styles.

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

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | `Element \| RefObject<Element \| null> \| string` | — | The element to mirror, as an element, a ref, or a CSS selector. |
| `fps` | `number` | `12` | Maximum captures per second. |
| `pixelRatio` | `number` | `devicePixelRatio` | Bitmap pixels captured per CSS pixel. |
| `objectFit` | `ObjectFit` | `'fill'` | Applies once the canvas has both a width and a height. |
| `objectPosition` | `string` | `'center'` | Alignment when `objectFit` crops or letterboxes. |
| `capture` | `'auto' \| 'always' \| 'once'` | `'auto'` | `auto` skips captures while the source is unchanged. |
| `background` | `string \| null` | `null` | Fill behind the element. `null` keeps transparency. |
| `paused` | `boolean` | `false` | Stop capturing and hold the last frame. |

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
<div className={active ? undefined : 'opacity-0'}>
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
const density = window.devicePixelRatio || 1
const snap = (value: number) => Math.round(value * density) / density
ghost.style.transform = `translate3d(${snap(x)}px, ${snap(y)}px, 0)`
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

One loop in `src/lib/mirror-capture.ts` drives every mirror on the page. Each
cycle resolves each mirror's source and buckets the mirrors by the element they
landed on, and each bucket is serviced once:

- **One capture per element.** Mirrors of the same element each blit from a
  single capture, so eight mirrors cost one capture per frame rather than eight.
  They also stay frame-consistent, which independent loops did not.
- **The fastest subscriber sets the pace.** A bucket runs at `max(fps)` rather
  than the sum, and slower mirrors sample every nth frame.
- **Clean sources are not captured.** A `MutationObserver` and `ResizeObserver`
  watch the subtree, and a cycle with nothing to do is skipped. Running CSS
  animations, other canvases, and attribute changes on `<html>`/`<body>` (theme
  switching, for instance) all count as changed, so live content keeps updating;
  `capture="always"` opts out of the check entirely. Video is tracked by
  `currentTime`, which covers both playback and seeking while paused, and lets a
  paused video's mirror fall idle. A mirror that has not painted yet always
  captures, so joining a static source still gives it a first frame.
- **Videos that cannot draw are waited for.** A seeking or buffering video drops
  below `HAVE_CURRENT_DATA`, and capturing then paints a hole where the video
  sits. Those captures are skipped, so mirrors hold their last frame exactly as
  the video element does, and capture again as soon as it recovers.
- **The loop backs off.** Each capture is timed, and the element's next capture
  is delayed so capturing stays under `CAPTURE_DUTY_CYCLE` (20%) of wall-clock
  time. An expensive source degrades to a lower frame rate instead of saturating
  the main thread.

Mirrors also stop capturing while scrolled out of view (via
`IntersectionObserver`) or while the tab is hidden, captures never overlap, and
`background` is applied when blitting so that mirrors with different backgrounds
still share one capture.

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
