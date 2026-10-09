import { prisma } from "../prisma";

export type Insight = {
  agent: string;
  severity: "info" | "warn" | "good" | "critical";
  title: string;
  detail: string;
};

export type Analytics = {
  totals: {
    minutes: number;
    sessions: number;
    tasksDone: number;
    tasksPending: number;
    cardsDue: number;
  };
  minutesByDay: { date: string; minutes: number }[];
  minutesBySubject: { subject: string; minutes: number; color: string }[];
  taskMix: { type: string; count: number }[];
  forecast: {
    readinessBySubject: {
      subject: string;
      color: string;
      coverage: number; // 0..1 estimated syllabus coverage
      examInDays: number | null;
      verdict: string;
    }[];
  };
  insights: Insight[];
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export async function analyze(userId: string): Promise<Analytics> {
  const since30 = new Date(Date.now() - 30 * 86400000);

  const [sessions, tasksDone, tasksPending, dueCards, subjects] = await Promise.all([
    prisma.session.findMany({
      where: { userId, startedAt: { gte: since30 } },
      select: { startedAt: true, minutes: true }
    }),
    prisma.task.count({ where: { userId, status: "done" } }),
    prisma.task.count({ where: { userId, status: { in: ["todo", "doing"] } } }),
    prisma.flashcard.count({ where: { subject: { userId }, nextReview: { lte: new Date() } } }),
    prisma.subject.findMany({
      where: { userId },
      include: {
        tasks: { select: { status: true, type: true } }
      }
    })
  ]);

  // ── Minutes by day (last 30d, dense) ──
  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const s of sessions) {
    const key = s.startedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + s.minutes);
  }
  const minutesByDay = [...byDay.entries()].map(([date, minutes]) => ({ date, minutes }));

  // ── Minutes by subject ──
  const subjectTotals = await prisma.session.groupBy({
    by: ["taskId"],
    where: { userId, startedAt: { gte: since30 } },
    _sum: { minutes: true }
  });
  const taskSubject = new Map<string, { name: string; color: string }>();
  const taskIds = subjectTotals.map((s) => s.taskId).filter((x): x is string => !!x);
  if (taskIds.length) {
    const t = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, subject: { select: { name: true, color: true } } }
    });
    for (const tt of t) taskSubject.set(tt.id, tt.subject);
  }
  const subjectMap = new Map<string, { minutes: number; color: string }>();
  for (const s of subjectTotals) {
    if (!s.taskId || !s._sum.minutes) continue;
    const meta = taskSubject.get(s.taskId);
    if (!meta) continue;
    const cur = subjectMap.get(meta.name) || { minutes: 0, color: meta.color };
    subjectMap.set(meta.name, { minutes: cur.minutes + s._sum.minutes, color: meta.color });
  }
  const minutesBySubject = [...subjectMap.entries()].map(([subject, v]) => ({ subject, ...v })).sort((a, b) => b.minutes - a.minutes);

  // ── Task mix ──
  const mix = new Map<string, number>();
  for (const sub of subjects) {
    for (const t of sub.tasks) {
      mix.set(t.type, (mix.get(t.type) || 0) + 1);
    }
  }
  const taskMix = [...mix.entries()].map(([type, count]) => ({ type, count }));

  // ── Readiness forecast per subject ──
  const readinessBySubject = subjects.map((s) => {
    const total = s.tasks.length || 1;
    const done = s.tasks.filter((t) => t.status === "done").length;
    const coverage = done / total;
    const examInDays = s.examDate ? Math.ceil((s.examDate.getTime() - Date.now()) / 86400000) : null;
    let verdict = "On pace";
    if (examInDays !== null) {
      const needed = 1 - coverage;
      const daysNeeded = Math.ceil(needed * total * 0.8); // heuristic: 80% of task duration
      if (daysNeeded > examInDays) verdict = "At risk";
      else if (coverage > 0.85) verdict = "Exam ready";
    } else if (coverage >= 0.9) verdict = "Complete";
    return { subject: s.name, color: s.color, coverage, examInDays, verdict };
  });

  // ── Insights (Vector the Analyst) ──
  const insights: Insight[] = [];
  const totalMinutes = minutesByDay.reduce((a, b) => a + b.minutes, 0);
  const activeDays = minutesByDay.filter((d) => d.minutes > 0).length;
  const first14 = minutesByDay.slice(0, 14).reduce((a, b) => a + b.minutes, 0);
  const last14 = minutesByDay.slice(14).reduce((a, b) => a + b.minutes, 0);

  if (last14 > first14 * 1.2) {
    const gain = Math.round((last14 / Math.max(1, first14) - 1) * 100);
    insights.push({ agent: "analyst", severity: "good", title: "Momentum building", detail: `Your focus time rose ${gain}% in the last two weeks vs the prior two.` });
  }
  if (last14 < first14 * 0.8 && first14 > 0) insights.push({ agent: "analyst", severity: "warn", title: "Fading momentum", detail: "Focus time dropped vs the prior two weeks. Ember (coach) suggests a small daily minimum to restart." });
  if (activeDays / 30 < 0.4 && totalMinutes > 0) insights.push({ agent: "analyst", severity: "warn", title: "Sporadic pattern", detail: `You studied on ${activeDays}/30 days. Regularity beats intensity — try same-time daily blocks.` });
  if (dueCards > 20) insights.push({ agent: "analyst", severity: "critical", title: "Review backlog", detail: `${dueCards} flashcards are due. A 15-min review blitz today clears the queue and stops forgetting.` });
  const atRisk = readinessBySubject.filter((r) => r.verdict === "At risk");
  for (const r of atRisk) {
    insights.push({ agent: "analyst", severity: "critical", title: `${r.subject} at risk`, detail: `Coverage ${Math.round(r.coverage * 100)}% with the exam in ${r.examInDays} days. Re-run Chronos to re-pack the remaining days.` });
  }
  if (insights.length === 0) {
    insights.push({ agent: "analyst", severity: "info", title: "All clear", detail: "No risks detected. Keep the cadence and let spaced reviews do their work." });
  }

  return {
    totals: { minutes: totalMinutes, sessions: sessions.length, tasksDone, tasksPending, cardsDue: dueCards },
    minutesByDay,
    minutesBySubject,
    taskMix,
    forecast: { readinessBySubject },
    insights
  };
}
