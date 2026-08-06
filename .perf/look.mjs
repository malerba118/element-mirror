import puppeteer from 'puppeteer-core'

/** Screenshots a section by name, for looking at it. */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const needle = process.argv[2] ?? 'Playground'
const out = process.argv[3] ?? 'look.png'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

if (process.env.DARK === '1') {
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await wait(400)
}

const section = (
  await page.evaluateHandle((text) => {
    return Array.from(document.querySelectorAll('section')).find((element) =>
      element.querySelector('h2')?.textContent?.includes(text)
    )
  }, needle)
).asElement()

await section.scrollIntoView()
await wait(2500)
await section.screenshot({ path: out })
console.log(`wrote ${out}`)

await browser.close()
