import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";
import { scheduleWeek, type SchedulerTask } from "@/lib/agents/scheduler";
import { logEvent } from "@/lib/agents/orchestrator";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    const tasks = (await prisma.task.findMany({
      where: { userId: user.id, status: { in: ["todo", "doing"] } },
      include: { subject: true }
    })) as SchedulerTask[];

    const schedule = scheduleWeek(tasks, user.hoursPerWeek);
    return ok(schedule);
  });
}

const prefsSchema = z.object({
  hoursPerWeek: z.number().int().min(1).max(80)
});

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = prefsSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid preferences", 422);

    await prisma.user.update({ where: { id: user.id }, data: { hoursPerWeek: parsed.data.hoursPerWeek } });

    const tasks = (await prisma.task.findMany({
      where: { userId: user.id, status: { in: ["todo", "doing"] } },
      include: { subject: true }
    })) as SchedulerTask[];

    const schedule = await scheduleWeekAsync(tasks, parsed.data.hoursPerWeek);
    await logEvent({
      agent: "scheduler",
      action: "repacked week",
      detail: `${schedule.blocks.length} blocks at ${parsed.data.hoursPerWeek}h/week`
    });
    return ok(schedule);
  });
}

// Small indirection so PUT can log after scheduling
async function scheduleWeekAsync(tasks: SchedulerTask[], hoursPerWeek: number) {
  return scheduleWeek(tasks, hoursPerWeek);
}
