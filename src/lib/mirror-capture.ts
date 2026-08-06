import { screenshot } from '@renoun/screenshot'

/**
 * Shared capture scheduling for every mirror on the page.
 *
 * Capturing an element costs roughly one DOM walk plus a computed-style read
 * per node, which dwarfs the cost of drawing the resulting bitmap: a capture of
 * a small card runs a few milliseconds, while blitting it is measured in
 * microseconds. Three consequences shape this module:
 *
 * 1. Mirrors of the same element share one capture and each blit from it, so N
 *    mirrors cost one capture instead of N.
 * 2. The fastest subscriber drives the clock and slower ones sample it, so an
 *    element costs max(fps) rather than sum(fps).
 * 3. A capture is skipped entirely while the source is unchanged, and the loop
 *    backs off when captures turn out to be expensive.
 *
 * One loop drives every mirror. Each cycle resolves each subscriber's source
 * afresh and buckets subscribers by the element they landed on, which is what
 * lets sharing key on the element itself: a ref and a selector that name the
 * same node share a capture, and a source may appear late, be swapped, or go
 * away without the subscription knowing.
 */

/** Share of wall-clock time the capture loop is allowed to consume. */
export const CAPTURE_DUTY_CYCLE = 0.2

/** How long to wait before looking again for a missing or zero-sized source. */
const RETRY_MS = 250

/** How long an unserviced element keeps its observers before being dropped. */
const STALE_MS = 5000

export type CaptureMode = 'auto' | 'always' | 'once'

export interface MirrorSubscriber {
  /** Resolved each cycle, so a source may appear, change, or disappear. */
  resolve: () => Element | null
  /** Blits per second. Values <= 0 paint one frame and stop. */
  fps: number
  pixelRatio?: number
  capture: CaptureMode
  /** Whether this subscriber currently wants frames at all. */
  isActive: () => boolean
  onFrame: (
    bitmap: HTMLCanvasElement,
    sourceWidth: number,
    sourceHeight: number
  ) => void
}

export interface CaptureStats {
  /** Distinct elements being captured. */
  sources: number
  /** Mirrors subscribed across all sources. */
  mirrors: number
  capturesPerSecond: number
  blitsPerSecond: number
  /** Services that found the source unchanged and skipped the capture. */
  skippedPerSecond: number
  msPerCapture: number
  /** Estimated share of the main thread spent capturing. */
  mainThreadPercent: number
}

interface SubscriberState {
  nextDueAt: number
  /** A mirror with nothing on it yet needs a frame, changed source or not. */
  painted: boolean
  done: boolean
}

interface SourceState {
  buffer: HTMLCanvasElement
  dirty: boolean
  lastCaptureAt: number
  lastDurationMs: number
  /** Playback positions of any videos, to notice frames advancing. */
  videoSignature: string
  lastSeenAt: number
  mutation: MutationObserver
  resize: ResizeObserver
}

const subscribers = new Map<MirrorSubscriber, SubscriberState>()
const sources = new Map<Element, SourceState>()

function stateFor(element: Element, now: number) {
  let state = sources.get(element)
  if (!state) {
    const created: SourceState = {
      buffer: document.createElement('canvas'),
      dirty: true,
      lastCaptureAt: 0,
      lastDurationMs: 0,
      videoSignature: '',
      lastSeenAt: now,
      mutation: new MutationObserver(() => {
        created.dirty = true
      }),
      resize: new ResizeObserver(() => {
        created.dirty = true
      }),
    }
    created.mutation.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    created.resize.observe(element)
    sources.set(element, created)
    state = created
  }
  state.lastSeenAt = now
  return state
}

function forget(element: Element, state: SourceState) {
  state.mutation.disconnect()
  state.resize.disconnect()
  sources.delete(element)
}

/** The element itself plus any descendants matching the selector. */
function selfAndDescendants(target: Element, selector: string) {
  const found = target.matches(selector) ? [target] : []
  return found.concat(Array.from(target.querySelectorAll(selector)))
}

/**
 * Whether a video is too far from having a frame to contribute one, which is
 * the same bar the capture itself applies before drawing a video.
 */
function cannotDrawVideo(video: HTMLVideoElement) {
  return video.readyState < video.HAVE_CURRENT_DATA
}

/**
 * Content that repaints without mutating the DOM, which a MutationObserver
 * cannot see: running CSS animations and transitions, playing video, and
 * canvases other than mirrors.
 */
function hasLiveContent(state: SourceState, target: Element) {
  const animations = target.getAnimations?.({ subtree: true }) ?? []
  for (const animation of animations) {
    if (animation.playState === 'running') return true
  }

  // A video advancing is invisible to observers, and so is a seek while
  // paused, but both move currentTime. Comparing positions covers each case
  // without keeping a paused video's mirror capturing forever.
  const videos = selfAndDescendants(target, 'video') as HTMLVideoElement[]
  if (videos.length > 0) {
    const signature = videos.map((video) => video.currentTime).join(',')
    if (signature !== state.videoSignature) {
      state.videoSignature = signature
      return true
    }
  }

  // A canvas can repaint with no observable trace at all, so assume it did.
  return (
    selfAndDescendants(target, 'canvas:not([data-screenshot-ignore])').length > 0
  )
}

let timer: number | undefined
let wakeAt = Number.POSITIVE_INFINITY
let pumping = false

function scheduleAt(time: number) {
  if (timer !== undefined) {
    if (time >= wakeAt) return
    window.clearTimeout(timer)
  }
  wakeAt = time
  timer = window.setTimeout(
    () => {
      timer = undefined
      wakeAt = Number.POSITIVE_INFINITY
      void pump()
    },
    Math.max(0, time - performance.now())
  )
}

/** Books each subscriber's next frame and reports the soonest of them. */
function advance(due: MirrorSubscriber[], now: number) {
  let next = Number.POSITIVE_INFINITY
  for (const subscriber of due) {
    const state = subscribers.get(subscriber)
    if (!state) continue
    if (subscriber.capture === 'once' && state.painted) {
      state.done = true
      continue
    }
    // A non-positive rate is a single frame, like capture: 'once'.
    if (subscriber.fps <= 0) {
      state.nextDueAt = Number.POSITIVE_INFINITY
      continue
    }
    state.nextDueAt = now + 1000 / subscriber.fps
    next = Math.min(next, state.nextDueAt)
  }
  return next
}

/** Captures one element if it is due and dirty, then blits to its mirrors. */
async function serviceSource(element: Element, due: MirrorSubscriber[]) {
  const now = performance.now()
  const state = stateFor(element, now)

  // One layout read per capture, shared by every mirror of this element.
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return now + RETRY_MS

  // Backpressure: an expensive source degrades to a lower rate rather than
  // saturating the main thread.
  const affordableAt =
    state.lastCaptureAt + state.lastDurationMs / CAPTURE_DUTY_CYCLE
  if (affordableAt > now + 1) return affordableAt

  // Seeking and buffering drop a video below the bar for drawing a frame, so
  // capturing now would punch a hole where the video is. The video element
  // itself keeps showing its last frame at times like this, and so do its
  // mirrors. Marking the element dirty guarantees a capture once it recovers.
  const everyMirrorHasAFrame = due.every(
    (subscriber) => subscribers.get(subscriber)?.painted
  )
  if (
    everyMirrorHasAFrame &&
    (selfAndDescendants(element, 'video') as HTMLVideoElement[]).some(
      cannotDrawVideo
    )
  ) {
    state.dirty = true
    return advance(due, now)
  }

  const forced = due.some((subscriber) => {
    if (subscriber.capture !== 'auto') return true
    return !subscribers.get(subscriber)?.painted
  })
  if (!forced && !state.dirty && !hasLiveContent(state, element)) {
    counters.skipped += 1
    return advance(due, now)
  }

  const pixelRatio = Math.max(
    ...due.map(
      (subscriber) => subscriber.pixelRatio ?? window.devicePixelRatio ?? 1
    )
  )

  // Cleared before the capture: a mutation arriving mid-capture should leave
  // the element dirty rather than be swallowed by this frame.
  state.dirty = false
  const started = performance.now()
  try {
    // Always captured transparent; each mirror applies its own background at
    // blit time, so background does not fragment the sharing.
    await screenshot.canvas(element, {
      canvas: state.buffer,
      scale: pixelRatio,
      backgroundColor: null,
    })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('ElementMirror: capture failed', element, error)
    }
    state.lastCaptureAt = performance.now()
    return advance(due, state.lastCaptureAt)
  }
  const finished = performance.now()
  state.lastDurationMs = finished - started
  state.lastCaptureAt = finished
  counters.captures += 1
  counters.durationMs += state.lastDurationMs

  for (const subscriber of due) {
    subscriber.onFrame(state.buffer, rect.width, rect.height)
    counters.blits += 1
    const subscriberState = subscribers.get(subscriber)
    if (subscriberState) subscriberState.painted = true
  }

  return advance(due, performance.now())
}

async function pump() {
  if (pumping) return
  pumping = true
  try {
    // Nothing is painting while the tab is hidden; visibilitychange resumes.
    if (document.hidden) return

    const now = performance.now()
    let next = Number.POSITIVE_INFINITY
    const buckets = new Map<Element, MirrorSubscriber[]>()

    for (const [subscriber, state] of subscribers) {
      if (state.done || !subscriber.isActive()) continue
      const element = subscriber.resolve()
      if (!element) {
        next = Math.min(next, now + RETRY_MS)
        continue
      }
      if (state.nextDueAt > now + 1) {
        next = Math.min(next, state.nextDueAt)
        continue
      }
      const bucket = buckets.get(element)
      if (bucket) bucket.push(subscriber)
      else buckets.set(element, [subscriber])
    }

    for (const [element, due] of buckets) {
      next = Math.min(next, await serviceSource(element, due))
    }

    for (const [element, state] of sources) {
      if (performance.now() - state.lastSeenAt > STALE_MS) {
        forget(element, state)
      }
    }

    if (next < Number.POSITIVE_INFINITY) scheduleAt(next)
  } finally {
    pumping = false
  }
}

/** Runs the loop now, from outside it. */
function kick() {
  if (pumping) return
  scheduleAt(0)
}

let globalListeners = false

function ensureGlobalListeners() {
  if (globalListeners) return
  globalListeners = true

  // Styles inherited from outside the subtree (a theme class on <html>, for
  // instance) change what a capture would produce without mutating the source.
  const root = new MutationObserver(() => {
    for (const state of sources.values()) state.dirty = true
    kick()
  })
  root.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  })
  if (document.body) {
    root.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick()
  })
}

export interface MirrorSubscription {
  /** Ask for a frame now, after becoming visible or unpaused. */
  wake: () => void
  release: () => void
}

export function subscribeToSource(
  subscriber: MirrorSubscriber
): MirrorSubscription {
  ensureGlobalListeners()
  subscribers.set(subscriber, { nextDueAt: 0, painted: false, done: false })
  kick()

  return {
    wake() {
      const state = subscribers.get(subscriber)
      if (!state) return
      state.nextDueAt = 0
      kick()
    },
    release() {
      subscribers.delete(subscriber)
      if (subscribers.size > 0) return
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
        wakeAt = Number.POSITIVE_INFINITY
      }
      for (const [element, state] of sources) forget(element, state)
    },
  }
}

let counters = {
  captures: 0,
  blits: 0,
  skipped: 0,
  durationMs: 0,
  since: 0,
}
const statsListeners = new Set<(stats: CaptureStats) => void>()
let statsTimer: number | undefined

function resetCounters() {
  counters = {
    captures: 0,
    blits: 0,
    skipped: 0,
    durationMs: 0,
    since: performance.now(),
  }
}

function emitStats() {
  const elapsedSeconds = Math.max(1, performance.now() - counters.since) / 1000
  const capturesPerSecond = counters.captures / elapsedSeconds
  const msPerCapture = counters.captures
    ? counters.durationMs / counters.captures
    : 0
  const stats: CaptureStats = {
    sources: sources.size,
    mirrors: subscribers.size,
    capturesPerSecond: +capturesPerSecond.toFixed(1),
    blitsPerSecond: +(counters.blits / elapsedSeconds).toFixed(1),
    skippedPerSecond: +(counters.skipped / elapsedSeconds).toFixed(1),
    msPerCapture: +msPerCapture.toFixed(2),
    mainThreadPercent: +((capturesPerSecond * msPerCapture) / 10).toFixed(1),
  }
  resetCounters()
  for (const listener of statsListeners) listener(stats)
}

/** Live capture accounting, for the demo's readout. */
export function subscribeToCaptureStats(
  listener: (stats: CaptureStats) => void
) {
  statsListeners.add(listener)
  if (statsTimer === undefined) {
    resetCounters()
    statsTimer = window.setInterval(emitStats, 500)
  }
  return () => {
    statsListeners.delete(listener)
    if (statsListeners.size === 0 && statsTimer !== undefined) {
      window.clearInterval(statsTimer)
      statsTimer = undefined
    }
  }
}
