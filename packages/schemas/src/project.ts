/**
 * Project — the container for one game's or module's authoring work.
 *
 * The root of the on-disk tree (REPO_LAYOUT §4). Holds global version pins and
 * the locks index, and points at the artifact folders. It is NOT an aggregation
 * of all data — those live in their own files and are resolved by id.
 */

import { z } from "zod";
import { LocalizedText, Ref, StableId, Versioned } from "./common.js";

export const ProjectLocks = z.object({
  /** Locked profile fields: characterId -> field path -> lock. */
  characterProfileFields: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  /** Locked dialogue line ids, keyed by artifact id. */
  dialogueLines: z.record(z.string(), z.array(z.string())).default({}),
  /** Locked canon fact ids. */
  canonFacts: z.array(Ref).default([]),
  /** Locked quest facts (questId -> fact refs). */
  questFacts: z.record(z.string(), z.array(Ref)).default({}),
});

export const Project = Versioned.extend({
  /** e.g. project_quarry_module */
  id: StableId,
  name: z.string().min(1).max(120),
  summary: LocalizedText,
  /** Global schema + prompt-template version pins (overridable per artifact). */
  schemaVersion: z.string().min(1).max(40),
  promptTemplateVersion: z.string().min(1).max(40),
  /** Default provider/model for generation. */
  defaultProvider: z.string().min(1).max(64).default("glm"),
  defaultModel: z.string().min(1).max(64).default("glm-5.2"),
  defaultReasoningEffort: z.enum(["normal", "high", "max"]).default("normal"),
  /** Centralized lock registry. Per-field/per-line locks also live on the artifacts themselves. */
  locks: ProjectLocks.default({}),
  /** Stable localization key namespace prefix for exports. */
  locKeyPrefix: z.string().min(1).max(64).default("df"),
});

export type Project = z.infer<typeof Project>;
export type ProjectLocks = z.infer<typeof ProjectLocks>;
