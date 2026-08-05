/**
 * Stable ID helpers.
 *
 * IDs are `<kind>_<snake_slug>` with one optional `__subsegment` (see
 * @df/schemas `StableId`). They are immutable once referenced. These helpers
 * construct and validate them so call sites never hand-assemble strings.
 */

import { StableId, StableIdRegex } from "@df/schemas";

export type StableId = string & { readonly __brand: "StableId" };

export const STABLE_ID_KINDS = [
  "project",
  "fact",
  "fac",
  "char",
  "state",
  "rel",
  "quest",
  "scene",
  "beat",
  "dlg",
  "review",
  "prop",
  "ctx",
] as const;
export type StableIdKind = (typeof STABLE_ID_KINDS)[number];

const slugRe = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Build a stable id, e.g. `makeId("char", "hornblende_golem")`. */
export function makeId(kind: StableIdKind, slug: string, subsegment?: string): StableId {
  if (!slugRe.test(slug)) {
    throw new Error(`invalid slug "${slug}": must be snake_case of [a-z0-9_]`);
  }
  let raw = `${kind}_${slug}`;
  if (subsegment !== undefined) {
    if (!slugRe.test(subsegment)) {
      throw new Error(`invalid subsegment "${subsegment}": must be snake_case of [a-z0-9_]`);
    }
    raw += `__${subsegment}`;
  }
  return validateId(raw);
}

/** Parse a stable id into its kind, slug, and optional subsegment. */
export function partsOf(id: string): { kind: string; slug: string; subsegment?: string } {
  if (!StableIdRegex.test(id)) throw new Error(`invalid stable id "${id}"`);
  const sepIdx = id.indexOf("__");
  const main = sepIdx === -1 ? id : id.slice(0, sepIdx);
  const subsegment = sepIdx === -1 ? undefined : id.slice(sepIdx + 2);
  const underscore = main.indexOf("_");
  return {
    kind: main.slice(0, underscore),
    slug: main.slice(underscore + 1),
    subsegment,
  };
}

/** Validate and brand an id parsed from external (file/user) input. */
export function validateId(id: string): StableId {
  const parsed = StableId.safeParse(id);
  if (!parsed.success) {
    throw new Error(`invalid stable id "${id}": ${parsed.error.issues[0]?.message ?? "parse failed"}`);
  }
  return id as StableId;
}

export function isValidId(id: string): id is StableId {
  return StableId.safeParse(id).success;
}
