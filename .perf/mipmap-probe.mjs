import { chromium, firefox, webkit } from 'playwright'

/**
 * Does textureLod actually read mipmap levels in each engine? A checkerboard
 * sampled at lod 4 must come back grey; an engine that ignores the lod (or
 * fails to build mipmaps) returns pure black or white. Tested at a
 * power-of-two size and at the water's own odd size, with and without the
 * premultiply unpack flag, since any of those could be the one that breaks.
 *
 *   node .perf/mipmap-probe.mjs
 */

const LAUNCH = {
  chromium: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'] },
  firefox: {},
  webkit: {},
}

const TEST = `(() => {
  const results = {}
  for (const [label, width, height, premultiply] of [
    ['pot', 256, 256, true],
    ['npot', 1008, 652, true],
    ['npot-no-premult', 1008, 652, false],
  ]) {
    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const c2d = source.getContext('2d')
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        c2d.fillStyle = ((x + y) / 8) % 2 ? '#000' : '#fff'
        c2d.fillRect(x, y, 8, 8)
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const gl = canvas.getContext('webgl2')
    if (!gl) { results[label] = 'no webgl2'; continue }

    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, '#version 300 es\\nlayout(location=0) in vec2 p; out vec2 v; void main(){ v=p*0.5+0.5; gl_Position=vec4(p,0.,1.); }')
    gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, '#version 300 es\\nprecision highp float; uniform sampler2D t; uniform float lod; in vec2 v; out vec4 o; void main(){ o = textureLod(t, v, lod); }')
    gl.compileShader(fs)
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    const glError = gl.getError()

    const sample = (lod) => {
      gl.uniform1f(gl.getUniformLocation(prog, 'lod'), lod)
      gl.viewport(0, 0, 64, 64)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const px = new Uint8Array(4)
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      return px[0]
    }
    results[label] = { glError, lod0: sample(0), lod2: sample(2), lod4: sample(4) }
  }
  return results
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
  const result = await page.evaluate(TEST)
  console.log(`${name}: ${JSON.stringify(result)}`)
  await browser.close()
}
