# 🧠 Cortexa — Multi-Agent Study Planner

Cortexa is a full-stack study operating system run by a crew of **six specialised AI agents**.
You describe a subject once; the agents decompose it into a spaced study roadmap, pack your week,
write flashcards, coach your streaks, and analyse how you actually study.

The headline design idea: the agent engine is **hybrid**. Every agent tries a real LLM first
(if you provide a key) and otherwise falls back to deterministic expert-system logic — so the app
is **fully functional, offline, and free out of the box**, and upgrades to LLM reasoning with
**zero code changes**.

> Built with Next.js 14 (App Router) · TypeScript · Prisma + SQLite · Tailwind · Recharts

---

## ✨ Features

| Page | What it does |
| --- | --- |
| **Dashboard** | Coach brief, today's focus, streak, level/XP, tasks pending, cards due, exam-readiness forecast, Vector's insights. |
| **Planner** | Describe a subject → Athena generates a phased roadmap, Conductor persists tasks, Chronos packs the week, Sage seeds a deck. |
| **Schedule** | Chronos' time-blocked weekly board + daily-load profile, with an "hours/week" control to re-pack the week. |
| **Focus** | Pomodoro / deep-work / quick-review timer with a WebAudio chime; finished sessions award XP and update streaks. |
| **Flashcards** | Sage generates cards; a **Leitner box** system (5 boxes, 1/2/4/7/14-day intervals) schedules reviews. |
| **Analytics** | 30-day focus trend, time by subject (donut), task mix (bar), review backlog, forecast readiness — all via Recharts. |
| **Agent Hub** | The six agents, their skills, the live reasoning-engine badge, and an auditable **event bus**. |
| Dark / light mode | CSS-variable theming, persisted in `localStorage` (`cortexa-theme`), no flash on load. |

---

## 🤖 The agent crew

| Agent | Role | Responsibility |
| --- | --- | --- |
| 🧠 **Athena** | Master Planner | Decomposes a subject into a spaced, prioritised roadmap across phases **Foundation → Deep Practice → Integration → Exam Sprint**. |
| ⏱️ **Chronos** | Time Architect | Packs open tasks into your calendar around availability + energy curves (deep work to peak hours, reviews to dips). |
| 📚 **Sage** | Active-Recall Tutor | Generates flashcards and quizzes from your material; drives Leitner scheduling. |
| 🔥 **Ember** | Motivation Coach | Watches streaks and morale; produces `celebrate / encourage / urgent / steady` signals. |
| 📊 **Vector** | Performance Analyst | Mines sessions for trends, bottlenecks, and an exam-readiness forecast. |
| 🎼 **Conductor** | Orchestrator | Routes work between agents, runs the pipelines, and writes every run to the event bus. |

Registry: [`src/lib/agents/registry.ts`](src/lib/agents/registry.ts)

---

## 🧩 The hybrid engine

```
src/lib/llm.ts  ──►  llmStatus()  ·  llmComplete()
                        │
        key present ────┴──── no key
             │                    │
     real LLM reasoning     deterministic heuristic
     (OpenAI / Anthropic)   expert-system logic
             │                    │
             └──── same agent API ─┘
```

- Each agent calls `llmComplete()` and, **on any failure** (no key, HTTP error, bad JSON), falls
  back to its deterministic heuristic so a single agent can never break a pipeline.
- Planner output from the LLM is validated with **zod** before use; invalid shapes fall back too.
- The UI always shows which engine is live (`heuristic-v2` vs. the model name) on the Agent Hub.

Supported providers (selected by `LLM_PROVIDER`):

| Provider | Default model | Env var |
| --- | --- | --- |
| `openai` (default) | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `anthropic` | `claude-3-5-haiku-20241022` | `ANTHROPIC_API_KEY` |

Override the model with `LLM_MODEL`. See [`.env.example`](.env.example).

---

## 🚀 Quickstart

```bash
npm install
npm run db:push     # create prisma/dev.db from the schema
npm run seed        # seed a demo learner + study history (runs the real pipelines)
npm run dev         # http://localhost:3000
```

Requirements: Node 18.17+ (uses the Next.js 14 App Router). No database server needed — SQLite.

There is a **single local-first demo user** (`student@cortexa.app`, "Maya"), so there is no auth to
configure. `getUser()` in [`src/lib/api-helpers.ts`](src/lib/api-helpers.ts) resolves (and lazily
creates) that user.

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server on port 3000. |
| `npm run build` | `prisma generate && next build`. |
| `npm start` | Production server. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run seed` | Seed demo data through the real agent pipelines. |
| `npm run db:push` | Sync schema to SQLite. |
| `npm run db:studio` | Prisma Studio. |
| `npm run db:reset` | Delete `prisma/dev.db` and re-create it. |

---

## 🔁 Agent pipelines

All pipelines live in [`src/lib/agents/orchestrator.ts`](src/lib/agents/orchestrator.ts). Every step
is written to the `AgentLog` event bus, which powers the Agent Hub and the dashboard activity feed.

**1 · Subject onboarding** — triggered from the Planner.
```
Athena drafts roadmap
   → Conductor persists subject + plan + tasks
      → Chronos packs the coming week
         → Sage seeds a starter deck
```

**2 · Reschedule** — triggered by "Repack week" on the Schedule page.
```
Chronos re-packs all open tasks against your hours/week budget
```

**3 · Daily brief** — triggered by "Run agent brief" on the Dashboard / Agent Hub.
```
Ember (coach signal)  +  Vector (analytics)  →  a single morning brief
```

---

## 🗄️ Data model

Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma)

| Model | Purpose |
| --- | --- |
| `User` | Learner profile: `xp`, `level`, `streak`, `longestStreak`, `lastStudyDate`, `hoursPerWeek`. |
| `Subject` | A course with `color`, `difficulty` (1–5), optional `examDate`. |
| `Plan` | One generated roadmap per subject (`summary` + JSON `strategy`). |
| `Task` | `read \| practice \| review \| project \| mock_exam`, priority, status, estimate. |
| `Session` | A focus/Pomodoro session with `minutes` + `focusScore`. |
| `Deck` / `Flashcard` | Cards with Leitner `box`, `nextReview`, `lastResult`, `streak`. |
| `Exam` | Exam date + `weight`, used for readiness forecasting. |
| `AgentLog` | The event bus: `agent`, `action`, `detail` for every agent run. |

---

## 🔌 API reference

All routes live under `src/app/api/` and return JSON via `ok()` / `fail()` helpers.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe. |
| `GET` | `/api/agents` | Agent registry, recent events, LLM status. |
| `POST` | `/api/agents` | Run the onboarding pipeline (zod-validated payload). |
| `GET` `POST` | `/api/subjects` | List / create subjects. |
| `DELETE` | `/api/subjects` | Delete a subject (cascades to its plans, tasks, decks, cards). |
| `GET` `POST` `PATCH` `PUT` | `/api/tasks` | List · create · update status (awards **XP + streak**) · reschedule week. |
| `GET` `POST` | `/api/sessions` | List focus sessions · log one (recomputes XP + streak). |
| `GET` | `/api/flashcards?mode=due\|decks` | Due cards or all decks. |
| `POST` | `/api/flashcards` | `action: "generate"` (Sage) or `"manual"`. |
| `POST` | `/api/flashcards/review` | Record a `hit`/`miss` → advance/reset the Leitner box. |
| `GET` | `/api/stats` | Dashboard aggregates + coach signal + analytics. |
| `POST` | `/api/brief` | Run the daily-brief pipeline. |
| `GET` `POST` | `/api/exams` | List / create exams. |
| `GET` `PUT` | `/api/schedule` | Get the packed week · set `hoursPerWeek` and repack. |

---

## 📁 Project structure

```
prisma/
  schema.prisma          # SQLite data model
  seed.ts                # demo seeding (runs the real pipelines)
src/
  app/
    layout.tsx           # shell + theme bootstrap script
    page.tsx             # Dashboard
    planner/ schedule/ focus/ flashcards/ analytics/ agents/
    api/…                # 12 route handlers (see API reference)
  components/
    Nav.tsx              # sidebar, theme toggle, engine indicator
    ui.tsx               # PageHeader, StatCard, Section, ProgressBar, EmptyState
  lib/
    prisma.ts            # singleton client
    llm.ts               # hybrid LLM provider layer
    api-helpers.ts       # getUser / ok / fail / handle
    agents/
      registry.ts  planner.ts  scheduler.ts  tutor.ts
      coach.ts     analyst.ts  orchestrator.ts
```

---

## 🧠 Design notes

- **XP & streaks** are recomputed on both task completion and session logging, so the gamification
  layer stays consistent regardless of which surface you act from.
- **Leitner scheduling**: a `hit` moves a card up a box (longer interval), a `miss` resets it to box 1.
- **Energy-aware scheduling**: Chronos assigns `deep` work to peak-energy hours and `review`/`light`
  work to the dips, respecting an 8:00–21:00 window.
- **Graceful LLM degradation** means you can ship/demo the app with no keys and no network, then add
  a key to unlock richer reasoning — the deterministic logic is a genuine fallback, not a stub.

---

## 🛠️ Verified

- `npx tsc --noEmit` — clean.
- `npm run build` — production build succeeds.
- `npm run seed` — demo data created through the real pipelines.
- Manually exercised in the browser: agent-brief pipeline, planner generation, Leitner review,
  schedule repack UI, analytics charts, and the light/dark toggle.
