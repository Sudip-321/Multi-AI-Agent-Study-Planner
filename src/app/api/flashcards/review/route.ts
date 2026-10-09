import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, handle } from "@/lib/api-helpers";

const LEITNER_INTERVALS_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 14
};

const reviewSchema = z.object({
  cardId: z.string().min(1),
  result: z.enum(["hit", "miss"])
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid review payload", 422);

    const card = await prisma.flashcard.findUnique({ where: { id: parsed.data.cardId } });
    if (!card) return fail("Card not found", 404);

    const nextBox = parsed.data.result === "hit" ? Math.min(5, card.box + 1) : 1;
    const intervalDays = LEITNER_INTERVALS_DAYS[nextBox] ?? 1;

    const updated = await prisma.flashcard.update({
      where: { id: card.id },
      data: {
        box: nextBox,
        nextReview: new Date(Date.now() + intervalDays * 86400000),
        lastResult: parsed.data.result,
        streak: parsed.data.result === "hit" ? card.streak + 1 : 0
      }
    });
    return ok(updated);
  });
}
