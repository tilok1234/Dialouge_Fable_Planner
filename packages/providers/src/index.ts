/**
 * @df/providers — barrel.
 *
 * The AI seam. Two implementations:
 *  - MockProvider (default): deterministic, offline, zero-key. What tests and
 *    CI use; nothing here ever touches a network in the test suite.
 *  - ClaudeCliProvider (opt-in via DF_PROVIDER=claude): shells out to the
 *    Claude Code CLI on the user's own subscription login. No API key. Pinned
 *    to claude-opus-5 by default.
 */
export * from "./provider.js";
export * from "./mock-provider.js";
export * from "./cli-provider.js";
