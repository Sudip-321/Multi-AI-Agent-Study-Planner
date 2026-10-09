import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle } from "@/lib/api-helpers";

export async function GET() {
  return handle(async () => {
    const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
    return ok({ exams });
  });
}

const examSchema = z.object({
  title: z.string().min(2).max(120),
  date: z.string().datetime(),
  subjectId: z.string().nullable().optional(),
  weight: z.number().int().min(1).max(5).default(1)
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const parsed = examSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid exam payload", 422);

    const exam = await prisma.exam.create({
      data: {
        title: parsed.data.title,
        date: new Date(parsed.data.date),
        subjectId: parsed.data.subjectId ?? null,
        weight: parsed.data.weight
      }
    });
    return ok(exam, 201);
  });
}
