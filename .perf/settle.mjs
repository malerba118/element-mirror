import { chromium } from 'playwright'

/**
 * Asserts the first-frame settle guard: a paused mirror over still-loading
 * images must hold no frame while they fetch (not a placeholder it would keep
 * forever), then hold a frame containing the real pixels of every image.
 * Drives /settle-test, which exists for this script.
 *
 *   node .perf/settle.mjs
 *
 * Needs the dev server up: `pnpm dev`.
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/settle-test'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
})
await page.goto(PAGE, { waitUntil: 'domcontentloaded' })

const inspect = () =>
  page.evaluate(() => {
    const report = {}
    for (const which of ['single', 'nested']) {
      const canvas = document.querySelector(`canvas[data-case="${which}"]`)
      const style = canvas ? getComputedStyle(canvas) : null
      let inkedHalves = null
      if (canvas && canvas.width > 0) {
        const { data } = canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height)
        // Count pixels with alpha in the left and right halves separately, so
        // a nested frame holding img-1 but missing img-2 is caught.
        let left = 0
        let right = 0
        const rowBytes = canvas.width * 4
        for (let i = 3; i < data.length; i += 40) {
          if (data[i] > 16) {
            const x = ((i - 3) % rowBytes) / 4
            if (x < canvas.width / 2) left += 1
            else right += 1
          }
        }
        inkedHalves = { left, right }
      }
      report[which] = {
        visibility: style?.visibility ?? 'absent',
        bitmap: canvas ? `${canvas.width}x${canvas.height}` : null,
        inkedHalves,
      }
    }
    const images = Array.from(document.querySelectorAll('img')).map(
      (img) => img.complete
    )
    return { ...report, imagesComplete: images }
  })

// While the images fetch: mirrors must be frameless (hidden, no bitmap).
await page.waitForTimeout(600)
console.log('during load:', JSON.stringify(await inspect()))

// After the slowest image (2.2s) plus a couple retry beats.
await page.waitForTimeout(4000)
const after = await inspect()
console.log('after load: ', JSON.stringify(after))

await browser.close()

const failures = []
for (const which of ['single', 'nested']) {
  const state = after[which]
  if (state.visibility !== 'visible') failures.push(`${which}: still hidden`)
  const halves = state.inkedHalves ?? { left: 0, right: 0 }
  if (halves.left === 0 || halves.right === 0) {
    failures.push(`${which}: frame missing pixels (${halves.left}/${halves.right})`)
  }
}
if (failures.length > 0) {
  console.error('FAIL:', failures.join('; '))
  process.exit(1)
}
console.log('ok: paused mirrors waited for the images and kept complete frames')
