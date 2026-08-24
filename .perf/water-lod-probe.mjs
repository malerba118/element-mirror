import { chromium, firefox, webkit } from 'playwright'

/**
 * Asks the glass-floor page's own water context whether its card texture
 * blurs with lod. A throwaway program samples the texture bound on unit 1
 * (the newest frame) at lods 0/1.5/3 and reports edge contrast along a row
 * through the card's text: if higher lods do not lower the contrast, the
 * page's mipmaps are not really there, no matter what isolated tests say.
 *
 *   node .perf/water-lod-probe.mjs
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/glass-floor'

const LAUNCH = {
  chromium: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'] },
  firefox: {},
  webkit: {},
}

const TEST = `(() => {
  const water = document.querySelector('canvas[data-reflection]')
  if (!water) return 'no water canvas'
  const gl = water.getContext('webgl2')
  if (!gl) return 'no gl'

  const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM)
  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, '#version 300 es\\nlayout(location=0) in vec2 p; out vec2 v; void main(){ v=p*0.5+0.5; gl_Position=vec4(p,0.,1.); }')
  gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fs, '#version 300 es\\nprecision highp float; uniform sampler2D t; uniform float lod; in vec2 v; out vec4 o; void main(){ o = vec4(textureLod(t, vec2(v.x, 1.0 - v.y), lod).rgb, 1.0); }')
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    return 'probe fs failed: ' + gl.getShaderInfoLog(fs)
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.uniform1i(gl.getUniformLocation(prog, 't'), 1)

  const w = gl.drawingBufferWidth
  const h = gl.drawingBufferHeight
  const contrastAt = (lod) => {
    gl.uniform1f(gl.getUniformLocation(prog, 'lod'), lod)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // A row through the upper third, where the card's heading text lives.
    const row = new Uint8Array(w * 4)
    gl.readPixels(0, Math.floor(h * 0.7), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row)
    let contrast = 0
    let bright = 0
    for (let x = 1; x < w; x++) {
      contrast += Math.abs(row[x * 4] - row[(x - 1) * 4])
      bright = Math.max(bright, row[x * 4])
    }
    return { contrast, bright }
  }

  const result = {
    lod0: contrastAt(0),
    lod15: contrastAt(1.5),
    lod3: contrastAt(3),
    filter: (() => {
      // What min filter does the texture on unit 1 actually carry?
      return gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER)
    })(),
    linearMipmapLinear: gl.LINEAR_MIPMAP_LINEAR,
    error: gl.getError(),
  }
  gl.useProgram(previousProgram)
  gl.deleteProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return result
})()`

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch(LAUNCH[name])
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  })
  try {
    await page.goto(PAGE, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(3000)
    const result = await page.evaluate(TEST)
    console.log(`${name}: ${JSON.stringify(result)}`)
  } catch (error) {
    console.log(`${name}: failed — ${String(error.message).split('\n')[0]}`)
  }
  await browser.close()
}
