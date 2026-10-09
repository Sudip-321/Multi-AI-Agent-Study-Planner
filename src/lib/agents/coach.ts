import { prisma } from "../prisma";
import { llmComplete } from "../llm";

export type CoachSignal = {
  tone: "celebrate" | "encourage" | "urgent" | "steady";
  headline: string;
  message: string;
  actions: string[];
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export async function coachSignal(userId: string): Promise<CoachSignal> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { tone: "steady", headline: "Welcome", message: "Set up your profile to begin.", actions: [] };
  }

  const [overdue, done7, minutes7, sessions7] = await Promise.all([
    prisma.task.count({ where: { userId, status: "todo", dueDate: { lt: startOfDay(new Date()) } } }),
    prisma.task.count({ where: { userId, status: "done", completedAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.session.aggregate({ where: { userId, startedAt: { gte: new Date(Date.now() - 7 * 86400000) } }, _sum: { minutes: true } }),
    prisma.session.count({ where: { userId, startedAt: { gte: new Date(Date.now() - 7 * 86400000) } } })
  ]);

  const mins7 = minutes7._sum.minutes || 0;
  const since = user.lastStudyDate ? daysBetween(user.lastStudyDate, new Date()) : 999;

  // Deterministic tone selection
  let tone: CoachSignal["tone"] = "steady";
  if (since >= 3) tone = "urgent";
  else if (user.streak >= 5) tone = "celebrate";
  else if (mins7 < 60) tone = "encourage";

  const actions: string[] = [];
  if (overdue > 0) actions.push(`Clear ${overdue} overdue task${overdue > 1 ? "s" : ""} (they're the cheapest wins right now)`);
  if (mins7 < 120) actions.push("Book one 25-min focus block today — momentum beats motivation");
  if (sessions7 === 0) actions.push("Start a 10-minute warm-up session to restart the habit loop");
  if (user.streak >= 3 && since === 0) actions.push(`Protect the ${user.streak}-day streak: one short review session tonight`);
  if (actions.length === 0) actions.push("You're on track — attempt one harder practice task to keep growing");

  const headlineByTone: Record<CoachSignal["tone"], string> = {
    celebrate: `${user.streak}-day streak! 🔥 You're compounding.`,
    encourage: "Rough patch — one small session resets everything.",
    urgent: `${since} days since your last session. Let's rebuild today.`,
    steady: "On track. Consistency is your edge."
  };

  const fallback: CoachSignal = {
    tone,
    headline: headlineByTone[tone],
    message:
      mins7 > 0
        ? `Last 7 days: ${mins7} focus minutes across ${sessions7} session${sessions7 === 1 ? "" : "s"}, ${done7} tasks completed${overdue ? `, ${overdue} overdue` : ""}.`
        : "No sessions logged in the last 7 days. Start tiny: 10 minutes counts.",
    actions
  };

  // If LLM available, enrich the message (tone and actions stay deterministic for safety)
  const enriched = await llmComplete(
    [
      {
        role: "system",
        content:
          "You are Ember, a warm, concise motivation coach grounded in behavioral science. Given stats, write ONE encouraging message (max 40 words), no lists, no emojis beyond at most one."
      },
      {
        role: "user",
        content: `Streak: ${user.streak} days. Last session: ${since === 999 ? "never" : `${since}d ago`}. 7-day minutes: ${mins7}. Sessions: ${sessions7}. Overdue tasks: ${overdue}. Completed: ${done7}. Tone: ${tone}.`
      }
    ],
    { maxTokens: 90, temperature: 0.8 }
  );

  return enriched ? { ...fallback, message: enriched } : fallback;
}
