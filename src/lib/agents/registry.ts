export const AGENTS = [
  {
    id: "planner",
    name: "Athena",
    role: "Master Planner",
    color: "#6366f1",
    emoji: "🧠",
    tagline: "Decomposes subjects into a spaced, prioritized study roadmap.",
    skills: ["task decomposition", "spaced scheduling", "exam weighting"]
  },
  {
    id: "scheduler",
    name: "Chronos",
    role: "Time Architect",
    color: "#06b6d4",
    emoji: "⏱️",
    tagline: "Packs tasks into your calendar around availability & energy curves.",
    skills: ["time-blocking", "energy-aware ordering", "deadline pressure"]
  },
  {
    id: "tutor",
    name: "Sage",
    role: "Active-Recall Tutor",
    color: "#10b981",
    emoji: "📚",
    tagline: "Generates flashcards and quizzes from what you're studying.",
    skills: ["flashcard generation", "question design", "Leitner scheduling"]
  },
  {
    id: "coach",
    name: "Ember",
    role: "Motivation Coach",
    color: "#f59e0b",
    tagline: "Watches streaks and morale, and intervenes when you slip.",
    emoji: "🔥",
    skills: ["habit nudging", "streak recovery", "celebration"]
  },
  {
    id: "analyst",
    name: "Vector",
    role: "Performance Analyst",
    color: "#8b5cf6",
    emoji: "📊",
    tagline: "Mines your study sessions for trends, risks, and wins.",
    skills: ["trend detection", "bottleneck analysis", "forecasting"]
  },
  {
    id: "orchestrator",
    name: "Conductor",
    role: "Orchestrator",
    color: "#ec4899",
    emoji: "🎼",
    tagline: "Routes work between agents and reports their collaborations.",
    skills: ["agent routing", "pipeline control", "event bus"]
  }
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

export function getAgent(id: string) {
  return AGENTS.find((a) => a.id === id);
}
