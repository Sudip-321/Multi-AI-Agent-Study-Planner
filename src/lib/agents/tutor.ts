import { z } from "zod";
import { llmComplete } from "../llm";

export type GeneratedCard = { front: string; back: string };

const llmCardSchema = z.object({
  cards: z.array(z.object({ front: z.string().min(2), back: z.string().min(1) })).min(1).max(20)
});

export type TutorInput = {
  topic: string;
  subject: string;
  count: number;
  context?: string;
};

const STOP = new Set([
  "the", "and", "for", "with", "what", "why", "how", "define", "explain", "list",
  "describe", "compare", "of", "in", "to", "a", "an", "is", "are", "on", "by"
]);

function keywordize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function heuristicCards(input: TutorInput): GeneratedCard[] {
  const kw = keywordize(`${input.topic} ${input.context || ""}`);
  const unique = [...new Set(kw)].slice(0, input.count);
  const cards: GeneratedCard[] = [];
  const topic = input.topic.trim();

  const templates: { front: (t: string) => string; back: (t: string) => string }[] = [
    { front: (t) => `In one clear sentence, define: ${t}`, back: (t) => `${t}: core concept in ${topic}. Recall your definition aloud, then check your notes.` },
    { front: (t) => `Why does ${t} matter in ${topic}?`, back: (t) => `${t} connects foundational ideas to applications in ${topic}. Cite one concrete example.` },
    { front: (t) => `Give one concrete example of ${t}.`, back: (t) => `Examples anchor ${t} in memory. Compare your example with the textbook's.` },
    { front: (t) => `Common mistake involving ${t}?`, back: (t) => `A frequent error with ${t} is misapplying it outside its conditions. Review the conditions first.` },
    { front: (t) => `How would you teach ${t} to a beginner?`, back: (t) => `Teaching = deepest recall. Sketch a 3-step explanation of ${t} from first principles.` }
  ];

  unique.forEach((k, i) => {
    const t = templates[i % templates.length];
    cards.push({ front: t.front(k), back: t.back(k) });
  });

  // Guarantee at least a few even with sparse input
  while (cards.length < Math.min(input.count, 3)) {
    const i = cards.length;
    cards.push({
      front: `State the 3 key ideas of ${topic} (part ${i + 1}).`,
      back: `Part ${i + 1} of the core summary of ${topic}. Verify against your notes.`
    });
  }
  return cards;
}

export async function generateCards(input: TutorInput): Promise<{ cards: GeneratedCard[]; engine: "llm" | "heuristic" }> {
  const system = `You are Sage, an expert in active recall and evidence-based learning. Generate high-quality flashcards: atomic (one idea per card), precise, and phrased as questions or prompts. Respond ONLY with JSON: {"cards":[{"front":string,"back":string}]}. No markdown fences.`;

  const user = `Subject: ${input.subject}
Topic: ${input.topic}
Context/syllabus excerpt: ${input.context || "(none provided)"}
Generate exactly ${input.count} flashcards.`;

  const raw = await llmComplete(
    [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    { maxTokens: 1400, temperature: 0.7 }
  );

  if (raw) {
    try {
      const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
      const parsed = llmCardSchema.parse(JSON.parse(cleaned));
      return { cards: parsed.cards, engine: "llm" };
    } catch {
      // fall through
    }
  }
  return { cards: heuristicCards(input), engine: "heuristic" };
}
