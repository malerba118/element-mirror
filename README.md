# Element Mirror

Mirror any live DOM element into a React-managed `<canvas>`, at up to 60fps.
Use it for reflections, delay trails, drag ghosts, blurred video backdrops, and
any view that should stay visually in sync without cloning DOM or React state.

- **Live:** inputs, video, animation, selection, scroll, and style changes update.
- **Faithful:** the browser paints the capture, including text, masks, filters,
  blend modes, transforms, shadows, and overflow.
- **Shared:** mirrors of one element share captures, even at different rates and
  delays.

## Quick start

```tsx
'use client'

import { useRef } from 'react'
import { ElementMirror } from './packages/element-mirror/src'

export function Reflection() {
  const source = useRef<HTMLDivElement>(null)

  return (
    <>
      <div ref={source}>Anything the browser can paint</div>
      <ElementMirror
        source={source}
        fps={20}
        style={{ transform: 'scaleY(-1)', opacity: 0.5 }}
      />
    </>
  )
}
```

The component uses browser APIs, so in Next.js it belongs in a client component.

## API

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `source` | `Element \| RefObject<Element \| null> \| string` | required | Element, React ref, or CSS selector to mirror. |
| `fps` | `number \| () => number` | `12` | Maximum capture rate. A function is read every capture cycle. |
| `delay` | `number` | `0` | How many milliseconds behind the source to display. |
| `pixelRatio` | `number` | `devicePixelRatio` | Captured bitmap pixels per CSS pixel. |
| `objectPosition` | `string` | `'center'` | Alignment when the mirror and source have different aspect ratios. |
| `background` | `string \| null` | `null` | Fill behind the source; `null` preserves transparency. |
| `paused` | `boolean` | `false` | Hold the last frame and stop capturing. |

All other props are forwarded to the outer `<span>`, including `className`,
`style`, event handlers, and `ref`. The canvas inside is positioned out of flow
and the outer span is marked with `data-element-mirror`.

The source is resolved every cycle. A ref may start empty, a selector may match
later, and the matching element may change without remounting the mirror.

## The model

### Sizing is CSS

The source provides the mirror's natural size and aspect ratio; CSS decides its
display size, just like an image:

- neither dimension set: use the source's layout size
- one dimension set: derive the other from the source's aspect ratio
- both dimensions set: fit uniformly and align with `objectPosition`

There is intentionally no `objectFit`. A mirror preserves the relationship
between the source's layout box and paint outside it—such as shadows, rings,
outlines, overflow, and transformed corners—so the capture is never stretched.
For a `cover` effect, oversize the mirror and crop it with an
`overflow: hidden` container.

### Captures are shared and adaptive

One scheduler drives the page. Mirrors that resolve to the same element share a
capture at the highest requested `fps`; slower mirrors sample those frames.
Unchanged sources are skipped, expensive sources automatically run slower
rather than monopolizing the main thread, and off-screen mirrors sleep.

Cost scales mainly with the number and complexity of distinct source subtrees,
not the number of mirrors. A lower `pixelRatio` reduces bitmap work when the
result will be blurred or displayed small.

### Delay is history, not more work

`delay` selects an older frame from a shared per-source timeline. A trail of
mirrors therefore adds history and canvas draws, not repeated DOM captures:

```tsx
{[0, 150, 300, 450].map((delay) => (
  <ElementMirror key={delay} source={source} fps={20} delay={delay} />
))}
```

Delay precision is bounded by the capture interval: at 20fps, a `300ms` mirror
will practically run 300–350ms behind. While history fills, it shows the oldest
available frame instead of remaining blank.

## Useful patterns

### Blurred video backdrop

Mirror the existing `<video>` instead of decoding a second copy. A low
`pixelRatio` is usually enough after blur:

```tsx
<ElementMirror
  source={videoRef}
  pixelRatio={0.5}
  className="absolute left-1/2 top-1/2 min-h-full min-w-full"
  style={{
    width: 'auto',
    height: 'auto',
    filter: 'blur(28px)',
    transform: 'translate(-50%, -50%) scale(1.15)',
  }}
/>
```

### Live drag ghost

Move a wrapper with the pointer and let the mirror keep updating inside it:

```tsx
{draggedElement && (
  <div
    style={{
      position: 'fixed',
      left: 0,
      top: 0,
      transform: `translate(${pointer.x}px, ${pointer.y}px)`,
      pointerEvents: 'none',
    }}
  >
    <ElementMirror source={draggedElement} fps={15} />
  </div>
)}
```

Unlike a DOM clone, the ghost does not duplicate IDs or component state. Unlike
a drag image, it can continue changing during the drag.

### Minimap

Set one dimension and the source's aspect ratio supplies the other:

```tsx
<ElementMirror source={contentRef} fps={4} style={{ width: 200 }} />
```

Because captures are skipped while the source is unchanged, a low-rate minimap
is cheap to leave mounted.

### Magnifier

Scale a mirror inside a clipped viewport. This example magnifies the center;
change the translation to focus another region.

```tsx
<div
  style={{
    width: 160,
    height: 160,
    overflow: 'hidden',
    borderRadius: '50%',
  }}
>
  <ElementMirror
    source={sourceRef}
    style={{
      width: '200%',
      transform: 'translate(-25%, -25%)',
    }}
  />
</div>
```

## Behavior worth knowing

- A mirror keeps its layout box hidden until the first frame is ready, avoiding
  an empty-canvas flash.
- A direct `<img>` or `<video>` source waits briefly for its first pixels. A
  composite source captures its current loading state and updates as media loads.
- `paused` holds the current frame. If mounted paused, it takes one frame first.
- The source's own transform is captured as paint, not layout. Animated
  transforms can therefore move beyond the mirror's stable box.
- Mirrors inside a captured subtree are automatically ignored, preventing
  recursive mirror-within-mirror output.
- A focused field's selection is captured; its native caret requires
  `TextCaret`.

## Advanced use

The package also exports `subscribeToSource` for custom canvas consumers,
`subscribeToCaptureStats` for page-wide capture metrics, and
`IGNORE_ATTRIBUTE` for excluding a subtree from captures. See the
[expanded package reference](packages/element-mirror) for lower-level types and
capture details.

Captures use [`@frostin/snapdom`](packages/snapdom), a fork of
[SnapDOM](https://github.com/zumerlab/snapdom) optimized for repeated live
captures.

## Repository

```bash
pnpm dev
pnpm lint
pnpm test
pnpm --filter @frostin/element-mirror build
```

The repo contains the [demo](apps/demo), [capture engine](packages/snapdom), and
[performance and fidelity probes](.perf).
