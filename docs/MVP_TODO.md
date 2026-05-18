# MeritView MVP — Todo List

> **Tech Stack:** React + Vite, shadcn/ui, Tailwind v4, Zustand, React Query, Node.js, Express.js, Prisma, PostgreSQL, Better Auth, Stripe, LangChain + LangGraph, OpenRouter

---

## Phase 1: Project Setup & Foundation

### 1.1 Frontend Setup
- [x] Initialize React + Vite project
- [x] Install and configure Tailwind CSS v4
- [x] Install and configure shadcn/ui
- [x] Set up folder structure (`pages/`, `components/`, `store/`, `lib/`, `hooks/`)
- [x] Install Zustand for global state
- [x] Install React Query (TanStack Query) for server state
- [x] Set up React Router for navigation
- [x] Create base layout component (navbar, sidebar, main content area)
- [x] Set up environment variables (`.env`, `.env.example`)

### 1.2 Backend Setup
- [x] Initialize Node.js + Express.js project
- [x] Set up TypeScript config
- [x] Set up folder structure (`routes/`, `controllers/`, `services/`, `middleware/`, `prisma/`)
- [ ] Connect PostgreSQL database *(requires DATABASE_URL)*
- [x] Initialize Prisma and create base schema
- [x] Set up environment variables
- [x] Set up CORS, helmet, rate limiting middleware
- [x] Add basic health check endpoint (`GET /health`)

### 1.3 Database Schema (Prisma)
- [x] `User` table — id, email, name, role, createdAt
- [x] `Dispute` table — id, title, category, summary, state, stakes, initiatorId, createdAt
- [x] `Party` table — id, disputeId, userId, role (initiator/respondent), invitationToken, invitationStatus, briefStatus
- [x] `Brief` table — id, partyId, disputeId, content (sections JSON), wordCount, status, submittedAt
- [x] `BriefPrepSession` table — id, partyId, disputeId, llmProvider, messages JSON, totalTokens, status
- [x] `EvaluatorOutput` table — id, disputeId, llmProvider, structuredOutput JSON, promptVersion, tokensUsed, cost
- [x] `Opinion` table — id, disputeId, executiveSummary, partyAAnalysis JSON, partyBAnalysis JSON, comparativeAssessment, confidenceScore, aggregatorAgreement, deliveredAt
- [x] `Payment` table — id, disputeId, userId, amountUsd, status, stripePaymentIntentId, createdAt
- [x] `AuditEvent` table — id, eventType, actorId, resourceType, resourceId, eventData JSON, createdAt
- [ ] Run initial Prisma migration *(requires live PostgreSQL connection)*

---

## Phase 2: Authentication

### 2.1 Backend Auth (Better Auth)
- [x] Install and configure Better Auth
- [x] Set up email + password authentication
- [ ] Set up Google OAuth
- [x] Email verification flow
- [x] JWT access tokens (15 min) + refresh tokens (7 days)
- [ ] Guest/invitation token support
- [x] Auth middleware for protected routes

### 2.2 Frontend Auth
- [x] Login page (email/password)
- [x] Register page
- [x] Email verification page
- [x] Forgot password / reset password pages
- [x] Protected route wrapper component
- [x] Zustand auth store (user, token, isAuthenticated)
- [x] Auto token refresh logic
- [x] Logout functionality

---

## Phase 3: Core Pages & Navigation (Frontend)

### 3.1 Layout & Navigation
- [x] Top navbar — logo, nav links, user avatar/menu
- [x] Dashboard layout wrapper
- [x] Mobile responsive hamburger menu
- [x] Loading spinner / skeleton components
- [x] Toast notification setup (shadcn Toaster)
- [x] 404 page

### 3.2 Dashboard (Home after login)
- [x] List of user's disputes (cards with state badges)
- [x] "Start New Dispute" button
- [x] Dispute state badge colors (draft, in progress, under analysis, completed)
- [x] Empty state illustration/message

### 3.3 Landing Page (Public)
- [x] Hero section — headline, subheadline, CTA button
- [x] How it works — 3-step visual (Create → Write Brief → Get Analysis)
- [x] Pricing section ($99 standard, $199 expedited, $299 extended)
- [x] FAQ section
- [x] Footer

---

## Phase 4: Dispute Creation Flow

### 4.1 Backend — Dispute Endpoints
- [x] `POST /v1/disputes` — create dispute, generate invitation link
- [x] `GET /v1/disputes` — list user's disputes
- [x] `GET /v1/disputes/:id` — dispute detail (fields filtered by state)
- [x] `POST /v1/invitations/:token/accept` — counterparty accepts invite
- [x] `POST /v1/invitations/:token/decline` — counterparty declines (triggers refund)
- [x] Dispute state machine logic (draft → awaiting_counterparty → in_progress → ...)
- [x] Invitation email sending (send email with invite link)

### 4.2 Frontend — Create Dispute
- [x] Multi-step form: Step 1 — Dispute title + category (contract / small claims / partnership)
- [x] Multi-step form: Step 2 — Summary + estimated stakes
- [x] Multi-step form: Step 3 — Counterparty email + name
- [ ] Multi-step form: Step 4 — Choose pricing tier + Stripe payment *(deferred to Phase 8)*
- [x] Form progress indicator (step 1 of 4)
- [x] Form validation (required fields, word limits)
- [x] Success page after dispute created (show invitation link)

### 4.3 Frontend — Invitation Accept/Decline
- [x] Public invitation landing page (`/invite/:token`)
- [x] Show dispute summary to invited party
- [x] Accept button → register/login → join dispute
- [x] Decline button → confirmation modal

---

## Phase 5: Brief Writing Flow

### 5.1 Backend — Brief Endpoints
- [x] `POST /v1/disputes/:id/parties/:partyId/brief/session` — start AI chat session, return session ID
- [x] `PUT /v1/disputes/:id/parties/:partyId/brief/draft` — save draft (multiple times)
- [x] `POST /v1/disputes/:id/parties/:partyId/brief/submit` — submit final brief (immutable), trigger evaluation if both submitted
- [x] `GET /v1/disputes/:id/parties/:partyId/brief` — get brief (own only until both submitted)
- [x] Data isolation enforcement — party A cannot read party B's brief until both sealed

### 5.2 Backend — AI Brief Assistant (LangChain + OpenRouter)
- [x] Set up OpenRouter provider in LangChain
- [x] Implement streaming chat endpoint for brief preparation
- [x] Brief template structure prompt (5 sections: facts, position, arguments, acknowledgment, desired outcome)
- [x] Enforce word limits (500–2000 words, hard cap 5000)
- [x] Store conversation history in `BriefPrepSession`

### 5.3 Frontend — Brief Writing Page
- [x] Split layout — AI chat on left, brief draft editor on right
- [x] Chat interface with streaming response (typewriter effect)
- [x] LLM provider selector (Claude, GPT-4, Gemini via OpenRouter)
- [x] Brief sections panel (5 labeled sections with text areas)
- [x] Word count indicator per section + total
- [x] "Save Draft" button (auto-save every 60 seconds)
- [x] "Submit Final Brief" button with confirmation modal ("You cannot edit after submitting")
- [x] Waiting screen after submission ("Waiting for the other party to submit their brief...")

---

## Phase 6: AI Evaluation Engine

### 6.1 Backend — Evaluator Dispatcher (LangGraph)
- [ ] Build LangGraph workflow: Dispatch → Parallel Evaluate → Aggregate
- [ ] Implement 3 evaluator nodes (Claude, GPT-4, Gemini via OpenRouter) running in parallel
- [ ] Use the judge prompt template from client (substitute Party A and Party B briefs)
- [ ] Parse and validate each evaluator's JSON output against schema
- [ ] Retry failed evaluators (up to 2x with backoff)
- [ ] Require minimum 2 successful evaluations (MVP: 3 evaluators, need 2)
- [ ] Store each `EvaluatorOutput` in DB

### 6.2 Backend — Aggregation Engine
- [ ] Calculate inter-evaluator agreement score
- [ ] Scoring algorithm: No winner = 1pt each, Slightly wins = 3pts, Strongly wins = 5pts
- [ ] Call aggregator LLM to write narrative synthesis from all evaluator outputs
- [ ] Build final `Opinion` JSON (executive summary, per-party analysis, comparative assessment, confidence)
- [ ] Save Opinion to DB
- [ ] Update dispute state to `completed`
- [ ] Trigger notification to both parties

### 6.3 Backend — Status Tracking
- [ ] SSE endpoint `GET /v1/disputes/:id/opinion/stream` — real-time evaluation progress
- [ ] Events: `evaluator_complete`, `aggregation_started`, `opinion_ready`
- [ ] `GET /v1/disputes/:id/opinion/status` — poll-based fallback

---

## Phase 7: Opinion / Results Page

### 7.1 Backend — Opinion Endpoints
- [ ] `GET /v1/disputes/:id/opinion` — full opinion (only after state = completed)
- [ ] `GET /v1/disputes/:id/opinion/pdf` — generate and return signed PDF download URL

### 7.2 Frontend — Opinion Page
- [ ] Progress screen with live SSE updates ("Evaluator 1 of 3 complete...")
- [ ] Opinion result page:
  - Executive summary card
  - Party A strengths/weaknesses accordion
  - Party B strengths/weaknesses accordion
  - Comparative assessment section (who scored higher)
  - Score breakdown (how each judge voted)
  - Confidence score indicator
  - Suggested considerations for each party
- [ ] Legal disclaimer banner ("This is argument analysis, not legal advice")
- [ ] Download PDF button
- [ ] "Request Re-analysis" button ($49)

---

## Phase 8: Payments (Stripe)

### 8.1 Backend — Payment Endpoints
- [ ] `POST /v1/disputes` — create Stripe PaymentIntent on dispute creation
- [ ] `POST /v1/disputes/:id/payment/confirm` — confirm payment after Stripe client confirmation
- [ ] Webhook handler `POST /v1/webhooks/stripe` — handle payment success/failure events
- [ ] Refund logic — trigger on invitation decline or evaluation failure
- [ ] `POST /v1/disputes/:id/refund-request` — manual refund request

### 8.2 Frontend — Payment
- [ ] Stripe Elements integration on dispute creation step 4
- [ ] Payment confirmation page
- [ ] Payment success → redirect to brief writing page
- [ ] Payment failure → error message with retry
- [ ] Billing history page (`/settings/billing`)

---

## Phase 9: Notifications & Email

- [ ] Email on dispute creation — confirmation to initiator
- [ ] Email invitation to counterparty (with invite link)
- [ ] Email when counterparty accepts
- [ ] Email when both briefs submitted and analysis begins
- [ ] Email to both parties when opinion is ready
- [ ] In-app notification bell (optional MVP stretch)

---

## Phase 10: Settings & Account

- [ ] Profile settings page — display name, email, preferred LLM
- [ ] Change password
- [ ] Delete account (with active dispute check)
- [ ] Privacy settings

---

## Phase 11: Polish & MVP Hardening

- [ ] Mobile responsive audit — all pages tested on mobile
- [ ] Error boundary components (catch React errors)
- [ ] API error handling — friendly error messages for all failure states
- [ ] Loading states on all async actions
- [ ] Empty states on all list views
- [ ] Rate limiting on all API endpoints
- [ ] Input sanitization (prevent prompt injection in brief content)
- [ ] Legal disclaimer page (`/legal/disclaimer`)
- [ ] Terms of service page (`/legal/terms`)
- [ ] Privacy policy page (`/legal/privacy`)
- [ ] Favicon, meta tags, page titles

---

## MVP Out of Scope (Phase 2+)

- [ ] Native mobile app (iOS/Android)
- [ ] Document upload / OCR
- [ ] Admin dashboard
- [ ] B2B / white-label
- [ ] Multi-language support
- [ ] Subscription pricing tier
- [ ] Mediator referral integrations
- [ ] 2FA (TOTP)
- [ ] Webhook API for partners
- [ ] Re-analysis feature (add after core flow validated)

---

## Phase Order Summary

| Phase | What Gets Built | Dependency |
|-------|----------------|------------|
| 1 | Project setup, DB schema | None |
| 2 | Auth (register, login, tokens) | Phase 1 |
| 3 | Landing page + dashboard layout | Phase 2 |
| 4 | Dispute creation + invitation flow | Phase 2 |
| 5 | Brief writing + AI assistant | Phase 4 |
| 6 | AI evaluation engine (LangGraph) | Phase 5 |
| 7 | Opinion results page | Phase 6 |
| 8 | Stripe payments | Phase 4 |
| 9 | Email notifications | Phase 4+ |
| 10 | Account settings | Phase 2 |
| 11 | Polish + hardening | All phases |
