import puppeteer from 'puppeteer-core'

/** Every mirror on the page paints, shows itself, and lays out at its own size. */

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
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`[console] ${message.text()}`)
})
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

const titles = await page.evaluate(() =>
  Array.from(document.querySelectorAll('section')).map(
    (section) => section.querySelector('h2')?.textContent ?? '(untitled)'
  )
)

let bad = 0
let total = 0

for (const [index, title] of titles.entries()) {
  await page.evaluate((position) => {
    document.querySelectorAll('section')[position].scrollIntoView()
  }, index)
  await wait(1800)

  const mirrors = await page.evaluate((position) => {
    const section = document.querySelectorAll('section')[position]
    return Array.from(
      section.querySelectorAll('canvas[data-element-mirror-ignore]')
    ).map((canvas) => {
      const context = canvas.getContext('2d')
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      let opaque = 0
      for (let cursor = 3; cursor < data.length; cursor += 4) {
        if (data[cursor] > 8) opaque += 1
      }
      const rect = canvas.getBoundingClientRect()
      return {
        painted: opaque / (data.length / 4) > 0.02,
        visible: getComputedStyle(canvas).visibility === 'visible',
        // A canvas laid out at its bitmap size is the sizing bug this guards:
        // the bitmap is the source scaled by pixelRatio.
        oversized:
          Math.abs(rect.width - canvas.width) < 1 &&
          canvas.width > rect.height &&
          window.devicePixelRatio > 1,
        css: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      }
    })
  }, index)

  total += mirrors.length
  const failures = mirrors.filter(
    (mirror) => !mirror.painted || !mirror.visible || mirror.oversized
  )
  bad += failures.length
  const detail = failures.length
    ? failures
        .map(
          (mirror) =>
            `${mirror.painted ? '' : 'blank '}${mirror.visible ? '' : 'hidden '}${mirror.oversized ? 'oversized ' : ''}(${mirror.css})`
        )
        .join(', ')
    : mirrors.map((mirror) => mirror.css).join(' ')
  console.log(
    `${failures.length ? 'FAIL' : 'ok  '} ${title.slice(0, 38).padEnd(40)} ${String(mirrors.length).padStart(2)} mirrors  ${detail}`
  )
}

console.log(`\n${total - bad}/${total} mirrors painted, visible and sized`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
process.exit(bad || problems.length ? 1 : 0)
