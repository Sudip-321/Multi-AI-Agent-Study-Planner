"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "◎" },
  { href: "/planner", label: "Planner", icon: "▤" },
  { href: "/schedule", label: "Schedule", icon: "▦" },
  { href: "/focus", label: "Focus", icon: "◑" },
  { href: "/flashcards", label: "Flashcards", icon: "◆" },
  { href: "/analytics", label: "Analytics", icon: "◔" },
  { href: "/agents", label: "Agent Hub", icon: "✦" }
];

type LlmInfo = { provider: string; model: string; available: boolean };

export function Nav() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [llm, setLlm] = useState<LlmInfo | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setLlm(d.llm))
      .catch(() => {});
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cortexa-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <nav className="w-60 shrink-0 border-r h-screen sticky top-0 flex flex-col p-4 gap-1 bg-surface/60">
      <div className="flex items-center gap-2 px-2 py-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-bold text-lg">C</div>
        <div>
          <div className="font-bold leading-tight">Cortexa</div>
          <div className="text-[11px] text-muted leading-tight">Multi-Agent Study OS</div>
        </div>
      </div>

      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
            pathname === l.href ? "bg-raised font-semibold" : "text-muted hover:bg-raised hover:text-ink"
          }`}
        >
          <span className="text-accent">{l.icon}</span>
          {l.label}
        </Link>
      ))}

      <div className="mt-auto space-y-2">
        {llm && (
          <div className="rounded-xl border p-3 text-[11px] leading-relaxed">
            <div className="flex items-center gap-2 font-semibold">
              <span className={`inline-block w-2 h-2 rounded-full ${llm.available ? "bg-good animate-pulse-soft" : "bg-warn"}`} />
              {llm.available ? `LLM: ${llm.provider}` : "Heuristic engine"}
            </div>
            <div className="text-muted mt-1">{llm.model}</div>
          </div>
        )}
        <button onClick={toggleTheme} className="btn btn-ghost w-full" aria-label="Toggle dark mode">
          {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>
    </nav>
  );
}
