import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Native <select> renders OS/browser dropdown UI (hard to style).
      // Enforce FancySelect to keep consistent UI.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "ネイティブの<select>は禁止です。統一UIのため @/components/fancy-select の FancySelect を使ってください。",
        },
      ],
    },
  },
]);

export default eslintConfig;
