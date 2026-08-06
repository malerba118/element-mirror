import puppeteer from 'puppeteer-core'

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

const section = async (text) => {
  const handle = await page.evaluateHandle((needle) => {
    const found = Array.from(document.querySelectorAll('section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes(needle)
    )
    found.scrollIntoView()
    return found
  }, text)
  return handle.asElement()
}

const delaySection = await section('run behind')
await wait(3000)
await delaySection.screenshot({ path: 'delay-section.png' })

// The clocks should disagree, which is the whole point of the section.
const clocks = await page.evaluate(() => {
  const found = Array.from(document.querySelectorAll('section')).find((s) =>
    s.querySelector('h2')?.textContent?.includes('run behind')
  )
  return Array.from(found.querySelectorAll('canvas')).length
})
console.log(`delay section rendered with ${clocks} mirrors`)

const playground = await section('Playground')
await wait(2000)
const before = await page.evaluate(
  () => document.querySelector('section canvas')?.toDataURL() ?? null
)

// Drag the delay slider to the far right.
const slider = await page.$('#delay')
const box = await slider.boundingBox()
await page.mouse.move(box.x + 4, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 10 })
await page.mouse.up()
await wait(1500)

const label = await page.evaluate(() => {
  const control = document.querySelector('#delay')
  return control.closest('.space-y-3').querySelector('span')?.textContent
})
const after = await page.evaluate(
  () => document.querySelector('section canvas')?.toDataURL() ?? null
)
await playground.screenshot({ path: 'playground-delay.png' })

console.log(`playground delay control reads ${label}`)
console.log(`mirror still painting after the change: ${after !== null && after !== before}`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
