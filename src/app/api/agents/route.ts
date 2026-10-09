import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";
import { AGENTS } from "@/lib/agents/registry";
import { llmStatus } from "@/lib/llm";
import { onboardingPipeline } from "@/lib/agents/orchestrator";

export async function GET() {
  return handle(async () => {
    const events = await prisma.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
    return ok({ agents: AGENTS, events, llm: llmStatus() });
  });
}

const onboardSchema = z.object({
  name: z.string().min(2),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  difficulty: z.number().int().min(1).max(5),
  examDate: z.string().datetime().nullable().optional(),
  weeks: z.number().int().min(1).max(52),
  hoursPerWeek: z.number().int().min(1).max(80),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  weaknesses: z.string().max(500).optional()
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid onboarding payload", 422);

    const user = await getUser();
    const result = await onboardingPipeline({
      userId: user.id,
      name: parsed.data.name,
      color: parsed.data.color,
      difficulty: parsed.data.difficulty,
      examDate: parsed.data.examDate ? new Date(parsed.data.examDate) : null,
      weeks: parsed.data.weeks,
      hoursPerWeek: parsed.data.hoursPerWeek,
      level: parsed.data.level,
      weaknesses: parsed.data.weaknesses
    });
    return ok(result, 201);
  });
}
