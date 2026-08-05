/**
 * @df/storage — barrel.
 *
 * The filesystem I/O layer. Reads/writes the on-disk project tree and checks
 * referential integrity across artifacts. The ONLY package that imports
 * node:fs (enforced by the ESLint boundary rule).
 */
export * from "./tree.js";
export * from "./integrity.js";
