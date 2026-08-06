// Generate-profile panel (M3).
//
// Q-A1: uses ONLY the mock provider (no key, no network). The user enters a
// brief, clicks Generate, the backend returns a schema-valid DRAFT, and the
// draft is shown for review. Accept adds it to the project as a new character
// (and marks the project dirty so Save persists it); reject discards. Nothing
// is persisted until Save.

import type { CharacterProfile as CharacterProfileType } from "@df/schemas";
import { useState } from "react";

interface Draft {
  profile: CharacterProfileType;
  canonProposals: unknown[];
}

interface Props {
  /** Called when the user accepts the draft; the caller adds it to the project. */
  onAccept: (profile: CharacterProfileType) => void;
}

export function GeneratePanel({ onAccept }: Props) {
  const [brief, setBrief] = useState("");
  const [idSlug, setIdSlug] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!brief.trim()) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/generate-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief, idSlug: idSlug || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `generate failed (${res.status})`);
      setDraft(body.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function accept() {
    if (!draft) return;
    onAccept(draft.profile);
    setDraft(null);
    setBrief("");
    setIdSlug("");
  }

  return (
    <div className="generate-panel">
      <h2>Generate character profile</h2>
      <p className="muted">
        Enter a brief; the configured provider writes a full profile. With the mock
        (default) this is instant and canned; with the Claude provider it is a real
        model call and can take a few minutes. Output is schema-valid; nothing is
        saved until you Accept and then Save.
      </p>
      <label>
        Brief
        <textarea
          rows={2}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. ancient stone boss guarding a quarry; proud, judicial"
        />
      </label>
      <label>
        ID slug (optional)
        <input value={idSlug} onChange={(e) => setIdSlug(e.target.value)} placeholder="hornblende_golem" spellCheck={false} />
      </label>
      <button onClick={() => void generate()} disabled={loading || !brief.trim()}>
        {loading ? "Generating…" : "Generate"}
      </button>
      {error && <div className="err">error: {error}</div>}

      {draft && (
        <div className="draft">
          <h3>Draft: {draft.profile.identity.name}</h3>
          <p className="muted">id: {draft.profile.id} · role: {draft.profile.identity.gameplayRole}</p>
          <p><strong>Core desire:</strong> {draft.profile.core.primaryDesire.value}</p>
          <p><strong>Voice:</strong> {draft.profile.voice.formality}, {draft.profile.voice.metaphorDomain?.source}</p>
          <p><strong>Sample line:</strong> <em>{draft.profile.voice.sampleLines[0]?.value}</em></p>
          <div className="draft-actions">
            <button className="save" onClick={accept}>Accept (add to project)</button>
            <button className="rm" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
