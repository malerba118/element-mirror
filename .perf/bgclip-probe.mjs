import { chromium, firefox, webkit } from 'playwright'

/**
 * Can each engine rasterize background-clip:text inside an SVG foreignObject
 * image — the way snapdom renders everything? Draws gradient-clipped text
 * to a canvas via the foreignObject path and counts inked pixels, alongside
 * a plain-color control so a total failure of the pipeline can't masquerade
 * as a clip failure.
 *
 *   node .perf/bgclip-probe.mjs
 */

const LAUNCH = {
  chromium: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'] },
  firefox: {},
  webkit: {},
}

const TEST = `(async () => {
  const render = async (body) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60">' +
      '<foreignObject width="300" height="60">' +
      '<div xmlns="http://www.w3.org/1999/xhtml">' + body + '</div>' +
      '</foreignObject></svg>'
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, 300, 60).data
    let inked = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 30) inked++
    }
    return inked
  }

  const text = 'font:600 28px sans-serif;'
  return {
    control: await render(
      '<span style="' + text + 'color:#fff;">Slop digest</span>'),
    clipUnprefixed: await render(
      '<span style="' + text + 'color:transparent;' +
      'background-image:linear-gradient(180deg,#fff 28%,#a8a8bd);' +
      'background-clip:text;">Slop digest</span>'),
    clipPrefixed: await render(
      '<span style="' + text + 'color:transparent;' +
      'background-image:linear-gradient(180deg,#fff 28%,#a8a8bd);' +
      '-webkit-background-clip:text;">Slop digest</span>'),
    clipBoth: await render(
      '<span style="' + text + 'color:transparent;' +
      'background-image:linear-gradient(180deg,#fff 28%,#a8a8bd);' +
      '-webkit-background-clip:text;background-clip:text;">Slop digest</span>'),
  }
})()`

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch(LAUNCH[name])
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage()
  await page.goto('about:blank')
  try {
    const result = await page.evaluate(TEST)
    console.log(`${name}: ${JSON.stringify(result)} (inked pixels)`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  await browser.close()
}
