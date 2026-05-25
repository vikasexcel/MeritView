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
    ui_mode: 'custom' as any,
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
          eventData: { stripeSessionId: session.id, amountUsd: STANDARD_AMOUNT_CENTS / 100 },
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

  if (!payment.stripePaymentIntentId) {
    throw new Error('No payment_intent on record — cannot refund')
  }
  await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId })

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
