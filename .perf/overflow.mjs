import puppeteer from 'puppeteer-core'

/**
 * Whether a child that overflows its parent survives a capture.
 *
 * The player card's progress knob is a circle taller than the 4px rounded track
 * it sits on, and it vanishes from the mirror. CSS only clips a child when the
 * parent says overflow: hidden, so a rounded parent clipping anyway would
 * explain it.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const CASES = [
  { label: 'rounded parent, overflow visible', radius: '9999px', overflow: 'visible' },
  { label: 'square parent, overflow visible', radius: '0', overflow: 'visible' },
  { label: 'rounded parent, overflow hidden', radius: '9999px', overflow: 'hidden' },
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .scrollIntoView()
})
await wait(1500)
await page.click('[aria-label="Pause"]')
await wait(600)

const readings = await page.evaluate(async (cases) => {
  const card = document.querySelector('[class*="bg-neutral-950"]')
  const canvas = Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .querySelector('canvas[data-element-mirror-ignore]')

  const strip = document.createElement('div')
  strip.style.cssText = 'padding:14px 8px;background:#000;display:flex;gap:20px'
  const knobs = cases.map((testCase) => {
    const track = document.createElement('div')
    track.style.cssText = `position:relative;width:60px;height:4px;background:#555;border-radius:${testCase.radius};overflow:${testCase.overflow};flex:none`
    const knob = document.createElement('div')
    // Centred on the track and twice as tall, so it stands proud of it.
    knob.style.cssText =
      'position:absolute;left:30px;top:50%;width:10px;height:10px;margin-left:-5px;margin-top:-5px;border-radius:9999px;background:#fff'
    track.appendChild(knob)
    strip.appendChild(track)
    return knob
  })
  card.appendChild(strip)

  await new Promise((resolve) => setTimeout(resolve, 1400))

  const cardRect = card.getBoundingClientRect()
  const sx = canvas.width / cardRect.width
  const sy = canvas.height / cardRect.height
  const context = canvas.getContext('2d')

  const results = knobs.map((knob, index) => {
    const rect = knob.getBoundingClientRect()
    // Only the top third of the knob, which is the part outside the track.
    const left = Math.round((rect.left - cardRect.left) * sx)
    const top = Math.round((rect.top - cardRect.top) * sy)
    const width = Math.max(1, Math.round(rect.width * sx))
    const height = Math.max(1, Math.round((rect.height / 3) * sy))
    const { data } = context.getImageData(left, top, width, height)
    let white = 0
    for (let position = 0; position < data.length; position += 4) {
      if (data[position] > 200) white += 1
    }
    return {
      label: cases[index].label,
      coverage: white / (width * height),
    }
  })

  strip.remove()
  return results
}, CASES)

for (const reading of readings) {
  const visible = reading.coverage > 0.2
  console.log(
    `${visible ? 'kept    ' : 'CLIPPED '} ${reading.label.padEnd(34)} ${(reading.coverage * 100).toFixed(0)}% of the overflowing part survived`
  )
}

await browser.close()
