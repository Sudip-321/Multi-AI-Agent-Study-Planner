import { prisma } from "../prisma";
import { planSubject } from "./planner";
import { scheduleWeek, type SchedulerTask } from "./scheduler";
import { generateCards } from "./tutor";
import { coachSignal } from "./coach";
import { analyze } from "./analyst";
import { getAgent, type AgentId } from "./registry";

export type AgentEvent = {
  agent: AgentId | "orchestrator";
  action: string;
  detail: string;
};

export async function logEvent(e: AgentEvent) {
  await prisma.agentLog.create({ data: { agent: e.agent, action: e.action, detail: e.detail } });
  const a = getAgent(e.agent);
  console.log(`[Conductor] ${a?.emoji || "🎼"} ${a?.name || e.agent} → ${e.action}: ${e.detail}`);
  return e;
}

export async function recentEvents(limit = 25) {
  return prisma.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

// ── Pipeline 1: subject onboarding ──
// Planner drafts roadmap → tasks persisted → scheduler packs the week → tutor seeds flashcards
export async function onboardingPipeline(input: {
  userId: string;
  name: string;
  color: string;
  difficulty: number;
  examDate?: Date | null;
  weeks: number;
  hoursPerWeek: number;
  level: string;
  weaknesses?: string;
}) {
  const events: AgentEvent[] = [];
  const log = (agent: AgentEvent["agent"], action: string, detail: string) => {
    events.push({ agent, action, detail });
    return logEvent({ agent, action, detail });
  };

  // 1. Planner (Athena) drafts the roadmap
  const draft = await planSubject({
    subject: input.name,
    difficulty: input.difficulty,
    weeks: input.weeks,
    hoursPerWeek: input.hoursPerWeek,
    currentLevel: input.level,
    weaknesses: input.weaknesses
  });
  await log("planner", "drafted roadmap", `${draft.tasks.length} tasks · engine=${draft.engine}`);

  // 2. Persist subject + plan + tasks
  const subject = await prisma.subject.create({
    data: {
      name: input.name,
      color: input.color,
      difficulty: input.difficulty,
      examDate: input.examDate,
      userId: input.userId,
      plans: {
        create: {
          title: draft.title,
          summary: draft.summary,
          strategy: JSON.stringify(draft.strategy),
          userId: input.userId
        }
      }
    },
    include: { plans: true }
  });

  const plan = subject.plans[0];
  const createdTasks = await prisma.task.createMany({
    data: draft.tasks.map((t) => ({
      title: t.title,
      type: t.type,
      priority: t.priority,
      estimateMin: t.estimateMin,
      dueDate: new Date(Date.now() + t.dueInDays * 86400000),
      subjectId: subject.id,
      planId: plan?.id,
      userId: input.userId
    }))
  });
  await log("orchestrator", "persisted plan", `${createdTasks.count} tasks saved for ${input.name}`);

  // 3. Scheduler (Chronos) packs the coming week
  const weekTasks = (await prisma.task.findMany({
    where: { userId: input.userId, subjectId: subject.id },
    include: { subject: true }
  })) as SchedulerTask[];
  const schedule = scheduleWeek(weekTasks, input.hoursPerWeek);
  await log("scheduler", "packed week", `${schedule.blocks.length} blocks · ${schedule.unscheduled} unscheduled`);

  // 4. Tutor (Sage) seeds a starter deck
  const { cards, engine: cardEngine } = await generateCards({
    topic: `${input.name} fundamentals`,
    subject: input.name,
    count: 8,
    context: draft.summary
  });
  const deck = await prisma.deck.create({
    data: {
      name: `${input.name} — Starter Deck`,
      subjectId: subject.id,
      cards: {
        create: cards.map((c) => ({
          front: c.front,
          back: c.back,
          subjectId: subject.id
        }))
      }
    }
  });
  await log("tutor", "generated flashcards", `${cards.length} cards · engine=${cardEngine}`);

  return { subject, schedule, deck, draft, events };
}

// ── Pipeline 2: reschedule (Chronos re-pack) ──
export async function reschedulePipeline(userId: string, hoursPerWeek: number) {
  const tasks = (await prisma.task.findMany({
    where: { userId, status: { in: ["todo", "doing"] } },
    include: { subject: true }
  })) as SchedulerTask[];

  const schedule = scheduleWeek(tasks, hoursPerWeek);
  await logEvent({
    agent: "scheduler",
    action: "rescheduled week",
    detail: `${schedule.blocks.length} blocks · ${schedule.unscheduled} tasks couldn't fit`
  });
  return schedule;
}

// ── Pipeline 3: daily brief (all agents contribute) ──
export async function dailyBriefPipeline(userId: string) {
  const [coach, analytics] = await Promise.all([coachSignal(userId), analyze(userId)]);

  await logEvent({
    agent: "coach",
    action: "morning brief",
    detail: coach.headline
  });
  await logEvent({
    agent: "analyst",
    action: "brief analysis",
    detail: `${analytics.insights.length} insights · ${analytics.totals.cardsDue} cards due`
  });

  return { coach, analytics };
}
