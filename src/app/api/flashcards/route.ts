import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle, getUser } from "@/lib/api-helpers";
import { generateCards } from "@/lib/agents/tutor";
import { logEvent } from "@/lib/agents/orchestrator";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "due";

    if (mode === "due") {
      const due = await prisma.flashcard.findMany({
        where: { subject: { userId: user.id }, nextReview: { lte: new Date() } },
        include: { deck: true, subject: true },
        orderBy: { nextReview: "asc" },
        take: 40
      });
      const total = await prisma.flashcard.count({ where: { subject: { userId: user.id } } });
      return ok({ due, total });
    }

    const decks = await prisma.deck.findMany({
      where: { subject: { userId: user.id } },
      include: { subject: true, _count: { select: { cards: true } } },
      orderBy: { createdAt: "desc" }
    });
    return ok({ decks });
  });
}

const generateSchema = z.object({
  action: z.literal("generate"),
  subjectId: z.string().min(1),
  topic: z.string().min(2).max(120),
  count: z.number().int().min(3).max(20).default(8),
  context: z.string().max(2000).optional()
});

const manualSchema = z.object({
  action: z.literal("manual"),
  subjectId: z.string().min(1),
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(1000)
});

const bodySchema = z.discriminatedUnion("action", [generateSchema, manualSchema]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getUser();
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return fail("Invalid flashcard payload", 422);

    const subject = await prisma.subject.findFirst({ where: { id: parsed.data.subjectId, userId: user.id } });
    if (!subject) return fail("Subject not found", 404);

    if (parsed.data.action === "manual") {
      const deck = await ensureDeck(subject.id, subject.name);
      const card = await prisma.flashcard.create({
        data: {
          front: parsed.data.front,
          back: parsed.data.back,
          deckId: deck.id,
          subjectId: subject.id
        }
      });
      return ok(card, 201);
    }

    const { cards, engine } = await generateCards({
      topic: parsed.data.topic,
      subject: subject.name,
      count: parsed.data.count,
      context: parsed.data.context
    });

    const deck = await ensureDeck(subject.id, subject.name);
    const created = await prisma.flashcard.createMany({
      data: cards.map((c) => ({ front: c.front, back: c.back, deckId: deck.id, subjectId: subject.id }))
    });

    await logEvent({
      agent: "tutor",
      action: "generated flashcards",
      detail: `${created.count} cards for "${parsed.data.topic}" · engine=${engine}`
    });

    return ok({ count: created.count, engine, deck }, 201);
  });
}

async function ensureDeck(subjectId: string, subjectName: string) {
  const existing = await prisma.deck.findFirst({ where: { subjectId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.deck.create({ data: { name: `${subjectName} — Deck`, subjectId } });
}
