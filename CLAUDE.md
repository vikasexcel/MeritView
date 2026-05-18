# MeritView Agent Guide

MeritView is a responsive React web app with a Node/Express API for a dispute-resolution MVP. Product context lives in `CLIENT.md`; check it before making product or workflow decisions.

## Project Layout

- `frontend/`: Vite + React 19 + TypeScript app using Tailwind CSS v4, shadcn components, React Router, Zustand, Axios, and Better Auth client helpers.
- `backend/`: Express 5 + TypeScript API using Better Auth, Prisma 7, PostgreSQL/Neon, Vitest, and Supertest.
- `docs/`: implementation notes, MVP tasks, specs, and plans.

## Common Commands

- Frontend: `cd frontend && npm install`, `npm run dev`, `npm run build`, `npm run lint`
- Backend: `cd backend && npm install`, `npm run dev`, `npm run build`, `npm test`
- Database: from `backend/`, use `npm run db:generate`, `npm run db:migrate`, `npm run db:push`, `npm run db:studio`

## Environment

- Backend env starts from `backend/.env.example`.
- Frontend env starts from `frontend/.env.example`.
- Do not commit `.env` files or secrets.

## Repo Gotchas

- Keep imports at the top of files.
- Better Auth is used, not NextAuth.
- Backend auth routes are mounted at `/api/auth/{*any}` and frontend API defaults to `http://localhost:3000`.
- Preserve package boundaries: run package commands from `frontend/` or `backend/`.

## Agent Behavior

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.