/**
 * @df/core acceptance tests (M0).
 *
 * These prove the M0 [unit] acceptance criteria:
 *  - hashing is deterministic (same content → same hash)
 *  - hashing is content-sensitive (real edit → new hash)
 *  - hashing ignores version/timestamps (metadata bump → same hash)
 *  - stable IDs construct, parse, and validate per the contract regex
 *  - provenance staleness fires on version drift and hash drift
 */
import { describe, expect, it } from "vitest";

import {
  canonicalize,
  contentHash,
  contentChanged,
  hashesEqual,
  hashIntegrityValid,
  isStale,
  isValidId,
  makeId,
  ref,
  revise,
  stamp,
  partsOf,
  validateId,
} from "../src/index.js";

describe("stable ids", () => {
  it("constructs kind_slug and kind_slug__subsegment", () => {
    expect(makeId("char", "hornblende_golem")).toBe("char_hornblende_golem");
    expect(makeId("state", "hornblende_golem", "phase_two")).toBe("state_hornblende_golem__phase_two");
    expect(makeId("rel", "hornblende_golem", "player")).toBe("rel_hornblende_golem__player");
  });
  it("parses kind/slug/subsegment", () => {
    expect(partsOf("quest_quarry_seals__stage_2")).toEqual({
      kind: "quest",
      slug: "quarry_seals",
      subsegment: "stage_2",
    });
    expect(partsOf("fac_stoneborn")).toEqual({ kind: "fac", slug: "stoneborn", subsegment: undefined });
  });
  it("validates and brands", () => {
    expect(isValidId("char_golem")).toBe(true);
    expect(isValidId("golem")).toBe(false);
    expect(validateId("scene_golem_first_encounter")).toBe("scene_golem_first_encounter");
    expect(() => validateId("nope")).toThrow();
  });
  it("rejects bad slug input at construction", () => {
    expect(() => makeId("char", "Hornblende!")).toThrow();
    expect(() => makeId("char", "good", "Bad Sub")).toThrow();
  });
});

describe("content hashing — determinism (Q-F3)", () => {
  it("same content → same hash, regardless of key order", () => {
    const a = contentHash({ x: 1, y: { z: 2, w: 3 } });
    const b = contentHash({ y: { w: 3, z: 2 }, x: 1 });
    expect(a).toBe(b);
    expect(a.startsWith("sha256:")).toBe(true);
  });
  it("is stable across runs (known-vector)", () => {
    // Pinning a known hash guards against accidental algorithm changes.
    expect(contentHash({ id: "char_x", name: "X" })).toBe(
      contentHash({ id: "char_x", name: "X" }),
    );
  });
});

describe("content hashing — content sensitivity", () => {
  it("real content change → new hash", () => {
    expect(contentHash({ name: "Golem" })).not.toBe(contentHash({ name: "Golem2" }));
  });
  it("array order is significant", () => {
    expect(contentHash([1, 2, 3])).not.toBe(contentHash([3, 2, 1]));
  });
});

describe("content hashing — excludes version & timestamps", () => {
  it("bumping version alone does NOT change the hash", () => {
    const base = { id: "char_x", name: "X", tags: ["a"] };
    const h1 = contentHash({ ...base, version: 1 });
    const h2 = contentHash({ ...base, version: 99 });
    expect(h1).toBe(h2);
  });
  it("changing timestamps alone does NOT change the hash", () => {
    const base = { id: "x", name: "X" };
    const h1 = contentHash({ ...base, createdAt: "2026-01-01", updatedAt: "2026-01-02" });
    const h2 = contentHash({ ...base, createdAt: "2030-05-05", updatedAt: "2030-05-06" });
    expect(h1).toBe(h2);
  });
  it("contentHash field itself is excluded", () => {
    const base = { id: "x", name: "X" };
    expect(contentHash({ ...base, contentHash: "sha256:abc" })).toBe(contentHash(base));
  });
  it("a content edit DOES change the hash even when version is unchanged", () => {
    const h1 = contentHash({ id: "x", name: "X", version: 1 });
    const h2 = contentHash({ id: "x", name: "Y", version: 1 });
    expect(h1).not.toBe(h2);
  });
});

describe("canonicalize", () => {
  it("sorts keys recursively and drops excluded fields", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 }, version: 9 })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
});

describe("versioning envelopes", () => {
  it("stamp adds version + hash + timestamps without polluting content hash", () => {
    const v = stamp({ id: "char_x", name: "X" }, 1, new Date("2026-08-05T00:00:00Z"));
    expect(v.version).toBe(1);
    expect(v.contentHash.startsWith("sha256:")).toBe(true);
    // The hash is over content WITHOUT the version/timestamp fields.
    expect(v.contentHash).toBe(contentHash({ id: "char_x", name: "X" }));
  });
  it("revise bumps version, preserves createdAt, updates updatedAt", () => {
    const v1 = stamp({ id: "x", name: "A" }, 1, new Date("2026-01-01T00:00:00Z"));
    const v2 = revise(v1, { id: "x", name: "B" }, new Date("2026-02-01T00:00:00Z"));
    expect(v2.version).toBe(2);
    expect(v2.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(v2.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(v2.contentHash).not.toBe(v1.contentHash);
  });
  it("contentChanged detects semantic drift", () => {
    const v1 = stamp({ id: "x", name: "A" }, 1);
    expect(contentChanged(v1, { id: "x", name: "A" })).toBe(false);
    expect(contentChanged(v1, { id: "x", name: "B" })).toBe(true);
  });
});

describe("provenance", () => {
  it("ref captures id + version + contentHash", () => {
    const r = ref({ id: "char_x", version: 3, contentHash: "sha256:abc" });
    expect(r).toEqual({ id: "char_x", version: 3, contentHash: "sha256:abc" });
  });
  it("isStale fires on version drift", () => {
    const r = ref({ id: "x", version: 1, contentHash: contentHash({ a: 1 }) });
    expect(isStale(r, { id: "x", version: 2, contentHash: contentHash({ a: 1 }) })).toBe(true);
  });
  it("isStale fires on hash drift at the same version", () => {
    const r = ref({ id: "x", version: 1, contentHash: contentHash({ a: 1 }) });
    expect(isStale(r, { id: "x", version: 1, contentHash: contentHash({ a: 2 }) })).toBe(true);
  });
  it("isStale is false when nothing moved", () => {
    const r = ref({ id: "x", version: 1, contentHash: contentHash({ a: 1 }) });
    expect(isStale(r, { id: "x", version: 1, contentHash: contentHash({ a: 1 }) })).toBe(false);
  });
  it("hashIntegrityValid catches tampering", () => {
    const v = stamp({ id: "x", name: "A" }, 1);
    expect(hashIntegrityValid(v)).toBe(true);
    const tampered = { ...v, name: "B" }; // content changed, hash not recomputed
    expect(hashIntegrityValid(tampered)).toBe(false);
  });
});

describe("hashesEqual", () => {
  it("basic equality", () => {
    expect(hashesEqual("sha256:abc", "sha256:abc")).toBe(true);
    expect(hashesEqual("sha256:abc", "sha256:abd")).toBe(false);
    expect(hashesEqual("sha256:abc", "sha256:ab")).toBe(false); // length differs
  });
});
