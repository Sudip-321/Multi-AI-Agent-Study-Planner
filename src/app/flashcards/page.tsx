"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Section, EmptyState } from "@/components/ui";

type Card = {
  id: string;
  front: string;
  back: string;
  box: number;
  streak: number;
  subject: { name: string; color: string };
  deck: { name: string };
};

type Subject = { id: string; name: string; color: string };

export default function FlashcardsPage() {
  const [due, setDue] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState({ hits: 0, misses: 0 });

  const load = useCallback(async () => {
    const d = await fetch("/api/flashcards?mode=due").then((r) => r.json());
    setDue(d.due || []);
    setTotal(d.total || 0);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => {
        setSubjects(d.subjects || []);
        if (d.subjects?.length) setSubjectId(d.subjects[0].id);
      });
  }, [load]);

  const current = due[idx];

  async function grade(result: "hit" | "miss") {
    if (!current) return;
    await fetch("/api/flashcards/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: current.id, result })
    });
    setReviewed((r) => ({ hits: r.hits + (result === "hit" ? 1 : 0), misses: r.misses + (result === "miss" ? 1 : 0) }));
    setRevealed(false);
    setIdx((i) => i + 1);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", subjectId, topic, count })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Generation failed");
      setGenMsg(`Sage created ${d.count} cards (engine=${d.engine}). They're now in the due queue.`);
      setTopic("");
      await load();
      setIdx(0);
    } catch (err) {
      setGenMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Flashcards"
        subtitle="Sage writes cards; the Leitner box system schedules each one so you review right before you'd forget."
      />

      <div className="flex gap-3 text-sm">
        <span className="chip">Due now: {due.length - idx}</span>
        <span className="chip">Library: {total} cards</span>
        <span className="chip">This run: ✓ {reviewed.hits} · ✗ {reviewed.misses}</span>
      </div>

      {/* Reviewer */}
      {current ? (
        <div className="card">
          <div className="flex items-center justify-between text-xs text-muted mb-4">
            <span className="chip" style={{ color: current.subject.color }}>
              {current.subject.name}
            </span>
            <span>
              Box {current.box}/5 {current.streak > 1 && `· 🔥${current.streak} streak`}
            </span>
          </div>

          <div className="min-h-40 flex flex-col items-center justify-center text-center py-6">
            <div className="text-xl font-semibold max-w-lg">{current.front}</div>
            {revealed && <div className="mt-4 pt-4 border-t text-muted max-w-lg">{current.back}</div>}
          </div>

          {!revealed ? (
            <button className="btn btn-primary w-full" onClick={() => setRevealed(true)}>
              Reveal answer
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-ghost text-bad" onClick={() => grade("miss")}>
                ✗ Missed
              </button>
              <button className="btn btn-primary" onClick={() => grade("hit")}>
                ✓ Got it
              </button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title={idx > 0 ? "Queue cleared! 🎉" : "Nothing due right now"}
          hint={idx > 0 ? "Sage will resurface cards at expanding intervals." : "Generate a deck below, or come back when cards ripen."}
        />
      )}

      {/* Generator */}
      <Section title="Generate with Sage (tutor agent)">
        {subjects.length === 0 ? (
          <p className="text-sm text-muted">Add a subject in the Planner first.</p>
        ) : (
          <form onSubmit={generate} className="grid md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            <div>
              <label className="label">Topic</label>
              <input className="input mt-1" placeholder="e.g. cellular respiration" value={topic} onChange={(e) => setTopic(e.target.value)} required minLength={2} />
            </div>
            <div>
              <label className="label">Subject</label>
              <select className="input mt-1" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">#</label>
              <input type="number" min={3} max={20} className="input mt-1 w-20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <button className="btn btn-primary" disabled={generating}>
              {generating ? "Sage writing…" : "✦ Generate"}
            </button>
          </form>
        )}
        {genMsg && <div className="text-sm mt-3 text-muted">{genMsg}</div>}
      </Section>
    </div>
  );
}
