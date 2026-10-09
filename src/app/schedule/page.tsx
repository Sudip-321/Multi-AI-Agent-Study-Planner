"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Section, EmptyState } from "@/components/ui";

type Block = {
  date: string;
  startHour: number;
  minutes: number;
  taskId: string | null;
  title: string;
  subject: string;
  color: string;
  kind: "deep" | "light" | "review";
};

type ScheduleData = {
  blocks: Block[];
  unscheduled: number;
  loadPerDay: { date: string; minutes: number }[];
};

const DAYS = 7;

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [hours, setHours] = useState<number>(10);
  const [packing, setPacking] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/schedule").then((r) => r.json());
    setData(d);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/agents")
      .then((r) => r.json())
      .then(() => {}) // engine info only
      .catch(() => {});
  }, [load]);

  async function repack() {
    setPacking(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hoursPerWeek: hours })
      });
      const d = await res.json();
      if (res.ok) setData(d);
    } finally {
      setPacking(false);
    }
  }

  if (!data) return <div className="text-muted animate-pulse-soft">Chronos is arranging your week…</div>;

  // Build day columns
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const maxLoad = Math.max(60, ...data.loadPerDay.map((l) => l.minutes));

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Schedule"
        subtitle="Chronos packs open tasks into your week, matching deep work to your peak-energy hours and reviews to the dips."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Hours / week</label>
          <input type="number" min={1} max={80} className="input mt-1 w-28" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary" onClick={repack} disabled={packing}>
          {packing ? "Repacking…" : "⏱️ Repack week"}
        </button>
        <div className="text-sm text-muted ml-auto">
          {data.blocks.length} blocks
          {data.unscheduled > 0 && <span className="text-warn"> · {data.unscheduled} task(s) don't fit — raise hours or prune</span>}
        </div>
      </div>

      {data.blocks.length === 0 ? (
        <EmptyState title="Nothing scheduled" hint="Add subjects in the Planner first, then let Chronos pack your week." />
      ) : (
        <>
          {/* Daily load bars */}
          <Section title="Daily load">
            <div className="flex items-end gap-3 h-28">
              {days.map((d) => {
                const load = data.loadPerDay.find((l) => l.date === d)?.minutes || 0;
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
                      <div
                        className="w-8 rounded-t-lg transition-all"
                        style={{ height: `${(load / maxLoad) * 100}%`, background: load > 0 ? "var(--accent)" : "var(--raised)" }}
                        title={`${load} min`}
                      />
                    </div>
                    <div className="text-[11px] text-muted">
                      {new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Week grid */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {days.map((d) => {
              const dayBlocks = data.blocks
                .filter((b) => b.date === d)
                .sort((a, b) => a.startHour - b.startHour);
              const isToday = d === today.toISOString().slice(0, 10);
              return (
                <div key={d} className={`card p-3 ${isToday ? "border-accent" : ""}`}>
                  <div className="text-xs font-semibold mb-2 flex justify-between">
                    <span>{new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="text-muted">{new Date(d + "T00:00:00").getDate()}</span>
                  </div>
                  <div className="space-y-2 min-h-16">
                    {dayBlocks.length === 0 && <div className="text-[11px] text-muted">Free</div>}
                    {dayBlocks.map((b, i) => (
                      <div
                        key={i}
                        className="rounded-lg p-2 text-[11px] leading-snug border"
                        style={{ borderColor: b.color, background: `${b.color}14` }}
                        title={`${b.subject} · ${b.minutes} min`}
                      >
                        <div className="font-semibold" style={{ color: b.color }}>
                          {b.startHour}:00 · {b.minutes}m
                        </div>
                        <div className="mt-0.5 line-clamp-3">{b.title}</div>
                        <div className="mt-1 chip !px-1.5 !py-0 !text-[10px]">{b.kind}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
