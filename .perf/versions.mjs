import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/** Shoots the demo under both mirror implementations, for eyeballing. */

const BASE = 'http://localhost:5173'
const OUT = '/tmp/v1v2'
mkdirSync(OUT, { recursive: true })

// Located by the source each section mirrors, since that is the one part of a
// section that cannot move.
const SHOTS = [
  { name: 'playground', selector: 'section:has(#playground-source)' },
  { name: 'sizing', selector: 'section:has(#sizing-source)' },
  { name: 'backdrop', selector: 'section:has(#backdrop-video)' },
  { name: 'sharing', selector: 'section:has(#sharing-source)' },
  { name: 'delay', selector: 'section:has(#delay-source)' },
  { name: 'frame-rate', selector: 'section:has(#frame-rate-source)' },
  { name: 'snapshot', selector: 'section:has(#snapshot-source)' },
]

const browser = await chromium.launch()

for (const version of ['1', '2']) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  await page.addInitScript(
    (value) => window.localStorage.setItem('element-mirror-version', value),
    version
  )
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important }',
  })

  // Scroll the whole page so every mirror has been on screen at least once.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  })
  await page.waitForTimeout(1500)

  for (const { name, selector } of SHOTS) {
    const target = page.locator(selector).first()
    if ((await target.count()) === 0) continue
    await target.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await target.screenshot({ path: `${OUT}/${name}-v${version}.png` })
  }

  // Does the backdrop actually cover its container?
  const cover = await page.evaluate(() => {
    const video = document.querySelector('#backdrop-video')
    const container = video.parentElement
    const mirror = container.firstElementChild
    const box = container.getBoundingClientRect()
    const paint = mirror.getBoundingClientRect()
    return {
      container: `${Math.round(box.width)}x${Math.round(box.height)}`,
      mirror: `${Math.round(paint.width)}x${Math.round(paint.height)}`,
      covers:
        paint.width >= box.width - 0.5 && paint.height >= box.height - 0.5,
    }
  })

  // How every mirror on the page ended up sized, against its source.
  const blank = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    const inked = (canvas) => {
      if (!canvas.width) return false
      const { data } = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height)
      for (let index = 3; index < data.length; index += 40) {
        if (data[index] > 16) return true
      }
      return false
    }
    return {
      total: canvases.length,
      painted: canvases.filter(inked).length,
    }
  })

  // The gallery, in both of its views. A mirror follows a change in its
  // source's size one capture later, the same way it follows a change in its
  // source's pixels, so switching view needs a moment before it means anything.
  await page.goto(`${BASE}/gallery`, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important }',
  })
  const specimen = page.locator('[data-specimen="button variants"]')
  await specimen.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await specimen.screenshot({ path: `${OUT}/gallery-v${version}.png` })
  await page.getByRole('button', { name: 'difference' }).first().click()
  await page.waitForTimeout(1500)
  await specimen.screenshot({ path: `${OUT}/difference-v${version}.png` })

  console.log(`\n=== v${version} ===`)
  console.log(
    `backdrop: container ${cover.container}, mirror ${cover.mirror} — ${
      cover.covers ? 'covers' : 'LETTERBOXES'
    }`
  )
  console.log(`canvases painted: ${blank.painted}/${blank.total}`)
  const unique = [...new Set(problems)]
  console.log(
    unique.length === 0
      ? 'console: clean'
      : `console:\n  ${unique.slice(0, 12).join('\n  ')}`
  )
  await page.close()
}

await browser.close()
console.log(`\nshots in ${OUT}`)
