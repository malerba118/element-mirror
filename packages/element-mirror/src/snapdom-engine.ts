import { snapdom } from '@frostin/snapdom'

/**
 * The renderer behind every capture: `@frostin/snapdom`, a fork of SnapDOM
 * tuned for exactly this workload. It clones the source subtree into an SVG
 * `foreignObject` and hands it to the browser to paint, so masks, blend
 * modes, filters and text shaping come out right without anyone implementing
 * them; the fork adds per-node style-cache invalidation and smaller
 * per-frame SVGs so re-capturing the same element sixty times a second stays
 * cheap. The engine choice was settled by measurement — see the fork's
 * FORK.md for the story.
 */

/**
 * Mirrors are marked so that a capture never draws another mirror: one sitting
 * inside the element being captured would otherwise recurse a frame at a time.
 */
export const IGNORE_ATTRIBUTE = 'data-element-mirror-ignore'

/**
 * A capture in two phases. The promise returning this handle resolves when the
 * engine is done with the main thread and the next capture may safely begin;
 * `settled` resolves once the pixels are actually in the canvas. SnapDOM
 * builds an SVG on the main thread and then waits for the browser to decode
 * it, which happens off-thread and takes longer than a 60fps frame — the
 * split is what lets the capture loop bill only real work and overlap the
 * decode with the next frame.
 */
export interface CaptureHandle {
  /** Main-thread cost of this capture in milliseconds. */
  mainThreadMs: number
  /** Resolves when the canvas holds the frame; rejects if it never will. */
  settled: Promise<void>
}

/**
 * Renders `element` into `canvas` at `scale`, leaving it transparent behind.
 * Resolves when the main-thread work is done; the returned handle says when
 * the canvas holds the frame (see CaptureHandle).
 */
export async function capture(
  element: Element,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<CaptureHandle> {
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
}
