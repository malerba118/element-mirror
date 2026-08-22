import { mkdirSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * Close-ups of the glass-floor pieces per engine, with the water stilled so
 * the frames are comparable: the water canvas alone, the bloom region, plus
 * a genuine ctx.filter check (draw through a blur and look for spread pixels
 * — Safari has historically reflected the attribute while ignoring it).
 *
 *   node .perf/glass-visual.mjs
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
    await page.waitForTimeout(2500)

    const filter = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 60
      const ctx = canvas.getContext('2d')
      ctx.filter = 'blur(6px)'
      const reflected = ctx.filter
      ctx.fillStyle = '#fff'
      ctx.fillRect(25, 25, 10, 10)
      // With a real 6px blur, ink spreads well past the rect; without one,
      // this pixel outside it stays fully transparent.
      const spread = ctx.getImageData(20, 30, 1, 1).data[3]
      return { reflected, applied: spread > 0 }
    })

    // Still the water and the card so every engine shows the same frame.
    await page.locator('#ripple [role="slider"]').press('Home')
    await page.locator('#aurora [role="slider"]').press('Home')
    await page.waitForTimeout(2000)

    await page
      .locator('canvas[data-reflection]')
      .screenshot({ path: `${OUT}${name}-water.png` })
    await page
      .locator('div.relative.flex-1')
      .screenshot({ path: `${OUT}${name}-still.png` })
    console.log(`${name}: ctx.filter reflected="${filter.reflected}" applied=${filter.applied}`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  await browser.close()
}

console.log(`shots in ${OUT}`)
