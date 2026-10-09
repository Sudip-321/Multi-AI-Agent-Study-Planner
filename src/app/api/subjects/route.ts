import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    const subjects = await prisma.subject.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { tasks: true, flashcards: true, decks: true } },
        plans: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "asc" }
    });
    return ok({ subjects });
  });
}

const subjectSchema = z.object({
  name: z.string().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  difficulty: z.number().int().min(1).max(5).default(3),
  examDate: z.string().datetime().nullable().optional()
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = subjectSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid subject payload", 422);

    const subject = await prisma.subject.create({
      data: {
        name: parsed.data.name,
        color: parsed.data.color,
        difficulty: parsed.data.difficulty,
        examDate: parsed.data.examDate ? new Date(parsed.data.examDate) : null,
        userId: user.id
      }
    });
    return ok(subject, 201);
  });
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid delete payload", 422);

    const existing = await prisma.subject.findFirst({ where: { id: parsed.data.id, userId: user.id } });
    if (!existing) return fail("Subject not found", 404);

    await prisma.subject.delete({ where: { id: parsed.data.id } });
    return ok({ deleted: parsed.data.id });
  });
}
