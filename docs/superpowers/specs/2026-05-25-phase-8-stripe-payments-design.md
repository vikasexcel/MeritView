# Phase 8 — Stripe Payments Design

**Date:** 2026-05-25  
**Status:** Approved

---

## Overview

Phase 8 adds Stripe payment processing to the dispute creation flow. Payment is required before a dispute is created — no orphan disputes exist without a completed payment. All Stripe work is done in test/dev mode only.

---

## Pricing

Single fixed tier for MVP: **$99 USD** (standard). No user selection required. The tier is encoded as metadata on the Checkout Session for audit purposes.

---

## Payment Flow

```
User fills steps 1–3 (dispute details + counterparty)
  ↓
Step 4: Review summary + "Pay $99" button
  ↓
Frontend calls POST /v1/payments/checkout-session
  (passes dispute form data: title, category, summary, stakes, counterpartyEmail, counterpartyName)
  ↓
Backend creates Stripe Checkout Session (ui_mode: 'custom')
  stores pending metadata (dispute form fields) in session metadata
  creates a Payment record in DB (status: pending, no disputeId yet)
  returns { clientSecret, paymentId }
  ↓
Frontend mounts Stripe Payment Element using clientSecret
User enters card details and confirms payment
  ↓
Stripe calls POST /v1/webhooks/stripe with checkout.session.completed
  ↓
Webhook handler:
  1. Verifies signature
  2. Looks up Payment record by Stripe session ID
  3. Creates the Dispute in DB (state: awaiting_counterparty)
  4. Creates two Party records (initiator + respondent with invitationToken)
  5. Links Payment.disputeId to new dispute
  6. Updates Payment.status = succeeded
  7. Sends invitation email to counterparty
  8. Creates AuditEvents: payment_succeeded + dispute_created
  ↓
Stripe redirects frontend to /payment/success?session_id=...
  ↓
PaymentSuccess page polls GET /v1/payments/session/:sessionId/status
  until { status: 'succeeded', disputeId } is returned
  then auto-redirects to /disputes/:disputeId (after 2s with countdown)
```

**Failure path:**
- Payment fails → Stripe stays on Payment Element with error message; user can retry
- Webhook fails after payment → Payment stays `pending`; dispute is never created; user can contact support
- Invitation declined → backend triggers Stripe Refund on the PaymentIntent

---

## Backend

### New files

#### `src/lib/stripe.ts`
Stripe client singleton. Initialized with `STRIPE_SECRET_KEY` (restricted API key, `rk_` prefix).  
API version: `2026-04-22.dahlia`.

#### `src/services/payments.ts`
- `createCheckoutSession(userId, formData)` — creates Stripe Checkout Session (`ui_mode: 'custom'`, amount 9900 cents, currency usd), stores dispute form fields as session metadata, creates a pending `Payment` record in DB, returns `{ clientSecret, paymentId }`
- `getSessionStatus(sessionId, userId)` — returns `{ status, disputeId? }` for the polling endpoint
- `handleWebhookEvent(rawBody, signature)` — verifies signature using `STRIPE_WEBHOOK_SECRET`, handles `checkout.session.completed` (create dispute + update payment) and `checkout.session.expired` (mark payment failed)
- `createRefund(disputeId)` — looks up succeeded Payment for dispute, calls Stripe Refunds API, updates Payment.status = refunded

#### `src/controllers/payments.ts`
- `createCheckoutSession` handler
- `getSessionStatus` handler
- `listPayments` handler (billing history)
- `handleWebhook` handler (raw body — registered before `express.json()`)

#### `src/routes/payments.ts`
```
POST /v1/payments/checkout-session   (requireAuth)
GET  /v1/payments/session/:sessionId/status  (requireAuth)
GET  /v1/payments  (requireAuth — billing history)
POST /v1/webhooks/stripe  (no auth — raw body)
```

### Modified files

#### `src/app.ts`
- Register `POST /v1/webhooks/stripe` with `express.raw({ type: 'application/json' })` **before** `express.json()` middleware
- Mount `/v1/payments` router

#### `src/services/disputes.ts`
- Extract `createDisputeFromWebhook(input)` variant used by the webhook handler (no longer called from HTTP controller directly)

#### `src/controllers/disputes.ts`
- Remove dispute creation logic (now webhook-driven); `POST /v1/disputes` becomes unused for the new flow (keep the endpoint but note it is superseded)

#### `backend/.env.example`
```
STRIPE_SECRET_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STANDARD_CENTS=9900
```

---

## Frontend

### Modified files

#### `src/pages/disputes/CreateDispute.tsx`
Step 4 replaces the current "Review & Submit" with:
1. Summary of dispute details (read-only)
2. Price display: **$99.00 — Standard Analysis**
3. "Pay $99" button → calls `paymentApi.createCheckoutSession(formValues)` → mounts Stripe Payment Element
4. Payment Element rendered inline; on confirm → Stripe handles redirect to `/payment/success?session_id=...`
5. Payment failure → inline error from Stripe, user retries

Uses `@stripe/stripe-js` and `@stripe/react-stripe-js`.

#### `src/lib/paymentApi.ts` (new)
- `createCheckoutSession(formData)` → `POST /v1/payments/checkout-session`
- `getSessionStatus(sessionId)` → `GET /v1/payments/session/:sessionId/status`
- `listPayments()` → `GET /v1/payments`

### New files

#### `src/pages/disputes/PaymentSuccess.tsx`
- Reads `?session_id=` from URL
- Polls `getSessionStatus(sessionId)` every 2s (max 30s / 15 attempts)
- Shows spinner: "Confirming your payment..."
- On `succeeded` + `disputeId`: shows green checkmark + "Payment confirmed! Redirecting..." with 2s countdown, then navigates to `/disputes/:disputeId`
- On timeout or `failed`: shows error message with "Go to Dashboard" link

#### `src/pages/settings/Billing.tsx`
- Fetches `listPayments()` via React Query
- Table: Date | Dispute | Amount | Status
- Empty state: "No payments yet"

### Modified files

#### `src/App.tsx`
- Add route `/payment/success` → `<PaymentSuccess />`
- Add route `/settings/billing` → `<Billing />` (protected)

#### `frontend/.env.example`
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Database

No schema changes needed. The existing `Payment` model covers everything:
- `stripePaymentIntentId` stores the Checkout Session's PaymentIntent ID (retrieved from the session object after completion)
- `status` tracks pending → succeeded / failed / refunded
- `disputeId` is nullable until the webhook fires and creates the dispute

One migration needed: add `stripeSessionId String? @unique` to `Payment` so the webhook can look up the Payment by Stripe session ID without scanning by PaymentIntent ID (which is only known after completion).

---

## Tests (TDD)

All tests written **before** implementation. Test file: `backend/src/tests/payments.test.ts`.

### Test cases

**createCheckoutSession service:**
- Creates a pending Payment record in DB
- Returns a clientSecret string
- Stores dispute form metadata on the Checkout Session
- Rejects if userId is missing

**handleWebhookEvent:**
- Rejects requests with invalid signature (returns 400)
- On `checkout.session.completed`: creates Dispute + Party records, updates Payment to succeeded, links disputeId
- On `checkout.session.completed` with already-processed session (idempotency): does not create duplicate dispute
- On `checkout.session.expired`: updates Payment to failed

**getSessionStatus:**
- Returns `{ status: 'pending' }` before webhook fires
- Returns `{ status: 'succeeded', disputeId }` after webhook fires
- Returns 404 for unknown sessionId or wrong userId

**createRefund:**
- Updates Payment.status to refunded after Stripe call
- Throws if no succeeded payment found for dispute

**Routes (integration):**
- `POST /v1/payments/checkout-session` requires auth (401 without session)
- `GET /v1/payments/session/:id/status` requires auth
- `POST /v1/webhooks/stripe` accepts raw body, returns 400 on bad signature

---

## Environment variables summary

| Variable | Location | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | backend `.env` | Restricted API key (`rk_test_...` in dev) |
| `STRIPE_WEBHOOK_SECRET` | backend `.env` | From `stripe listen --forward-to` in dev |
| `STRIPE_PRICE_STANDARD_CENTS` | backend `.env` | `9900` (default) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | frontend `.env` | `pk_test_...` in dev |

---

## Dev mode notes

- Use `stripe listen --forward-to localhost:3000/v1/webhooks/stripe` to forward Stripe events locally
- Use Stripe test card `4242 4242 4242 4242` for successful payments
- Use `4000 0000 0000 0002` to test declined card
- All keys are test-mode (`pk_test_`, `rk_test_`, `whsec_` from CLI)
- Never commit real keys — use `.env` (gitignored)

---

## Out of scope for this phase

- Multiple pricing tiers (user-selectable)
- Stripe Customer object (no card saving)
- PDF download of invoice
- Re-analysis payment ($49)
- Production key rotation process
