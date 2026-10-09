// ─────────────────────────────────────────────────────────────
// LLM abstraction layer — the "genius" of the hybrid engine.
// If an API key exists, agents get real LLM reasoning. If not,
// they fall back to deterministic expert-system logic so the
// app ALWAYS works, offline, with zero cost.
// ─────────────────────────────────────────────────────────────

export type LlmMessage = { role: "system" | "user"; content: string };

export type LlmStatus = {
  available: boolean;
  provider: "openai" | "anthropic" | "none";
  model: string;
};

export function llmStatus(): LlmStatus {
  const openai = !!process.env.OPENAI_API_KEY;
  const anthropic = !!process.env.ANTHROPIC_API_KEY;
  const requested = (process.env.LLM_PROVIDER || "openai").toLowerCase();

  if (requested === "anthropic" && anthropic) {
    return { available: true, provider: "anthropic", model: process.env.LLM_MODEL || "claude-3-5-haiku-20241022" };
  }
  if (requested === "openai" && openai) {
    return { available: true, provider: "openai", model: process.env.LLM_MODEL || "gpt-4o-mini" };
  }
  // fall back to whatever key exists
  if (openai) return { available: true, provider: "openai", model: process.env.LLM_MODEL || "gpt-4o-mini" };
  if (anthropic) return { available: true, provider: "anthropic", model: process.env.LLM_MODEL || "claude-3-5-haiku-20241022" };

  return { available: false, provider: "none", model: "heuristic-v2" };
}

export async function llmComplete(
  messages: LlmMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const status = llmStatus();
  if (!status.available) return null;

  const maxTokens = opts.maxTokens ?? 1200;
  const temperature = opts.temperature ?? 0.6;

  try {
    if (status.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: status.model,
          messages,
          max_tokens: maxTokens,
          temperature
        })
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return json.choices?.[0]?.message?.content?.trim() || null;
    }

    if (status.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: status.model,
          max_tokens: maxTokens,
          temperature,
          system: messages.find((m) => m.role === "system")?.content,
          messages: messages
            .filter((m) => m.role === "user")
            .map((m) => ({ role: "user", content: m.content }))
        })
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: { text?: string }[] };
      return json.content?.map((c) => c.text || "").join("").trim() || null;
    }
  } catch {
    return null; // graceful degradation to heuristics
  }

  return null;
}
