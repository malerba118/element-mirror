import puppeteer from 'puppeteer-core'

/** What each part of the source costs to capture, by removing it and looking. */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const VARIANTS = {
  whole: () => {},
  'without the svg icons': (card) =>
    card.querySelectorAll('svg').forEach((node) => node.remove()),
  'without the range input': (card) =>
    card.querySelectorAll('input[type=range]').forEach((node) => node.remove()),
  'without the artwork': (card) =>
    card.querySelector('.relative')?.remove(),
  'without the buttons': (card) =>
    card.querySelectorAll('button').forEach((node) => node.remove()),
  'without the transport row': (card) => card.lastElementChild?.remove(),
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const name of Object.keys(VARIANTS)) {
  const page = await browser.newPage()
  await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('section'))
      .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
      .scrollIntoView()
  })
  await wait(1000)

  await page.evaluate((key) => {
    const card = document.querySelector('section canvas[data-element-mirror-ignore]')
      ? Array.from(document.querySelectorAll('section'))
          .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
          .querySelector('[class*="bg-neutral-950"]')
      : null
    const mutate = {
      whole: () => {},
      'without the svg icons': (node) =>
        node.querySelectorAll('svg').forEach((svg) => svg.remove()),
      'without the range input': (node) =>
        node
          .querySelectorAll('input[type=range]')
          .forEach((input) => input.remove()),
      'without the artwork': (node) => node.querySelector('.relative')?.remove(),
      'without the buttons': (node) =>
        node.querySelectorAll('button').forEach((button) => button.remove()),
      'without the transport row': (node) => node.lastElementChild?.remove(),
    }[key]
    mutate(card)
  }, name)

  await wait(2500)

  const samples = []
  for (let index = 0; index < 8; index += 1) {
    samples.push(
      await page.evaluate(() => {
        const text = document.querySelector('header .font-mono')?.textContent ?? ''
        const ms = text.match(/([\d.]+)\s*ms/)
        return ms ? Number(ms[1]) : 0
      })
    )
    await wait(400)
  }
  const used = samples.filter((value) => value > 0)
  const mean = used.reduce((total, value) => total + value, 0) / used.length
  console.log(`  ${name.padEnd(28)} ${mean.toFixed(1)} ms/capture`)
  await page.close()
}

await browser.close()
