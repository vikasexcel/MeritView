# Phase 8 — Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe payment processing so a dispute is only created after a $99 payment is confirmed via webhook.

**Architecture:** The frontend collects dispute form data across steps 1–3, then on step 4 calls the backend to create a Stripe Checkout Session (ui_mode: custom). The Payment Element is embedded inline; on success Stripe redirects to `/payment/success` which polls until the webhook fires and the dispute is created in DB, then auto-redirects to the dispute. All work is in Stripe test/dev mode.

**Tech Stack:** Stripe Node.js SDK (`stripe`), `@stripe/stripe-js`, `@stripe/react-stripe-js`, Vitest + Supertest (backend tests), Prisma migration (new `stripeSessionId` column on `Payment`).

---

## File Map

**Backend — new files:**
- `backend/src/lib/stripe.ts` — Stripe client singleton
- `backend/src/services/payments.ts` — business logic: createCheckoutSession, getSessionStatus, handleWebhookEvent, createRefund, listPayments
- `backend/src/controllers/payments.ts` — HTTP handlers
- `backend/src/routes/payments.ts` — route definitions
- `backend/src/tests/payments.test.ts` — TDD tests

**Backend — modified files:**
- `backend/prisma/schema.prisma` — add `stripeSessionId` to Payment model
- `backend/src/app.ts` — register webhook route (raw body, before express.json), mount payments router
- `backend/.env.example` — add Stripe env vars

**Frontend — new files:**
- `frontend/src/lib/paymentApi.ts` — API calls
- `frontend/src/pages/disputes/PaymentSuccess.tsx` — post-payment polling + redirect page
- `frontend/src/pages/settings/Billing.tsx` — billing history page

**Frontend — modified files:**
- `frontend/src/pages/disputes/CreateDispute.tsx` — step 4 replaced with payment UI
- `frontend/src/App.tsx` — add `/payment/success` and `/settings/billing` routes
- `frontend/.env.example` — add `VITE_STRIPE_PUBLISHABLE_KEY`

---

## Task 1: Install dependencies

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Stripe Node SDK in backend**

```bash
cd backend && npm install stripe
```

Expected: `stripe` added to `dependencies` in `backend/package.json`.

- [ ] **Step 2: Install Stripe JS and React Stripe in frontend**

```bash
cd frontend && npm install @stripe/stripe-js @stripe/react-stripe-js
```

Expected: both packages added to `dependencies` in `frontend/package.json`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json
git commit -m "chore: install stripe dependencies"
```

---

## Task 2: Database migration — add stripeSessionId to Payment

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `stripeSessionId` field to Payment model**

In `backend/prisma/schema.prisma`, update the `Payment` model to:

```prisma
model Payment {
  id                    String        @id @default(cuid())
  disputeId             String?
  userId                String
  amountUsd             Decimal       @db.Decimal(10, 2)
  status                PaymentStatus @default(pending)
  stripePaymentIntentId String?       @unique
  stripeSessionId       String?       @unique
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  dispute Dispute? @relation(fields: [disputeId], references: [id])
  user    User     @relation(fields: [userId], references: [id])

  @@index([disputeId])
  @@index([userId])
}
```

Two changes from the existing model:
1. `disputeId` becomes `String?` (nullable — no dispute yet when payment is created)
2. New field `stripeSessionId String? @unique`
3. `dispute` relation becomes `Dispute?` to match nullable disputeId

- [ ] **Step 2: Run migration**

```bash
cd backend && npm run db:migrate
```

When prompted for migration name, enter: `add_stripe_session_id_to_payment`

Expected: migration file created in `backend/prisma/migrations/`, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add stripeSessionId to Payment, make disputeId nullable"
```

---

## Task 3: Backend — Stripe client singleton

**Files:**
- Create: `backend/src/lib/stripe.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Create Stripe client**

Create `backend/src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia' as any,
})
```

- [ ] **Step 2: Add env vars to .env.example**

In `backend/.env.example`, append:

```
# Stripe (use rk_test_... restricted key in dev)
STRIPE_SECRET_KEY=rk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_PRICE_STANDARD_CENTS=9900
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/stripe.ts backend/.env.example
git commit -m "feat: add Stripe client singleton"
```

---

## Task 4: Backend — write failing tests (TDD)

**Files:**
- Create: `backend/src/tests/payments.test.ts`

- [ ] **Step 1: Write the test file**

Create `backend/src/tests/payments.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

// Mock the stripe module so tests don't hit Stripe's API
vi.mock('../lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    refunds: {
      create: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}))

import { stripe } from '../lib/stripe'

const AUTH_BASE = '/api/auth'

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await request(app)
      .post(`${AUTH_BASE}/sign-up/email`)
      .send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    try {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    } catch {
      continue
    }
    const res = await request(app)
      .post(`${AUTH_BASE}/sign-in/email`)
      .send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

const VALID_FORM = {
  title: 'Payment Test Dispute',
  category: 'contract',
  summary: 'A dispute about a contract payment issue.',
  counterpartyEmail: 'other-payment@example.com',
  counterpartyName: 'Other Party',
}

// ──────────────────────────────────────────────────────────
// POST /v1/payments/checkout-session
// ──────────────────────────────────────────────────────────
describe('POST /v1/payments/checkout-session', () => {
  let cookie: string[]

  beforeEach(async () => {
    cookie = await registerAndLogin('payments-create@test.meritview')
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_test_123',
      client_secret: 'cs_test_secret_abc',
    } as any)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/v1/payments/checkout-session').send(VALID_FORM)
    expect(res.status).toBe(401)
  })

  it('creates a pending Payment record and returns clientSecret', async () => {
    const res = await request(app)
      .post('/v1/payments/checkout-session')
      .set('Cookie', cookie)
      .send(VALID_FORM)

    expect(res.status).toBe(201)
    expect(res.body.clientSecret).toBe('cs_test_secret_abc')
    expect(res.body.paymentId).toBeTruthy()

    const payment = await prisma.payment.findUnique({ where: { id: res.body.paymentId } })
    expect(payment).toBeTruthy()
    expect(payment!.status).toBe('pending')
    expect(payment!.stripeSessionId).toBe('cs_test_123')
    expect(payment!.disputeId).toBeNull()
  })

  it('returns 400 if title is missing', async () => {
    const res = await request(app)
      .post('/v1/payments/checkout-session')
      .set('Cookie', cookie)
      .send({ ...VALID_FORM, title: '' })
    expect(res.status).toBe(400)
  })

  it('calls Stripe with correct amount and metadata', async () => {
    await request(app)
      .post('/v1/payments/checkout-session')
      .set('Cookie', cookie)
      .send(VALID_FORM)

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ui_mode: 'custom',
        line_items: [{ price_data: expect.objectContaining({ unit_amount: 9900 }), quantity: 1 }],
        metadata: expect.objectContaining({ title: VALID_FORM.title }),
      })
    )
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/payments/session/:sessionId/status
// ──────────────────────────────────────────────────────────
describe('GET /v1/payments/session/:sessionId/status', () => {
  let cookie: string[]

  beforeEach(async () => {
    cookie = await registerAndLogin('payments-status@test.meritview')
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_test_status_456',
      client_secret: 'cs_test_secret_xyz',
    } as any)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/v1/payments/session/cs_test_status_456/status')
    expect(res.status).toBe(401)
  })

  it('returns pending status before webhook fires', async () => {
    const createRes = await request(app)
      .post('/v1/payments/checkout-session')
      .set('Cookie', cookie)
      .send(VALID_FORM)
    expect(createRes.status).toBe(201)

    const statusRes = await request(app)
      .get('/v1/payments/session/cs_test_status_456/status')
      .set('Cookie', cookie)

    expect(statusRes.status).toBe(200)
    expect(statusRes.body.status).toBe('pending')
    expect(statusRes.body.disputeId).toBeNull()
  })

  it('returns 404 for unknown session', async () => {
    const res = await request(app)
      .get('/v1/payments/session/cs_test_nonexistent/status')
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────
// POST /v1/webhooks/stripe
// ──────────────────────────────────────────────────────────
describe('POST /v1/webhooks/stripe', () => {
  it('returns 400 with invalid signature', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    const res = await request(app)
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'bad_sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }))

    expect(res.status).toBe(400)
  })

  it('creates dispute and updates payment on checkout.session.completed', async () => {
    // Set up: create a pending payment record directly in DB
    const user = await prisma.user.findFirst({ where: { email: 'webhook-test@test.meritview' } })
      ?? await prisma.user.create({
        data: {
          email: 'webhook-test@test.meritview',
          name: 'Webhook Test User',
          emailVerified: true,
        },
      })

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        amountUsd: 99,
        status: 'pending',
        stripeSessionId: 'cs_test_webhook_789',
      },
    })

    const fakeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_webhook_789',
          payment_intent: 'pi_test_abc',
          metadata: {
            title: 'Webhook Test Dispute',
            category: 'contract',
            summary: 'Summary from webhook test.',
            counterpartyEmail: 'cp@example.com',
            counterpartyName: 'Counter Party',
            userId: user.id,
          },
        },
      },
    }

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(fakeEvent as any)

    const res = await request(app)
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'valid_test_sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(fakeEvent))

    expect(res.status).toBe(200)

    const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } })
    expect(updatedPayment!.status).toBe('succeeded')
    expect(updatedPayment!.disputeId).toBeTruthy()
    expect(updatedPayment!.stripePaymentIntentId).toBe('pi_test_abc')

    const dispute = await prisma.dispute.findUnique({ where: { id: updatedPayment!.disputeId! } })
    expect(dispute).toBeTruthy()
    expect(dispute!.title).toBe('Webhook Test Dispute')
    expect(dispute!.state).toBe('awaiting_counterparty')
  })

  it('is idempotent — does not create duplicate dispute on second webhook call', async () => {
    const user = await prisma.user.findFirst({ where: { email: 'webhook-idempotent@test.meritview' } })
      ?? await prisma.user.create({
        data: {
          email: 'webhook-idempotent@test.meritview',
          name: 'Idempotent User',
          emailVerified: true,
        },
      })

    await prisma.payment.create({
      data: {
        userId: user.id,
        amountUsd: 99,
        status: 'pending',
        stripeSessionId: 'cs_test_idempotent_999',
      },
    })

    const fakeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_idempotent_999',
          payment_intent: 'pi_test_idempotent',
          metadata: {
            title: 'Idempotent Dispute',
            category: 'contract',
            summary: 'Idempotency test summary.',
            counterpartyEmail: 'cp2@example.com',
            counterpartyName: 'Counter Party 2',
            userId: user.id,
          },
        },
      },
    }

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(fakeEvent as any)

    await request(app)
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'valid_sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(fakeEvent))

    // Call again — should not create a second dispute
    const res2 = await request(app)
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'valid_sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(fakeEvent))

    expect(res2.status).toBe(200)

    const disputes = await prisma.dispute.findMany({ where: { title: 'Idempotent Dispute' } })
    expect(disputes).toHaveLength(1)
  })

  it('marks payment failed on checkout.session.expired', async () => {
    const user = await prisma.user.findFirst({ where: { email: 'webhook-expired@test.meritview' } })
      ?? await prisma.user.create({
        data: {
          email: 'webhook-expired@test.meritview',
          name: 'Expired User',
          emailVerified: true,
        },
      })

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        amountUsd: 99,
        status: 'pending',
        stripeSessionId: 'cs_test_expired_111',
      },
    })

    const fakeEvent = {
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_expired_111' } },
    }

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(fakeEvent as any)

    const res = await request(app)
      .post('/v1/webhooks/stripe')
      .set('stripe-signature', 'valid_sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(fakeEvent))

    expect(res.status).toBe(200)

    const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } })
    expect(updatedPayment!.status).toBe('failed')
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/payments (billing history)
// ──────────────────────────────────────────────────────────
describe('GET /v1/payments', () => {
  let cookie: string[]

  beforeEach(async () => {
    cookie = await registerAndLogin('payments-list@test.meritview')
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/v1/payments')
    expect(res.status).toBe(401)
  })

  it('returns empty array when no payments', async () => {
    const res = await request(app).get('/v1/payments').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.payments).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd backend && npm test -- payments.test.ts
```

Expected: multiple failures — `Cannot find module '../lib/stripe'`, route 404s, etc. That's correct — we haven't built anything yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/src/tests/payments.test.ts
git commit -m "test: add failing TDD tests for Phase 8 Stripe payments"
```

---

## Task 5: Backend — payments service

**Files:**
- Create: `backend/src/services/payments.ts`

- [ ] **Step 1: Write the service**

Create `backend/src/services/payments.ts`:

```typescript
import { stripe } from '../lib/stripe'
import { prisma } from '../lib/prisma'
import { DisputeCategory } from '@prisma/client'
import crypto from 'crypto'
import { sendInvitationEmail } from '../lib/email'

const STANDARD_AMOUNT_CENTS = parseInt(process.env.STRIPE_PRICE_STANDARD_CENTS ?? '9900', 10)

export interface CheckoutFormData {
  title: string
  category: string
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
}

export async function createCheckoutSession(userId: string, formData: CheckoutFormData) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173'

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'custom',
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: STANDARD_AMOUNT_CENTS,
          product_data: { name: 'MeritView Standard Analysis — $99' },
        },
        quantity: 1,
      },
    ],
    return_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      userId,
      title: formData.title,
      category: formData.category,
      summary: formData.summary,
      stakes: formData.stakes?.toString() ?? '',
      counterpartyEmail: formData.counterpartyEmail,
      counterpartyName: formData.counterpartyName,
    },
  })

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountUsd: STANDARD_AMOUNT_CENTS / 100,
      status: 'pending',
      stripeSessionId: session.id,
    },
  })

  return { clientSecret: session.client_secret!, paymentId: payment.id }
}

export async function getSessionStatus(sessionId: string, userId: string) {
  const payment = await prisma.payment.findFirst({
    where: { stripeSessionId: sessionId, userId },
  })
  if (!payment) return null
  return { status: payment.status, disputeId: payment.disputeId ?? null }
}

export async function handleWebhookEvent(rawBody: Buffer, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any
    await handleSessionCompleted(session)
  } else if (event.type === 'checkout.session.expired') {
    const session = event.data.object as any
    await prisma.payment.updateMany({
      where: { stripeSessionId: session.id },
      data: { status: 'failed' },
    })
  }
}

async function handleSessionCompleted(session: any) {
  const payment = await prisma.payment.findUnique({
    where: { stripeSessionId: session.id },
  })
  if (!payment) return

  // Idempotency — already processed
  if (payment.status === 'succeeded') return

  const meta = session.metadata
  const invitationToken = crypto.randomBytes(32).toString('hex')

  const dispute = await prisma.$transaction(async (tx) => {
    const d = await tx.dispute.create({
      data: {
        title: meta.title,
        category: meta.category as DisputeCategory,
        summary: meta.summary,
        stakes: meta.stakes ? parseFloat(meta.stakes) : null,
        initiatorId: meta.userId,
        state: 'awaiting_counterparty',
        parties: {
          create: [
            { userId: meta.userId, role: 'initiator', invitationStatus: 'accepted' },
            { role: 'respondent', invitationToken, invitationStatus: 'pending' },
          ],
        },
      },
      include: { parties: true },
    })

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'succeeded',
        disputeId: d.id,
        stripePaymentIntentId: session.payment_intent ?? null,
      },
    })

    await tx.auditEvent.createMany({
      data: [
        {
          eventType: 'payment_succeeded',
          actorId: meta.userId,
          resourceType: 'payment',
          resourceId: payment.id,
          eventData: { stripeSessionId: session.id, amountUsd: 99 },
        },
        {
          eventType: 'dispute_created',
          actorId: meta.userId,
          resourceType: 'dispute',
          resourceId: d.id,
          eventData: { title: meta.title, category: meta.category },
        },
      ],
    })

    return d
  })

  const appUrl = process.env.APP_URL ?? 'http://localhost:5173'
  const inviteUrl = `${appUrl}/invite/${invitationToken}`
  sendInvitationEmail(meta.counterpartyEmail, meta.counterpartyName, meta.title, inviteUrl).catch(
    (err) => console.error('[webhook] Failed to send invitation email:', err)
  )
}

export async function createRefund(disputeId: string) {
  const payment = await prisma.payment.findFirst({
    where: { disputeId, status: 'succeeded' },
  })
  if (!payment) throw new Error('No succeeded payment found for dispute')

  await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId! })

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'refunded' },
  })

  await prisma.auditEvent.create({
    data: {
      eventType: 'payment_refunded',
      actorId: payment.userId,
      resourceType: 'payment',
      resourceId: payment.id,
      eventData: { disputeId },
    },
  })
}

export async function listPayments(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    include: { dispute: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  })
}
```

---

## Task 6: Backend — payments controller and routes

**Files:**
- Create: `backend/src/controllers/payments.ts`
- Create: `backend/src/routes/payments.ts`

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/payments.ts`:

```typescript
import { Request, Response } from 'express'
import * as paymentsService from '../services/payments'
import { DisputeCategory } from '@prisma/client'

const VALID_CATEGORIES: DisputeCategory[] = ['contract', 'small_claims', 'partnership']

export async function createCheckoutSession(req: Request, res: Response) {
  const { title, category, summary, stakes, counterpartyEmail, counterpartyName } = req.body

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'title must be at least 3 characters' })
    return
  }
  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'invalid category' })
    return
  }
  if (!summary || typeof summary !== 'string' || summary.trim().length < 10) {
    res.status(400).json({ error: 'summary must be at least 10 characters' })
    return
  }
  if (!counterpartyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartyEmail)) {
    res.status(400).json({ error: 'invalid counterparty email' })
    return
  }
  if (!counterpartyName || typeof counterpartyName !== 'string' || counterpartyName.trim().length < 1) {
    res.status(400).json({ error: 'counterparty name is required' })
    return
  }
  if (counterpartyEmail.toLowerCase() === req.user!.email.toLowerCase()) {
    res.status(400).json({ error: 'counterparty cannot be yourself' })
    return
  }

  const result = await paymentsService.createCheckoutSession(req.user!.id, {
    title: title.trim(),
    category,
    summary: summary.trim(),
    stakes: stakes ? Number(stakes) : undefined,
    counterpartyEmail,
    counterpartyName,
  })

  res.status(201).json(result)
}

export async function getSessionStatus(req: Request, res: Response) {
  const status = await paymentsService.getSessionStatus(req.params.sessionId, req.user!.id)
  if (!status) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(status)
}

export async function listPayments(req: Request, res: Response) {
  const payments = await paymentsService.listPayments(req.user!.id)
  res.json({ payments })
}

export async function handleWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string
  if (!signature) {
    res.status(400).json({ error: 'missing stripe-signature header' })
    return
  }

  try {
    await paymentsService.handleWebhookEvent(req.body as Buffer, signature)
    res.json({ received: true })
  } catch (err: any) {
    console.error('[webhook] Error:', err.message)
    res.status(400).json({ error: err.message })
  }
}
```

- [ ] **Step 2: Write the routes**

Create `backend/src/routes/payments.ts`:

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as paymentsController from '../controllers/payments'

const router = Router()

router.post('/checkout-session', requireAuth, paymentsController.createCheckoutSession)
router.get('/session/:sessionId/status', requireAuth, paymentsController.getSessionStatus)
router.get('/', requireAuth, paymentsController.listPayments)

export default router
```

---

## Task 7: Backend — wire up routes in app.ts

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Update app.ts**

In `backend/src/app.ts`, add the webhook route (raw body, before `express.json()`) and the payments router. The final file should be:

```typescript
import express from 'express'
import helmet from 'helmet'
import 'dotenv/config'
import { toNodeHandler } from 'better-auth/node'
import { corsMiddleware } from './middleware/cors'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'
import disputesRouter from './routes/disputes'
import invitationsRouter from './routes/invitations'
import briefsRouter from './routes/briefs'
import opinionsRouter from './routes/opinions'
import paymentsRouter from './routes/payments'
import { handleWebhook } from './controllers/payments'
import { auth } from './lib/auth'

const app = express()

app.use(helmet())
app.use(corsMiddleware)

// Better Auth handler must come BEFORE express.json()
app.all('/api/auth/{*any}', toNodeHandler(auth))

// Stripe webhook must receive raw body — register BEFORE express.json()
app.post('/v1/webhooks/stripe', express.raw({ type: 'application/json' }), handleWebhook)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(rateLimiter)

app.use('/v1', healthRouter)
app.use('/v1/disputes', disputesRouter)
app.use('/v1/disputes/:id/parties/:partyId/brief', briefsRouter)
app.use('/v1/disputes/:id/opinion', opinionsRouter)
app.use('/v1/invitations', invitationsRouter)
app.use('/v1/payments', paymentsRouter)

app.use(errorHandler)

export default app
```

---

## Task 8: Run backend tests — verify they pass

- [ ] **Step 1: Set required env vars for test run**

Add to `backend/.env` (do NOT commit this file):

```
STRIPE_SECRET_KEY=rk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
STRIPE_PRICE_STANDARD_CENTS=9900
```

- [ ] **Step 2: Run payments tests**

```bash
cd backend && npm test -- payments.test.ts
```

Expected: all tests pass. If any fail, fix the service/controller before continuing.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
cd backend && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/stripe.ts backend/src/services/payments.ts backend/src/controllers/payments.ts backend/src/routes/payments.ts backend/src/app.ts
git commit -m "feat: add Stripe payment backend — checkout session, webhook, refund"
```

---

## Task 9: Update invitations service to trigger refund on decline

**Files:**
- Modify: `backend/src/services/disputes.ts`

- [ ] **Step 1: Import createRefund and call it on invitation decline**

In `backend/src/services/disputes.ts`, update the `declineInvitation` function. Add the import at the top alongside existing imports:

```typescript
import { createRefund } from './payments'
```

Then update `declineInvitation` to trigger a refund after the dispute is cancelled:

```typescript
export async function declineInvitation(token: string, userId?: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null

  const updated = await prisma.party.updateMany({
    where: { invitationToken: token, invitationStatus: 'pending' },
    data: { invitationStatus: 'declined' },
  })

  if (updated.count === 0) return { error: 'already_responded' as const }

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'cancelled' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_declined',
        actorId: userId ?? null,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  // Trigger refund — fire-and-forget; log errors but don't block the response
  createRefund(party.disputeId).catch((err) =>
    console.error('[declineInvitation] Refund failed:', err)
  )

  return { ok: true }
}
```

- [ ] **Step 2: Run existing invitations tests to ensure no regressions**

```bash
cd backend && npm test -- disputes.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/disputes.ts
git commit -m "feat: trigger Stripe refund on invitation decline"
```

---

## Task 10: Frontend — add Stripe env var and paymentApi

**Files:**
- Modify: `frontend/.env.example`
- Create: `frontend/src/lib/paymentApi.ts`

- [ ] **Step 1: Add publishable key to env.example**

In `frontend/.env.example`, append:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

Also add it to your local `frontend/.env` with your actual Stripe test publishable key (`pk_test_...`).

- [ ] **Step 2: Create paymentApi.ts**

Create `frontend/src/lib/paymentApi.ts`:

```typescript
import { api } from './api'

export interface CheckoutSessionPayload {
  title: string
  category: string
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
}

export interface CheckoutSessionResponse {
  clientSecret: string
  paymentId: string
}

export interface SessionStatusResponse {
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  disputeId: string | null
}

export interface PaymentRecord {
  id: string
  amountUsd: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  createdAt: string
  dispute: { id: string; title: string } | null
}

export const paymentApi = {
  createCheckoutSession: (payload: CheckoutSessionPayload) =>
    api.post<CheckoutSessionResponse>('/v1/payments/checkout-session', payload),

  getSessionStatus: (sessionId: string) =>
    api.get<SessionStatusResponse>(`/v1/payments/session/${sessionId}/status`),

  listPayments: () => api.get<{ payments: PaymentRecord[] }>('/v1/payments'),
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/.env.example frontend/src/lib/paymentApi.ts
git commit -m "feat: add paymentApi and Stripe publishable key env var"
```

---

## Task 11: Frontend — update CreateDispute step 4 to embed Payment Element

**Files:**
- Modify: `frontend/src/pages/disputes/CreateDispute.tsx`

- [ ] **Step 1: Replace step 4 with Stripe Payment Element**

Replace the entire contents of `frontend/src/pages/disputes/CreateDispute.tsx`:

```tsx
import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { paymentApi } from '@/lib/paymentApi'
import { useDisputeForm } from '@/hooks/useDisputeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full ${i + 1 <= current ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
      <span className="ml-2 whitespace-nowrap">Step {current} of {total}</span>
    </div>
  )
}

function PaymentForm({ onBack }: { onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError('')

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {},
      redirect: 'always',
    })

    if (submitError) {
      setError(submitError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button type="submit" disabled={!stripe || loading}>
          {loading ? 'Processing...' : 'Pay $99.00'}
        </Button>
      </div>
    </form>
  )
}

export function CreateDispute() {
  const { step, values, updateValues, nextStep, prevStep, toPayload } = useDisputeForm()
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  async function handleProceedToPayment() {
    setError('')
    setLoadingSession(true)
    try {
      const res = await paymentApi.createCheckoutSession(toPayload())
      setClientSecret(res.data.clientSecret)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Something went wrong. Please try again.')
    } finally {
      setLoadingSession(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Create a Dispute</h1>
      <StepIndicator current={step} total={4} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dispute Details</CardTitle>
            <CardDescription>Give your dispute a title and category.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Unpaid freelance invoice"
                value={values.title}
                onChange={(e) => updateValues({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Select
                value={values.category}
                onValueChange={(v) => updateValues({ category: v as any })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="small_claims">Small Claims</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={nextStep}
                disabled={values.title.trim().length < 3 || !values.category}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Summary & Stakes</CardTitle>
            <CardDescription>Describe the dispute and estimated value.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                placeholder="Briefly describe the dispute..."
                rows={4}
                value={values.summary}
                onChange={(e) => updateValues({ summary: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{values.summary.length} characters (min 10)</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="stakes">Estimated Stakes (USD, optional)</Label>
              <Input
                id="stakes"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={values.stakes}
                onChange={(e) => updateValues({ stakes: e.target.value })}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>Back</Button>
              <Button onClick={nextStep} disabled={values.summary.trim().length < 10}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Counterparty Details</CardTitle>
            <CardDescription>Who are you in dispute with?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="cpName">Their Name</Label>
              <Input
                id="cpName"
                placeholder="Full name"
                value={values.counterpartyName}
                onChange={(e) => updateValues({ counterpartyName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cpEmail">Their Email</Label>
              <Input
                id="cpEmail"
                type="email"
                placeholder="their@email.com"
                value={values.counterpartyEmail}
                onChange={(e) => updateValues({ counterpartyEmail: e.target.value })}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>Back</Button>
              <Button
                onClick={nextStep}
                disabled={
                  !values.counterpartyName.trim() ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.counterpartyEmail)
                }
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
            <CardDescription>Complete payment to submit your dispute.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <dl className="space-y-2 text-sm bg-muted/40 rounded-md p-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Title</dt>
                <dd className="font-medium">{values.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="capitalize">{values.category.replace('_', ' ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Counterparty</dt>
                <dd>{values.counterpartyName}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <dt className="font-medium">Standard Analysis</dt>
                <dd className="font-semibold">$99.00</dd>
              </div>
            </dl>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {!clientSecret ? (
              <div className="flex justify-between">
                <Button variant="outline" onClick={prevStep}>Back</Button>
                <Button onClick={handleProceedToPayment} disabled={loadingSession}>
                  {loadingSession ? 'Loading...' : 'Proceed to Payment'}
                </Button>
              </div>
            ) : (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: { theme: 'stripe' } }}
              >
                <PaymentForm onBack={() => setClientSecret(null)} />
              </Elements>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/disputes/CreateDispute.tsx
git commit -m "feat: embed Stripe Payment Element in dispute creation step 4"
```

---

## Task 12: Frontend — PaymentSuccess page

**Files:**
- Create: `frontend/src/pages/disputes/PaymentSuccess.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/disputes/PaymentSuccess.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { paymentApi } from '@/lib/paymentApi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function PaymentSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id')

  const [state, setState] = useState<'polling' | 'success' | 'error'>('polling')
  const [countdown, setCountdown] = useState(3)
  const disputeIdRef = useRef<string | null>(null)
  const attemptsRef = useRef(0)
  const MAX_ATTEMPTS = 15

  useEffect(() => {
    if (!sessionId) {
      setState('error')
      return
    }

    const interval = setInterval(async () => {
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_ATTEMPTS) {
        clearInterval(interval)
        setState('error')
        return
      }

      try {
        const res = await paymentApi.getSessionStatus(sessionId)
        const { status, disputeId } = res.data

        if (status === 'succeeded' && disputeId) {
          clearInterval(interval)
          disputeIdRef.current = disputeId
          setState('success')
        } else if (status === 'failed') {
          clearInterval(interval)
          setState('error')
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionId])

  useEffect(() => {
    if (state !== 'success') return
    if (countdown <= 0) {
      navigate(`/disputes/${disputeIdRef.current}`)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [state, countdown, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {state === 'polling' && (
            <>
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-lg font-medium">Confirming your payment...</p>
              <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold">Payment confirmed!</p>
              <p className="text-sm text-muted-foreground">
                Redirecting to your dispute in {countdown}...
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-lg font-semibold">Something went wrong</p>
              <p className="text-sm text-muted-foreground">
                Your payment may have been processed but we could not confirm it. Please check your dashboard or contact support.
              </p>
              <Button asChild variant="outline">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/disputes/PaymentSuccess.tsx
git commit -m "feat: add PaymentSuccess page with polling and auto-redirect"
```

---

## Task 13: Frontend — Billing history page

**Files:**
- Create: `frontend/src/pages/settings/Billing.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/settings/Billing.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { paymentApi, PaymentRecord } from '@/lib/paymentApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const STATUS_COLORS: Record<PaymentRecord['status'], string> = {
  pending: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  refunded: 'outline',
}

export function Billing() {
  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentApi.listPayments(),
  })

  const payments = data?.data.payments ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Billing History</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

          {!isLoading && payments.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No payments yet.</p>
          )}

          {payments.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-left font-medium">Dispute</th>
                  <th className="pb-2 text-left font-medium">Amount</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      {p.dispute ? (
                        <Link to={`/disputes/${p.dispute.id}`} className="hover:underline">
                          {p.dispute.title}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3">${Number(p.amountUsd).toFixed(2)}</td>
                    <td className="py-3">
                      <Badge variant={STATUS_COLORS[p.status] as any}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/settings/Billing.tsx
git commit -m "feat: add Billing history page"
```

---

## Task 14: Frontend — wire up routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add new routes**

In `frontend/src/App.tsx`, add the imports and routes. The full updated file:

```tsx
import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Landing } from '@/pages/Landing'
import { NotFound } from '@/pages/NotFound'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { VerifyEmail } from '@/pages/auth/VerifyEmail'
import { InvitationPage } from '@/pages/invitations/InvitationPage'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { Dashboard as DisputesDashboard } from '@/pages/disputes/Dashboard'
import { CreateDispute } from '@/pages/disputes/CreateDispute'
import { DisputeDetail } from '@/pages/disputes/DisputeDetail'
import { BriefWriting } from '@/pages/disputes/BriefWriting'
import { OpinionPage } from '@/pages/disputes/OpinionPage'
import { PaymentSuccess } from '@/pages/disputes/PaymentSuccess'
import { Billing } from '@/pages/settings/Billing'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>

      <Route path="/invite/:token" element={<InvitationPage />} />

      {/* Payment success is public (Stripe redirects here with session_id) */}
      <Route element={<ProtectedRoute />}>
        <Route path="/payment/success" element={<PaymentSuccess />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
        </Route>
        <Route path="/settings" element={<DashboardLayout />}>
          <Route index element={<div className="p-6 text-muted-foreground text-sm">Settings — coming in Phase 10</div>} />
          <Route path="billing" element={<Billing />} />
        </Route>
        <Route path="/disputes" element={<DashboardLayout />}>
          <Route index element={<DisputesDashboard />} />
          <Route path="new" element={<CreateDispute />} />
          <Route path=":id" element={<DisputeDetail />} />
          <Route path=":id/parties/:partyId/brief" element={<BriefWriting />} />
          <Route path=":id/opinion" element={<OpinionPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add /payment/success and /settings/billing routes"
```

---

## Task 15: Manual end-to-end test in dev

- [ ] **Step 1: Set up Stripe CLI webhook forwarding**

In a terminal:

```bash
stripe listen --forward-to localhost:3000/v1/webhooks/stripe
```

Copy the `whsec_...` value printed and set it as `STRIPE_WEBHOOK_SECRET` in `backend/.env`.

- [ ] **Step 2: Start backend and frontend**

Terminal 1:
```bash
cd backend && npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Walk through the payment flow**

1. Log in and go to `/disputes/new`
2. Fill steps 1–3 with valid data
3. On step 4, click "Proceed to Payment" — Payment Element should appear
4. Enter test card `4242 4242 4242 4242`, any future expiry, any CVC
5. Click "Pay $99.00"
6. Should redirect to `/payment/success?session_id=...`
7. Spinner shows "Confirming your payment..."
8. Stripe CLI terminal shows `checkout.session.completed` forwarded
9. After ~2–4 seconds: green checkmark + countdown
10. Auto-redirects to `/disputes/:id`

- [ ] **Step 4: Test declined card**

Repeat with card `4000 0000 0000 0002` — should show inline error on the Payment Element, no redirect.

- [ ] **Step 5: Check billing history**

Go to `/settings/billing` — the $99 payment should appear with status "succeeded" linked to the dispute.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: <describe any fixes from manual testing>"
```

---

## Dev Setup Reminder

Before running locally you need these in your `.env` files (never commit them):

**`backend/.env`:**
```
STRIPE_SECRET_KEY=rk_test_<your restricted test key>
STRIPE_WEBHOOK_SECRET=whsec_<from stripe listen output>
STRIPE_PRICE_STANDARD_CENTS=9900
```

**`frontend/.env`:**
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_<your publishable test key>
```

Get test keys from: Stripe Dashboard → Developers → API Keys (test mode).  
Use a Restricted Key (`rk_test_`) with permissions: Checkout Sessions (write), Refunds (write), Webhooks (read).
