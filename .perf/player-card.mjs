import { mkdirSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * The playground's player card and its mirror, side by side per engine — the
 * card is the awkward-controls test (styled range input, animation, SVG
 * icons), so this is the fastest way to eyeball what each engine's capture
 * makes of it.
 *
 *   node .perf/player-card.mjs
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const OUT = new URL('./shots/player/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch()
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 3,
  })
  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(2500)
    await page
      .locator('#playground-source')
      .screenshot({ path: `${OUT}${name}-source.png` })
    await page
      .locator('[data-element-mirror]')
      .first()
      .screenshot({ path: `${OUT}${name}-mirror.png` })
    console.log(`${name}: done`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  await browser.close()
}

console.log(`shots in ${OUT}`)
