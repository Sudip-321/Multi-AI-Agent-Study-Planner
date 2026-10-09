"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Section, EmptyState, ProgressBar } from "@/components/ui";

type Subject = {
  id: string;
  name: string;
  color: string;
  difficulty: number;
  examDate: string | null;
  _count: { tasks: number; flashcards: number; decks: number };
  plans: { id: string; title: string; summary: string; strategy: string }[];
};

const COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function PlannerPage() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState(3);
  const [weeks, setWeeks] = useState(6);
  const [hoursPerWeek, setHoursPerWeek] = useState(10);
  const [level, setLevel] = useState("intermediate");
  const [examDate, setExamDate] = useState("");
  const [weaknesses, setWeaknesses] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/subjects").then((r) => r.json());
    setSubjects(d.subjects || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          color: COLORS[subjects?.length ? subjects.length % COLORS.length : 0],
          difficulty,
          weeks,
          hoursPerWeek,
          level,
          examDate: examDate ? new Date(examDate).toISOString() : null,
          weaknesses: weaknesses || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pipeline failed");
      setResult(
        `Athena drafted ${data.draft.tasks.length} tasks (engine=${data.draft.engine}); Chronos packed ${data.schedule.blocks.length} focus blocks; Sage created ${data.deck ? "a starter deck" : "cards"}.`
      );
      setName("");
      setWeaknesses("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  const agentSteps = [
    { emoji: "🧠", name: "Athena", desc: "decomposes the subject into a phased roadmap" },
    { emoji: "🎼", name: "Conductor", desc: "persists the plan and routes the next handoff" },
    { emoji: "⏱️", name: "Chronos", desc: "packs your week into energy-matched focus blocks" },
    { emoji: "📚", name: "Sage", desc: "seeds a flashcard deck for active recall" }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Planner"
        subtitle="Describe a subject once. Athena drafts the roadmap, Conductor wires it up, Chronos packs your week, and Sage seeds your first deck."
      />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Wizard */}
        <form onSubmit={submit} className="card lg:col-span-2 space-y-4 h-fit">
          <div>
            <label className="label">Subject</label>
            <input className="input mt-1" placeholder="e.g. Organic Chemistry" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Difficulty (1–5)</label>
              <input type="number" min={1} max={5} className="input mt-1" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Horizon (weeks)</label>
              <input type="number" min={1} max={52} className="input mt-1" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hours / week</label>
              <input type="number" min={1} max={80} className="input mt-1" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Your level</label>
              <select className="input mt-1" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Exam date (optional)</label>
            <input type="date" className="input mt-1" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Weaknesses to target (optional)</label>
            <textarea className="input mt-1" rows={2} placeholder="e.g. stereochemistry, NMR interpretation" value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={running || name.trim().length < 2}>
            {running ? "Agents collaborating…" : "✦ Generate study plan"}
          </button>

          {running && (
            <div className="space-y-2 text-xs text-muted">
              {agentSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 animate-pulse-soft" style={{ animationDelay: `${i * 0.4}s` }}>
                  <span>{s.emoji}</span>
                  <span><b className="text-ink">{s.name}</b> {s.desc}</span>
                </div>
              ))}
            </div>
          )}
          {result && <div className="rounded-xl border border-good/40 p-3 text-sm text-good">{result}</div>}
          {error && <div className="rounded-xl border border-bad/40 p-3 text-sm text-bad">{error}</div>}
        </form>

        {/* Subject list */}
        <div className="lg:col-span-3 space-y-4">
          {subjects === null ? (
            <div className="text-muted animate-pulse-soft">Loading…</div>
          ) : subjects.length === 0 ? (
            <EmptyState title="No subjects yet" hint="Fill the form and the agent crew will assemble your first roadmap in seconds." />
          ) : (
            subjects.map((s) => {
              const plan = s.plans?.[0];
              const strategy = plan ? safeParse(plan.strategy) : null;
              const isOpen = expanded === s.id;
              return (
                <div key={s.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: s.color }} />
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted mt-0.5">
                          {s._count.tasks} tasks · {s._count.flashcards} cards · difficulty {s.difficulty}/5
                          {s.examDate && ` · exam ${new Date(s.examDate).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {plan && (
                        <button className="btn btn-ghost text-xs" onClick={() => setExpanded(isOpen ? null : s.id)}>
                          {isOpen ? "Hide plan" : "View plan"}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost text-xs text-bad"
                        onClick={async () => {
                          await fetch("/api/subjects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) });
                          load();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {plan && (
                    <div className="mt-3">
                      <div className="text-sm text-muted">{plan.summary}</div>
                      <div className="mt-2">
                        <ProgressBar value={Math.min(1, s._count.tasks / Math.max(8, s._count.tasks))} color={s.color} />
                      </div>
                    </div>
                  )}

                  {isOpen && plan && strategy && (
                    <div className="mt-4 space-y-3 text-sm border-t pt-4">
                      <div>
                        <div className="label mb-1">Weekly focus</div>
                        <ul className="list-disc list-inside text-muted space-y-1">
                          {strategy.weeklyFocus.slice(0, 6).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="label mb-1">Review cadence</div>
                        <div className="text-muted">{strategy.reviewCadence}</div>
                      </div>
                      <div>
                        <div className="label mb-1">Exam tactics</div>
                        <div className="text-muted">{strategy.examTactics}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function safeParse(json: string): { weeklyFocus: string[]; reviewCadence: string; examTactics: string } | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
