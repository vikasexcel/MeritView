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
