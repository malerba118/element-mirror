import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The Next app lives in apps/demo and uses the app router; the rule's
      // default probe for a pages/ directory runs from the monorepo root.
      "@next/next/no-html-link-for-pages": ["error", "apps/demo/src/app"],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/dist/**",
    // Forked upstream source, kept diffable against it rather than lint-clean here.
    "packages/snapdom/**",
  ]),
]);

export default eslintConfig;
