/* eslint-env node */
/**
 * ESLint config for the Dialogue Foundry monorepo.
 *
 * Enforces the import boundaries in docs/REPO_LAYOUT.md §3 and contract
 * constraint #9 ("provider-independent, GLM first"):
 *
 *   - @df/schemas           imports nothing of ours; only `zod`.
 *   - logic packages         may import only their declared @df/* deps; NEVER
 *                            node:fs / node:net / a vendor model client.
 *   - @df/storage            the ONLY package that may import node:fs.
 *   - @df/providers          the ONLY package that may import node:net / a
 *                            vendor model client (fetch, openai, @anthropic, etc).
 *
 * The per-package `files` overrides below make these rules real rather than
 * aspirational. CI runs `pnpm lint` (acceptance C5).
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
  ],
  settings: {
    "import/resolver": { typescript: { alwaysTryTypes: true } },
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.cjs"],
  rules: {
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
  },
  overrides: [
    // @df/schemas — the foundation. Imports NOTHING of ours.
    {
      files: ["packages/schemas/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["@df/*"], message: "@df/schemas must not depend on any other @df package." },
            ],
          },
        ],
      },
    },
    // Pure logic packages — no I/O, no network, no vendor clients.
    {
      files: [
        "packages/core/src/**/*.ts",
        "packages/context-compiler/src/**/*.ts",
        "packages/generation/src/**/*.ts",
        "packages/validators/src/**/*.ts",
        "packages/exporters/src/**/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "node:fs", message: "Logic packages are I/O-free. File access lives in @df/storage." },
              { name: "node:fs/promises", message: "Logic packages are I/O-free. File access lives in @df/storage." },
              { name: "fs", message: "Logic packages are I/O-free. File access lives in @df/storage." },
              { name: "node:net", message: "Logic packages are network-free. Network lives in @df/providers." },
              { name: "node:http", message: "Logic packages are network-free. Network lives in @df/providers." },
              { name: "node:https", message: "Logic packages are network-free. Network lives in @df/providers." },
              { name: "openai", message: "Vendor clients live only in @df/providers (constraint #9)." },
              { name: "@anthropic-ai/sdk", message: "Vendor clients live only in @df/providers (constraint #9)." },
            ],
            patterns: [
              { group: ["@anthropic-ai/*", "openai-*"], message: "Vendor clients live only in @df/providers (constraint #9)." },
            ],
          },
        ],
      },
    },
    // @df/storage — the ONLY place node:fs is allowed. Still no network.
    {
      files: ["packages/storage/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "node:net", message: "@df/storage is for filesystem only; network lives in @df/providers." },
              { name: "node:http", message: "@df/storage is for filesystem only; network lives in @df/providers." },
              { name: "node:https", message: "@df/storage is for filesystem only; network lives in @df/providers." },
              { name: "openai", message: "Vendor clients live only in @df/providers (constraint #9)." },
            ],
          },
        ],
      },
    },
    // @df/providers — the ONLY place vendor clients / network may live.
    // No restriction here on purpose: this is the seam by design.
    // Tests are allowed to use node:fs for fixtures etc.
    {
      files: ["**/test/**/*.ts", "**/scripts/**/*.ts"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
    // Plain JS scripts (JSON-schema emit, sample validator) run in Node.
    {
      files: ["**/scripts/**/*.js"],
      env: { node: true },
      rules: { "no-console": "off" },
    },
    // apps/studio — the application layer.
    // UI (React) runs in the browser: allow DOM globals; JSX allowed above.
    {
      files: ["apps/studio/ui/**/*.ts", "apps/studio/ui/**/*.tsx"],
      env: { browser: true },
    },
    // Backend service: a Node process. May use node:http/node:console; reaches
    // the filesystem only through @df/storage (which it imports).
    {
      files: ["apps/studio/main/**/*.js"],
      env: { node: true },
      rules: { "no-console": "off" },
    },
  ],
};
