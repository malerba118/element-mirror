import puppeteer from 'puppeteer-core'

/**
 * Whether cached svg rasterisation stays correct when an icon changes, and
 * whether the progress knob makes it into the capture.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(String(error.message)))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .scrollIntoView()
})
await wait(1500)

const results = []
const ok = (pass, label, detail = '') =>
  results.push({ pass, label, detail })

const mirrorShot = () =>
  page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('section'))
      .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
      .querySelector('canvas[data-screenshot-ignore]')
    return canvas.toDataURL()
  })

// The transport row of the mirror, where the icons are.
const iconStrip = () =>
  page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('section'))
      .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
      .querySelector('canvas[data-screenshot-ignore]')
    const context = canvas.getContext('2d')
    // Bottom quarter, left half: the transport controls.
    const { data } = context.getImageData(
      0,
      Math.floor(canvas.height * 0.75),
      Math.floor(canvas.width * 0.45),
      Math.floor(canvas.height * 0.25)
    )
    let hash = 0
    for (let index = 0; index < data.length; index += 4) {
      hash = (hash * 31 + data[index] + data[index + 3]) % 1000000007
    }
    return hash
  })

const click = async (label) => {
  const button = await page.$(`[aria-label="${label}"]`)
  await button.click()
  await wait(900)
}

const before = await iconStrip()
await click('Pause')
const afterPause = await iconStrip()
ok(
  before !== afterPause,
  'the play icon replacing pause reaches the mirror',
  before === afterPause ? 'strip unchanged' : 'strip changed'
)

await click('Play')
const backToPause = await iconStrip()
ok(
  backToPause !== afterPause,
  'and swapping back changes it again',
  backToPause === before ? 'identical to the original' : 'changed'
)

// A liked heart is the same icon in a different colour, which shares nothing
// with the cached entry only if colour is part of the key.
const heartBefore = await page.evaluate(() => {
  const canvas = Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .querySelector('canvas[data-screenshot-ignore]')
  const context = canvas.getContext('2d')
  const { data } = context.getImageData(
    Math.floor(canvas.width * 0.8),
    0,
    Math.floor(canvas.width * 0.2),
    Math.floor(canvas.height * 0.4)
  )
  let reddest = 0
  for (let index = 0; index < data.length; index += 4) {
    reddest = Math.max(reddest, data[index] - data[index + 2])
  }
  return reddest
})

await click('Like')

const heartAfter = await page.evaluate(() => {
  const canvas = Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .querySelector('canvas[data-screenshot-ignore]')
  const context = canvas.getContext('2d')
  const { data } = context.getImageData(
    Math.floor(canvas.width * 0.8),
    0,
    Math.floor(canvas.width * 0.2),
    Math.floor(canvas.height * 0.4)
  )
  let reddest = 0
  for (let index = 0; index < data.length; index += 4) {
    reddest = Math.max(reddest, data[index] - data[index + 2])
  }
  return reddest
})

ok(
  heartAfter > heartBefore + 40,
  'a liked heart turns red in the mirror too',
  `red over blue went ${heartBefore} to ${heartAfter}`
)

// The progress knob: a 10px circle centred on the bar, so it stands proud of
// the 4px track above and below it. Compare the source's own pixels with the
// mirror's at the same relative position.
const knob = await page.evaluate(() => {
  const card = document.querySelector('[class*="bg-neutral-950"]')
  const dot = card.querySelector('span.rounded-full.bg-white')
  if (!dot) return { found: false }
  const dotRect = dot.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  const canvas = Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .querySelector('canvas[data-screenshot-ignore]')

  // Where the knob's centre falls in the bitmap.
  const fx = (dotRect.left + dotRect.width / 2 - cardRect.left) / cardRect.width
  const fy = (dotRect.top + dotRect.height / 2 - cardRect.top) / cardRect.height
  const context = canvas.getContext('2d')
  const x = Math.round(fx * canvas.width)
  const y = Math.round(fy * canvas.height)
  // The knob is taller than the track, so sample just above its top edge.
  const offset = Math.round(((dotRect.height / 2) * canvas.height) / cardRect.height) - 1
  const at = (dx, dy) => {
    const { data } = context.getImageData(x + dx, y + dy, 1, 1)
    return data[0]
  }
  return {
    found: true,
    size: `${dotRect.width}x${dotRect.height}`,
    centre: at(0, 0),
    aboveTrack: at(0, -offset),
    belowTrack: at(0, offset),
  }
})

ok(
  knob.found && knob.centre > 200,
  'the mirror has the bar under the knob',
  `centre brightness ${knob.centre}`
)
ok(
  knob.found && knob.aboveTrack > 200 && knob.belowTrack > 200,
  'and the knob standing proud of the track',
  `${knob.aboveTrack} above, ${knob.belowTrack} below, knob is ${knob.size}`
)

for (const row of results) {
  console.log(
    `${row.pass ? 'ok  ' : 'FAIL'} ${row.label.padEnd(48)} ${row.detail}`
  )
}
console.log(
  `\n${results.filter((row) => row.pass).length}/${results.length} checks passed`
)
console.log(`problems: ${problems.length ? problems : 'none'}`)

await browser.close()
