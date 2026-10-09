"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Section } from "@/components/ui";

type Task = {
  id: string;
  title: string;
  status: string;
  subject: { name: string; color: string };
};

const PRESETS = [
  { label: "Pomodoro", minutes: 25 },
  { label: "Deep work", minutes: 50 },
  { label: "Quick review", minutes: 10 }
];

export default function FocusPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState<string>("");
  const [preset, setPreset] = useState(PRESETS[0].minutes);
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<null | { minutes: number }>(null);
  const [focusScore, setFocusScore] = useState(80);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTasks = useCallback(async () => {
    const d = await fetch("/api/tasks").then((r) => r.json());
    const open = (d.tasks || []).filter((t: Task) => t.status !== "done" && t.status !== "skipped");
    setTasks(open);
    if (open.length && !taskId) setTaskId(open[0].id);
  }, [taskId]);

  useEffect(() => {
    loadTasks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            setRunning(false);
            setDone({ minutes: preset });
            // gentle completion chime via WebAudio
            try {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.connect(g);
              g.connect(ctx.destination);
              o.frequency.value = 880;
              g.gain.setValueAtTime(0.08, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
              o.start();
              o.stop(ctx.currentTime + 1.2);
            } catch {}
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, preset]);

  const total = preset * 60;
  const progress = total > 0 ? 1 - secondsLeft / total : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const selectedTask = tasks.find((t) => t.id === taskId);

  async function saveSession() {
    if (!done) return;
    setSaving(true);
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutes: done.minutes,
          focusScore,
          taskId: taskId || null,
          notes: selectedTask ? `Worked on: ${selectedTask.title}` : undefined
        })
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function reset(minutes: number) {
    setRunning(false);
    setDone(null);
    setSaved(false);
    setPreset(minutes);
    setSecondsLeft(minutes * 60);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up">
      <PageHeader
        title="Focus"
        subtitle="Log deep-work sessions. Finished sessions feed XP, streaks, and Vector's analytics — the agents learn from how you actually study."
      />

      <div className="card text-center py-10">
        <div className="flex justify-center gap-2 mb-6">
          {PRESETS.map((p) => (
            <button
              key={p.minutes}
              className={`btn text-xs ${preset === p.minutes ? "btn-primary" : "btn-ghost"}`}
              onClick={() => reset(p.minutes)}
              disabled={running}
            >
              {p.label} · {p.minutes}m
            </button>
          ))}
        </div>

        <div
          className="mx-auto w-56 h-56 rounded-full flex items-center justify-center relative"
          style={{
            background: `conic-gradient(var(--accent) ${progress * 360}deg, var(--raised) 0deg)`
          }}
        >
          <div className="w-48 h-48 rounded-full flex flex-col items-center justify-center" style={{ background: "var(--surface)" }}>
            <div className="text-5xl font-bold tabular-nums">{mm}:{ss}</div>
            <div className="text-xs text-muted mt-1">{running ? "focusing" : done ? "session complete" : "ready"}</div>
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 chip">{PRESETS.find((p) => p.minutes === preset)?.label}</div>
        </div>

        <div className="flex justify-center gap-3 mt-8">
          {!done ? (
            <button className={`btn ${running ? "btn-ghost" : "btn-primary"} w-32`} onClick={() => setRunning(!running)}>
              {running ? "Pause" : secondsLeft === total ? "Start" : "Resume"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={saveSession} disabled={saving || saved}>
              {saved ? "Logged ✓" : saving ? "Logging…" : "Log session"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => reset(preset)}>
            Reset
          </button>
        </div>
      </div>

      <Section title="Session details">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Working on</label>
            <select className="input mt-1" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">— general study —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subject.name} · {t.title.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Focus score: {focusScore}</label>
            <input type="range" min={0} max={100} value={focusScore} onChange={(e) => setFocusScore(Number(e.target.value))} className="w-full mt-3 accent-indigo-500" />
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Sessions without a task still count toward your streak and analytics. Completed the task itself? Mark it done in the
          <a href="/planner" className="text-accent"> Planner</a>.
        </p>
      </Section>
    </div>
  );
}
