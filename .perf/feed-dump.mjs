import { mkdirSync, writeFileSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * The water's raw input, per engine: the hidden feed mirror's canvas saved
 * as a PNG, plus the sub-rect the page would compute for the card within it.
 * Whatever is wrong in an engine's reflection starts (or doesn't) here.
 *
 *   node .perf/feed-dump.mjs
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/glass-floor'
const OUT = new URL('./shots/glass/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const LAUNCH = {
  chromium: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'] },
  firefox: {},
  webkit: {},
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch(LAUNCH[name])
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  })
  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(3000)
    const result = await page.evaluate(() => {
      const feed = document.querySelector('[data-element-mirror]')
      const source = feed?.querySelector('canvas')
      if (!source) return null
      const feedRect = feed.getBoundingClientRect()
      const sourceRect = source.getBoundingClientRect()
      return {
        png: source.toDataURL('image/png'),
        canvas: `${source.width}x${source.height}`,
        rect: [
          +((feedRect.left - sourceRect.left) / sourceRect.width).toFixed(3),
          +((feedRect.top - sourceRect.top) / sourceRect.height).toFixed(3),
          +(feedRect.width / sourceRect.width).toFixed(3),
          +(feedRect.height / sourceRect.height).toFixed(3),
        ],
      }
    })
    if (!result) {
      console.log(`${name}: no feed canvas`)
    } else {
      const base64 = result.png.replace(/^data:image\/png;base64,/, '')
      writeFileSync(`${OUT}${name}-feed.png`, Buffer.from(base64, 'base64'))
      console.log(
        `${name}: canvas ${result.canvas} rect [${result.rect.join(', ')}]`,
      )
    }
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  await browser.close()
}

console.log(`shots in ${OUT}`)
