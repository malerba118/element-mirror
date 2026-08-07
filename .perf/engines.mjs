import { chromium } from 'playwright'

/**
 * Sanity: every engine still delivers frames, and the delayed-mirror trail
 * still draws (frames age into each ghost's past and blit there).
 */

const BASE = process.env.MIRROR_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch()

for (const engine of ['snapdom', 'fork', 'modern']) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  await page.goto(`${BASE}?engine=${engine}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    document.querySelector('#delay-source')?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(1200)

  const counts = await page.evaluate(async () => {
    const counts = new Map()
    const original = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const canvas = this.canvas
      if (canvas?.hasAttribute?.('data-screenshot-ignore')) {
        counts.set(canvas, (counts.get(canvas) ?? 0) + 1)
      }
      return original.apply(this, args)
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
    CanvasRenderingContext2D.prototype.drawImage = original
    const rows = []
    for (const blits of counts.values()) {
      rows.push({ blitsPerSecond: +(blits / 4).toFixed(1) })
    }
    rows.sort((a, b) => b.blitsPerSecond - a.blitsPerSecond)
    return rows
  })
  console.log(
    `${engine.padEnd(8)} mirrors blitting: ${counts.length}, rates: ${counts
      .map((row) => row.blitsPerSecond)
      .join(', ')}`
  )
  await page.close()
}

await browser.close()
