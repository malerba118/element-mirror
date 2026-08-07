import {
  capture as captureInto,
  IGNORE_ATTRIBUTE,
  type CaptureHandle,
} from './snapdom-engine'

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
 * Deciding a source is unchanged has to be right, because nothing in the API
 * asks for a capture anyway. Three mechanisms together decide it: observers,
 * for changes to the tree, its attributes or its size; polling, for content
 * that repaints under its own power, like a running animation or an advancing
 * video; and capture-phase listeners, for the changes that leave no trace in
 * the DOM at all, like a typed value or a scroll offset. None of that is
 * provably exhaustive, so a source is re-captured every VERIFY_MS regardless,
 * which turns a hole in the detection into a moment of staleness rather than a
 * mirror that is wrong until something else happens to it.
 *
 * Capturing and presenting are separate. Captures accumulate in a per-source
 * timeline, and each mirror is drawn the frame matching its own `delay`, so a
 * mirror running behind the source has a new frame to show whenever one ages
 * into its past, which is not the same moment a capture happens. Delayed
 * mirrors therefore cost history rather than captures: a trail of eight ghosts
 * over one element is still one capture per frame.
 *
 * One loop drives every mirror. Each cycle resolves each subscriber's source
 * afresh and buckets subscribers by the element they landed on, which is what
 * lets sharing key on the element itself: a ref and a selector that name the
 * same node share a capture, and a source may appear late, be swapped, or go
 * away without the subscription knowing.
 */

/**
 * Share of the main thread the capture loop is allowed to consume.
 *
 * This, and not the `fps` a mirror asks for, is what sets the rate it gets:
 * captures are spaced by cost divided by this, so ten milliseconds a capture at
 * 20% is fifty milliseconds apart however fast the mirror asked to run.
 *
 * The cost being divided is main-thread work only. An engine that can tell its
 * own work from time spent awaiting the browser's rasterizer reports just the
 * work (see CaptureHandle), so a capture whose SVG decode overlaps the next
 * frame is billed for what it actually took from the page. The player card
 * costs ~5ms of main thread a capture at 2x; 45% spaces that to ~11ms, which
 * is what lets a mirror asking for 60 get 60, and `.perf/live.mjs` shows the
 * page still painting at its full refresh rate alongside. Each further source
 * needs its own share of the thread, while mirrors of the same source are
 * free.
 */
export const CAPTURE_DUTY_CYCLE = 0.45

/** Weight of the newest capture in a source's running cost, per capture. */
const COST_WEIGHT = 0.2

/** How long to wait before looking again for a missing or zero-sized source. */
const RETRY_MS = 250

/** How long an unserviced element keeps its observers before being dropped. */
const STALE_MS = 5000

/**
 * How long a source may go unverified while it looks unchanged.
 *
 * The change detection is a heuristic, and a heuristic that is wrong leaves a
 * mirror silently stale, which is a worse failure than a capture nobody needed.
 * Re-capturing on this interval bounds how wrong a mirror can be, at a cost of
 * roughly one capture per second per still source.
 */
const VERIFY_MS = 1000

/** Ceiling on the pixels one source may hold as history for delayed mirrors. */
const TIMELINE_BUDGET_BYTES = 32 * 1024 * 1024

/** Spare capture canvases kept for reuse rather than reallocated. */
const POOL_LIMIT = 4

/**
 * Events that repaint an element without leaving a trace an observer can see.
 * Registered in the capture phase, which reaches the source for events fired
 * on any descendant whether or not they bubble.
 */
const REPAINT_EVENTS = [
  // Typed and selected values live on the property, never the attribute.
  'input',
  'change',
  // A scroll offset is not DOM state at all.
  'scroll',
  // :hover and :focus-visible restyle without touching the tree.
  'pointerover',
  'pointerout',
  'focusin',
  'focusout',
  // Images and frames that arrive after their attribute was set.
  'load',
] as const

const REPAINT_LISTENER: AddEventListenerOptions = {
  capture: true,
  passive: true,
}

export interface MirrorSubscriber {
  /** Resolved each cycle, so a source may appear, change, or disappear. */
  resolve: () => Element | null
  /** Blits per second. Values <= 0 paint one frame and stop. */
  fps: number
  /** How far behind the source this mirror runs, in milliseconds. */
  delay: number
  pixelRatio?: number
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

/** One capture, kept so that delayed mirrors can be served from the past. */
interface Frame {
  canvas: HTMLCanvasElement
  /** When the source looked like this. */
  capturedAt: number
  /** The source's CSS size at the time, so a lagging mirror lags in size too. */
  width: number
  height: number
  /**
   * Whether the canvas holds the frame yet. A capture returns to the loop when
   * its main-thread work is done, and the browser may still be rasterizing;
   * the frame joins the timeline immediately so order is capture order, and is
   * skipped by presentation until the pixels land.
   */
  ready: boolean
}

interface SubscriberState {
  nextDueAt: number
  /** A mirror with nothing on it yet needs a frame, changed source or not. */
  painted: boolean
  done: boolean
  /** `capturedAt` of the frame currently on this mirror's canvas. */
  shownAt: number
}

interface SourceState {
  /**
   * Captures in order, newest last. Gaps are not missing history: a cycle is
   * only skipped when the source is unchanged, so the frame before a gap still
   * depicts every moment inside it.
   */
  timeline: Frame[]
  /** Canvases retired from the timeline, reused by the next capture. */
  pool: HTMLCanvasElement[]
  dirty: boolean
  lastCaptureAt: number
  /** Smoothed cost of capturing this source, in milliseconds. */
  costMs: number
  /** Playback positions of any videos, to notice frames advancing. */
  videoSignature: string
  lastSeenAt: number
  mutation: MutationObserver
  resize: ResizeObserver
  unlisten: () => void
}

const subscribers = new Map<MirrorSubscriber, SubscriberState>()
const sources = new Map<Element, SourceState>()

function stateFor(element: Element, now: number) {
  let state = sources.get(element)
  if (!state) {
    const created: SourceState = {
      timeline: [],
      pool: [],
      dirty: true,
      lastCaptureAt: 0,
      costMs: 0,
      videoSignature: '',
      lastSeenAt: now,
      mutation: new MutationObserver(() => {
        created.dirty = true
      }),
      resize: new ResizeObserver(() => {
        created.dirty = true
      }),
      unlisten: () => {},
    }
    created.mutation.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
    created.resize.observe(element)

    const markDirty = () => {
      created.dirty = true
    }
    for (const type of REPAINT_EVENTS) {
      element.addEventListener(type, markDirty, REPAINT_LISTENER)
    }
    created.unlisten = () => {
      for (const type of REPAINT_EVENTS) {
        element.removeEventListener(type, markDirty, REPAINT_LISTENER)
      }
    }

    sources.set(element, created)
    state = created
  }
  state.lastSeenAt = now
  return state
}

function forget(element: Element, state: SourceState) {
  state.mutation.disconnect()
  state.resize.disconnect()
  state.unlisten()
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
    selfAndDescendants(target, `canvas:not([${IGNORE_ATTRIBUTE}])`).length > 0
  )
}

let timer: number | undefined
let frame: number | undefined
let wakeAt = Number.POSITIVE_INFINITY
let pumping = false

/**
 * Assumed length of a displayed frame, used to align to one.
 *
 * Deliberately the slowest common refresh rate. It is the width of the window a
 * wake may be pulled forward into, and a window narrower than the real frame
 * only costs an extra wake, while a wider one would pull frames early.
 */
const FRAME_MS = 1000 / 60

function unschedule() {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
  if (frame !== undefined) {
    window.cancelAnimationFrame(frame)
    frame = undefined
  }
}

/**
 * Wakes the loop at a time, on a displayed frame where one is close enough.
 *
 * A capture is only worth the paint that carries it to the screen, and timers
 * fire on a clock of their own. At rates near the refresh rate that leaves a
 * frame finishing just after a paint went out and waiting for the next one, so
 * an evenly captured sequence reaches the eye unevenly: two frames one refresh
 * apart, then one three refreshes later. Waking on an animation frame instead
 * quantises the loop to the display, which is what makes a rate below the
 * refresh rate look steady rather than merely be steady.
 */
function scheduleAt(time: number) {
  if (timer !== undefined || frame !== undefined) {
    if (time >= wakeAt) return
    unschedule()
  }
  wakeAt = time

  const run = () => {
    timer = undefined
    frame = undefined
    wakeAt = Number.POSITIVE_INFINITY
    void pump()
  }

  const delay = time - performance.now()
  if (delay <= FRAME_MS) {
    frame = window.requestAnimationFrame(run)
    return
  }
  // Woken a frame short of the mark, so the branch above aligns the last of it.
  timer = window.setTimeout(run, delay - FRAME_MS)
}

/** Books each subscriber's next frame and reports the soonest of them. */
function advance(due: MirrorSubscriber[], now: number) {
  let next = Number.POSITIVE_INFINITY
  for (const subscriber of due) {
    const state = subscribers.get(subscriber)
    if (!state) continue
    // A non-positive rate asks for a single frame. Retire the subscriber once
    // it has one, and keep asking while it does not, so a source that was
    // missing or mid-capture still gets it a moment later.
    if (subscriber.fps <= 0) {
      if (state.painted) {
        state.done = true
        continue
      }
      state.nextDueAt = now + RETRY_MS
      next = Math.min(next, state.nextDueAt)
      continue
    }

    // Booked from when this frame was due rather than from now. Capturing takes
    // time, and charging that time to the next interval as well would fold the
    // cost of a capture into the period: a source taking 4ms to capture would
    // run a requested 30fps at 27, and any variation in that cost would show up
    // as jitter in what was asked to be a fixed rate.
    const interval = 1000 / subscriber.fps
    let at = state.nextDueAt + interval
    if (at <= now) {
      // Behind by whole frames, from being slow or asleep. Give up the missed
      // ones rather than capture them back to back to catch up, which would
      // spend the arrears in a burst at the worst possible moment.
      at += Math.ceil((now - at) / interval) * interval
    }
    state.nextDueAt = at
    next = Math.min(next, at)
  }
  return next
}

/**
 * Whether the source might look different from the newest frame of it.
 *
 * Biased towards capturing. A capture nobody needed costs a few milliseconds,
 * while a change nobody noticed leaves every mirror of the source wrong.
 */
function needsCapture(state: SourceState, element: Element, now: number) {
  if (state.timeline.length === 0) return true
  if (state.dirty) return true
  if (hasLiveContent(state, element)) return true
  // Nothing says the detection above is exhaustive, so verify on an interval.
  return now - state.lastCaptureAt >= VERIFY_MS
}

/**
 * Adds a frame to the source's timeline if one is warranted.
 *
 * Returns a time to look again, for the reasons that are worth retrying sooner
 * than the subscribers' own cadence, or null when there is nothing to retry.
 */
async function capture(
  element: Element,
  state: SourceState,
  due: MirrorSubscriber[],
  now: number
) {
  // One layout read per capture, shared by every mirror of this element.
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return now + RETRY_MS

  // Backpressure: an expensive source degrades to a lower rate rather than
  // saturating the main thread. Judged on the smoothed cost, because a capture
  // is timed across an await and so measures whatever else the main thread did
  // meanwhile. Reacting to one inflated sample would drop a frame from a rate
  // the source can comfortably sustain, which is worse than answering a real
  // slowdown a few frames late.
  const affordableAt = state.lastCaptureAt + state.costMs / CAPTURE_DUTY_CYCLE
  if (affordableAt > now + FRAME_MS / 2) return affordableAt

  // Seeking and buffering drop a video below the bar for drawing a frame, so
  // capturing now would punch a hole where the video is. Adding no frame keeps
  // the last good one on screen, which is what the video element itself does.
  // Marking the element dirty guarantees a capture once it recovers.
  if (
    state.timeline.length > 0 &&
    (selfAndDescendants(element, 'video') as HTMLVideoElement[]).some(
      cannotDrawVideo
    )
  ) {
    state.dirty = true
    return null
  }

  if (!needsCapture(state, element, now)) {
    counters.skipped += 1
    return null
  }

  const pixelRatio = Math.max(
    ...due.map(
      (subscriber) => subscriber.pixelRatio ?? window.devicePixelRatio ?? 1
    )
  )
  const canvas = state.pool.pop() ?? document.createElement('canvas')

  // Cleared before the capture: a mutation arriving mid-capture should leave
  // the element dirty rather than be swallowed by this frame.
  state.dirty = false
  const started = performance.now()
  let handle: CaptureHandle
  try {
    // Always captured transparent; each mirror applies its own background at
    // blit time, so background does not fragment the sharing.
    handle = await captureInto(element, canvas, pixelRatio)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('ElementMirror: capture failed', element, error)
    }
    state.pool.push(canvas)
    state.lastCaptureAt = performance.now()
    return null
  }
  state.lastCaptureAt = performance.now()
  // What throttling is protecting is the main thread, so the engine reports
  // its own work apart from time spent awaiting the browser's rasterizer, and
  // only the work is billed. SnapDOM decodes its SVG off-thread: billing the
  // wall clock for that wait would throttle a 60fps mirror to 30 while the
  // main thread sat idle.
  const duration = handle.mainThreadMs
  state.costMs =
    state.costMs === 0
      ? duration
      : state.costMs * (1 - COST_WEIGHT) + duration * COST_WEIGHT
  counters.captures += 1
  counters.durationMs += duration

  // Timestamped from the start of the capture, which is the moment it depicts.
  // Joins the timeline now, unready, so frames sit in capture order however
  // rasterization completes; presented the moment the pixels land.
  const frame: Frame = {
    canvas,
    capturedAt: started,
    width: rect.width,
    height: rect.height,
    ready: false,
  }
  state.timeline.push(frame)
  handle.settled.then(
    () => {
      frame.ready = true
      // The mirrors this capture was for get it the moment it lands rather
      // than at their next scheduled cycle. The shownAt guard keeps this from
      // adding blits — the next cycle finds the same frame and skips it — so
      // the rate stays what was asked and only the latency improves.
      present(due, state, performance.now())
    },
    (error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('ElementMirror: rasterization failed', element, error)
      }
      // The canvas never got its pixels: withdraw the frame, and do not pool
      // the canvas in case the engine writes to it late.
      const at = state.timeline.indexOf(frame)
      if (at !== -1) state.timeline.splice(at, 1)
      state.dirty = true
    }
  )
  return null
}

/**
 * The frame depicting a moment: the newest ready one taken at or before it.
 *
 * A mirror reaching further back than the timeline goes gets the oldest frame
 * there is, so a delayed mirror starts out level with the source and falls
 * behind as history accumulates, rather than starting blank. Frames whose
 * pixels have not landed yet are passed over; until the first of them lands
 * there is nothing to show at all.
 */
function frameAt(timeline: Frame[], target: number) {
  let chosen: Frame | null = null
  for (const frame of timeline) {
    if (!frame.ready) continue
    if (chosen && frame.capturedAt > target) break
    chosen = frame
  }
  return chosen
}

/** Draws each mirror the frame that matches its own place in the past. */
function present(due: MirrorSubscriber[], state: SourceState, now: number) {
  if (state.timeline.length === 0) return
  for (const subscriber of due) {
    const subscriberState = subscribers.get(subscriber)
    if (!subscriberState) continue
    const frame = frameAt(state.timeline, now - subscriber.delay)
    if (!frame) continue
    // A frame already on the canvas is worth nothing to draw again, which is
    // what keeps a still source from repainting its mirrors every cycle.
    if (subscriberState.shownAt === frame.capturedAt) continue
    subscriber.onFrame(frame.canvas, frame.width, frame.height)
    subscriberState.shownAt = frame.capturedAt
    subscriberState.painted = true
    counters.blits += 1
  }
}

/**
 * Retires frames no mirror of this source can still ask for.
 *
 * The rule is what is still reachable rather than what is old: a still source's
 * only frame may have been taken minutes ago and is still the correct thing to
 * show, so age alone is never a reason to drop one.
 */
function retain(state: SourceState, all: MirrorSubscriber[], now: number) {
  let longest = 0
  for (const subscriber of all) {
    longest = Math.max(longest, subscriber.delay)
  }

  // Everything newer than the frame the furthest-behind mirror is due to show.
  // A frame still waiting on its pixels is never retired — it is the newest
  // thing there is, whatever its timestamp says — and nothing behind it is
  // either, or a slow rasterization would get its frame retired mid-flight
  // and land with nowhere to go.
  const horizon = now - longest
  let keepFrom = 0
  for (let index = 0; index < state.timeline.length; index += 1) {
    const frame = state.timeline[index]
    if (!frame.ready || frame.capturedAt > horizon) break
    keepFrom = index
  }

  // Then a ceiling on the pixels, in case a long delay at a high frame rate
  // would hold more than it is worth.
  let bytes = 0
  for (let index = state.timeline.length - 1; index >= keepFrom; index -= 1) {
    const frame = state.timeline[index]
    bytes += frame.canvas.width * frame.canvas.height * 4
    if (bytes > TIMELINE_BUDGET_BYTES) {
      keepFrom = Math.min(index + 1, state.timeline.length - 1)
      break
    }
  }

  for (const frame of state.timeline.splice(0, keepFrom)) {
    // An unready frame's canvas still has a rasterization heading for it, so
    // handing it to the next capture would let the two write over each other.
    if (frame.ready && state.pool.length < POOL_LIMIT) state.pool.push(frame.canvas)
  }
}

/**
 * Captures one element if it needs it, then serves every mirror of it from the
 * timeline. The two are separate because a delayed mirror has a new frame to
 * show whenever one ages into its past, which is not when captures happen.
 */
async function serviceSource(
  element: Element,
  due: MirrorSubscriber[],
  all: MirrorSubscriber[]
) {
  const now = performance.now()
  const state = stateFor(element, now)

  const retryAt = await capture(element, state, due, now)

  const painted = performance.now()
  present(due, state, painted)
  retain(state, all, painted)

  const next = advance(due, performance.now())
  return retryAt === null ? next : Math.min(next, retryAt)
}

async function pump() {
  if (pumping) return
  pumping = true
  try {
    // Nothing is painting while the tab is hidden; visibilitychange resumes.
    if (document.hidden) return

    const now = performance.now()
    let next = Number.POSITIVE_INFINITY
    const buckets = new Map<
      Element,
      { due: MirrorSubscriber[]; all: MirrorSubscriber[] }
    >()

    for (const [subscriber, state] of subscribers) {
      if (state.done || !subscriber.isActive()) continue
      const element = subscriber.resolve()
      if (!element) {
        next = Math.min(next, now + RETRY_MS)
        continue
      }
      let bucket = buckets.get(element)
      if (!bucket) {
        bucket = { due: [], all: [] }
        buckets.set(element, bucket)
      }
      // Every mirror of the element has a say in how much history it keeps,
      // whether or not it wants a frame this cycle.
      bucket.all.push(subscriber)
      // Anything due before the next displayed frame is due now: this cycle is
      // running on a paint, and holding the frame back would only land it on
      // the following paint anyway, a whole refresh later.
      if (state.nextDueAt > now + FRAME_MS / 2) {
        next = Math.min(next, state.nextDueAt)
        continue
      }
      bucket.due.push(subscriber)
    }

    for (const [element, bucket] of buckets) {
      if (bucket.due.length === 0) continue
      next = Math.min(
        next,
        await serviceSource(element, bucket.due, bucket.all)
      )
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

  // A webfont swapping in restyles text everywhere at once, and nothing about
  // that reaches an observer watching the source.
  document.fonts?.addEventListener('loadingdone', () => {
    for (const state of sources.values()) state.dirty = true
    kick()
  })

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
  subscribers.set(subscriber, {
    nextDueAt: 0,
    painted: false,
    done: false,
    shownAt: 0,
  })
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
