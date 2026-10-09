import { prisma } from "@/lib/prisma";
import { ok, handle, getUser } from "@/lib/api-helpers";
import { coachSignal } from "@/lib/agents/coach";
import { analyze } from "@/lib/agents/analyst";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    const [coach, analytics, exams, schedule] = await Promise.all([
      coachSignal(user.id),
      analyze(user.id),
      prisma.exam.findMany({ orderBy: { date: "asc" }, take: 10 }),
      prisma.subject.findMany({
        where: { userId: user.id },
        orderBy: [{ examDate: { sort: "asc", nulls: "last" } }]
      })
    ]);

    const today = new Date().toDateString();
    const todaySessions = await prisma.session.findMany({
      where: { userId: user.id, startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
    });
    const focusMinutesToday = todaySessions.reduce((a, s) => a + s.minutes, 0);

    return ok({ user, coach, analytics, exams, subjects: schedule, focusMinutesToday });
  });
}
