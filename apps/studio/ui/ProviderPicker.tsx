// Provider picker — switch the generation engine at runtime.
//
// Talks to POST /api/provider. The backend's boot flags only set the default;
// this control changes what every subsequent generate/review/repair call uses
// (including the batch queue). Switching costs nothing until you generate.

import { useEffect, useState } from "react";

interface Current {
  provider: string;
  model?: string;
}

export function ProviderPicker() {
  const [current, setCurrent] = useState<Current | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<"mock" | "claude">("mock");
  const [command, setCommand] = useState("claude");
  const [model, setModel] = useState("claude-opus-5");
  const [err, setErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    void fetch("/api/health")
      .then(async (r) => {
        const h = await r.json();
        setCurrent({ provider: h.provider, model: h.model });
        setName(h.provider === "mock" ? "mock" : "claude");
        if (h.model) setModel(h.model);
      })
      .catch(() => undefined);
  }, []);

  async function apply() {
    setApplying(true);
    setErr(null);
    try {
      const res = await fetch("/api/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(name === "mock" ? { name } : { name, command, model }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `switch failed (${res.status})`);
      setCurrent({ provider: body.provider, model: body.model });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  const label = current ? (current.model ? `${current.provider} · ${current.model}` : current.provider) : "…";

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Generation engine — click to switch">
        engine: {label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            zIndex: 40,
            width: 320,
            background: "#141824",
            border: "1px solid #2a2f3e",
            borderRadius: 6,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" checked={name === "mock"} onChange={() => setName("mock")} />
            Mock — free, instant, canned (for testing the flow)
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" checked={name === "claude"} onChange={() => setName("claude")} />
            CLI model (claude or compatible)
          </label>
          {name === "claude" && (
            <>
              <label>
                Command
                <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="claude | kimi | …" spellCheck={false} />
              </label>
              <label>
                Model
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-opus-5 | kimi-k3 | …" spellCheck={false} />
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setCommand("claude");
                    setModel("claude-opus-5");
                  }}
                >
                  Opus 5
                </button>
                <button
                  onClick={() => {
                    setCommand("kimi");
                    setModel("kimi-k3");
                  }}
                >
                  Kimi K3
                </button>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Any CLI that accepts <code>-p --output-format json --model</code> with the prompt on stdin works.
              </p>
            </>
          )}
          {err && <div className="err">{err}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button className="save" onClick={() => void apply()} disabled={applying}>
              {applying ? "Switching…" : "Apply"}
            </button>
            <button onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
