# MeritView

MeritView is a dispute-resolution web app that gives two parties in a disagreement a fast, neutral, AI-generated opinion on the merits of their case.

Each side privately writes a structured brief (facts, position, arguments, acknowledgment of the other side, desired outcome), optionally with the help of an AI writing assistant. Once both briefs are submitted, a panel of independent LLM judges (Claude, GPT-4, and Gemini, via OpenRouter) scores each side, and the results are aggregated into a single opinion: a point-based verdict, an inter-judge agreement score, and a neutral narrative summary — all clearly framed as argument analysis, not legal advice.

> [!NOTE]
> This is an MVP under active development. See [Project status](#project-status) for what is and isn't finished yet.

## How it works

1. **Create a dispute** — the initiator describes the case (title, category, summary, stakes) and pays for analysis via Stripe Checkout.
2. **Invite the counterparty** — an invitation link is emailed to the other side; they accept or decline (declining refunds the initiator automatically).
3. **Write briefs** — both parties independently write a brief in five structured sections, with an optional AI chat assistant to help them articulate their position.
4. **AI evaluation** — once both briefs are submitted, three independent LLM judges each score the case and vote a winner; an aggregator LLM combines the results into one opinion.
5. **Get the opinion** — both parties see the same result: an executive summary, a comparative assessment (winner, points, confidence, judge agreement), and a strengths/weaknesses breakdown for each side.

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, React Router, Zustand, React Query, Axios |
| Backend | Express 5, TypeScript, Prisma 7, PostgreSQL (Neon), Better Auth |
| AI | LangChain + OpenRouter (Claude, GPT-4o, Gemini) |
| Payments | Stripe (Checkout Sessions, webhooks, refunds) |
| Email | Nodemailer (SMTP) |
| Testing | Vitest, Supertest |

## Project structure

```
frontend/   Vite + React SPA
backend/    Express API, Prisma schema, business logic
docs/       Implementation notes, MVP task tracker, specs
```

## Prerequisites

- Node.js 20 or later
- A PostgreSQL database (the project is built against [Neon](https://neon.tech)'s serverless driver)
- An [OpenRouter](https://openrouter.ai) API key
- A [Stripe](https://stripe.com) account (test mode is fine for local development)
- An SMTP account for sending email (a Gmail account with an [app password](https://myaccount.google.com/apppasswords) works)

## Getting started

Clone the repo, then set up the backend and frontend in two terminals.

### 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `backend/.env` (see [Backend environment variables](#backend-environment-variables) below), then:

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # push the schema to your database
npm run dev           # start the API on http://localhost:3000
```

### 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `frontend/.env` (see [Frontend environment variables](#frontend-environment-variables) below), then:

```bash
npm run dev            # start the Vite dev server
```

Open the URL Vite prints (defaults to `http://localhost:5173`) and sign up for an account to get started.

> [!IMPORTANT]
> Backend auth routes are mounted at `/api/auth/*`. The frontend's `VITE_BETTER_AUTH_URL` and `VITE_API_BASE_URL` should both point at the backend's base URL (e.g. `http://localhost:3000`), and `CORS_ORIGIN`/`APP_URL` on the backend should point at the frontend's URL.

### Backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Port the API listens on. Defaults to `3000`. |
| `NODE_ENV` | `development` or `production`. Controls whether stack traces are exposed in error responses. |
| `DATABASE_URL` | PostgreSQL connection string (Neon connection string recommended). |
| `CORS_ORIGIN` | Origin allowed to call the API — set to your frontend's URL. |
| `RATE_LIMIT_WINDOW_MS` | Rate-limiter window in milliseconds. Defaults to `900000` (15 min). |
| `RATE_LIMIT_MAX` | Max requests per window per client. Defaults to `100`. |
| `APP_URL` | Public URL of the frontend app, used to build links in emails (invitations, checkout redirects). |
| `SMTP_HOST` | SMTP server host for sending transactional email. |
| `SMTP_PORT` | SMTP server port (typically `587`). |
| `SMTP_SECURE` | `true`/`false` — whether to use TLS/SSL. |
| `SMTP_USER` | SMTP auth username. |
| `SMTP_PASS` | SMTP auth password (e.g. a Gmail app password). |
| `SMTP_FROM` | "From" header on outgoing email, e.g. `MeritView <your@gmail.com>`. |
| `OPENROUTER_API_KEY` | API key for [OpenRouter](https://openrouter.ai), used for the AI brief assistant and the three AI evaluators. |
| `STRIPE_SECRET_KEY` | Stripe secret key. Use a restricted `rk_test_...` key in development. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for verifying Stripe webhook events (`whsec_...`). |
| `STRIPE_PRICE_STANDARD_CENTS` | Price, in cents, for the standard analysis tier. Defaults to `9900` ($99). |

> [!TIP]
> To test Stripe webhooks locally, forward events with the [Stripe CLI](https://docs.stripe.com/stripe-cli): `stripe listen --forward-to localhost:3000/v1/webhooks/stripe`.

### Frontend environment variables

Copy `frontend/.env.example` to `frontend/.env` and fill in:

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API. Defaults to `http://localhost:3000`. |
| `VITE_BETTER_AUTH_URL` | Base URL the Better Auth client talks to for sign-up/sign-in/session. Usually the same as `VITE_API_BASE_URL`. |
| `VITE_APP_NAME` | Display name shown in the app. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...` in development), required to render the Checkout payment step. |

## Common commands

**Frontend** (run from `frontend/`):

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

**Backend** (run from `backend/`):

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run db:generate` | Regenerate the Prisma client from the schema |
| `npm run db:migrate` | Create and apply a dev migration |
| `npm run db:push` | Push the schema to the database without a migration |
| `npm run db:studio` | Open Prisma Studio |

> [!WARNING]
> The backend test suite is an integration suite: it runs against a real database and calls real LLM providers through OpenRouter, rather than mocking them. Make sure `DATABASE_URL` and `OPENROUTER_API_KEY` are set before running `npm test`, and expect API usage costs.

## Using the app

### Creating and paying for a dispute

From the dashboard, start **New Dispute** and complete the four-step wizard: dispute details, summary and stakes, counterparty contact info, and payment via Stripe. The dispute is only created once payment succeeds (handled by the Stripe webhook), and an invitation email is sent to the counterparty automatically.

### Inviting and onboarding the counterparty

The counterparty receives an emailed link to `/invite/:token`, where they can review the dispute summary and accept or decline. Accepting takes them straight into their own brief; declining cancels the dispute and refunds the initiator.

### Writing a brief

Each party gets a private brief-writing workspace with two panes:

- **AI assistant** — a streaming chat assistant (choice of Claude, GPT-4, or Gemini) that helps you think through and phrase your argument.
- **Structured editor** — five sections: Facts, Position, Arguments, Acknowledgment of the other side, and Desired Outcome. Drafts autosave every 60 seconds, with a 5,000-word cap.

Briefs are private until both sides submit; submitting locks the brief permanently.

### Getting the opinion

Once both briefs are submitted, evaluation starts automatically. The opinion page shows live progress as each of the three AI judges finishes, then displays the combined result:

- An executive summary and neutral narrative
- A comparative assessment: winner, points per side, confidence score, and inter-judge agreement
- Expandable strengths/weaknesses/considerations for each party

### Managing disputes and billing

The dashboard lists all of a user's disputes with their current status (draft, awaiting counterparty, in progress, under analysis, completed, cancelled, or refunded). Payment history is available under **Settings → Billing**.

## Project status

The core product loop is functionally complete: authentication, paid dispute creation, invitations, brief writing with AI assistance, the three-judge AI evaluation engine, opinion delivery, and transactional email are all implemented and tested.

Not yet implemented:

- Account/profile settings (password change, account deletion, privacy settings)
- PDF export of the opinion, and the "Request re-analysis" upsell
- Google OAuth and guest/invitation-only sign-in
- General mobile responsiveness and error-state polish

See `docs/MVP_TODO.md` for the full, up-to-date task breakdown.
