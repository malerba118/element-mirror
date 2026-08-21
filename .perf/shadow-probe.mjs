import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

/** Which reads see an animation running inside a shadow tree. */

function findChrome() {
  if (process.env.MIRROR_CHROME) return process.env.MIRROR_CHROME
  const roots = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/puppeteer/chrome'),
  ]
  const leaves = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  ]
  for (const root of roots) {
    let entries = []
    try {
      entries = fs.readdirSync(root).sort().reverse()
    } catch {
      continue
    }
    for (const entry of entries) {
      for (const leaf of leaves) {
        const full = path.join(root, entry, leaf)
        if (fs.existsSync(full)) return full
      }
    }
  }
  return undefined
}

const browser = await chromium.launch({ executablePath: findChrome() })
const page = await browser.newPage()
await page.setContent('<!doctype html><body><div id="host"></div></body>')

const result = await page.evaluate(async () => {
  const host = document.getElementById('host')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML =
    '<style>@keyframes s { from { opacity: 1 } to { opacity: 0 } }' +
    'i { display: block; width: 8px; height: 8px; background: red;' +
    ' animation: s 800ms linear infinite }</style><i></i>'
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await new Promise((resolve) => setTimeout(resolve, 100))

  const inner = root.querySelector('i')
  const describe = (list) =>
    list.map((a) => `${a.constructor.name}:${a.playState}`)

  const reaches = (element, node) => {
    if (element.contains(node)) return true
    let step = node
    while (step) {
      if (step === element) return true
      step = step.parentNode ?? step.host ?? null
    }
    return false
  }

  const fromDocument = document.getAnimations()
  const targets = fromDocument
    .map((a) => a.effect && a.effect.target)
    .filter(Boolean)

  return {
    onTheElementItself: describe(inner.getAnimations()),
    fromTheHostSubtree: describe(host.getAnimations({ subtree: true })),
    fromTheDocument: describe(fromDocument),
    hostContainsInner: host.contains(inner),
    hostReachesInner: reaches(host, inner),
    documentTargetsReachedFromHost: targets.map((t) => reaches(host, t)),
    shadowRootHasGetAnimations: typeof root.getAnimations === 'function',
    fromTheShadowRoot:
      typeof root.getAnimations === 'function'
        ? describe(root.getAnimations())
        : null,
  }
})

console.log(JSON.stringify(result, null, 2))
await browser.close()
