import { screenshot } from '@screenshot'

/**
 * The renderers a mirror can be captured with.
 *
 * There are two families here rather than three implementations of one thing.
 * The vendored fork walks the DOM and paints to a canvas itself, so it decides
 * how every CSS property is drawn. SnapDOM and modern-screenshot clone the
 * subtree into an SVG `foreignObject` and hand it back to the browser to paint,
 * so masks, blend modes, filters and text shaping come out right without anyone
 * implementing them, and what they give away instead is the live state a clone
 * cannot carry: a playing video, a scroll offset, an element whose bitmap the
 * browser will not hand over.
 *
 * Two of the three are vendored under `vendor/` and imported as source, so a
 * fault in either is something to fix rather than work around. The published
 * `@zumer/snapdom` is still a dependency, but only `.perf` uses it, as the
 * unforked baseline to measure the fork against.
 *
 * `.perf/renderers.mjs` scores all three against the real thing, and the
 * gallery can switch between them while it runs, which is what this indirection
 * is for.
 */
export type MirrorEngine = 'fork' | 'snapdom' | 'modern'

export const MIRROR_ENGINES: readonly MirrorEngine[] = [
  'fork',
  'snapdom',
  'modern',
] as const

/**
 * SnapDOM, on the evidence of `.perf/fidelity.mjs` and `.perf/ceiling.mjs`: as
 * faithful as modern-screenshot across the gallery and three to five times
 * cheaper, where the fork cannot hold ten frames a second on a card and gets a
 * good deal of the CSS wrong.
 */
export const DEFAULT_MIRROR_ENGINE: MirrorEngine = 'snapdom'

/** What each engine is, for a control that has room for a sentence. */
export const MIRROR_ENGINE_NOTES: Record<MirrorEngine, string> = {
  fork: 'the vendored renoun fork, painting to a canvas itself',
  snapdom: 'the vendored SnapDOM fork, cloning into an SVG for the browser',
  modern: 'modern-screenshot, cloning into an SVG for the browser to paint',
}

/**
 * Mirrors are marked so that a capture never draws another mirror: one sitting
 * inside the element being captured would otherwise recurse a frame at a time.
 */
const IGNORE_ATTRIBUTE = 'data-screenshot-ignore'

const isMirror = (node: Node) =>
  node instanceof Element && node.hasAttribute(IGNORE_ATTRIBUTE)

/**
 * modern-screenshot does not paint into a canvas it was handed, so its result
 * is copied into the pooled one. The SnapDOM fork takes the canvas directly
 * (its `canvas` option) and skips this copy.
 */
function copyInto(produced: HTMLCanvasElement, canvas: HTMLCanvasElement) {
  canvas.width = produced.width
  canvas.height = produced.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('ElementMirror: no 2D context for the capture')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(produced, 0, 0)
}

// Held rather than awaited per frame, so the dynamic import costs one round
// trip the first time an engine is used and nothing after it.
let snapdomModule: Promise<typeof import('@snapdom')> | null = null
let modernModule: Promise<typeof import('modern-screenshot')> | null = null

type ModernContext = Awaited<
  ReturnType<typeof import('modern-screenshot').createContext>
>

/**
 * modern-screenshot reads the page's fonts and the browser's default styles
 * once per capture unless it is handed a context to keep them in, which is
 * three quarters of the cost of a repeat capture. A mirror captures the same
 * element over and over, so each element keeps one.
 *
 * The context is built around a size, so it is thrown away and rebuilt when the
 * element is a different size than it was.
 */
const modernContexts = new WeakMap<
  Element,
  { key: string; context: ModernContext }
>()

async function modernContextFor(
  element: Element,
  scale: number,
  destroy: (context: ModernContext) => void,
  create: (element: Element, scale: number) => Promise<ModernContext>
) {
  const rect = element.getBoundingClientRect()
  const key = `${scale}:${Math.round(rect.width)}x${Math.round(rect.height)}`
  const held = modernContexts.get(element)
  if (held?.key === key) return held.context

  if (held) destroy(held.context)
  const context = await create(element, scale)
  modernContexts.set(element, { key, context })
  return context
}

/**
 * A capture in two phases. The promise returning this handle resolves when the
 * engine is done with the main thread and the next capture may safely begin;
 * `settled` resolves once the pixels are actually in the canvas. SnapDOM is the
 * engine the split exists for: it builds an SVG on the main thread and then
 * waits for the browser to decode it, which happens off-thread and takes
 * longer than a 60fps frame. An engine that cannot separate the phases settles
 * before the handle is returned, and the two moments coincide.
 */
export interface CaptureHandle {
  /**
   * Main-thread cost in milliseconds, when the engine can tell its own work
   * apart from time spent awaiting the browser. Absent, the caller has only
   * the wall clock to go by.
   */
  mainThreadMs?: number
  /** Resolves when the canvas holds the frame; rejects if it never will. */
  settled: Promise<void>
}

const SETTLED: Promise<void> = Promise.resolve()

const ENGINES: Record<
  MirrorEngine,
  (
    element: Element,
    canvas: HTMLCanvasElement,
    scale: number
  ) => Promise<CaptureHandle>
> = {
  fork: async (element, canvas, scale) => {
    await screenshot.canvas(element, { canvas, scale, backgroundColor: null })
    return { settled: SETTLED }
  },

  snapdom: async (element, canvas, scale) => {
    snapdomModule ??= import('@snapdom')
    const { snapdom } = await snapdomModule
    // Split where SnapDOM itself splits: building the SVG holds the main
    // thread, while rasterizing it is the browser decoding an image, which
    // runs off-thread and only costs this loop the wait.
    const started = performance.now()
    const snapshot = await snapdom(element as HTMLElement, {
      // SnapDOM works in device pixels already, so a scale on top of its own
      // would square it.
      dpr: scale,
      scale: 1,
      // Off by default, and the clone is painted as a detached document that
      // cannot reach the page's fonts, so text is set in a fallback and every
      // line of it lands slightly wrong. Costs nothing measurable.
      embedFonts: true,
      exclude: [`[${IGNORE_ATTRIBUTE}]`],
    })
    const mainThreadMs = performance.now() - started
    return {
      mainThreadMs,
      // The fork draws straight into the pooled canvas (its `canvas` option),
      // so there is no per-frame copy out of a throwaway one.
      settled: snapshot.toCanvas({ canvas }).then(() => {}),
    }
  },

  modern: async (element, canvas, scale) => {
    modernModule ??= import('modern-screenshot')
    const { createContext, destroyContext, domToCanvas } = await modernModule
    const context = await modernContextFor(
      element,
      scale,
      destroyContext,
      (element, scale) =>
        createContext(element, {
          scale,
          filter: (node) => !isMirror(node),
          autoDestruct: false,
        })
    )
    copyInto(await domToCanvas(context), canvas)
    return { settled: SETTLED }
  },
}

/**
 * Renders `element` into `canvas` at `scale`, leaving it transparent behind.
 * Resolves when the engine's main-thread work is done; the returned handle
 * says when the canvas holds the frame (see CaptureHandle).
 */
export function captureWith(
  engine: MirrorEngine,
  element: Element,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<CaptureHandle> {
  return ENGINES[engine](element, canvas, scale)
}
