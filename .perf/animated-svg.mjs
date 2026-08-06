import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

/**
 * Whether a CSS-animated svg still moves in a capture.
 *
 * The patch keeps rasterised svgs keyed by the markup they came from, and a
 * spinner's rotation lives in the animation engine rather than in any attribute,
 * so a cache could freeze it. Each case is captured at 30fps by both the patched
 * and the pristine library: if the patched one is still while the pristine one
 * moves, the cache broke it, and if both are still, the library never handled it.
 *
 * The pristine copy is not kept in the repo. To recreate it:
 *
 *   cp ../node_modules/@renoun/screenshot/dist/index.js renoun-pristine.js
 *   patch -R renoun-pristine.js < ../patches/@renoun+screenshot+0.3.3.patch
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const CASES = {
  'div rotating (control)': `
    <div style="width:32px;height:32px;background:linear-gradient(#fff 0 50%,#f43f5e 50% 100%);animation:probe-spin 1s linear infinite"></div>`,
  'svg rotating': `
    <svg width="32" height="32" viewBox="0 0 24 24" style="animation:probe-spin 1s linear infinite">
      <path d="M12 2v6" stroke="white" stroke-width="3" fill="none"/>
      <circle cx="12" cy="12" r="9" stroke="#f43f5e" stroke-width="2" fill="none"/>
    </svg>`,
  'svg inner group rotating': `
    <svg width="32" height="32" viewBox="0 0 24 24">
      <g style="animation:probe-spin 1s linear infinite;transform-origin:12px 12px">
        <path d="M12 2v6" stroke="white" stroke-width="3" fill="none"/>
      </g>
      <circle cx="12" cy="12" r="9" stroke="#38bdf8" stroke-width="2" fill="none"/>
    </svg>`,
  'svg dashoffset animating': `
    <svg width="32" height="32" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="#a3e635" stroke-width="3" fill="none"
        stroke-dasharray="57" style="animation:probe-dash 1.4s linear infinite"/>
    </svg>`,
}

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
await wait(1200)

for (const [name, path] of Object.entries({
  patched: '../node_modules/@renoun/screenshot/dist/index.js',
  pristine: 'renoun-pristine.js',
})) {
  await page.evaluate(
    async ({ name, source }) => {
      const blob = new Blob([source], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      window[`__${name}`] = await import(url)
      URL.revokeObjectURL(url)
    },
    { name, source: fs.readFileSync(path, 'utf8') }
  )
}

// The probes live inside the mirrored card so they are captured the same way
// everything else in this demo is.
await page.evaluate((cases) => {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes probe-spin { to { transform: rotate(360deg) } }
    @keyframes probe-dash { to { stroke-dashoffset: -57 } }`
  document.head.appendChild(style)

  const card = document.querySelector('[class*="bg-neutral-950"]')
  const strip = document.createElement('div')
  strip.id = 'probes'
  strip.style.cssText =
    'display:flex;gap:10px;padding:10px;background:#000;align-items:center'
  strip.innerHTML = Object.values(cases)
    .map((markup) => `<div data-probe style="flex:none">${markup}</div>`)
    .join('')
  card.appendChild(strip)
}, CASES)

await wait(600)

const results = await page.evaluate(async () => {
  const strip = document.getElementById('probes')
  const probes = Array.from(strip.querySelectorAll('[data-probe]'))
  const own = document.createElement('canvas')

  const fingerprintRegion = (canvas, rect, stripRect) => {
    const sx = canvas.width / stripRect.width
    const sy = canvas.height / stripRect.height
    const { data } = canvas
      .getContext('2d')
      .getImageData(
        Math.round((rect.left - stripRect.left) * sx),
        Math.round((rect.top - stripRect.top) * sy),
        Math.max(1, Math.round(rect.width * sx)),
        Math.max(1, Math.round(rect.height * sy))
      )
    let hash = 0
    for (let index = 0; index < data.length; index += 4) {
      hash = (hash * 31 + data[index] + data[index + 3]) % 1000000007
    }
    return hash
  }

  const run = async (library) => {
    const seen = probes.map(() => new Set())
    for (let frame = 0; frame < 24; frame += 1) {
      await window[`__${library}`].screenshot.canvas(strip, {
        canvas: own,
        scale: 2,
        backgroundColor: null,
      })
      const stripRect = strip.getBoundingClientRect()
      probes.forEach((probe, index) => {
        seen[index].add(
          fingerprintRegion(own, probe.getBoundingClientRect(), stripRect)
        )
      })
      await new Promise((resolve) => setTimeout(resolve, 1000 / 30))
    }
    return seen.map((set) => set.size)
  }

  return { patched: await run('patched'), pristine: await run('pristine') }
})

const labels = Object.keys(CASES)
console.log('distinct renderings across 24 captures at 30fps\n')
console.log(`  ${'case'.padEnd(26)} patched  pristine`)
labels.forEach((label, index) => {
  const patched = results.patched[index]
  const pristine = results.pristine[index]
  const verdict =
    patched > 2 ? '' : pristine > 2 ? '  <- the cache froze it' : '  <- neither renders it'
  console.log(
    `  ${label.padEnd(26)} ${String(patched).padStart(7)}  ${String(pristine).padStart(8)}${verdict}`
  )
})

await page.evaluate(() => document.getElementById('probes')?.remove())
await browser.close()
