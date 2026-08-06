import puppeteer from 'puppeteer-core'

/** The drag ghost appears fully formed: no blank and no wrong-shaped frame. */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Drag ghosts'))
    .scrollIntoView()
})
await wait(1500)

const card = await page.evaluate(() => {
  const section = Array.from(document.querySelectorAll('section')).find((s) =>
    s.querySelector('h2')?.textContent?.includes('Drag ghosts')
  )
  const node = section.querySelector('[class*="cursor-grab"]')
  const rect = node.getBoundingClientRect()
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
})

// Watch every animation frame from the moment the drag starts, so a single
// blank or wrong-shaped frame cannot slip through unseen.
await page.evaluate(() => {
  window.__frames = []
  const sample = () => {
    const ghost = document.querySelector('.fixed.z-50 canvas')
    if (ghost) {
      const rect = ghost.getBoundingClientRect()
      let opaque = 0
      if (ghost.width && ghost.height) {
        const { data } = ghost
          .getContext('2d')
          .getImageData(0, 0, ghost.width, ghost.height)
        for (let cursor = 3; cursor < data.length; cursor += 4) {
          if (data[cursor] > 8) opaque += 1
        }
        opaque = opaque / (data.length / 4)
      }
      window.__frames.push({
        visible: getComputedStyle(ghost).visibility === 'visible',
        opaque,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
    window.__raf = requestAnimationFrame(sample)
  }
  sample()
})

await page.mouse.move(card.x, card.y)
await page.mouse.down()
await page.mouse.move(card.x + 40.5, card.y + 30.5, { steps: 6 })
await wait(600)

const readGhost = () =>
  page.evaluate(
    () => document.querySelector('.fixed.z-50 canvas')?.toDataURL() ?? null
  )
const liveA = await readGhost()
await page.mouse.move(card.x + 120.5, card.y + 60.5, { steps: 10 })
await wait(600)
const liveB = await readGhost()

const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  return window.__frames
})
await page.mouse.up()

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${detail}`)
}

const shown = frames.filter((frame) => frame.visible)
check('the ghost appears at all', frames.length > 0, `${frames.length} frames`)
check(
  'never shows a visible blank frame',
  shown.every((frame) => frame.opaque > 0.3),
  `${shown.filter((frame) => frame.opaque <= 0.3).length} blank`
)
check(
  'never shows a visible wrong-sized frame',
  shown.every(
    (frame) =>
      Math.abs(frame.width - card.width) <= 1 &&
      Math.abs(frame.height - card.height) <= 1
  ),
  `card is ${card.width}x${card.height}`
)
check(
  'stays live while dragging',
  liveA !== null && liveA !== liveB,
  'the pulsing dot moved in the ghost'
)

const failed = checks.filter((row) => !row.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
process.exit(failed.length ? 1 : 0)
