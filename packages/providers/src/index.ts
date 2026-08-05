/**
 * @df/providers — barrel.
 *
 * The AI seam. Per Q-A1, ships ONLY the interface + MockProvider: the app
 * never makes a real LLM call, reads no API key, opens no network socket. A
 * future GLM/Claude/local implementation can satisfy the same interface for
 * anyone who opts in.
 */
export * from "./provider.js";
export * from "./mock-provider.js";
