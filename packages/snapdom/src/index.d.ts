/**
 * Types for the vendored source, which is JavaScript.
 *
 * Upstream ships `types/snapdom.d.ts` describing the built package rather than
 * the entry module, so this points the `@snapdom` alias at it: TypeScript
 * resolves this declaration for the import while bundlers resolve `index.js`
 * beside it. Not upstream's file, and the only file here that is ours.
 */

export * from '../types/snapdom'
