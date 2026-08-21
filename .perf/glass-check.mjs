import { chromium } from 'playwright'

/**
 * Drives the glass-floor demo and checks its two claims.
 *
 * The bloom: each `[data-bloom]` layer must actually hold bright, saturated
 * pixels, since screen blending turns only those into visible light.
 *
 * The water: the WebGL canvas must be lit by the reflection, hold still when
 * ripple is zero, move when it is not, and — because its texture is a live
 * mirror — change when the card changes, with no CSS in between.
 */

const PAGE = 'http://localhost:5173/glass-floor'

// Playwright's headless shell ships without WebGL; these turn on SwiftShader.
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'],
})
const page = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
})
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text())
})
page.on('pageerror', (e) => problems.push(e.message))

await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/glass-idle.png' })

// The aurora animates the card perpetually by design, so the still-water
// checks below are only meaningful with it off — and only once its last
// frames have worked through the mirrors and into the water.
await page.locator('#aurora [role="slider"]').press('Home')
await page.waitForTimeout(1600)

/** Copies the WebGL water into 2D pixels (drawing buffer is preserved). */
const readWater = () =>
  page.evaluate(() => {
    const gl = document.querySelector('canvas[data-reflection]')
    const copy = document.createElement('canvas')
    copy.width = gl.width
    copy.height = gl.height
    const context = copy.getContext('2d')
    context.drawImage(gl, 0, 0)
    const data = context.getImageData(0, 0, copy.width, copy.height).data
    let lit = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 20) lit++
    }
    window.__water ??= []
    window.__water.push(data)
    if (window.__water.length > 2) window.__water.shift()
    return +((lit / (data.length / 4)) * 100).toFixed(2)
  })

/** Differing pixels between the last two water readings. */
const waterDrift = () =>
  page.evaluate(() => {
    const [a, b] = window.__water
    const len = Math.min(a.length, b.length)
    let differing = 0
    for (let i = 0; i < len; i += 4) {
      if (Math.abs(a[i] - b[i]) > 10) differing++
    }
    return +((differing / (len / 4)) * 100).toFixed(2)
  })

/** The glow's footprint in each bloom canvas. The canvas holds the already
 *  blurred light now — the blur is baked into pixels rather than applied by
 *  CSS — so the wide layer is dim by design and a brightness bar would fail
 *  it. Coverage plus one genuinely bright peak proves a frame landed and got
 *  blurred: an unblurred card would cover far less of the padded canvas. */
const bloom = await page.evaluate(() =>
  [...document.querySelectorAll('[data-bloom]')].map((layer) => {
    const canvas = layer.querySelector('canvas')
    const data = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height).data
    let lit = 0
    let peak = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 8) lit++
      const max = Math.max(data[i], data[i + 1], data[i + 2])
      if (max > peak) peak = max
    }
    const style = getComputedStyle(layer)
    return {
      opacity: +(+style.opacity).toFixed(2),
      blend: style.mixBlendMode,
      peak,
      lit: +((lit / (data.length / 4)) * 100).toFixed(1),
    }
  })
)

const litIdle = await readWater()

// Ripple off: the water must freeze solid between two frames.
await page.locator('#ripple [role="slider"]').press('Home')
await page.waitForTimeout(400)
await readWater()
await page.waitForTimeout(200)
await readWater()
const stillDrift = await waterDrift()

// Typing spawns rings now, so to isolate the live texture: type, then let the
// rings die out, and compare the frozen water against before — what remains
// changed is the reflected text itself.
await readWater()
await page.click('#email')
await page.keyboard.type('ada@lovelace.org', { delay: 80 })
await page.screenshot({ path: '/tmp/glass-typing.png' })
await page.waitForTimeout(3600)
await readWater()
const typedDrift = await waterDrift()

// Clicking the card must leave still water untouched now.
await page.evaluate(() => document.activeElement?.blur())
await page.waitForTimeout(1500)
await readWater()
await page.click('h2')
await page.waitForTimeout(400)
await readWater()
const clickDrift = await waterDrift()

// One keystroke must break it immediately — the ring lands before the
// character can even be captured — and afterwards the water refreezes.
await page.click('#email')
await page.waitForTimeout(1200)
await readWater()
await page.keyboard.press('x')
await page.waitForTimeout(300)
await readWater()
const keyDrift = await waterDrift()
await page.waitForTimeout(3600)
await readWater()
await page.waitForTimeout(200)
await readWater()
const refrozenDrift = await waterDrift()

// Ripple back on: two frames apart, the water must be moving again.
await page.locator('#ripple [role="slider"]').press('End')
await page.waitForTimeout(400)
await readWater()
await page.waitForTimeout(200)
await readWater()
const movingDrift = await waterDrift()

// Aurora alone: still water, but the card's own background is animating, so
// the reflection must be moving anyway — the motion rides the mirror.
await page.locator('#ripple [role="slider"]').press('Home')
await page.locator('#aurora [role="slider"]').press('End')
await page.waitForTimeout(800)
await readWater()
await page.waitForTimeout(200)
await readWater()
const auroraDrift = await waterDrift()
await page.locator('#ripple [role="slider"]').press('End')
await page.waitForTimeout(300)

await page.click('button[type="submit"]')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/glass-signin.png' })
const stats = await page.textContent('footer p.ml-auto')

// A click on the water spawns a ring.
await page.mouse.click(640, 700)
await page.waitForTimeout(250)
await page.screenshot({ path: '/tmp/glass-ring.png' })

await page.waitForTimeout(2600)
await page.locator('#frost [role="slider"]').press('Home')
await page.waitForTimeout(700)
await page.screenshot({ path: '/tmp/glass-clear.png' })

console.log('bloom layers:', JSON.stringify(bloom))
console.log('water lit at idle:          ', litIdle, '% of pixels')
console.log('water drift, ripple off:    ', stillDrift, '% of pixels')
console.log('water drift after typing:   ', typedDrift, '% of pixels')
console.log('water drift from card click:', clickDrift, '% of pixels')
console.log('water drift from keystroke: ', keyDrift, '% of pixels')
console.log('water drift after refreeze: ', refrozenDrift, '% of pixels')
console.log('water drift, ripple on:     ', movingDrift, '% of pixels')
console.log('water drift, aurora only:   ', auroraDrift, '% of pixels')
console.log('stats while signing in:', stats?.trim())
console.log(
  bloom.every((l) => l.lit > 20 && l.peak > 200 && l.blend === 'screen') &&
    litIdle > 2 &&
    stillDrift < 0.02 &&
    typedDrift > 0.05 &&
    clickDrift < 0.02 &&
    keyDrift > 0.2 &&
    refrozenDrift < 0.02 &&
    movingDrift > 1 &&
    auroraDrift > 0.2
    ? 'ok: water is lit, still when still, moved by keys, clicks no, aurora yes'
    : 'PROBLEM: see the numbers above'
)
if (problems.length) console.log('errors:\n  ' + [...new Set(problems)].join('\n  '))
await browser.close()
