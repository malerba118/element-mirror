import { chromium } from 'playwright'

/**
 * Per-mirror delivery rate on the live page: counts drawImage calls into each
 * mirror canvas (every blit is one), plus real page paints, for five seconds
 * with the playground mirror asked for 60fps.
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
})
await page.goto(PAGE, { waitUntil: 'networkidle' })

const slider = page.locator('#fps [role="slider"], [role="slider"]#fps').first()
await slider.focus()
await page.keyboard.press('End')
await page.evaluate(() => {
  document.querySelector('#playground-source')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(1500)

const sample = await page.evaluate(async () => {
  const counts = new Map()
  const original = CanvasRenderingContext2D.prototype.drawImage
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    const canvas = this.canvas
    if (canvas?.hasAttribute?.('data-screenshot-ignore')) {
      counts.set(canvas, (counts.get(canvas) ?? 0) + 1)
    }
    return original.apply(this, args)
  }

  let painted = 0
  let counting = true
  const count = () => {
    if (!counting) return
    painted += 1
    requestAnimationFrame(count)
  }
  requestAnimationFrame(count)

  const SECONDS = 5
  await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000))
  counting = false
  CanvasRenderingContext2D.prototype.drawImage = original

  const badge = Array.from(document.querySelectorAll('div')).find(
    (el) => el.textContent?.includes('cap/s') && el.textContent?.includes('blit/s')
  )

  const rows = []
  for (const [canvas, blits] of counts) {
    const section = canvas.closest('section')
    const title = section?.querySelector('h2')?.textContent ?? '(no section)'
    rows.push({
      section: title.slice(0, 40),
      size: `${canvas.width}x${canvas.height}`,
      perSecond: +(blits / SECONDS).toFixed(1),
    })
  }
  rows.sort((a, b) => b.perSecond - a.perSecond)
  return { rows, pageFps: painted / SECONDS, badge: badge?.textContent?.slice(0, 120) ?? '' }
})

await browser.close()

console.log(`page fps: ${sample.pageFps.toFixed(0)}`)
console.log(`badge: ${sample.badge}`)
console.log(['blit/s', 'canvas', 'section'].join('\t'))
for (const row of sample.rows) {
  console.log([String(row.perSecond).padStart(6), row.size.padEnd(10), row.section].join('\t'))
}
