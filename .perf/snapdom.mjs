import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * What SnapDOM's own options are worth, before considering a patch.
 *
 * `.perf/ceiling.mjs` prices the engines against each other; this prices one
 * engine against itself, driven at the rate a mirror wants rather than as fast
 * as it will go, since cost depends on the rate (a capture pays for what the
 * source invalidated since the last one).
 *
 * `fresh` is the column that disqualifies things: a config that hands back a
 * cached frame is cheap and useless to a mirror, so anything below the capture
 * count on a live source is a config we cannot take.
 *
 *   node .perf/snapdom.mjs
 *   node .perf/snapdom.mjs '#playground-source' 40
 *
 * Needs the dev server up (`npm run dev`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'
const TARGET = Number(process.argv[3] ?? 40)
const SECONDS = 3
const SCALE = 2

/**
 * The fork is served as source rather than a bundle: it is plain ESM with
 * relative imports, so the browser resolves the graph itself and there is
 * nothing to build. `MIRROR_SNAPDOM=npm` serves the published bundle instead,
 * which is the unforked baseline to measure a change against.
 */
const dist =
  process.env.MIRROR_SNAPDOM === 'npm'
    ? new URL('./node_modules/@zumer/snapdom/dist/', import.meta.url).pathname
    : new URL('../packages/snapdom/src/', import.meta.url).pathname
const entry = process.env.MIRROR_SNAPDOM === 'npm' ? 'snapdom.mjs' : 'index.js'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: SCALE,
})
await serveModules(page, '/__snapdom/', dist)
await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.addScriptTag({
  type: 'module',
  content: `
    import { snapdom, preCache } from '/__snapdom/${entry}'
    window.__lib = { snapdom, preCache }
  `,
})
await page.waitForFunction(() => Boolean(window.__lib))

// The page's own mirrors would only compete for the thread being measured.
await page.evaluate(() => {
  for (const canvas of document.querySelectorAll(
    'canvas[data-element-mirror-ignore]'
  )) {
    canvas.remove()
  }
})
await page.waitForTimeout(400)

const measured = await page.evaluate(
  async ({ selector, scale, target, seconds }) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`nothing matches ${selector}`)
    element.scrollIntoView()

    const { snapdom, preCache } = window.__lib
    // What the mirror passes, so the sweep measures what the app runs.
    const base = { dpr: scale, scale: 1, embedFonts: true }

    /** What the mirror asks for today, and each single change from it. */
    const variants = {
      ours: base,
      fast: { ...base, fast: true },
      'cache full': { ...base, cache: 'full' },
      'cache disabled': { ...base, cache: 'disabled' },
      'no compress': { ...base, compress: false },
      'no placeholders': {
        ...base,
        placeholders: false,
        resolvePicturePlaceholders: false,
      },
      'no fonts': { ...base, embedFonts: false },
      reconcile: { ...base, reconcile: true },
      'fast + cache full': { ...base, fast: true, cache: 'full' },
      everything: {
        ...base,
        fast: true,
        cache: 'full',
        compress: false,
        placeholders: false,
        resolvePicturePlaceholders: false,
      },
    }

    // Over the whole canvas, not a band of it: a clock or an equalizer low in
    // the card is exactly what a stale frame would be caught by.
    const signature = (canvas) => {
      const { data } = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height)
      let sum = 0
      for (let index = 0; index < data.length; index += 41) {
        sum = (sum + data[index] * (index % 251)) % 2147483647
      }
      return sum
    }

    const drive = async (options) => {
      const interval = 1000 / target
      const until = performance.now() + seconds * 1000
      let due = performance.now()
      let captures = 0
      let cost = 0
      let dropped = 0
      const frames = new Set()

      while (performance.now() < until) {
        const now = performance.now()
        if (now < due) {
          await new Promise((resolve) => setTimeout(resolve, due - now))
        } else if (now > due + interval) {
          dropped += Math.floor((now - due) / interval)
          due = now
        }
        const started = performance.now()
        const produced = await snapdom.toCanvas(element, options)
        cost += performance.now() - started
        captures += 1
        // Sampled: reading pixels back is not free and is not part of the cost.
        if (captures % 4 === 0) frames.add(signature(produced))
        due += interval
      }

      return {
        achieved: captures / seconds,
        mean: cost / Math.max(1, captures),
        share: cost / (seconds * 1000),
        dropped: dropped / seconds,
        fresh: frames.size,
        of: Math.floor(captures / 4),
      }
    }

    const rows = []
    for (const [name, options] of Object.entries(variants)) {
      try {
        await snapdom.toCanvas(element, options) // warm
        rows.push({ name, ...(await drive(options)) })
      } catch (error) {
        rows.push({ name, failed: String(error.message ?? error).slice(0, 50) })
      }
    }

    // preCache is a one-off warm of fonts and images, so it is not a variant but
    // a before-and-after on the options we already use.
    let warmed = null
    try {
      await preCache(element, { embedFonts: true, cache: 'full' })
      warmed = await drive(base)
    } catch (error) {
      warmed = { failed: String(error.message ?? error).slice(0, 50) }
    }
    rows.push({ name: 'ours, after preCache', ...warmed })

    /**
     * Where a capture's time goes, split at the only seam SnapDOM gives us:
     * calling it returns a snapshot holding an SVG data URL, and asking that for
     * a canvas hands the URL to an `<img>` for the browser to rasterize. The
     * first half is SnapDOM's own JavaScript, which a patch could change; the
     * second is Chrome, which it could not.
     */
    const phases = async (options, seconds) => {
      const interval = 1000 / target
      const until = performance.now() + seconds * 1000
      let due = performance.now()
      let captures = 0
      let serialize = 0
      let rasterize = 0
      let bytes = 0

      while (performance.now() < until) {
        const now = performance.now()
        if (now < due) {
          await new Promise((resolve) => setTimeout(resolve, due - now))
        } else {
          due = Math.max(due, now)
        }

        const start = performance.now()
        const snapshot = await snapdom(element, options)
        const middle = performance.now()
        await snapshot.toCanvas()
        rasterize += performance.now() - middle
        serialize += middle - start
        bytes += snapshot.url.length
        captures += 1
        due += interval
      }

      return {
        captures,
        serialize: serialize / captures,
        rasterize: rasterize / captures,
        kb: bytes / captures / 1024,
      }
    }

    const split = {
      ours: await phases(base, 2),
      'no fonts': await phases({ ...base, embedFonts: false }, 2),
    }

    /**
     * What the serializing half spends its time asking the DOM for. Counts are
     * the point rather than the times, which the wrappers themselves inflate:
     * a per-node style read that happens thousands of times a capture is a
     * different kind of problem from one that happens once.
     */
    const counted = {}
    const watch = (label, object, key) => {
      const original = object[key]
      counted[label] = { calls: 0, ms: 0 }
      object[key] = function (...args) {
        const started = performance.now()
        const result = original.apply(this, args)
        counted[label].calls += 1
        counted[label].ms += performance.now() - started
        return result
      }
      return () => {
        object[key] = original
      }
    }
    const watchGetter = (label, prototype, key) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      if (!descriptor?.get) return () => {}
      counted[label] = { calls: 0, ms: 0 }
      Object.defineProperty(prototype, key, {
        ...descriptor,
        get() {
          const started = performance.now()
          const value = descriptor.get.call(this)
          counted[label].calls += 1
          counted[label].ms += performance.now() - started
          return value
        },
      })
      return () => Object.defineProperty(prototype, key, descriptor)
    }

    const restore = [
      watch('getComputedStyle', window, 'getComputedStyle'),
      watch(
        'getPropertyValue',
        CSSStyleDeclaration.prototype,
        'getPropertyValue'
      ),
      watch('style item()', CSSStyleDeclaration.prototype, 'item'),
      watchGetter('style cssText', CSSStyleDeclaration.prototype, 'cssText'),
      watchGetter('style length', CSSStyleDeclaration.prototype, 'length'),
      watch('cloneNode', Node.prototype, 'cloneNode'),
      watch(
        'getBoundingClientRect',
        Element.prototype,
        'getBoundingClientRect'
      ),
    ]

    let asked = 12
    for (let index = 0; index < asked; index++) {
      await snapdom.toCanvas(element, base)
      await new Promise((resolve) => setTimeout(resolve, 1000 / target))
    }
    for (const undo of restore) undo()

    const per = Object.fromEntries(
      Object.entries(counted).map(([label, { calls, ms }]) => [
        label,
        { calls: calls / asked, ms: ms / asked },
      ])
    )

    /**
     * The read strategies a patch could use, priced over the same subtree that
     * a capture serializes, so the numbers are per capture and comparable with
     * the split above.
     */
    const nodes = [element, ...element.querySelectorAll('*')]

    const strategies = {
      'every property, length in the loop': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          let text = ''
          for (let index = 0; index < style.length; index++) {
            const name = style[index]
            text += `${name}:${style.getPropertyValue(name)};`
          }
          out.push(text)
        }
        return out
      },
      'every property, length hoisted': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index++) {
            const name = style[index]
            text += `${name}:${style.getPropertyValue(name)};`
          }
          out.push(text)
        }
        return out
      },
      'every property, indexed only': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index++) {
            const name = style[index]
            text += `${name}:${style[name]};`
          }
          out.push(text)
        }
        return out
      },
      // Whether the cost is the recalc the first read pays for or the reads
      // themselves. This reads the subtree twice over, so against one pass it
      // says what a second pass costs once the styles are valid: if that is
      // cheap the cost is the recalc, and reading less would not help.
      'every property, twice over': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index++) {
            text += `${style[index]}:${style.getPropertyValue(style[index])};`
          }
          out.push(text)
        }
        out.length = 0
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index++) {
            text += `${style[index]}:${style.getPropertyValue(style[index])};`
          }
          out.push(text)
        }
        return out
      },
      'half the properties': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index += 2) {
            const name = style[index]
            text += `${name}:${style.getPropertyValue(name)};`
          }
          out.push(text)
        }
        return out
      },
      'a quarter of the properties': () => {
        const out = []
        for (const node of nodes) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index += 4) {
            const name = style[index]
            text += `${name}:${style.getPropertyValue(name)};`
          }
          out.push(text)
        }
        return out
      },
      'only the animating nodes': () => {
        const changing = new Set()
        for (const animation of document.getAnimations()) {
          const node = animation.effect?.target
          if (node && element.contains(node)) changing.add(node)
        }
        const out = []
        for (const node of changing) {
          const style = getComputedStyle(node)
          const count = style.length
          let text = ''
          for (let index = 0; index < count; index++) {
            const name = style[index]
            text += `${name}:${style.getPropertyValue(name)};`
          }
          out.push(text)
        }
        return out
      },
      'typed OM (computedStyleMap)': () => {
        const out = []
        for (const node of nodes) {
          if (!node.computedStyleMap) return null
          let text = ''
          for (const [name, value] of node.computedStyleMap()) {
            text += `${name}:${value};`
          }
          out.push(text)
        }
        return out
      },
    }

    const reads = {}
    for (const [name, run] of Object.entries(strategies)) {
      const times = []
      for (let index = 0; index < 14; index++) {
        // A capture never reads a style that is still valid from the last one,
        // so invalidate layout between runs the way a live source does.
        element.style.setProperty('--perf', String(index))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const started = performance.now()
        const produced = run()
        const elapsed = performance.now() - started
        if (produced === null) {
          times.length = 0
          break
        }
        times.push(elapsed)
      }
      element.style.removeProperty('--perf')
      const sorted = times.slice(2).sort((a, b) => a - b)
      reads[name] = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
    }

    return {
      nodes: element.querySelectorAll('*').length + 1,
      rows,
      split,
      per,
      reads,
    }
  },
  { selector: SELECTOR, scale: SCALE, target: TARGET, seconds: SECONDS }
)

await browser.close()

console.log(
  `${SELECTOR} on ${PAGE}, ${measured.nodes} nodes at ${SCALE}x, driven at ${TARGET}fps`
)
console.log(['got', 'ms', 'thread', 'dropped', 'fresh', 'options'].join('\t'))
for (const row of measured.rows) {
  if (row.failed) {
    console.log(
      `   -\t    -\t     -\t       -\t    -\t${row.name} (${row.failed})`
    )
    continue
  }
  console.log(
    [
      row.achieved.toFixed(1).padStart(4),
      row.mean.toFixed(1).padStart(5),
      `${(row.share * 100).toFixed(0)}%`.padStart(6),
      row.dropped.toFixed(1).padStart(7),
      `${row.fresh}/${row.of}`.padStart(5),
      row.name,
    ].join('\t')
  )
}

console.log('\nwhere one capture goes')
console.log(
  ['serialize', 'rasterize', 'svg kb', 'options'].join('\t') +
    '\t(serialize is snapdom, rasterize is chrome)'
)
for (const [name, row] of Object.entries(measured.split)) {
  console.log(
    [
      row.serialize.toFixed(1).padStart(9),
      row.rasterize.toFixed(1).padStart(9),
      row.kb.toFixed(0).padStart(6),
      name,
    ].join('\t')
  )
}

console.log(
  `\nwhat it asks the DOM for, per capture (${measured.nodes} nodes, wrappers inflate the ms)`
)
console.log(['calls', 'ms', 'call'].join('\t'))
for (const [label, row] of Object.entries(measured.per)) {
  console.log(
    [
      row.calls.toFixed(0).padStart(6),
      row.ms.toFixed(1).padStart(5),
      label,
    ].join('\t')
  )
}

console.log('\nreading the whole subtree once, by strategy')
console.log(['ms', 'strategy'].join('\t'))
for (const [label, ms] of Object.entries(measured.reads)) {
  console.log([(ms?.toFixed(2) ?? 'n/a').padStart(5), label].join('\t'))
}
