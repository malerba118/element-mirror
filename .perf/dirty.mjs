import puppeteer from 'puppeteer-core'

/** What the change detection notices in a source that repaints on its own. */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) =>
      s.querySelector('h2')?.textContent?.includes('sizes like an image')
    )
    .scrollIntoView()
})
await wait(1200)

// Swap the selector's target for a source with nothing animating in it, so
// nothing masks what the dirty tracking does and does not notice.
await page.evaluate(() => {
  const demo = document.querySelector('#sizing-source')
  const host = demo.parentElement
  demo.removeAttribute('id')
  demo.style.display = 'none'

  const quiet = document.createElement('div')
  quiet.id = 'sizing-source'
  quiet.style.cssText =
    'width:360px;background:#fff;padding:16px;font:14px system-ui;color:#000'
  quiet.innerHTML = `
    <style>
      #probe-hover { padding: 6px; background: #eee; }
      #probe-hover:hover { background: #000; }
    </style>
    <p id="probe-text" style="margin:0 0 8px">quiet source</p>
    <input id="probe-input" style="width:100%;box-sizing:border-box;font-size:16px;padding:6px;border:1px solid #999" />
    <div id="probe-scroll" style="height:60px;overflow:auto;border:1px solid #999;margin-top:8px">
      <div style="height:400px;background:linear-gradient(#f00,#0f0,#00f)"></div>
    </div>
    <div id="probe-hover">hover target</div>
    <img id="probe-img" style="display:block;margin-top:8px;width:64px;height:32px" />
  `
  host.appendChild(quiet)
})
await wait(1500)

await page.evaluate(() => {
  window.__mirror = () => {
    const section = Array.from(document.querySelectorAll('section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes('sizes like an image')
    )
    const canvas = Array.from(
      section.querySelectorAll('canvas[data-element-mirror-ignore]')
    ).find((node) => !node.style.width && !node.style.height)
    return canvas ? canvas.toDataURL() : null
  }
})

const results = []
async function probe(label, action, { expectChange = true } = {}) {
  const before = await page.evaluate(() => window.__mirror())
  await action()
  await wait(1200)
  const after = await page.evaluate(() => window.__mirror())
  const changed = before !== after
  const ok = changed === expectChange
  results.push({ label, ok })
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(36)} mirror ${changed ? 'updated' : 'held still'}`
  )
}

console.log('what a still source repaints without mutating:\n')

await probe('text content changed (control)', () =>
  page.evaluate(() => {
    document.querySelector('#probe-text').textContent = 'mutated'
  })
)

await probe('typing into an input', async () => {
  await page.click('#probe-input')
  await page.keyboard.type('hello world')
})

await probe('scrolling a box inside the source', () =>
  page.evaluate(() => {
    document.querySelector('#probe-scroll').scrollTop = 220
  })
)

await probe('hovering a child', () => page.hover('#probe-hover'))

await probe('unhovering it again', () => page.hover('#probe-text'))

await probe('an image finishing loading', () =>
  page.evaluate(async () => {
    const scratch = document.createElement('canvas')
    scratch.width = 64
    scratch.height = 32
    const context = scratch.getContext('2d')
    context.fillStyle = '#f0f'
    context.fillRect(0, 0, 64, 32)
    const image = document.querySelector('#probe-img')
    image.src = scratch.toDataURL()
    await image.decode()
  })
)

// The periodic verification capture repaints the canvas, but with the same
// pixels, so a mirror of a still source still shows an unchanging image.
await probe('nothing at all', async () => {}, { expectChange: false })

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} correct`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
process.exit(failed.length ? 1 : 0)
