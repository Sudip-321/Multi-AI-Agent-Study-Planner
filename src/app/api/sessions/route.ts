import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { task: { include: { subject: true } } }
    });
    return ok({ sessions });
  });
}

const sessionSchema = z.object({
  minutes: z.number().int().min(1).max(600),
  focusScore: z.number().int().min(0).max(100).default(80),
  taskId: z.string().nullable().optional(),
  notes: z.string().max(1000).optional()
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid session payload", 422);

    const session = await prisma.session.create({
      data: {
        minutes: parsed.data.minutes,
        focusScore: parsed.data.focusScore,
        taskId: parsed.data.taskId ?? null,
        notes: parsed.data.notes,
        userId: user.id
      }
    });

    // Any logged session updates streak date + XP
    const xpGain = Math.max(5, Math.round(parsed.data.minutes / 2));
    await prisma.user.update({
      where: { id: user.id },
      data: { xp: { increment: xpGain }, lastStudyDate: new Date() }
    });
    await recomputeStreakAndLevel(user.id);

    return ok(session, 201);
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function isYesterday(a: Date): boolean {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return a.toDateString() === y.toDateString();
}

async function recomputeStreakAndLevel(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const level = Math.max(1, Math.floor(user.xp / 100) + 1);
  let streak = user.streak;
  const last = user.lastStudyDate;
  if (!last) streak = 1;
  else if (isSameDay(last, new Date())) {
    // same-day session: streak unchanged
  } else if (isYesterday(last)) {
    streak = user.streak + 1;
  } else {
    streak = 1;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { level, streak, longestStreak: Math.max(user.longestStreak, streak) }
  });
}
