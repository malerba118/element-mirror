import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Serves the sample frame after an artificial delay, for `.perf/settle.mjs`. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const ms = Math.min(10000, Number(url.searchParams.get('ms') ?? 1500))
  await new Promise((resolve) => setTimeout(resolve, ms))
  const file = await readFile(
    path.join(process.cwd(), 'public', 'sample-frame.jpg')
  )
  return new Response(new Uint8Array(file), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=60',
    },
  })
}
