import { mkdirSync } from 'node:fs'

import { chromium, firefox, webkit } from 'playwright'

/**
 * The glass-floor water, per engine: a screenshot of the stage plus the
 * numbers that say whether the reflection pipeline is alive at all — the
 * feed mirror's canvas size, how much of the water is lit, whether the water
 * is moving, and any console errors.
 *
 *   node .perf/glass-browsers.mjs
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
  const messages = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      messages.push(`${m.type()}: ${m.text()}`)
    }
  })
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`))

  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(3000)

    const report = await page.evaluate(() => {
      const feed = document.querySelector('[data-element-mirror]')
      const feedCanvas = feed?.querySelector('canvas')
      const water = document.querySelector('canvas[data-reflection]')
      const read = () => {
        if (!water) return null
        const copy = document.createElement('canvas')
        copy.width = water.width
        copy.height = water.height
        const ctx = copy.getContext('2d')
        ctx.drawImage(water, 0, 0)
        const data = ctx.getImageData(0, 0, copy.width, copy.height).data
        let lit = 0
        for (let i = 0; i < data.length; i += 4) {
          if (Math.max(data[i], data[i + 1], data[i + 2]) > 20) lit++
        }
        return { lit: +((lit / (data.length / 4)) * 100).toFixed(2), data }
      }
      const first = read()
      return new Promise((resolve) => {
        setTimeout(() => {
          const second = read()
          let drift = null
          if (first && second) {
            let differing = 0
            const len = Math.min(first.data.length, second.data.length)
            for (let i = 0; i < len; i += 4) {
              if (Math.abs(first.data[i] - second.data[i]) > 10) differing++
            }
            drift = +((differing / (len / 4)) * 100).toFixed(2)
          }
          resolve({
            gl2: !!document.createElement('canvas').getContext('webgl2'),
            feedCanvas: feedCanvas
              ? `${feedCanvas.width}x${feedCanvas.height}`
              : 'missing',
            water: water ? `${water.width}x${water.height}` : 'missing',
            litFirst: first?.lit ?? null,
            litSecond: second?.lit ?? null,
            drift,
          })
        }, 400)
      })
    })

    await page
      .locator('div.relative.flex-1')
      .screenshot({ path: `${OUT}${name}-stage.png` })
    console.log(`${name}: ${JSON.stringify(report)}`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  const unique = [...new Set(messages)]
  if (unique.length) {
    console.log(`${name} console:\n  ${unique.slice(0, 12).join('\n  ')}`)
  }
  await browser.close()
}

console.log(`shots in ${OUT}`)
