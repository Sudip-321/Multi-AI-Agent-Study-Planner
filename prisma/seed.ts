/**
 * Seeds the database by running the REAL agent pipelines — so the demo data
 * is exactly what the app itself would produce.
 *
 * Usage: npm run seed
 */
import { PrismaClient } from "@prisma/client";

// Avoid @/ alias issues in plain tsx by importing relatively
import { planSubject } from "../src/lib/agents/planner";
import { scheduleWeek, type SchedulerTask } from "../src/lib/agents/scheduler";
import { generateCards } from "../src/lib/agents/tutor";
import { coachSignal } from "../src/lib/agents/coach";
import { analyze } from "../src/lib/agents/analyst";

const prisma = new PrismaClient();

const DEMO_EMAIL = "student@cortexa.app";

const SUBJECTS = [
  {
    name: "Organic Chemistry",
    color: "#6366f1",
    difficulty: 5,
    examInDays: 21,
    weeks: 4,
    level: "intermediate",
    weaknesses: "stereochemistry, reaction mechanisms, NMR interpretation"
  },
  {
    name: "Linear Algebra",
    color: "#06b6d4",
    difficulty: 3,
    examInDays: 35,
    weeks: 6,
    level: "beginner",
    weaknesses: "eigenvalues, vector spaces"
  },
  {
    name: "Spanish B2",
    color: "#f59e0b",
    difficulty: 2,
    examInDays: 56,
    weeks: 8,
    level: "intermediate",
    weaknesses: "subjunctive mood, listening speed"
  }
];

async function main() {
  console.log("🌱 Seeding Cortexa demo data via agent pipelines…\n");

  // Fresh start
  await prisma.agentLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.flashcard.deleteMany();
  await prisma.deck.deleteMany();
  await prisma.task.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.user.deleteMany();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Sudip",
      xp: 340,
      level: 4,
      streak: 6,
      longestStreak: 11,
      hoursPerWeek: 12,
      lastStudyDate: new Date(today.getTime() + 18 * 3600000) // studied earlier today
    }
  });
  console.log(`👤 User: ${user.name} (level ${user.level}, ${user.xp} XP, ${user.streak}-day streak)`);

  for (const s of SUBJECTS) {
    console.log(`\n🧠 Athena planning: ${s.name}…`);

    // 1. Planner agent
    const draft = await planSubject({
      subject: s.name,
      difficulty: s.difficulty,
      weeks: s.weeks,
      hoursPerWeek: 12,
      currentLevel: s.level,
      weaknesses: s.weaknesses
    });
    console.log(`   → ${draft.tasks.length} tasks · engine=${draft.engine}`);

    const examDate = new Date(today.getTime() + s.examInDays * 86400000);
    const subject = await prisma.subject.create({
      data: {
        name: s.name,
        color: s.color,
        difficulty: s.difficulty,
        examDate,
        userId: user.id,
        plans: {
          create: {
            title: draft.title,
            summary: draft.summary,
            strategy: JSON.stringify(draft.strategy),
            userId: user.id
          }
        }
      },
      include: { plans: true }
    });

    // 2. Persist tasks — mark the first ~35% as done so analytics look lived-in
    const doneCount = Math.floor(draft.tasks.length * 0.35);
    await prisma.task.createMany({
      data: draft.tasks.map((t, i) => ({
        title: t.title,
        type: t.type,
        priority: t.priority,
        estimateMin: t.estimateMin,
        dueDate: new Date(today.getTime() + t.dueInDays * 86400000),
        subjectId: subject.id,
        planId: subject.plans[0]?.id,
        userId: user.id,
        status: i < doneCount ? "done" : "todo",
        completedAt: i < doneCount ? new Date(today.getTime() - (doneCount - i) * 86400000) : null
      }))
    });

    // 3. Tutor agent seeds flashcards — some already reviewed (in boxes)
    const { cards, engine } = await generateCards({
      topic: `${s.name} core concepts`,
      subject: s.name,
      count: 10,
      context: draft.summary
    });
    const deck = await prisma.deck.create({
      data: { name: `${s.name} — Starter Deck`, subjectId: subject.id }
    });
    await prisma.flashcard.createMany({
      data: cards.map((c, i) => {
        // Stagger: 60% due now, rest scheduled later via boxes
        const box = i < 6 ? 1 : 2 + (i % 3);
        const dueOffset = i < 6 ? 0 : box * 2;
        return {
          front: c.front,
          back: c.back,
          deckId: deck.id,
          subjectId: subject.id,
          box,
          nextReview: new Date(today.getTime() + dueOffset * 86400000 - (i < 6 ? 3600000 : 0)),
          streak: box - 1
        };
      })
    });
    console.log(`   → deck "${deck.name}" · ${cards.length} cards · engine=${engine}`);

    // 4. Exam entry
    await prisma.exam.create({
      data: { title: `${s.name} Final`, date: examDate, subjectId: subject.id, weight: s.difficulty }
    });
  }

  // 5. Simulate 30 days of focus sessions (linked to done tasks for subject attribution)
  console.log("\n⏱️  Simulating 30 days of focus sessions…");
  const doneTasks = await prisma.task.findMany({
    where: { userId: user.id, status: "done" },
    include: { subject: true }
  });
  const sessions: { minutes: number; startedAt: Date; focusScore: number; userId: string; taskId: string }[] = [];
  for (let d = 29; d >= 0; d--) {
    // Weekly rhythm: weekends lighter, one missed day ~10 days ago (coach can react)
    if (d === 10) continue;
    const weekday = new Date(today.getTime() - d * 86400000).getDay();
    const sessionsToday = weekday === 0 || weekday === 6 ? 1 : 2;
    for (let k = 0; k < sessionsToday; k++) {
      const task = doneTasks[(d * 2 + k) % Math.max(1, doneTasks.length)];
      sessions.push({
        minutes: 25 + ((d * 7 + k * 11) % 30),
        startedAt: new Date(today.getTime() - d * 86400000 + (9 + k * 5) * 3600000),
        focusScore: 65 + ((d * 13 + k * 29) % 30),
        userId: user.id,
        taskId: task?.id || ""
      });
    }
  }
  await prisma.session.createMany({ data: sessions });
  console.log(`   → ${sessions.length} sessions logged`);

  // 6. Run the analyst + coach so the event bus has content
  const analytics = await analyze(user.id);
  console.log(`\n📊 Vector: ${analytics.insights.length} insights, ${analytics.totals.cardsDue} cards due`);
  const coach = await coachSignal(user.id);
  console.log(`🔥 Ember: [${coach.tone}] ${coach.headline}`);

  console.log("\n✅ Seed complete! Run `npm run dev` and open http://localhost:3000\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
