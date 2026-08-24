import { chromium } from 'playwright'

/**
 * Drives the slit-scan demo with real mouse input and checks that the bands
 * actually hold different moments: park the scene on one side, jump to the
 * other, and the bands' brightness centroids must fan monotonically from the
 * old position to the new. Screenshots land in /tmp for eyeballing.
 */

const PAGE = 'http://localhost:5173/slit-scan'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
})
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text())
})
page.on('pageerror', (e) => problems.push(e.message))

await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

await page.screenshot({ path: '/tmp/slit-idle.png' })

// A fast serpentine sweep with real input.
const stage = await page.locator('.cursor-crosshair').boundingBox()
const steps = 90
for (let i = 0; i <= steps; i++) {
  const t = i / steps
  const x = stage.x + stage.width * (0.5 + 0.38 * Math.sin(t * Math.PI * 3))
  const y = stage.y + stage.height * (0.15 + 0.7 * t)
  await page.mouse.move(x, y)
  await page.waitForTimeout(16)
}
await page.screenshot({ path: '/tmp/slit-sweep.png' })

// Park, then jump, then measure each band's brightness centroid: if delays
// work they fan monotonically from the old position to the new one.
await page.mouse.move(stage.x + stage.width * 0.15, stage.y + stage.height * 0.5)
await page.waitForTimeout(2500)
const jumpTo = { x: stage.x + stage.width * 0.85, y: stage.y + stage.height * 0.5 }
for (let i = 0; i < 12; i++) {
  await page.mouse.move(jumpTo.x, jumpTo.y)
  await page.waitForTimeout(40)
}
const centroids = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('.cursor-crosshair canvas')]
  return canvases.map((c) => {
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height)
    let mass = 0
    let mx = 0
    for (let y = 0; y < c.height; y += 4) {
      for (let x = 0; x < c.width; x += 4) {
        const i = (y * c.width + x) * 4
        const v = data[i] + data[i + 1] + data[i + 2]
        mass += v
        mx += v * x
      }
    }
    return mass ? Math.round((mx / mass / c.width) * 100) : -1
  })
})
await page.screenshot({ path: '/tmp/slit-jump.png' })

const stats = await page.evaluate(
  () => document.querySelector('footer p.ml-auto')?.textContent
)

console.log('band centroids (newest → oldest), % of width:', centroids.join(' '))
console.log('stats:', stats)
const spread = Math.max(...centroids) - Math.min(...centroids.filter((c) => c >= 0))
console.log(
  spread > 25
    ? `ok: bands fan across ${spread}% of the stage`
    : `PROBLEM: bands only span ${spread}%`
)
const unique = [...new Set(problems)]
if (unique.length) console.log('console:', unique.slice(0, 8).join('\n  '))
await browser.close()
