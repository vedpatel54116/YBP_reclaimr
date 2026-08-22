// @ts-check
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// Needed so `next/core-web-vitals` (an eslintrc-style config) can resolve its
// plugins under pnpm's strict node_modules layout.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "legacy/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Next.js rules apply only to the web app. FlatCompat returns an array of
  // config objects, so spread them into the top-level array and scope each
  // entry to the web app's files.
  ...compat
    .extends("next/core-web-vitals")
    .map((config) => ({ ...config, files: ["apps/web/**/*.{js,jsx,mjs,ts,tsx}"] })),
  {
    files: ["apps/web/**/*.{js,jsx,mjs,ts,tsx}"],
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  prettier,
);
