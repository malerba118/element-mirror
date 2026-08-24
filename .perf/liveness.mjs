import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

/**
 * What deciding "nothing changed" costs.
 *
 * `needsCapture` short-circuits on `dirty`, so `hasLiveContent` runs precisely
 * when a source is clean — the path that is supposed to cost nothing. It walks
 * the subtree three times per source per cycle: `getAnimations({subtree:true})`,
 * which needs up-to-date style and so can force a recalc, plus a `video` and a
 * `canvas` query, and `capture` runs a second `video` query just before it.
 *
 * The same verdict is available from one `document.getAnimations()` per cycle
 * filtered by containment, which trades a walk per source for a walk per pump.
 * That is only a win while the document holds fewer running animations than the
 * sources hold nodes, so the run sweeps decoy animations outside the sources to
 * find where the trade turns.
 *
 * Self-contained: builds its own page, so no dev server and no demo structure.
 *
 *   node .perf/liveness.mjs
 *   SOURCES=8 NODES=300 node .perf/liveness.mjs
 */

const SECONDS = Number(process.env.SECONDS ?? 3)
const SOURCES = Number(process.env.SOURCES ?? 4)
const NODES = Number(process.env.NODES ?? 180)
const FPS = Number(process.env.FPS ?? 60)
/** Running animations elsewhere on the page, which only the shared read sees. */
const DECOY_SWEEP = (process.env.DECOYS ?? '0,8,40').split(',').map(Number)
const VARIANTS = ['per-source', 'shared-animations', 'shared-everything']

/**
 * A Chrome to drive. Found rather than hardcoded: Playwright's own resolution
 * picks the wrong architecture under some sandboxes, and a path baked in for
 * one machine is a script nobody else can run.
 */
function findChrome() {
  if (process.env.MIRROR_CHROME) return process.env.MIRROR_CHROME
  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/puppeteer/chrome'),
  ]
  const leaves = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  ]
  for (const root of roots) {
    let entries = []
    try {
      entries = fs.readdirSync(root).sort().reverse()
    } catch {
      continue
    }
    for (const entry of entries) {
      for (const leaf of leaves) {
        const full = path.join(root, entry, leaf)
        if (fs.existsSync(full)) return full
      }
    }
  }
  return undefined
}

const executablePath = findChrome()
if (!executablePath) {
  console.error('no Chrome found; set MIRROR_CHROME to one')
  process.exit(1)
}
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
})
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')

await page.setContent('<!doctype html><html><head></head><body></body></html>')

// A page shaped like one a mirror runs on: several clean sources with the sort
// of subtree a card has, transitions declared broadly the way a utility CSS
// framework declares them, and hover rules — all of which give the style engine
// something to do when something asks it for up-to-date style.
await page.evaluate(
  ({ sources, nodes }) => {
    const style = document.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; }
      body { margin: 0; font: 13px system-ui; }
      .card { width: 320px; padding: 12px; border: 1px solid #ddd;
              display: inline-block; vertical-align: top; margin: 4px; }
      .row { display: flex; gap: 6px; align-items: center; padding: 2px 0;
             transition: background-color 150ms, color 150ms, opacity 150ms; }
      .row:hover { background: #f3f3f3; }
      .dot { width: 8px; height: 8px; border-radius: 9999px; background: #888;
             transition: transform 150ms, background-color 150ms; }
      .row:hover .dot { transform: scale(1.4); background: #333; }
      .label { flex: 1; transition: color 150ms; }
      .pill { padding: 1px 6px; border-radius: 9999px; background: #eee;
              transition: background-color 150ms; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .decoy { width: 6px; height: 6px; background: #ccc;
               animation: spin 900ms linear infinite; }
      #decoys { position: fixed; bottom: 0; left: 0; }
      #churn { position: fixed; top: 0; right: 0; }
    `
    document.head.appendChild(style)

    // Something outside every source whose class flips each frame, so style is
    // dirty when the check asks for it. A page with a mirror on it is a page
    // with something moving; measuring against a page where style is already
    // clean would price the flush at zero and flatter every variant equally.
    const churn = document.createElement('div')
    churn.id = 'churn'
    churn.textContent = '.'
    document.body.appendChild(churn)

    const decoys = document.createElement('div')
    decoys.id = 'decoys'
    document.body.appendChild(decoys)

    const perRow = 4
    const rows = Math.max(1, Math.round(nodes / perRow))
    window.__sources = []
    for (let index = 0; index < sources; index += 1) {
      const card = document.createElement('div')
      card.className = 'card'
      let html = ''
      for (let row = 0; row < rows; row += 1) {
        html +=
          '<div class="row"><span class="dot"></span>' +
          `<span class="label">item ${row}</span>` +
          `<span class="pill">${row % 7}</span></div>`
      }
      card.innerHTML = html
      document.body.appendChild(card)
      window.__sources.push(card)
    }

    window.__setDecoys = (count) => {
      const host = document.getElementById('decoys')
      host.innerHTML = ''
      for (let index = 0; index < count; index += 1) {
        const node = document.createElement('div')
        node.className = 'decoy'
        host.appendChild(node)
      }
    }
  },
  { sources: SOURCES, nodes: NODES }
)

const nodeCount = await page.evaluate(() =>
  window.__sources.reduce(
    (total, card) => total + 1 + card.querySelectorAll('*').length,
    0
  )
)

/**
 * Runs one variant of the check once per frame for the duration and reports the
 * time spent inside it. Per frame rather than in a tight loop on purpose: back
 * to back, the first call flushes style and every later one finds it clean,
 * which prices the flush at a third of nothing. The loop under measurement runs
 * once per frame with the page's own work in between, so this does too.
 */
const drive = await page.evaluateHandle(() => {
  const IGNORE = 'data-element-mirror-ignore'
  const CANVAS = `canvas:not([${IGNORE}])`

  const selfAndDescendants = (target, selector) => {
    const found = target.matches(selector) ? [target] : []
    return found.concat(Array.from(target.querySelectorAll(selector)))
  }

  const runningIn = (element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (animation.playState === 'running') return true
    }
    return false
  }

  /** Today: three subtree walks per source, plus capture's own video query. */
  const perSource = (sources) => {
    let live = 0
    for (const element of sources) {
      selfAndDescendants(element, 'video')
      let alive = runningIn(element)
      if (!alive) {
        selfAndDescendants(element, 'video')
        alive = selfAndDescendants(element, CANVAS).length > 0
      }
      if (alive) live += 1
    }
    return live
  }

  /** One document-wide read per cycle, then containment per source. */
  const runningTargets = () => {
    const targets = []
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue
      const target = animation.effect && animation.effect.target
      if (target) targets.push(target)
    }
    return targets
  }

  // Plain containment, as the implementation has it: neither the subtree read
  // nor the document read reports an animation inside a shadow tree, so there
  // is no boundary left to cross (`.perf/shadow-probe.mjs`).
  const reaches = (element, node) => element.contains(node)

  const sharedAnimations = (sources) => {
    const targets = runningTargets()
    let live = 0
    for (const element of sources) {
      let alive = targets.some((target) => reaches(element, target))
      if (!alive) {
        selfAndDescendants(element, 'video')
        alive = selfAndDescendants(element, CANVAS).length > 0
      }
      if (alive) live += 1
    }
    return live
  }

  // Plus the node lists a MutationObserver's childList records could keep
  // current, which is what the real fix would cache them behind.
  let lists = new WeakMap()
  // What the MutationObserver's childList records would do in the real thing.
  window.__invalidateLists = () => {
    lists = new WeakMap()
  }
  const listsFor = (element) => {
    let found = lists.get(element)
    if (!found) {
      found = {
        videos: selfAndDescendants(element, 'video'),
        canvases: selfAndDescendants(element, CANVAS),
      }
      lists.set(element, found)
    }
    return found
  }

  const sharedEverything = (sources) => {
    const targets = runningTargets()
    let live = 0
    for (const element of sources) {
      let alive = targets.some((target) => reaches(element, target))
      if (!alive) alive = listsFor(element).canvases.length > 0
      if (alive) live += 1
    }
    return live
  }

  const checks = {
    'per-source': perSource,
    'shared-animations': sharedAnimations,
    'shared-everything': sharedEverything,
  }

  return ({ variant, seconds, fps }) =>
    new Promise((resolve) => {
      const check = checks[variant]
      const sources = window.__sources
      const churn = document.getElementById('churn')
      const interval = 1000 / fps
      const until = performance.now() + seconds * 1000
      let spent = 0
      let cycles = 0
      let verdict = -1
      let due = 0

      const frame = () => {
        const now = performance.now()
        if (now >= until) {
          resolve({ spent, cycles, verdict })
          return
        }
        if (now >= due) {
          due = now + interval
          // The page's own work, which is what leaves style dirty for the check.
          churn.style.color = cycles % 2 ? '#111' : '#222'
          const started = performance.now()
          verdict = check(sources)
          spent += performance.now() - started
          cycles += 1
        }
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
})

const counters = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]))
}

const measure = async (variant) => {
  const before = await counters()
  const result = await page.evaluate(
    ([run, options]) => run(options),
    [drive, { variant, seconds: SECONDS, fps: FPS }]
  )
  const after = await counters()
  const delta = (name, scale = 1) =>
    ((after[name] ?? 0) - (before[name] ?? 0)) * scale
  return {
    variant,
    ...result,
    perCycleMs: result.spent / Math.max(1, result.cycles),
    recalcs: delta('RecalcStyleCount'),
    recalcMs: delta('RecalcStyleDuration', 1000),
  }
}

console.log(
  `${SOURCES} clean sources, ${nodeCount} nodes total, ` +
    `one check per frame at ${FPS}fps for ${SECONDS}s\n`
)

for (const decoys of DECOY_SWEEP) {
  await page.evaluate((count) => window.__setDecoys(count), decoys)
  await page.waitForTimeout(400)
  // Warm up, so no variant pays for first-call lazy work.
  for (const variant of VARIANTS) {
    await page.evaluate(
      ([run, options]) => run(options),
      [drive, { variant, seconds: 0.4, fps: FPS }]
    )
  }

  const rows = []
  for (const variant of VARIANTS) rows.push(await measure(variant))

  const baseline = rows[0]
  console.log(`${decoys} running animations elsewhere on the page`)
  console.log(
    ['  variant', 'µs/cycle', 'ms/s', 'recalcs', 'recalc ms', 'vs now'].join(
      '\t'
    )
  )
  for (const row of rows) {
    const perSecond = row.perCycleMs * FPS
    const factor = baseline.perCycleMs / row.perCycleMs
    console.log(
      [
        `  ${row.variant.padEnd(18)}`,
        (row.perCycleMs * 1000).toFixed(0).padStart(6),
        perSecond.toFixed(1).padStart(5),
        String(row.recalcs).padStart(6),
        row.recalcMs.toFixed(0).padStart(8),
        row === baseline ? '—' : `${factor.toFixed(1)}x`,
      ].join('\t')
    )
  }
  const verdicts = new Set(rows.map((row) => row.verdict))
  console.log(
    verdicts.size === 1
      ? `  all three agreed (${rows[0].verdict} of ${SOURCES} live)\n`
      : `  DISAGREE: ${rows.map((r) => `${r.variant}=${r.verdict}`).join(' ')}\n`
  )
}

/**
 * The substitution is only worth anything if it answers the same question.
 * Agreeing that nothing is live is the easy direction; these are the cases
 * where a document-wide read plus containment could differ from a subtree read.
 */
await page.evaluate(() => window.__setDecoys(0))
const cases = [
  {
    name: 'animation on a direct child',
    apply: () => {
      const node = window.__sources[0].querySelector('.dot')
      node.style.animation = 'spin 900ms linear infinite'
    },
  },
  {
    name: 'animation deep in the subtree',
    apply: () => {
      const rows = window.__sources[1].querySelectorAll('.row')
      rows[rows.length - 1].querySelector('.pill').style.animation =
        'spin 900ms linear infinite'
    },
  },
  {
    // Neither read sees this one; the case is here to hold that blind spot
    // still, so a change that starts detecting it is noticed rather than
    // silently shipped as extra captures.
    name: 'animation in a shadow root (neither)',
    apply: () => {
      const host = document.createElement('div')
      window.__sources[2].appendChild(host)
      const root = host.attachShadow({ mode: 'open' })
      root.innerHTML =
        '<style>@keyframes s { to { opacity: 0 } }' +
        'i { display:block; width:4px; height:4px; animation: s 800ms infinite }' +
        '</style><i></i>'
    },
  },
  {
    name: 'animation on the source itself',
    apply: () => {
      window.__sources[3].style.animation = 'spin 4s linear infinite'
    },
  },
  {
    name: 'a canvas appearing in the subtree',
    apply: () => {
      window.__sources[0].appendChild(document.createElement('canvas'))
    },
  },
  {
    name: 'a paused animation (not live)',
    apply: () => {
      const node = window.__sources[1].querySelector('.label')
      node.style.animation = 'spin 900ms linear infinite'
      node.style.animationPlayState = 'paused'
    },
  },
]

console.log('does the shared read answer the same question?\n')
let wrong = 0
for (const { name, apply } of cases) {
  await page.evaluate(() => {
    // Reset every source, so each case is judged on its own.
    for (const source of window.__sources) {
      source.style.animation = ''
      for (const node of source.querySelectorAll('*')) {
        node.style.animation = ''
        node.style.animationPlayState = ''
      }
      for (const node of source.querySelectorAll('canvas')) node.remove()
    }
  })
  await page.evaluate(apply)
  // The cached lookups answer to the observer, which these edits bypass.
  await page.evaluate(() => window.__invalidateLists())
  await page.waitForTimeout(250)

  const verdicts = {}
  for (const variant of VARIANTS) {
    const result = await page.evaluate(
      ([run, options]) => run(options),
      [drive, { variant, seconds: 0.25, fps: FPS }]
    )
    verdicts[variant] = result.verdict
  }
  const values = new Set(Object.values(verdicts))
  const ok = values.size === 1
  if (!ok) wrong += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(34)} ` +
      (ok
        ? `${verdicts['per-source']} of ${SOURCES} live`
        : Object.entries(verdicts)
            .map(([key, value]) => `${key}=${value}`)
            .join(' '))
  )
}
console.log(
  `\n${cases.length - wrong}/${cases.length} cases agree with the subtree read`
)

await browser.close()
process.exit(wrong ? 1 : 0)
