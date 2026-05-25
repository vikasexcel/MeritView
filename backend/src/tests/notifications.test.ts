// src/tests/notifications.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('../lib/email', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendDisputeConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendCounterpartyAcceptedEmail: vi.fn().mockResolvedValue(undefined),
  sendAnalysisStartedEmail: vi.fn().mockResolvedValue(undefined),
  sendOpinionReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/evaluator', () => ({
  EVALUATOR_COUNT: 1,
  runEvaluators: vi.fn().mockResolvedValue([
    {
      provider: 'mock',
      tokensUsed: 0,
      output: {
        partyAScore: 7,
        partyBScore: 5,
        partyAStrengths: ['clear'],
        partyAWeaknesses: ['brief'],
        partyBStrengths: ['concise'],
        partyBWeaknesses: ['vague'],
        partyASuggestedConsiderations: [],
        partyBSuggestedConsiderations: [],
        reasoning: 'mock',
      },
    },
  ]),
}))

vi.mock('../lib/aggregator', () => ({
  aggregateResults: vi.fn().mockResolvedValue({
    partyAPoints: 5,
    partyBPoints: 3,
    overallWinner: 'Party A',
    confidenceScore: 80,
    aggregatorAgreement: 0.9,
    narrative: 'Mock narrative',
    partyAAnalysis: { strengths: ['clear'], weaknesses: [], suggestedConsiderations: [] },
    partyBAnalysis: { strengths: [], weaknesses: ['vague'], suggestedConsiderations: [] },
  }),
}))

import * as emailLib from '../lib/email'
import { submitBrief } from '../services/briefs'
import { triggerEvaluation } from '../services/evaluation'

const AUTH_BASE = '/api/auth'

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    try {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    } catch {
      continue
    }
    const res = await request(app).post(`${AUTH_BASE}/sign-in/email`).send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

describe('POST /v1/disputes — email notifications', () => {
  let cookie: string[]

  beforeEach(async () => {
    vi.clearAllMocks()
    cookie = await registerAndLogin('notif-create@test.meritview')
  })

  it('calls sendDisputeConfirmationEmail with initiator email and dispute title', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Notification Test Dispute',
        category: 'contract',
        summary: 'This is a summary of the notification test dispute.',
        counterpartyEmail: 'counterparty@example.com',
        counterpartyName: 'Counter Party',
      })

    expect(res.status).toBe(201)
    expect(emailLib.sendDisputeConfirmationEmail).toHaveBeenCalledOnce()
    const [to, , title] = (emailLib.sendDisputeConfirmationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('notif-create@test.meritview')
    expect(title).toBe('Notification Test Dispute')
  })

  it('calls sendInvitationEmail with counterparty email and invite URL', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Invitation Email Dispute',
        category: 'contract',
        summary: 'Summary for invitation email test.',
        counterpartyEmail: 'bob@example.com',
        counterpartyName: 'Bob Jones',
      })

    expect(res.status).toBe(201)
    expect(emailLib.sendInvitationEmail).toHaveBeenCalledOnce()
    const [to, name, , url] = (emailLib.sendInvitationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('bob@example.com')
    expect(name).toBe('Bob Jones')
    expect(url).toContain(res.body.invitationToken)
  })
})

describe('POST /v1/invitations/:token/accept — email notification', () => {
  it('calls sendCounterpartyAcceptedEmail with initiator email when counterparty accepts', async () => {
    vi.clearAllMocks()

    // Create initiator + dispute
    const initiatorCookie = await registerAndLogin('notif-initiator@test.meritview')
    const createRes = await request(app)
      .post('/v1/disputes')
      .set('Cookie', initiatorCookie)
      .send({
        title: 'Accept Notification Dispute',
        category: 'contract',
        summary: 'Summary for accept notification test.',
        counterpartyEmail: 'respondent@example.com',
        counterpartyName: 'Respondent',
      })
    expect(createRes.status).toBe(201)
    const { invitationToken } = createRes.body

    vi.clearAllMocks()

    // Register respondent and accept
    const respondentCookie = await registerAndLogin('notif-respondent@test.meritview')
    const acceptRes = await request(app)
      .post(`/v1/invitations/${invitationToken}/accept`)
      .set('Cookie', respondentCookie)

    expect(acceptRes.status).toBe(200)
    expect(emailLib.sendCounterpartyAcceptedEmail).toHaveBeenCalledOnce()
    const [to] = (emailLib.sendCounterpartyAcceptedEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('notif-initiator@test.meritview')
  })
})

describe('submitBrief — analysis started email', () => {
  it('calls sendAnalysisStartedEmail for both parties when both briefs submitted', async () => {
    vi.clearAllMocks()

    // Create two users
    const initiatorEmail = 'notif-brief-a@test.meritview'
    const respondentEmail = 'notif-brief-b@test.meritview'
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: initiatorEmail, password: 'Password123!', name: 'Party A' })
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: respondentEmail, password: 'Password123!', name: 'Party B' })

    const userA = await prisma.user.findUnique({ where: { email: initiatorEmail } })
    const userB = await prisma.user.findUnique({ where: { email: respondentEmail } })
    expect(userA).toBeTruthy()
    expect(userB).toBeTruthy()

    // Create dispute with two parties directly in DB
    const dispute = await prisma.dispute.create({
      data: {
        title: 'Analysis Email Dispute',
        category: 'contract',
        summary: 'Summary for analysis email test.',
        state: 'in_progress',
        initiatorId: userA!.id,
        parties: {
          create: [
            { userId: userA!.id, role: 'initiator', invitationStatus: 'accepted' },
            { userId: userB!.id, role: 'respondent', invitationStatus: 'accepted' },
          ],
        },
      },
      include: { parties: true },
    })

    const [partyA, partyB] = dispute.parties
    const briefContent = { facts: 'Some facts here', position: 'My position', desiredOutcome: 'Resolution' }

    // Submit brief for party A (should not trigger email yet)
    await submitBrief(partyA.id, dispute.id, briefContent)
    expect(emailLib.sendAnalysisStartedEmail).not.toHaveBeenCalled()

    // Submit brief for party B (should trigger analysis started for both)
    await submitBrief(partyB.id, dispute.id, briefContent)

    // Give fire-and-forget a tick to settle
    await new Promise((r) => setTimeout(r, 50))

    expect(emailLib.sendAnalysisStartedEmail).toHaveBeenCalledTimes(2)
    const calls = (emailLib.sendAnalysisStartedEmail as ReturnType<typeof vi.fn>).mock.calls
    const toAddresses = calls.map((c: unknown[]) => c[0])
    expect(toAddresses).toContain(initiatorEmail)
    expect(toAddresses).toContain(respondentEmail)
  })
})

describe('triggerEvaluation — opinion ready email', () => {
  it('calls sendOpinionReadyEmail for both parties after opinion is saved', async () => {
    vi.clearAllMocks()

    // Create two users and a dispute with submitted briefs
    const userAEmail = 'notif-eval-a@test.meritview'
    const userBEmail = 'notif-eval-b@test.meritview'
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: userAEmail, password: 'Password123!', name: 'Eval A' })
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: userBEmail, password: 'Password123!', name: 'Eval B' })

    const userA = await prisma.user.findUnique({ where: { email: userAEmail } })
    const userB = await prisma.user.findUnique({ where: { email: userBEmail } })
    expect(userA).toBeTruthy()
    expect(userB).toBeTruthy()

    const dispute = await prisma.dispute.create({
      data: {
        title: 'Opinion Email Dispute',
        category: 'contract',
        summary: 'Summary for opinion email test.',
        state: 'under_analysis',
        initiatorId: userA!.id,
        parties: {
          create: [
            { userId: userA!.id, role: 'initiator', invitationStatus: 'accepted', briefStatus: 'submitted' },
            { userId: userB!.id, role: 'respondent', invitationStatus: 'accepted', briefStatus: 'submitted' },
          ],
        },
      },
      include: { parties: true },
    })

    const briefContent = { facts: 'Facts', position: 'Position', desiredOutcome: 'Settlement' }
    for (const p of dispute.parties) {
      await prisma.brief.create({
        data: { partyId: p.id, disputeId: dispute.id, content: briefContent, wordCount: 10, status: 'submitted', submittedAt: new Date() },
      })
    }

    vi.clearAllMocks()
    await triggerEvaluation(dispute.id)

    // Give fire-and-forget a tick to settle
    await new Promise((r) => setTimeout(r, 100))

    expect(emailLib.sendOpinionReadyEmail).toHaveBeenCalledTimes(2)
    const calls = (emailLib.sendOpinionReadyEmail as ReturnType<typeof vi.fn>).mock.calls
    const toAddresses = calls.map((c: unknown[]) => c[0])
    expect(toAddresses).toContain(userAEmail)
    expect(toAddresses).toContain(userBEmail)
  })
})
