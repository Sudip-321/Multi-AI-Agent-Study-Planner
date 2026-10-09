import type { Task, Subject } from "@prisma/client";

export type StudyBlock = {
  date: string; // YYYY-MM-DD
  startHour: number;
  minutes: number;
  taskId: string | null;
  title: string;
  subject: string;
  color: string;
  kind: "deep" | "light" | "review";
};

export type SchedulerTask = Pick<Task, "id" | "title" | "type" | "priority" | "estimateMin" | "dueDate" | "status"> & {
  subject: Pick<Subject, "name" | "color" | "difficulty">;
};

export type SchedulerOutput = {
  blocks: StudyBlock[];
  unscheduled: number;
  loadPerDay: { date: string; minutes: number }[];
};

// Energy curve: most people peak late morning, dip early afternoon,
// recover in the evening. Deep work goes to peaks.
function energyAt(hour: number): number {
  if (hour < 7) return 0.2;
  if (hour < 10) return 0.8;
  if (hour < 12) return 1.0;
  if (hour < 14) return 0.55;
  if (hour < 17) return 0.75;
  if (hour < 21) return 0.85;
  return 0.35;
}

function kindFor(type: string): StudyBlock["kind"] {
  if (type === "review") return "review";
  if (type === "read") return "light";
  return "deep";
}

export function scheduleWeek(tasks: SchedulerTask[], hoursPerWeek: number, days = 7): SchedulerOutput {
  const blocks: StudyBlock[] = [];
  const loadPerDay: { date: string; minutes: number }[] = [];

  const dailyBudget = Math.max(30, Math.round((hoursPerWeek * 60) / days));
  const openSlots: { date: string; hour: number }[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const iso = date.toISOString().slice(0, 10);

    // Candidate hours: 8..21, keep the best-energy ones within budget
    const hours = [9, 10, 11, 16, 17, 19, 20, 8, 14, 15, 21].filter((h) => energyAt(h) >= 0.5);
    let budget = d === 0 ? dailyBudget * 0.6 : dailyBudget; // today partially spent

    for (const h of hours) {
      if (budget <= 0) break;
      openSlots.push({ date: iso, hour: h });
      budget -= 45;
    }
    loadPerDay.push({ date: iso, minutes: 0 });
  }

  // Sort open slots by energy of hour (desc), then date (asc)
  openSlots.sort((a, b) => energyAt(b.hour) - energyAt(a.hour) || a.date.localeCompare(b.date));

  // Sort tasks: hard+high-priority first (they claim peak slots)
  const pending = tasks
    .filter((t) => t.status === "todo" || t.status === "doing")
    .sort((a, b) => {
      const da = a.dueDate ? a.dueDate.getTime() : Infinity;
      const dbb = b.dueDate ? b.dueDate.getTime() : Infinity;
      return a.priority - b.priority || da - dbb || b.subject.difficulty - a.subject.difficulty;
    });

  const slotTask = new Map<string, { minutes: number; taskId: string | null; title: string; subject: string; color: string; kind: StudyBlock["kind"] }>();

  let unscheduled = 0;
  for (const task of pending) {
    let remaining = task.estimateMin;

    // Try slots whose date <= dueDate first, else any slot
    const dueIso = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null;
    const eligible = openSlots.filter((s) => !slotTask.has(`${s.date}|${s.hour}`));
    const preferred = dueIso ? eligible.filter((s) => s.date <= dueIso) : [];
    const pool = preferred.length >= 1 ? preferred : eligible;

    for (const slot of pool) {
      if (remaining <= 0) break;
      const key = `${slot.date}|${slot.hour}`;
      if (slotTask.has(key)) continue;

      const take = Math.min(remaining, 50);
      slotTask.set(key, {
        minutes: take,
        taskId: task.id,
        title: task.title,
        subject: task.subject.name,
        color: task.subject.color,
        kind: kindFor(task.type)
      });
      remaining -= take;
    }
    if (remaining > 0) unscheduled++;
  }

  // Materialize blocks in chronological order
  const sortedKeys = [...slotTask.keys()].sort((a, b) => {
    const [da, ha] = a.split("|").map(Number);
    const [dbb, hb] = b.split("|").map(Number);
    return da - dbb || ha - hb;
  });

  for (const key of sortedKeys) {
    const [date, hour] = key.split("|");
    const v = slotTask.get(key)!;
    blocks.push({
      date,
      startHour: Number(hour),
      minutes: v.minutes,
      taskId: v.taskId,
      title: v.title,
      subject: v.subject,
      color: v.color,
      kind: v.kind
    });
    const day = loadPerDay.find((l) => l.date === date);
    if (day) day.minutes += v.minutes;
  }

  return { blocks, unscheduled, loadPerDay };
}
