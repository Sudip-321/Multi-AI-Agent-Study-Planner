"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, StatCard, Section, ProgressBar, EmptyState } from "@/components/ui";

type Stats = {
  user: { name: string; xp: number; level: number; streak: number; longestStreak: number };
  coach: { tone: string; headline: string; message: string; actions: string[] };
  analytics: {
    totals: { minutes: number; sessions: number; tasksDone: number; tasksPending: number; cardsDue: number };
    forecast: { readinessBySubject: { subject: string; color: string; coverage: number; examInDays: number | null; verdict: string }[] };
    insights: { severity: string; title: string; detail: string }[];
  };
  focusMinutesToday: number;
};

type AgentEvent = { id: string; agent: string; action: string; detail: string; createdAt: string };

const TONE_STYLE: Record<string, string> = {
  celebrate: "border-good/40",
  encourage: "border-warn/40",
  urgent: "border-bad/40",
  steady: "border-accent/40"
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [briefing, setBriefing] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json())
    ]);
    setStats(s);
    setEvents((a.events || []).slice(0, 8));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runBrief() {
    setBriefing(true);
    try {
      await fetch("/api/brief", { method: "POST" });
      await load();
    } finally {
      setBriefing(false);
    }
  }

  if (!stats) {
    return <div className="text-muted animate-pulse-soft">Waking the agents…</div>;
  }

  const { user, coach, analytics } = stats;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title={`Good to see you, ${user.name}`}
        subtitle="Your agent crew has been standing by. Here's today's picture."
        actions={
          <>
            <button className="btn btn-primary" onClick={runBrief} disabled={briefing}>
              {briefing ? "Agents working…" : "✦ Run agent brief"}
            </button>
            <Link className="btn btn-ghost" href="/planner">
              + New subject
            </Link>
          </>
        }
      />

      {/* Coach brief */}
      <div className={`card border-2 ${TONE_STYLE[coach.tone] || ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label mb-1">Ember · Coach brief</div>
            <div className="text-lg font-semibold">{coach.headline}</div>
            <p className="text-sm text-muted mt-1">{coach.message}</p>
          </div>
          <div className="text-3xl">🔥</div>
        </div>
        {coach.actions.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {coach.actions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Focus today" value={`${stats.focusMinutesToday}m`} sub={`${analytics.totals.sessions} sessions / 30d`} />
        <StatCard label="Streak" value={`${user.streak}d`} sub={`best ${user.longestStreak}d`} tone={user.streak >= 3 ? "good" : undefined} />
        <StatCard label="Level" value={user.level} sub={`${user.xp} XP`} />
        <StatCard label="Tasks pending" value={analytics.totals.tasksPending} sub={`${analytics.totals.tasksDone} done`} tone={analytics.totals.tasksPending > 15 ? "warn" : undefined} />
        <StatCard label="Cards due" value={analytics.totals.cardsDue} sub="spaced repetition" tone={analytics.totals.cardsDue > 20 ? "bad" : undefined} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Readiness */}
        <Section title="Exam readiness forecast">
          {analytics.forecast.readinessBySubject.length === 0 ? (
            <p className="text-sm text-muted">No subjects yet. Add one in the Planner and Athena will draft a roadmap.</p>
          ) : (
            <div className="space-y-4">
              {analytics.forecast.readinessBySubject.map((r) => (
                <div key={r.subject}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium">{r.subject}</span>
                    <span className="text-muted">
                      {Math.round(r.coverage * 100)}% · {r.verdict}
                      {r.examInDays !== null && ` · exam in ${r.examInDays}d`}
                    </span>
                  </div>
                  <ProgressBar value={r.coverage} color={r.color} />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Agent activity */}
        <Section
          title="Agent activity"
          right={
            <Link href="/agents" className="text-xs text-accent hover:underline">
              Agent Hub →
            </Link>
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted">No agent runs yet. Try “Run agent brief” above.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="chip capitalize shrink-0">{e.agent}</span>
                  <span>
                    <span className="font-medium">{e.action}</span>
                    <span className="text-muted"> — {e.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Insights */}
      {analytics.insights.length > 0 && (
        <Section title="Vector's insights">
          <div className="grid md:grid-cols-2 gap-3">
            {analytics.insights.slice(0, 4).map((i, idx) => (
              <div key={idx} className="rounded-xl border p-3 text-sm">
                <div className="font-medium flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      i.severity === "good" ? "bg-good" : i.severity === "critical" ? "bg-bad" : i.severity === "warn" ? "bg-warn" : "bg-accent"
                    }`}
                  />
                  {i.title}
                </div>
                <div className="text-muted mt-1">{i.detail}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
