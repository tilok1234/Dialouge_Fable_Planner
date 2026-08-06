/**
 * Shared issue shape for all M5 validators.
 *
 * Each finding identifies the artifact, the field, the offending value, and a
 * human-readable reason. Validators REPORT — they never silently coerce or
 * rewrite (the same discipline as the M6 reviewer will use).
 */

export type ValidatorSeverity = "blocker" | "major" | "minor" | "info";

export interface ValidationIssue {
  /** The artifact id where the problem lives. */
  from: string;
  /** Where in that artifact (field path). */
  field: string;
  /** The offending value, if applicable. */
  value?: string;
  severity: ValidatorSeverity;
  reason: string;
}

/** A typed validator result: issues list + a clean flag. */
export interface ValidationResult {
  issues: ValidationIssue[];
  /** True iff no blocker/major issues. */
  clean: boolean;
}

export function result(issues: ValidationIssue[]): ValidationResult {
  const clean = !issues.some((i) => i.severity === "blocker" || i.severity === "major");
  return { issues, clean };
}
