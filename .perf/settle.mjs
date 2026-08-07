import { chromium } from 'playwright'

/**
 * Asserts both halves of the first-frame rule against /settle-test, which
 * exists for this script.
 *
 * `single` mirrors an <img> directly: its one frame must wait for the pixels
 * (no frame while the image fetches, real pixels once it lands). `nested`
 * mirrors a div whose images load slower than the engine's own fetch timeout:
 * the wait is deliberately shallow, so its one frame must arrive WITHOUT
 * waiting for them — an interface is captured as it looks, loading states
 * included, and app-defined readiness belongs to the app.
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
        // a frame holding one image but missing the other is caught.
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
        inkedHalves,
      }
    }
    report.imagesComplete = Array.from(document.querySelectorAll('img')).map(
      (img) => img.complete
    )
    return report
  })

// 600ms in: the single image (1.5s) is still fetching, so its mirror must be
// frameless — not holding a placeholder it would keep forever.
await page.waitForTimeout(600)
const during = await inspect()
console.log('during load:', JSON.stringify(during))

// 4.3s in: the single image landed at 1.5s; the nested images (5.5s) are
// still fetching, but the engine's 3s fetch timeout has passed, so the
// nested mirror must already hold its frame of the loading interface.
await page.waitForTimeout(3700)
const midway = await inspect()
console.log('midway:     ', JSON.stringify(midway))

await browser.close()

const failures = []
if (during.single.visibility !== 'hidden') {
  failures.push('single: captured before its image landed')
}
const singleInk = midway.single.inkedHalves ?? { left: 0, right: 0 }
if (midway.single.visibility !== 'visible' || singleInk.left === 0 || singleInk.right === 0) {
  failures.push(
    `single: no complete frame after load (${midway.single.visibility}, ${singleInk.left}/${singleInk.right})`
  )
}
if (midway.imagesComplete[1] || midway.imagesComplete[2]) {
  failures.push('nested: test images loaded too soon to prove anything')
}
if (midway.nested.visibility !== 'visible') {
  failures.push('nested: waited for descendants — the guard is meant to be shallow')
}
if (failures.length > 0) {
  console.error('FAIL:', failures.join('; '))
  process.exit(1)
}
console.log(
  'ok: a media source waited for its pixels; a composite captured its loading state'
)
