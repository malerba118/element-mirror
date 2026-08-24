import { chromium, firefox, webkit } from 'playwright'

/**
 * Whether a document-wide animation read sees what a per-subtree read sees.
 *
 * `hasLiveContent` asks which elements are animating so it can skip capturing a
 * still source. It used to ask each source's subtree and now asks the document
 * once (see animatedElements in mirror-capture.ts). If an engine answers those
 * two questions differently, a live source reads as still and its mirror falls
 * back to the once-a-second verification capture.
 *
 *   node .perf/animations-probe.mjs
 */

const page = `<!doctype html><html><head><style>
  @keyframes slide { from { left: 0 } to { left: 40px } }
  #animated { position: relative; width: 10px; height: 10px; background: red;
              animation: slide 2s linear infinite; }
  #transitioned { width: 10px; height: 10px; background: blue;
                  transition: opacity 4s linear; }
  #webanimated { width: 10px; height: 10px; background: green; }
</style></head><body>
  <div id="host">
    <div id="animated"></div>
    <div id="transitioned"></div>
    <div id="webanimated"></div>
  </div>
</body></html>`

const probe = async () => {
  const host = document.getElementById('host')

  // A Web Animations API animation, which is a different code path from CSS.
  document
    .getElementById('webanimated')
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 3000,
      iterations: Infinity,
    })

  // Start a transition, so there is a running CSSTransition to find.
  const transitioned = document.getElementById('transitioned')
  void transitioned.offsetWidth
  transitioned.style.opacity = '0.05'

  await new Promise((resolve) => requestAnimationFrame(resolve))
  await new Promise((resolve) => setTimeout(resolve, 200))

  const kinds = (list) =>
    list
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const effect = animation.effect
        const target = effect && effect.target
        return `${animation.constructor.name}->${target ? target.id || target.tagName : 'none'}`
      })
      .sort()

  const fromSubtree = host.getAnimations
    ? kinds(host.getAnimations({ subtree: true }))
    : null
  const fromDocument = kinds(document.getAnimations())

  // The substitution the implementation makes: document-wide, then containment.
  const reachedByContainment = kinds(
    document.getAnimations().filter((animation) => {
      const effect = animation.effect
      const target =
        effect instanceof KeyframeEffect ? effect.target : null
      return target && host.contains(target)
    })
  )

  return { fromSubtree, fromDocument, reachedByContainment }
}

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch()
  const tab = await browser.newPage()
  await tab.setContent(page)
  const result = await tab.evaluate(probe)
  const subtree = (result.fromSubtree ?? []).join(', ') || '(none)'
  const shared = result.reachedByContainment.join(', ') || '(none)'
  const same = subtree === shared
  console.log(`\n${name}`)
  console.log(`  per-source subtree read : ${subtree}`)
  console.log(`  document read + contains: ${shared}`)
  console.log(`  whole document          : ${result.fromDocument.join(', ') || '(none)'}`)
  console.log(`  ${same ? 'ok   same answer' : 'MISMATCH — the shared read loses work the subtree read found'}`)
  await browser.close()
}
