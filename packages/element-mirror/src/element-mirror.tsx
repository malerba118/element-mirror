'use client'

import * as React from 'react'

import { subscribeToSource } from './mirror-capture'

export type ElementMirrorSource =
  | Element
  | React.RefObject<Element | null>
  | string

export type ElementMirrorProps = Omit<
  React.CanvasHTMLAttributes<HTMLCanvasElement>,
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
   * Captures land on displayed frames, so the effective ceiling is the
   * refresh rate, and a rate that does not divide into it is spaced as
   * evenly as whole frames allow. An expensive source is held below the
   * requested rate rather than allowed to saturate the main thread.
   *
   * @default 12
   */
  fps?: number

  /**
   * How far behind the source this mirror runs, in milliseconds.
   *
   * Mirrors of one source share its capture history, so a trail of
   * delayed mirrors costs no more captures than a single mirror.
   *
   * Resolution is bounded by the capture rate: a delay finer than one
   * capture interval lands on the nearest captured frame.
   *
   * @default 0
   */
  delay?: number

  /**
   * Number of bitmap pixels captured per CSS pixel.
   *
   * Lower values reduce capture cost. Higher values produce a
   * sharper canvas at larger display sizes.
   *
   * @default window.devicePixelRatio
   */
  pixelRatio?: number

  /**
   * Determines how the captured bitmap fits inside the canvas when
   * CSS gives it both an explicit width and height.
   *
   * Equivalent to the CSS property, and only set when passed, so a
   * stylesheet or class can supply it instead.
   *
   * @default 'fill'
   */
  objectFit?: React.CSSProperties['objectFit']

  /**
   * Determines the alignment of the captured bitmap when
   * objectFit crops or letterboxes it.
   *
   * @default 'center'
   */
  objectPosition?: React.CSSProperties['objectPosition']

  /**
   * Paints a background behind the captured element.
   *
   * null preserves transparency.
   *
   * @default null
   */
  background?: string | null

  /**
   * Suspends capturing while preserving the last painted frame.
   *
   * A mirror paused before it has a frame still captures one, so it holds a
   * still of the source rather than nothing.
   *
   * @default false
   */
  paused?: boolean
}

// Reading layout has to happen before the browser paints, but there is no
// layout to read while rendering on the server.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

// A canvas's intrinsic size is its bitmap size, which is the source scaled by
// pixelRatio, so an unsized mirror would lay out devicePixelRatio times too
// big. Size containment replaces that with a declared intrinsic size, giving
// the source's own dimensions the way a density-described image does.
// Browsers that took `contain: size` before this property would collapse the
// canvas to nothing, so the pair has to be applied together or not at all.
const canDeclareIntrinsicSize =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('contain-intrinsic-size', '1px 1px')

function resolveSource(source: ElementMirrorSource): Element | null {
  if (typeof source === 'string') return document.querySelector(source)
  if (source instanceof Element) return source
  return source.current
}

/**
 * A live mirror of another DOM element, rendered into a <canvas>.
 *
 * The canvas sizes like an <img> of the source: left alone it takes the
 * source's own width and height, given one dimension it derives the other
 * from the source's aspect ratio, and given both it fits the capture inside
 * with `objectFit`. CSS always wins, from a stylesheet or anywhere else.
 *
 * Mirrors pointing at the same element share a single capture, so adding
 * mirrors costs bitmap draws rather than captures.
 *
 * Like an image, a mirror stays hidden until it has a frame to show, while
 * still taking up its layout box.
 */
export const ElementMirror = React.forwardRef<
  HTMLCanvasElement,
  ElementMirrorProps
>(function ElementMirror(
  {
    source,
    fps = 12,
    delay = 0,
    pixelRatio,
    objectFit,
    objectPosition,
    background = null,
    paused = false,
    style,
    ...canvasProps
  },
  forwardedRef
) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  React.useImperativeHandle(forwardedRef, () => canvasRef.current!)
  const [measured, setMeasured] = React.useState<{
    width: number
    height: number
  } | null>(null)
  const [hasFrame, setHasFrame] = React.useState(false)
  const hasFrameRef = React.useRef(false)

  // Presentation-only option, read at blit time. Keeping it out of the
  // effect's dependencies means changing it never restarts capturing.
  const backgroundRef = React.useRef(background)
  backgroundRef.current = background

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Pausing holds whatever is on the canvas, so a mirror that already has a
    // frame needs nothing further. One that does not still owes the page an
    // image: a non-positive rate captures a single frame and retires.
    if (paused && hasFrameRef.current) return

    // Assume visible until the observer says otherwise, so the first frame
    // paints without waiting a callback.
    let onScreen = true

    const subscription = subscribeToSource({
      resolve: () => resolveSource(source),
      fps: paused ? 0 : fps,
      delay,
      pixelRatio,
      isActive: () => onScreen,
      onFrame(bitmap, sourceWidth, sourceHeight) {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
        }
        const context = canvas.getContext('2d')
        if (!context) return
        context.clearRect(0, 0, canvas.width, canvas.height)
        const fill = backgroundRef.current
        if (fill) {
          context.fillStyle = fill
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        context.drawImage(bitmap, 0, 0)

        if (!hasFrameRef.current) {
          hasFrameRef.current = true
          setHasFrame(true)
        }

        setMeasured((previous) =>
          previous?.width === sourceWidth && previous?.height === sourceHeight
            ? previous
            : { width: sourceWidth, height: sourceHeight }
        )
      },
    })

    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) subscription.wake()
    })
    intersection.observe(canvas)

    return () => {
      intersection.disconnect()
      subscription.release()
    }
  }, [source, fps, delay, pixelRatio, paused])

  // The intrinsic size has to be settled before the first paint. Left to an
  // ordinary effect, the canvas would lay out once at its default 300x150,
  // which reads as a flash of the wrong shape.
  useIsomorphicLayoutEffect(() => {
    const rect = resolveSource(source)?.getBoundingClientRect()
    if (rect) setMeasured({ width: rect.width, height: rect.height })
  }, [source])

  return (
    <canvas
      ref={canvasRef}
      // Never let one mirror appear inside another capture of a containing
      // element, which would recurse visually.
      data-element-mirror-ignore
      style={{
        objectFit,
        objectPosition,
        // Before the first capture lands there is nothing to show, and a
        // capture cannot be taken synchronously. Painting the canvas anyway
        // would put an empty box on screen for a frame, which reads as a
        // flicker wherever a mirror appears in response to an interaction.
        // Hidden rather than unmounted, so it still holds its layout box.
        ...(hasFrame ? null : { visibility: 'hidden' as const }),
        // Only an intrinsic size, so any width or height the page gives the
        // canvas still wins, wherever it comes from.
        ...(measured && canDeclareIntrinsicSize
          ? {
              contain: 'size',
              containIntrinsicSize: `${measured.width}px ${measured.height}px`,
            }
          : null),
        ...style,
      }}
      {...canvasProps}
    />
  )
})
