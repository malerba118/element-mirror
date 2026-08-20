'use client'

import * as React from 'react'

import { subscribeToSource } from './mirror-capture'
import type { ElementMirrorSource } from './element-mirror'

/**
 * A second take on ElementMirror, kept alongside the first to be compared
 * against it.
 *
 * ElementMirror is a picture of the box an element occupies on screen. That is
 * the wrong box for anything transformed: a rotating source gives its mirror a
 * layout box that grows and shrinks every frame, so the mirror shoves the page
 * around while the source — whose transform cannot affect layout at all — sits
 * perfectly still. It is also the box the capture is squashed into, and the
 * recorded size lags the bitmap on a fast transform, so the ink is squashed by
 * whatever the source did during its own capture.
 *
 * This version takes CSS's own division instead. The mirror lays out like the
 * source's layout box, and paints like the source's transform: a wrapper holds
 * the layout box and nothing else, and inside it a canvas positioned out of
 * flow paints past every edge, as far as the source reaches. Frames are drawn
 * at their own size rather than stretched into a box, which is what makes the
 * placement survive rotation and immunises it from the lagging size.
 *
 * The two differences a caller sees:
 *
 * - `objectFit` is gone. There is one fit — the source's box, scaled uniformly
 *   to the mirror's box — because a mirror that stretched its source would
 *   have to stretch the transformed paint with it, and `cover` cannot be drawn
 *   at all once the paint leaves the box it was supposed to be cropped to.
 * - `objectPosition` decides where the source's box sits when the mirror's box
 *   is a different shape, which is the only thing left for it to decide.
 */

export type ElementMirror2Props = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'children'
> & {
  /**
   * The DOM element to mirror.
   *
   * Accepts:
   * - a DOM element
   * - a React ref
   * - a CSS selector
   */
  source: ElementMirrorSource

  /**
   * Maximum captures per second.
   *
   * Mirrors of the same source share captures, and the mirror with
   * the highest fps determines the shared capture rate.
   *
   * @default 12
   */
  fps?: number

  /**
   * How far behind the source this mirror runs, in milliseconds.
   *
   * Each frame is placed where the source was when it was taken, so a delayed
   * mirror of a moving element trails along its path rather than sitting under
   * it.
   *
   * @default 0
   */
  delay?: number

  /**
   * Number of bitmap pixels captured per CSS pixel of the source.
   *
   * As with an image, displaying a mirror larger than its source does not add
   * detail; raise this to capture it.
   *
   * @default window.devicePixelRatio
   */
  pixelRatio?: number

  /**
   * Where the source's box sits when the mirror's box is a different shape.
   *
   * Takes the CSS object-position forms that make sense here: keywords, a
   * percentage of the leftover space, or a length from the leading edge.
   *
   * @default 'center'
   */
  objectPosition?: string

  /**
   * Paints a background behind the source's box.
   *
   * Covers the box the source laid out in, wherever the source's transform has
   * since taken it, so a transformed source that needs a backdrop of its own
   * is better off with a background on the source itself.
   *
   * null preserves transparency.
   *
   * @default null
   */
  background?: string | null

  /**
   * Suspends capturing while preserving the last painted frame.
   *
   * @default false
   */
  paused?: boolean
}

// Reading layout has to happen before the browser paints, but there is no
// layout to read while rendering on the server.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

// The wrapper is an ordinary box with an absolutely positioned child, so it has
// no natural size of its own. Size containment plus a declared intrinsic size
// gives it the source's dimensions the way an image has its file's, and leaves
// any width or height the page supplies free to win.
const canDeclareIntrinsicSize =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('contain-intrinsic-size', '1px 1px')

/**
 * Growth increment for the painted area, in source pixels, once the paint
 * reaches further than this out. Up to it, room is taken to the pixel.
 *
 * The two cases either side of this are different animals. A ring, a shadow or
 * an outline overhangs a box by a pixel or a few, always by the same amount, so
 * paying for a step of room would be paying for room to hold nothing; a
 * transform in motion overhangs by hundreds and by a different amount every
 * frame, and there a step is what keeps a canvas from being reallocated sixty
 * times a second.
 */
const REACH_STEP = 32

/** Frames a smaller paint must hold for before the canvas gives room back. */
const SHRINK_AFTER = 90

/**
 * How far outside the viewport a mirror still captures, in CSS pixels.
 *
 * Generous, because what a mirror paints and what it occupies are different
 * things: a box scrolled just out of view can have paint that a transform took
 * hundreds of pixels away and is still on screen.
 */
const WAKE_MARGIN = 256

/**
 * Ceiling on the display canvas, per side, in device pixels. Comfortably below
 * where browsers refuse to allocate one at all, which they do by handing back
 * a canvas that silently draws nothing.
 */
const MAX_CANVAS = 8192

const px = (value: string) => Number.parseFloat(value) || 0

const EDGES: Record<string, number> = {
  left: 0,
  top: 0,
  center: 0.5,
  right: 1,
  bottom: 1,
}

const IS_VERTICAL = /^(top|bottom)$/
const IS_HORIZONTAL = /^(left|right)$/

/** One axis of an object-position, against the space left over on that axis. */
function place(token: string, slack: number) {
  const edge = EDGES[token]
  if (edge !== undefined) return edge * slack
  // A percentage lines the same point of each box up, so it spends the slack;
  // a length is measured from the leading edge, as CSS has it.
  if (token.endsWith('%')) return (px(token) / 100) * slack
  return px(token)
}

function alignment(value: string) {
  const tokens = value.trim().toLowerCase().split(/\s+/)
  if (tokens.length === 1) {
    return IS_VERTICAL.test(tokens[0])
      ? { x: 'center', y: tokens[0] }
      : { x: tokens[0], y: 'center' }
  }
  // Keywords are allowed either way round, and say which axis they are.
  return IS_VERTICAL.test(tokens[0]) || IS_HORIZONTAL.test(tokens[1])
    ? { x: tokens[1], y: tokens[0] }
    : { x: tokens[0], y: tokens[1] }
}

function resolveSource(source: ElementMirrorSource): Element | null {
  if (typeof source === 'string') return document.querySelector(source)
  if (source instanceof Element) return source
  return source.current
}

/** The source's layout box, which its own transform cannot affect. */
function readLayoutBox(element: Element) {
  const style = getComputedStyle(element)
  // `width` reports whichever box `box-sizing` refers to, so the padding and
  // borders are already in it under `border-box` and are not otherwise.
  const inner = style.boxSizing === 'border-box' ? 0 : 1
  return {
    width:
      px(style.width) +
      inner *
        (px(style.paddingLeft) +
          px(style.paddingRight) +
          px(style.borderLeftWidth) +
          px(style.borderRightWidth)),
    height:
      px(style.height) +
      inner *
        (px(style.paddingTop) +
          px(style.paddingBottom) +
          px(style.borderTopWidth) +
          px(style.borderBottomWidth)),
  }
}

/**
 * How the mirror's box is described to CSS.
 *
 * Layout containment first, and for the canvas rather than for layout: it makes
 * this box the containing block for anything absolutely positioned inside it
 * whatever its own `position` turns out to be, which is what lets the page
 * position the mirror itself. An inline `position: relative` would have done the
 * same job while quietly outranking the `absolute` a class asked for.
 *
 * Then size containment, so the canvas inside contributes nothing to the box,
 * and an aspect ratio, which is what gives every sizing case the same answer an
 * image gives: a width implies the height, a height implies the width, and both
 * are obeyed as given.
 *
 * The intrinsic size is the exception, declared only for a mirror CSS said
 * nothing about. It is what gives that mirror a box at all, and it outranks the
 * ratio wherever both could apply — resolving the free axis to the source's own
 * dimension instead of the ratio's, which for a mirror 150px wide is the
 * source's full height rather than the 62px that keeps its shape.
 */
function sizing(
  intrinsic: { width: number; height: number },
  declared: boolean
): React.CSSProperties {
  if (!canDeclareIntrinsicSize) {
    return { contain: 'layout', width: intrinsic.width, height: intrinsic.height }
  }
  return {
    contain: 'size layout',
    aspectRatio: `${intrinsic.width} / ${intrinsic.height}`,
    ...(declared
      ? { containIntrinsicSize: `${intrinsic.width}px ${intrinsic.height}px` }
      : null),
  }
}

/**
 * A live mirror of another DOM element.
 *
 * Lays out like the source's layout box: left alone it takes the source's own
 * width and height, given one dimension it derives the other from the source's
 * aspect ratio, and given both it fits the source's box inside uniformly and
 * places it with `objectPosition`. CSS always wins, from a stylesheet or
 * anywhere else.
 *
 * Paints like the source's transform: whatever the source paints outside its
 * layout box, the mirror paints outside its own, in the same place. Nothing
 * about that reaches layout, so a source can rotate, scale and fly around
 * without the mirror disturbing a single thing laid out beside it.
 *
 * Mirrors pointing at the same element share a single capture, so adding
 * mirrors costs bitmap draws rather than captures.
 *
 * Like an image, a mirror stays hidden until it has a frame to show, while
 * still taking up its layout box.
 */
export const ElementMirror2 = React.forwardRef<
  HTMLSpanElement,
  ElementMirror2Props
>(function ElementMirror2(
  {
    source,
    fps = 12,
    delay = 0,
    pixelRatio,
    objectPosition = 'center',
    background = null,
    paused = false,
    style,
    ...spanProps
  },
  forwardedRef
) {
  const wrapperRef = React.useRef<HTMLSpanElement>(null)
  React.useImperativeHandle(forwardedRef, () => wrapperRef.current!)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  // The source's layout box, for the wrapper's intrinsic size and ratio. State
  // because it has to reach the style; everything else the drawing needs is
  // kept in refs, so a source that moves or grows never re-renders the mirror
  // and never restarts its capture.
  const [intrinsic, setIntrinsic] = React.useState<{
    width: number
    height: number
  } | null>(null)
  const [hasFrame, setHasFrame] = React.useState(false)
  const hasFrameRef = React.useRef(false)
  /**
   * Whether this mirror has to declare its intrinsic size to have a box at all.
   *
   * An aspect ratio alone gives every sizing case the image-like answer — a
   * width implies the height, a height implies the width, both are obeyed — and
   * a declared intrinsic size beats the ratio in every one of them, resolving
   * the free axis to the source's own dimension rather than the ratio's. The
   * one case the ratio cannot answer is a mirror CSS said nothing about, which
   * collapses to nothing. So the size is declared on the evidence of that: an
   * empty box means nothing else was going to give it one.
   */
  const [declared, setDeclared] = React.useState(false)
  const intrinsicRef = React.useRef(intrinsic)
  intrinsicRef.current = intrinsic

  // The mirror's own box, as CSS settled it, against which the source's box is
  // scaled and placed.
  const boxRef = React.useRef<{ width: number; height: number } | null>(null)
  // What the canvas currently holds: the source's box in the middle, plus
  // `reach` source pixels of room on every side for the paint to spill into,
  // and how much of the source that adds up to once rounded to whole device
  // pixels — always a shade more, and the number the canvas is shown at.
  const heldRef = React.useRef({
    width: 0,
    height: 0,
    reach: 0,
    extentWidth: 0,
    extentHeight: 0,
  })
  const spareFramesRef = React.useRef(0)

  // Presentation-only options, read at blit time so that changing one never
  // restarts capturing.
  const backgroundRef = React.useRef(background)
  backgroundRef.current = background
  const positionRef = React.useRef(objectPosition)
  positionRef.current = objectPosition

  /**
   * Fits the canvas over the mirror's box.
   *
   * Only the canvas's CSS size, which leaves the pixels it is holding alone:
   * the canvas is drawn in the source's own scale and stretched to whatever
   * size the mirror ended up, the way an image is, so a mirror being resized
   * costs four style writes rather than a re-capture.
   */
  const fit = React.useCallback(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    const held = heldRef.current
    if (!canvas || !box) return
    // Nothing to fit to, or nothing to fit: leave the canvas as it was rather
    // than resolve a scale against a zero.
    if (box.width === 0 || box.height === 0) return
    if (held.width === 0 || held.height === 0) return

    // One fit, uniform: the source's box, as large as the mirror's box allows.
    const scale = Math.min(box.width / held.width, box.height / held.height)
    const { x, y } = alignment(positionRef.current)
    const left = place(x, box.width - held.width * scale)
    const top = place(y, box.height - held.height * scale)

    // Shown at the extent the canvas actually covers rather than the box it was
    // asked for. A bitmap is a whole number of device pixels around a box that
    // is not, and displaying that bitmap across the box alone would resample
    // every pixel in it by the difference — a fraction of a percent, which is
    // invisible on a photograph and reads as soft text everywhere else. The
    // rounding goes to the right and the bottom, where a fraction of a device
    // pixel of nothing cannot be seen.
    const reach = held.reach * scale
    canvas.style.left = `${left - reach}px`
    canvas.style.top = `${top - reach}px`
    canvas.style.width = `${held.extentWidth * scale}px`
    canvas.style.height = `${held.extentHeight * scale}px`
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    // Pausing holds whatever is on the canvas, so a mirror that already has a
    // frame needs nothing further. One that does not still owes the page an
    // image: a non-positive rate captures a single frame and retires.
    if (paused && hasFrameRef.current) return

    const ratio = pixelRatio ?? window.devicePixelRatio ?? 1
    // Read now as well as observed: a capture can land before an observer's
    // first callback, and a canvas with no size of its own would be shown at
    // its bitmap's size for that one frame.
    const initial = wrapper.getBoundingClientRect()
    boxRef.current = { width: initial.width, height: initial.height }
    // Assume visible until the observer says otherwise, so the first frame
    // paints without waiting a callback.
    let onScreen = true
    let warnedAboutSize = false

    /**
     * Makes sure the canvas can hold this frame.
     *
     * Sized before the frame is drawn rather than after one was clipped, so a
     * paint that reaches further than anything before it is still drawn whole.
     * It grows at once and gives room back only after a while, since an
     * animation's reach is discovered on the way out and wanted again on the
     * way back.
     */
    const hold = (layout: { width: number; height: number }, need: number) => {
      const held = heldRef.current
      const limit = Math.max(
        0,
        (MAX_CANVAS / ratio - Math.max(layout.width, layout.height)) / 2
      )
      // A device pixel is the smallest spill worth noticing, and a capture
      // covers a whole number of them around a box that does not, so nearly
      // every frame spills a fraction of one and is left alone.
      //
      // Past that, room doubles until doubling costs more than a step. A ring
      // asks for a pixel and gets exactly one, a shadow asks for twelve and
      // gets sixteen, and a transform sweeping out to two hundred pays six
      // allocations on the way rather than one per pixel — which is what
      // exactness costs a slow animation, since it discovers its reach one
      // pixel at a time. Always whole pixels: a fractional reach would sit the
      // canvas a fraction of a pixel off the box and resample everything on it.
      const step = (value: number) => {
        if (value < 1 / ratio) return 0
        const room =
          value > REACH_STEP
            ? Math.ceil(value / REACH_STEP) * REACH_STEP
            : Math.max(1, 2 ** Math.ceil(Math.log2(value)))
        return Math.min(limit, room)
      }

      let reach = held.reach
      const wanted = step(need)
      if (wanted > reach) {
        reach = wanted
        spareFramesRef.current = 0
      } else if (wanted < reach) {
        spareFramesRef.current += 1
        if (spareFramesRef.current >= SHRINK_AFTER) {
          reach = wanted
          spareFramesRef.current = 0
        }
      } else {
        spareFramesRef.current = 0
      }

      if (need > limit && !warnedAboutSize) {
        warnedAboutSize = true
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            'ElementMirror: the source paints further outside its layout box ' +
              'than a canvas can be allocated for, so the edges of it are cut ' +
              'off. Lower pixelRatio, or mirror a smaller source.',
            resolveSource(source)
          )
        }
      }
      if (
        held.width === layout.width &&
        held.height === layout.height &&
        held.reach === reach
      ) {
        return
      }

      // Rounded out to whole CSS pixels, which is the size the canvas will be
      // shown at when the mirror is at the source's own scale. A canvas shown
      // at a fractional CSS size is resampled by the browser however exactly
      // its bitmap divides into device pixels, and a resampled glyph is a
      // blurred one — while a source's layout box is fractional all the time.
      const extentWidth = Math.ceil(layout.width + reach * 2)
      const extentHeight = Math.ceil(layout.height + reach * 2)
      // Assigning either dimension clears the canvas, which is why nothing
      // else is allowed to resize it: every caller of this draws immediately
      // afterwards, so the frame that needed the new size fills it.
      canvas.width = Math.ceil(extentWidth * ratio)
      canvas.height = Math.ceil(extentHeight * ratio)
      heldRef.current = { ...layout, reach, extentWidth, extentHeight }
      fit()
    }

    const subscription = subscribeToSource({
      resolve: () => resolveSource(source),
      fps: paused ? 0 : fps,
      delay,
      pixelRatio,
      isActive: () => onScreen,
      onFrame(bitmap, _width, _height, geometry) {
        const context = canvas.getContext('2d')
        if (!context) return

        const layout = {
          width: geometry.layoutWidth,
          height: geometry.layoutHeight,
        }
        // The bitmap at its own scale, placed where the capture says it belongs:
        // its own top-left against the layout box's, plus however far the
        // source's transform pushed it. A capture widens by different amounts on
        // different sides — a shadow falls one way, a child's ring reaches the
        // edge it touches — so this is told rather than inferred, and the
        // frame's recorded size, which lags the bitmap on a fast transform, is
        // never consulted.
        const width = bitmap.width / geometry.pixelRatio
        const height = bitmap.height / geometry.pixelRatio
        const x = geometry.originX + geometry.translateX
        const y = geometry.originY + geometry.translateY

        hold(
          layout,
          Math.max(
            0,
            -x,
            x + width - layout.width,
            -y,
            y + height - layout.height
          )
        )
        const { reach, extentWidth, extentHeight } = heldRef.current

        // Drawn in the source's own scale, which is the space every number
        // above is in; the canvas is stretched to the mirror's box by CSS.
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, extentWidth, extentHeight)
        const fill = backgroundRef.current
        if (fill) {
          context.fillStyle = fill
          context.fillRect(reach, reach, layout.width, layout.height)
        }
        // Landed on the device grid. A capture's own pixels are whole, and
        // drawing them at a fraction of one resamples the whole bitmap — soft
        // text, soft edges — to place it a fraction of a pixel more precisely
        // than a screen can show. The furthest this can be from where the
        // capture says it belongs is half a device pixel.
        const snap = (value: number) => Math.round(value * ratio) / ratio
        context.drawImage(
          bitmap,
          snap(reach + x),
          snap(reach + y),
          width,
          height
        )

        if (!hasFrameRef.current) {
          hasFrameRef.current = true
          setHasFrame(true)
        }
        setIntrinsic((previous) =>
          previous?.width === layout.width && previous?.height === layout.height
            ? previous
            : layout
        )
      },
    })

    // Watched rather than measured once: the mirror's box is whatever CSS
    // makes of it, which the page can change without touching this component.
    const resize = new ResizeObserver(([entry]) => {
      const size = entry.contentRect
      boxRef.current = { width: size.width, height: size.height }
      // Only once the ratio is in place, since a mirror that has not measured
      // its source yet has no box for reasons that say nothing about the CSS.
      // Observed rather than checked once, so a mirror mounted inside a hidden
      // tab decides when it is shown.
      if (intrinsicRef.current && (size.width === 0 || size.height === 0)) {
        setDeclared(true)
      }
      fit()
    })
    resize.observe(wrapper)

    // Margined by what the source might paint: the wrapper can be well off
    // screen while the paint that belongs to it is not.
    const intersection = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) subscription.wake()
      },
      { rootMargin: `${WAKE_MARGIN}px` }
    )
    intersection.observe(wrapper)

    return () => {
      resize.disconnect()
      intersection.disconnect()
      subscription.release()
    }
  }, [source, fps, delay, pixelRatio, paused, fit])

  // The intrinsic size has to be settled before the first paint. Left to an
  // ordinary effect, the wrapper would lay out once at nothing, which reads as
  // a jump wherever a mirror appears among other content.
  useIsomorphicLayoutEffect(() => {
    const element = resolveSource(source)
    if (element) setIntrinsic(readLayoutBox(element))
  }, [source])

  /**
   * Decides whether this mirror has to declare its intrinsic size.
   *
   * Checked here as well as on resize because the answer is usually the same
   * before and after the ratio lands — an empty box stays an empty box — and a
   * ResizeObserver reports changes rather than states, so the one case that
   * needs deciding is the one case it says nothing about.
   */
  useIsomorphicLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || declared || !intrinsic) return
    const box = wrapper.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) setDeclared(true)
  }, [intrinsic, declared])

  return (
    <span
      ref={wrapperRef}
      style={{
        // The one declaration CSS cannot override, and the only one the mirror
        // cannot do without: an inline box takes no width or height at all, and
        // a block one would fill its container rather than take its source's
        // size. Pass `style` to change it — a class cannot, since an inline
        // style outranks every stylesheet on the page.
        display: 'inline-block',
        // An inline-level box sits on the line's baseline, which leaves room
        // for descenders under it — a few stray pixels of parent below every
        // mirror, exactly the gap under an unstyled `<img>`. Aligning to the
        // bottom of the line spends that room instead of reserving it. Every
        // CSS reset does the same to replaced elements, but a span is not one,
        // so a mirror in a page with a reset would miss out.
        verticalAlign: 'bottom',
        // Before the first capture lands there is nothing to show, and a
        // capture cannot be taken synchronously. Painting anyway would put an
        // empty box on screen for a frame, which reads as a flicker wherever a
        // mirror appears in response to an interaction. Hidden rather than
        // unmounted, so it still holds its layout box.
        ...(hasFrame ? null : { visibility: 'hidden' as const }),
        ...(intrinsic ? sizing(intrinsic, declared) : null),
        ...style,
      }}
      // Says which of the two elements is the mirror's box, for anything
      // measuring one from the outside. The canvas is not it: what a mirror
      // paints and what it occupies are deliberately different things.
      data-element-mirror=""
      {...spanProps}
    >
      <canvas
        ref={canvasRef}
        // Out of flow, so the room the paint needs never reaches layout.
        style={{ position: 'absolute', pointerEvents: 'none' }}
        // Never let one mirror appear inside another capture of a containing
        // element, which would recurse visually.
        data-element-mirror-ignore
      />
    </span>
  )
})
