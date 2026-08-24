import { mkdirSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * Screenshots of the gallery's form-control specimens, per engine: each
 * figure holds the source and its mirror side by side, so one image shows
 * what the engine's capture makes of a control the browser draws itself.
 *
 *   node .perf/gallery-controls.mjs
 *
 * Needs the dev server up (`pnpm dev`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/gallery'
const OUT = new URL('./shots/gallery/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const SPECIMENS = [
  'native controls',
  'sliders and progress',
  'checkbox and radio',
  'switches',
  'select triggers',
  'text inputs',
]

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch()
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  })
  const messages = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      messages.push(`[error] ${message.text().slice(0, 200)}`)
    }
  })
  page.on('pageerror', (error) =>
    messages.push(`[pageerror] ${String(error.message).slice(0, 200)}`)
  )

  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(1000)
    // Walk the page so every mirror wakes and paints at least once.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    })
    await page.waitForTimeout(1500)

    for (const specimen of SPECIMENS) {
      const figure = page.locator(`[data-specimen="${specimen}"]`)
      if ((await figure.count()) === 0) {
        console.log(`${name}: no specimen "${specimen}"`)
        continue
      }
      await figure.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
      const slug = specimen.replace(/\s+/g, '-')
      await figure.screenshot({ path: `${OUT}${name}--${slug}.png` })
    }
    console.log(`${name}: done${messages.length ? ` — ${messages.length} console errors` : ''}`)
    for (const line of messages.slice(0, 6)) console.log(`  ${line}`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }

  await browser.close()
}

console.log(`shots in ${OUT}`)
