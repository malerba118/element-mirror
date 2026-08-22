import { mkdirSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * What each engine makes of the mirrors on the demo page.
 *
 * Reports, per engine: the platform facts the component branches on, whether
 * each mirror ever got a frame (an unpainted mirror stays `visibility: hidden`,
 * so this is the difference between "wrong" and "absent"), whether its canvas
 * holds any ink and whether that ink can be read back at all, and how the
 * mirror's box compares with its source's. Plus every console message, since a
 * capture that throws is reported and swallowed.
 *
 *   node .perf/browsers.mjs
 *
 * Needs the dev server up (`pnpm dev`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const OUT = new URL('./shots/browsers/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const ALL = { chromium, firefox, webkit }
const ENGINES = process.env.MIRROR_ENGINES
  ? Object.fromEntries(
      process.env.MIRROR_ENGINES.split(',').map((name) => [name, ALL[name]])
    )
  : ALL

/** Read inside the page: everything worth knowing about the mirrors on it. */
const probe = () => {
  const support = (property, value) =>
    typeof CSS !== 'undefined' && CSS.supports
      ? CSS.supports(property, value)
      : null

  const mirrors = Array.from(
    document.querySelectorAll('[data-element-mirror]')
  ).map((wrapper, index) => {
    const canvas = wrapper.querySelector('canvas')
    const style = getComputedStyle(wrapper)
    const box = wrapper.getBoundingClientRect()

    let ink = null
    let readback = 'ok'
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const context = canvas.getContext('2d')
        // A sparse grid rather than the whole bitmap: enough to tell ink from
        // an empty canvas without reading megabytes per mirror.
        const steps = 24
        let painted = 0
        let looked = 0
        for (let x = 0; x < steps; x += 1) {
          for (let y = 0; y < steps; y += 1) {
            const px = Math.floor(((x + 0.5) / steps) * canvas.width)
            const py = Math.floor(((y + 0.5) / steps) * canvas.height)
            const data = context.getImageData(px, py, 1, 1).data
            looked += 1
            if (data[3] > 8) painted += 1
          }
        }
        ink = painted / looked
      } catch (error) {
        readback = error.name || 'threw'
      }
    }

    return {
      index,
      hidden: style.visibility === 'hidden',
      wrapper: {
        width: +box.width.toFixed(1),
        height: +box.height.toFixed(1),
        contain: style.contain,
        aspectRatio: style.aspectRatio,
        intrinsic: style.containIntrinsicSize,
      },
      canvas: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
            cssWidth: canvas.style.width,
            cssHeight: canvas.style.height,
          }
        : null,
      ink,
      readback,
    }
  })

  const badge = document.querySelector('header .font-mono')

  return {
    devicePixelRatio: window.devicePixelRatio,
    supportsIntrinsicSize: support('contain-intrinsic-size', '1px 1px'),
    supportsContainSize: support('contain', 'size layout'),
    hasDocumentGetAnimations: typeof document.getAnimations === 'function',
    hasKeyframeEffect: typeof window.KeyframeEffect === 'function',
    hasElementGetAnimations: typeof Element.prototype.getAnimations === 'function',
    stats: badge ? badge.textContent.trim() : null,
    mirrors,
  }
}

const summarise = (name, report, messages) => {
  const { mirrors } = report
  const hidden = mirrors.filter((m) => m.hidden).length
  const blank = mirrors.filter((m) => !m.hidden && m.ink === 0).length
  const unreadable = mirrors.filter((m) => m.readback !== 'ok').length
  const zero = mirrors.filter(
    (m) => m.canvas && (m.canvas.width === 0 || m.canvas.height === 0)
  ).length

  console.log(`\n${'='.repeat(64)}\n${name}\n${'='.repeat(64)}`)
  console.log(
    `dpr ${report.devicePixelRatio}` +
      `, contain-intrinsic-size ${report.supportsIntrinsicSize}` +
      `, contain:size ${report.supportsContainSize}`
  )
  console.log(
    `document.getAnimations ${report.hasDocumentGetAnimations}` +
      `, KeyframeEffect ${report.hasKeyframeEffect}` +
      `, Element.getAnimations ${report.hasElementGetAnimations}`
  )
  console.log(`capture stats: ${report.stats ?? '(no badge)'}`)
  console.log(
    `${mirrors.length} mirrors: ${hidden} never painted, ${blank} painted but blank, ` +
      `${zero} zero-sized canvas, ${unreadable} unreadable`
  )

  for (const mirror of mirrors.slice(0, 8)) {
    const ink =
      mirror.ink === null ? '   —' : `${(mirror.ink * 100).toFixed(0)}%`.padStart(4)
    console.log(
      `  #${String(mirror.index).padStart(2)} ` +
        `${mirror.hidden ? 'HIDDEN ' : 'shown  '}` +
        `box ${String(mirror.wrapper.width).padStart(6)}x${String(mirror.wrapper.height).padEnd(6)} ` +
        `canvas ${String(mirror.canvas?.width ?? 0).padStart(5)}x${String(mirror.canvas?.height ?? 0).padEnd(5)} ` +
        `ink ${ink} ` +
        (mirror.readback === 'ok' ? '' : `readback=${mirror.readback} `) +
        `contain="${mirror.wrapper.contain}" ratio=${mirror.wrapper.aspectRatio}`
    )
  }

  const notable = messages.filter(
    (line) => !/Download the React DevTools|Fast Refresh/.test(line)
  )
  console.log(
    notable.length
      ? `console (${notable.length}):\n${notable.slice(0, 12).map((l) => `  ${l}`).join('\n')}`
      : 'console: clean'
  )
}

for (const [name, engine] of Object.entries(ENGINES)) {
  let browser
  try {
    browser = await engine.launch()
  } catch (error) {
    console.log(`\n${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  const messages = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`[${message.type()}] ${message.text().slice(0, 220)}`)
    }
  })
  page.on('pageerror', (error) =>
    messages.push(`[pageerror] ${String(error.message).slice(0, 220)}`)
  )

  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    // Long enough for lazy sections to mount and for several capture cycles.
    await page.waitForTimeout(1500)
    await page.evaluate(async () => {
      // Walk the page so every mirror has been on screen and woken.
      const step = window.innerHeight * 0.8
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 220))
      }
      window.scrollTo(0, 0)
      await new Promise((resolve) => setTimeout(resolve, 600))
    })
    await page.waitForTimeout(2500)

    const report = await page.evaluate(probe)
    summarise(name, report, messages)
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false })
  } catch (error) {
    console.log(`\n${name}: failed — ${String(error.message).split('\n')[0]}`)
    if (messages.length) {
      console.log(messages.slice(0, 8).map((l) => `  ${l}`).join('\n'))
    }
  }

  await browser.close()
}

console.log(`\nscreenshots in ${OUT}`)
