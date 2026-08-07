import zlib from 'node:zlib'

/**
 * Just enough PNG to read one back: the screenshots these scripts take are all
 * written by the same encoder, so only the filters it actually emits matter.
 */
export function decodePng(buffer) {
  let offset = 8
  const idat = []
  let width = 0
  let height = 0
  let colorType = 0

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
    offset += 12 + length
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)

  let position = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[position++]
    const line = raw.subarray(position, position + stride)
    position += stride
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0
      const up = prior ? prior[x] : 0
      const upLeft = prior && x >= channels ? prior[x - channels] : 0
      let value = line[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      out[x] = value & 0xff
    }
  }

  return { width, height, channels, pixels }
}

/**
 * How far apart two images are, over the area they share. `differingPercent`
 * is the one to read: the share of pixels off by more than a shade, which
 * antialiasing alone will not reach.
 */
export function compare(a, b, threshold = 32) {
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  let total = 0
  let worst = 0
  let differing = 0
  let samples = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ai = (y * a.width + x) * a.channels
      const bi = (y * b.width + x) * b.channels
      const delta = Math.max(
        Math.abs(a.pixels[ai] - b.pixels[bi]),
        Math.abs(a.pixels[ai + 1] - b.pixels[bi + 1]),
        Math.abs(a.pixels[ai + 2] - b.pixels[bi + 2])
      )
      total += delta
      samples += 1
      if (delta > worst) worst = delta
      if (delta > threshold) differing += 1
    }
  }

  return {
    mean: total / Math.max(1, samples),
    worst,
    differingPercent: (differing / Math.max(1, samples)) * 100,
    sizeDelta: [b.width - a.width, b.height - a.height],
  }
}
