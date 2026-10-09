import { z } from "zod";
import { llmComplete } from "../llm";

export type PlannedTask = {
  title: string;
  type: string;
  priority: number;
  estimateMin: number;
  dueInDays: number;
  phase: string;
};

export type PlanDraft = {
  title: string;
  summary: string;
  strategy: {
    weeklyFocus: string[];
    reviewCadence: string;
    examTactics: string;
  };
  tasks: PlannedTask[];
  engine: "llm" | "heuristic";
};

const llmPlanSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  strategy: z.object({
    weeklyFocus: z.array(z.string()).min(1).max(10),
    reviewCadence: z.string().min(3),
    examTactics: z.string().min(3)
  }),
  tasks: z
    .array(
      z.object({
        title: z.string().min(3),
        type: z.enum(["read", "practice", "review", "project", "mock_exam"]),
        priority: z.number().int().min(1).max(3),
        estimateMin: z.number().int().min(15).max(240),
        dueInDays: z.number().int().min(1).max(365),
        phase: z.string().min(1)
      })
    )
    .min(3)
    .max(60)
});

export type PlannerInput = {
  subject: string;
  difficulty: number; // 1..5
  weeks: number; // until exam / horizon
  hoursPerWeek: number;
  currentLevel: string; // beginner | intermediate | advanced
  weaknesses?: string;
};

const PHASES = ["Foundation", "Deep Practice", "Integration", "Exam Sprint"] as const;

function heuristicPlan(input: PlannerInput): PlanDraft {
  const { subject, difficulty, weeks, hoursPerWeek, currentLevel, weaknesses } = input;

  // Total budget in hours -> minutes; cap task size at 90 min for focus quality
  const totalMin = weeks * hoursPerWeek * 60;
  const cap = difficulty >= 4 ? 60 : 90;
  const weeklyFocus: string[] = [];

  const phaseForWeek = (w: number): string => {
    const frac = w / Math.max(1, weeks);
    if (frac < 0.3) return PHASES[0];
    if (frac < 0.6) return PHASES[1];
    if (frac < 0.85) return PHASES[2];
    return PHASES[3];
  };

  // Build weekly focus narrative
  for (let w = 1; w <= Math.min(weeks, 12); w++) {
    const phase = phaseForWeek(w);
    weeklyFocus.push(`Week ${w} (${phase}): core ${subject} concepts, then spaced review of week ${Math.max(1, w - 2)}–${w - 1}`);
  }

  // Task skeleton scales with difficulty and level
  const levelFactor = currentLevel === "beginner" ? 1.3 : currentLevel === "advanced" ? 0.8 : 1;
  const units = Math.max(4, Math.min(24, Math.round(weeks * (2 + difficulty * 0.6) * levelFactor)));

  const tasks: PlannedTask[] = [];
  let day = 2;

  for (let i = 1; i <= units; i++) {
    const phase = phaseForWeek((i / units) * weeks);
    const isReview = i % 3 === 0;
    const isMock = i === units || (i === Math.floor(units * 0.7) && weeks >= 4);
    const isProject = !isReview && !isMock && i % 5 === 0;

    const type = isMock ? "mock_exam" : isReview ? "review" : isProject ? "project" : difficulty >= 4 ? "practice" : "read";
    const title = isMock
      ? `${subject} mock exam ${isMock && i === units ? "(final dress rehearsal)" : ""}`
      : isReview
        ? `Spaced review: units ${Math.max(1, i - 3)}–${i - 1} of ${subject}`
        : isProject
          ? `Build a ${subject} mini-project applying units ${Math.max(1, i - 4)}–${i}`
          : `${subject} unit ${i}: ${phase === "Foundation" ? "learn core concepts" : phase === "Deep Practice" ? "worked problems" : phase === "Integration" ? "cross-topic synthesis" : "high-yield rapid drills"}`;

    tasks.push({
      title: title.trim(),
      type,
      priority: isMock ? 1 : isReview ? 2 : difficulty >= 4 ? 1 : 2,
      estimateMin: Math.min(cap, isMock ? 120 : isReview ? 30 : 45 + Math.round(difficulty * 6)),
      dueInDays: day,
      phase
    });
    day += Math.max(1, Math.round(7 / (hoursPerWeek >= 10 ? 4 : hoursPerWeek >= 5 ? 3 : 2)));
    if (day > weeks * 7) day = weeks * 7;
  }

  const summary = `A ${weeks}-week roadmap for ${subject} tuned for a ${currentLevel} learner at difficulty ${difficulty}/5. Budget: ~${hoursPerWeek}h/week (${Math.round(totalMin / 60)}h total) split across ${PHASES.join(" → ")}, with spaced reviews every third task${weaknesses ? ` and extra reps targeting: ${weaknesses}` : ""}.`;

  return {
    title: `${subject} — ${weeks}-week mastery plan`,
    summary,
    strategy: {
      weeklyFocus,
      reviewCadence: "Every 3rd session reviews material from 2 units back (expanding interval: 2d → 4d → 7d).",
      examTactics:
        weeks >= 4
          ? "Final 15% of time: two timed mock exams, error-log autopsy, and one-page formula/summary sheets."
          : "Compress: one diagnostic drill up front, one mock at 70% mark, and daily 15-min rapid recall."
    },
    tasks,
    engine: "heuristic"
  };
}

export async function planSubject(input: PlannerInput): Promise<PlanDraft> {
  const system = `You are Athena, an expert learning scientist and curriculum designer. Design study plans using spaced repetition, active recall, interleaving, and deliberate practice. Respond ONLY with compact JSON matching this TypeScript type (no markdown fences, no commentary):
{
  title: string; summary: string;
  strategy: { weeklyFocus: string[]; reviewCadence: string; examTactics: string };
  tasks: { title: string; type: "read"|"practice"|"review"|"project"|"mock_exam"; priority: 1|2|3; estimateMin: number; dueInDays: number; phase: string }[]
}
Rules: tasks must be concrete and actionable; dueInDays starts at 1-2 and spreads evenly to the horizon; estimateMin 25..120; include reviews every ~3 tasks and at least one mock_exam if horizon >= 3 weeks; phases progress Foundation -> Deep Practice -> Integration -> Exam Sprint.`;

  const user = `Subject: ${input.subject}
Difficulty (1-5): ${input.difficulty}
Horizon: ${input.weeks} weeks
Available: ${input.hoursPerWeek} hours/week
Learner level: ${input.currentLevel}
Weaknesses to target: ${input.weaknesses || "unknown"}`;

  const raw = await llmComplete(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    { maxTokens: 2500, temperature: 0.55 }
  );

  if (raw) {
    try {
      const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
      const parsed = llmPlanSchema.parse(JSON.parse(cleaned));
      return { ...parsed, engine: "llm" };
    } catch {
      // fall through to heuristic
    }
  }

  return heuristicPlan(input);
}
