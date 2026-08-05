// Typed client for the studio backend. The UI's only path to the filesystem
// (constraint #9: UI imports no node:fs). All requests go over /api, which Vite
// proxies to the local Node service in dev.

import type { ProjectData } from "@df/storage";

export interface IntegrityIssue {
  from: string;
  field: string;
  ref: string;
  kind: "dangling-ref";
}

export interface LoadResult {
  data: ProjectData;
  errors: string[];
}

const json = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

export const api = {
  load: (dir: string) =>
    json("/api/load", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir }) }) as Promise<LoadResult>,
  save: (dir: string, project: ProjectData) =>
    json("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir, project }) }) as Promise<{ errors: string[] }>,
  integrity: (project: ProjectData) =>
    json("/api/integrity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) }) as Promise<{ issues: IntegrityIssue[] }>,
};
