"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid
} from "recharts";
import { PageHeader, Section, EmptyState } from "@/components/ui";

type Analytics = {
  totals: { minutes: number; sessions: number; tasksDone: number; tasksPending: number; cardsDue: number };
  minutesByDay: { date: string; minutes: number }[];
  minutesBySubject: { subject: string; minutes: number; color: string }[];
  taskMix: { type: string; count: number }[];
  forecast: { readinessBySubject: { subject: string; color: string; coverage: number; examInDays: number | null; verdict: string }[] };
  insights: { severity: string; title: string; detail: string }[];
};

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setA(d.analytics));
  }, []);

  if (!a) return <div className="text-muted animate-pulse-soft">Vector is mining your sessions…</div>;

  const dayData = a.minutesByDay.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Analytics"
        subtitle="30 days of study behavior, mined by Vector the analyst. Trends feed Ember's coaching and Athena's replanning."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="30-day focus" value={`${Math.round(a.totals.minutes / 60)}h ${a.totals.minutes % 60}m`} />
        <Metric label="Sessions" value={a.totals.sessions} />
        <Metric label="Tasks done" value={a.totals.tasksDone} />
        <Metric label="Review backlog" value={a.totals.cardsDue} tone={a.totals.cardsDue > 20 ? "bad" : undefined} />
      </div>

      <Section title="Focus minutes · last 30 days">
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={dayData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="minutes" stroke="#6366f1" strokeWidth={2} fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Time by subject">
          {a.minutesBySubject.length === 0 ? (
            <p className="text-sm text-muted">No task-linked sessions yet. Link sessions to tasks in Focus mode to populate this.</p>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={a.minutesBySubject} dataKey="minutes" nameKey="subject" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {a.minutesBySubject.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                {a.minutesBySubject.map((s) => (
                  <span key={s.subject} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    {s.subject} · {s.minutes}m
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Task mix">
          {a.taskMix.length === 0 ? (
            <p className="text-sm text-muted">No tasks yet.</p>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={a.taskMix}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="type" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <Section title="Readiness forecast">
        {a.forecast.readinessBySubject.length === 0 ? (
          <EmptyState title="No subjects to forecast" />
        ) : (
          <div className="space-y-4">
            {a.forecast.readinessBySubject.map((r) => (
              <div key={r.subject} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium truncate">{r.subject}</div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--raised)" }}>
                  <div className="h-full rounded-full" style={{ width: `${r.coverage * 100}%`, background: r.color }} />
                </div>
                <div className="text-xs text-muted w-40 text-right">
                  {Math.round(r.coverage * 100)}% · {r.verdict}
                  {r.examInDays !== null && ` · ${r.examInDays}d`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone === "bad" ? "text-bad" : ""}`}>{value}</div>
    </div>
  );
}
