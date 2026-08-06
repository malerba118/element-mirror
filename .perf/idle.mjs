import puppeteer from 'puppeteer-core'

/**
 * A still source costs almost nothing. Not quite nothing: the detection is
 * verified on an interval, so a missed change cannot leave a mirror stale
 * indefinitely. This checks the skipping still works and prices the insurance.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

const rate = () =>
  page.evaluate(() => {
    const badge = document.querySelector('header .font-mono')
    const match = (badge?.textContent ?? '').match(/([\d.]+)\s*cap\/s/)
    return match ? Number(match[1]) : null
  })

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) =>
      s.querySelector('h2')?.textContent?.includes('sizes like an image')
    )
    .scrollIntoView()
})
await wait(2000)
const animating = await rate()

// Same four mirrors, pointed at a source with nothing moving in it.
await page.evaluate(() => {
  const demo = document.querySelector('#sizing-source')
  const host = demo.parentElement
  demo.removeAttribute('id')
  demo.style.display = 'none'
  const quiet = document.createElement('div')
  quiet.id = 'sizing-source'
  quiet.style.cssText =
    'width:360px;background:#fff;padding:16px;font:14px system-ui;color:#000'
  quiet.innerHTML =
    '<p style="margin:0">nothing here moves</p><input style="width:100%" />'
  host.appendChild(quiet)
})
await wait(3000)

const samples = []
for (let index = 0; index < 6; index += 1) {
  samples.push(await rate())
  await wait(700)
}
const idle = Math.max(...samples)

console.log(`captures/second with an animating source: ${animating}`)
console.log(`captures/second with a still source:      ${samples.join(', ')}`)

// One source verified once a second, and nothing else.
const ok = idle <= 2 && animating > idle
console.log(
  `\n${ok ? 'ok  ' : 'FAIL'} a still source falls to the verification rate (${idle}/s) from ${animating}/s`
)
await browser.close()
process.exit(ok ? 0 : 1)
