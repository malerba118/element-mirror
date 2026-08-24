import puppeteer from 'puppeteer-core'

/** Pausing holds a frame, and pausing before there is one still takes one. */

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

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ${detail}`)
}

await page.evaluate(() => {
  window.__section = (text) =>
    Array.from(document.querySelectorAll('section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes(text)
    )
  window.__read = (canvas) => {
    if (!canvas) return null
    const context = canvas.getContext('2d')
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let opaque = 0
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 8) opaque += 1
    }
    // The box is not always the canvas: a mirror that paints outside its box
    // says which element the box is, and the canvas is free to be another size.
    const box = canvas.closest('[data-element-mirror]') ?? canvas
    const rect = box.getBoundingClientRect()
    return {
      url: canvas.toDataURL(),
      opaqueRatio: opaque / (data.length / 4),
      visibility: getComputedStyle(box).visibility,
      css: [rect.width, rect.height],
    }
  }
})

console.log('a mirror mounted paused:\n')

await page.evaluate(() => window.__section('One frame and stop').scrollIntoView())
await wait(2000)

const snapshot = () =>
  page.evaluate(() =>
    window.__read(window.__section('One frame and stop').querySelector('canvas'))
  )
const clock = () =>
  page.evaluate(
    () =>
      window.__section('One frame and stop').querySelector('#snapshot-source')
        ?.textContent ?? ''
  )

const first = await snapshot()
check(
  'paints a frame rather than staying blank',
  first !== null && first.opaqueRatio > 0.5,
  `${Math.round((first?.opaqueRatio ?? 0) * 100)}% opaque`
)
check('is visible once it has that frame', first?.visibility === 'visible')
check(
  'lays out at the source size, not the bitmap size',
  first?.css[0] === 300,
  `${first?.css.join('x')} css`
)

const sourceBefore = await clock()
await wait(2500)
const held = await snapshot()
const sourceAfter = await clock()
check(
  'the source kept running underneath it',
  sourceBefore !== sourceAfter,
  'clock advanced'
)
check('holds that frame instead of following', held?.url === first?.url)

await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.includes('Re-capture')
  )
  button.click()
})
await wait(1500)
const retaken = await snapshot()
check('re-capturing gives it a new frame', retaken?.url !== first?.url)
check(
  'and the new frame is not blank',
  (retaken?.opaqueRatio ?? 0) > 0.5,
  `${Math.round((retaken?.opaqueRatio ?? 0) * 100)}% opaque`
)

console.log('\npausing a mirror that is already running:\n')

await page.evaluate(() => window.__section('Playground').scrollIntoView())
await wait(1500)

const playground = () =>
  page.evaluate(() =>
    window.__read(window.__section('Playground').querySelectorAll('canvas')[0])
  )

const running = await playground()
await wait(1200)
const stillRunning = await playground()
check('runs before being paused', running?.url !== stillRunning?.url)

await page.click('#paused')
await wait(800)
const pausedOne = await playground()
await wait(1500)
const pausedTwo = await playground()
check('holds still once paused', pausedOne?.url === pausedTwo?.url)
check(
  'and keeps showing its frame',
  (pausedOne?.opaqueRatio ?? 0) > 0.3,
  `${Math.round((pausedOne?.opaqueRatio ?? 0) * 100)}% opaque`
)

await page.click('#paused')
await wait(1200)
const resumed = await playground()
check('resumes when unpaused', resumed?.url !== pausedTwo?.url)

const failed = checks.filter((row) => !row.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
process.exit(failed.length ? 1 : 0)
