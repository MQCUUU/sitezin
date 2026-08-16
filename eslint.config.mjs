import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn"
    }
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts"
  ])
]);