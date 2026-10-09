"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Section } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
  tagline: string;
  skills: readonly string[];
};

type Event = { id: string; agent: string; action: string; detail: string; createdAt: string };

type Llm = { available: boolean; provider: string; model: string };

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [llm, setLlm] = useState<Llm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/agents").then((r) => r.json());
    setAgents(d.agents || []);
    setEvents(d.events || []);
    setLlm(d.llm);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runBrief() {
    setBusy(true);
    try {
      await fetch("/api/brief", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Agent Hub"
        subtitle="The crew behind Cortexa. Every agent run is logged to the event bus so you can audit exactly what your AI did and why."
        actions={
          <button className="btn btn-primary" onClick={runBrief} disabled={busy}>
            {busy ? "Coordinating…" : "✦ Run daily brief"}
          </button>
        }
      />

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="label mb-1">Reasoning engine</div>
            <div className="font-semibold">
              {llm?.available ? `LLM connected · ${llm.provider}` : "Deterministic engine (offline mode)"}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {llm?.available
                ? `Model: ${llm.model} — agents think with LLM reasoning and fall back to heuristics on any failure.`
                : "Agents run on built-in expert-system logic. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env to upgrade to LLM reasoning — no code changes."}
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${llm?.available ? "bg-good animate-pulse-soft" : "bg-warn"}`} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                style={{ background: `${a.color}22`, border: `1px solid ${a.color}55` }}
              >
                {a.emoji}
              </div>
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs" style={{ color: a.color }}>
                  {a.role}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted mt-3">{a.tagline}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {a.skills.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Section
        title="Event bus"
        right={
          <button className="btn btn-ghost text-xs" onClick={load}>
            Refresh
          </button>
        }
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted">No agent runs yet. Generate a plan in the Planner or run the daily brief.</p>
        ) : (
          <div className="space-y-2 font-mono text-xs">
            {events.map((e) => (
              <div key={e.id} className="flex gap-3 items-baseline rounded-lg px-3 py-2" style={{ background: "var(--raised)" }}>
                <span className="text-muted shrink-0">{new Date(e.createdAt).toLocaleTimeString()}</span>
                <span className="font-semibold shrink-0" style={{ color: agents.find((a) => a.id === e.agent)?.color || "var(--accent)" }}>
                  [{e.agent}]
                </span>
                <span>{e.action}</span>
                <span className="text-muted truncate">— {e.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
