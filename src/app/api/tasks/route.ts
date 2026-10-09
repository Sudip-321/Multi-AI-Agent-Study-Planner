import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";
import { reschedulePipeline } from "@/lib/agents/orchestrator";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      include: { subject: true },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }]
    });
    return ok({ tasks });
  });
}

const taskCreateSchema = z.object({
  title: z.string().min(2).max(200),
  subjectId: z.string().min(1),
  type: z.enum(["read", "practice", "review", "project", "mock_exam"]).default("practice"),
  priority: z.number().int().min(1).max(3).default(2),
  estimateMin: z.number().int().min(10).max(300).default(45),
  dueDate: z.string().datetime().nullable().optional()
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = taskCreateSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid task payload", 422);

    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        subjectId: parsed.data.subjectId,
        type: parsed.data.type,
        priority: parsed.data.priority,
        estimateMin: parsed.data.estimateMin,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        userId: user.id
      },
      include: { subject: true }
    });
    return ok(task, 201);
  });
}

const taskUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["todo", "doing", "done", "skipped"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  estimateMin: z.number().int().min(10).max(300).optional(),
  dueDate: z.string().datetime().nullable().optional()
});

export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = taskUpdateSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid task update", 422);

    const { id, ...data } = parsed.data;
    const existing = await prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!existing) return fail("Task not found", 404);

    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === "done") updateData.completedAt = new Date();
      if (data.status === "todo") updateData.completedAt = null;
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.estimateMin !== undefined) updateData.estimateMin = data.estimateMin;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const task = await prisma.task.update({ where: { id }, data: updateData, include: { subject: true } });

    // Completing a task awards XP and keeps the streak alive
    if (data.status === "done" && existing.status !== "done") {
      const xpGain = 10 + (3 - existing.priority) * 5;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          xp: { increment: xpGain },
          lastStudyDate: new Date(),
          streak: { increment: user.lastStudyDate && isSameDay(user.lastStudyDate, new Date()) ? 0 : user.lastStudyDate && isYesterday(user.lastStudyDate) ? 1 : -user.streak + 1 },
          longestStreak: { increment: 0 }
        }
      });
      await recomputeStreak(user.id);
    }

    return ok(task);
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

async function recomputeStreak(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const level = Math.max(1, Math.floor(user.xp / 100) + 1);
  const last = user.lastStudyDate;
  let streak = user.streak;
  if (last) {
    if (isSameDay(last, new Date()) || isYesterday(last)) {
      // keep or grow; growth handled above
    } else {
      streak = 1;
    }
  } else {
    streak = 1;
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      level,
      streak,
      longestStreak: Math.max(user.longestStreak, streak)
    }
  });
}

const rescheduleSchema = z.object({
  hoursPerWeek: z.number().int().min(1).max(80).optional()
});

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json().catch(() => ({}));
    const parsed = rescheduleSchema.safeParse(body);
    const hours = parsed.success && parsed.data.hoursPerWeek ? parsed.data.hoursPerWeek : user.hoursPerWeek;

    const schedule = await reschedulePipeline(user.id, hours);
    return ok(schedule);
  });
}
