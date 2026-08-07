import fs from 'node:fs'
import path from 'node:path'

/** A relative import or dynamic import specifier, captured without its quotes. */
const RELATIVE_SPECIFIER = /(from\s*|import\s*\(\s*)'(\.[^']*)'/g

/**
 * Gives extensionless relative imports the extension a browser needs.
 *
 * Source written for a bundler imports `'../utils'` and expects something to
 * work out that it means `'../utils/index.js'`. Rewriting the specifier is what
 * a bundler would do; answering with a redirect instead would leave the module
 * resolving its own imports against a url it was not served from.
 */
function withExtensions(source, directory) {
  return source.replace(RELATIVE_SPECIFIER, (whole, lead, specifier) => {
    if (/\.[a-z0-9]+$/i.test(specifier)) return whole
    const resolved = path.resolve(directory, specifier)
    if (fs.existsSync(`${resolved}.js`)) return `${lead}'${specifier}.js'`
    if (fs.existsSync(path.join(resolved, 'index.js'))) {
      return `${lead}'${specifier}/index.js'`
    }
    return whole
  })
}

/**
 * Serves ES modules to a page from disk.
 *
 * The vendored renderers are loaded as source rather than as a bundle, so there
 * is nothing to build before measuring and a profile names real functions.
 *
 * @param {import('playwright').Page} page
 * @param {string} prefix url prefix to answer, e.g. `/__snapdom/`
 * @param {string | ((name: string) => string | undefined)} target
 *   one directory to resolve the whole path in, or a function taking the first
 *   path segment and returning the directory to resolve the rest in
 */
export async function serveModules(page, prefix, target) {
  await page.route(`**${prefix}**`, (route) => {
    const asked = new URL(route.request().url()).pathname.split(prefix)[1] ?? ''
    const [first, ...rest] = asked.split('/')
    const single = typeof target === 'string'
    const directory = single ? target : target(first)
    const file = single ? asked : rest.join('/')

    if (!directory) return route.abort()

    const full = path.join(directory, file)
    let source
    try {
      source = fs.readFileSync(full, 'utf8')
    } catch {
      return route.abort()
    }

    return route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: withExtensions(source, path.dirname(full)),
    })
  })
}
