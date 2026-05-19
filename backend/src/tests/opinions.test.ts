// backend/src/tests/opinions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))
vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        partyAScore: 4, partyBScore: 6, winner: 'Party B',
        partyAStrengths: ['Facts'], partyAWeaknesses: ['Weak'],
        partyBStrengths: ['Strong'], partyBWeaknesses: [],
        reasoning: 'B wins.', confidenceScore: 70,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

let _counter = 2000
function uid() { return `${Date.now()}-${++_counter}` }

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await request(app).post('/api/auth/sign-up/email').send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    try {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    } catch {
      continue
    }
    const res = await request(app).post('/api/auth/sign-in/email').send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

async function createCompletedDispute() {
  const id = uid()
  const initiatorEmail = `op-init-${id}@test.meritview`
  const respondentEmail = `op-resp-${id}@test.meritview`

  const initiatorCookie = await registerAndLogin(initiatorEmail)
  const createRes = await request(app)
    .post('/v1/disputes').set('Cookie', initiatorCookie)
    .send({ title: 'Opinion Test', category: 'contract', summary: 'Testing opinions.', counterpartyEmail: 'op-cp@example.com', counterpartyName: 'Resp' })

  const { dispute, invitationToken } = createRes.body
  const respondentCookie = await registerAndLogin(respondentEmail)
  await request(app).post(`/v1/invitations/${invitationToken}/accept`).set('Cookie', respondentCookie)

  const parties = await prisma.party.findMany({ where: { disputeId: dispute.id } })
  for (const party of parties) {
    await prisma.brief.upsert({
      where: { partyId: party.id },
      create: { partyId: party.id, disputeId: dispute.id, content: { facts: 'word '.repeat(600) }, wordCount: 600, status: 'submitted', submittedAt: new Date() },
      update: { status: 'submitted', submittedAt: new Date() },
    })
    await prisma.party.update({ where: { id: party.id }, data: { briefStatus: 'submitted' } })
  }

  // Wait for dispute to be visible via Prisma connection (Neon read-after-write lag)
  for (let i = 0; i < 10; i++) {
    const exists = await prisma.dispute.findUnique({ where: { id: dispute.id }, select: { id: true } })
    if (exists) break
    await new Promise((r) => setTimeout(r, 200))
  }

  // Manually create opinion and set dispute to completed
  const opinion = await prisma.opinion.create({
    data: {
      disputeId: dispute.id,
      executiveSummary: 'Party B presented stronger evidence overall.',
      partyAAnalysis: { strengths: ['Good facts'], weaknesses: ['Weak arguments'], suggestedConsiderations: [] },
      partyBAnalysis: { strengths: ['Strong evidence'], weaknesses: [], suggestedConsiderations: [] },
      comparativeAssessment: { winner: 'Party B', partyAPoints: 3, partyBPoints: 5 },
      confidenceScore: 75,
      aggregatorAgreement: 1.0,
    },
  })
  await prisma.dispute.update({ where: { id: dispute.id }, data: { state: 'completed' } })

  return { disputeId: dispute.id, opinionId: opinion.id, initiatorCookie, respondentCookie }
}

describe('GET /v1/disputes/:id/opinion', () => {
  let ctx: Awaited<ReturnType<typeof createCompletedDispute>>

  beforeEach(async () => {
    ctx = await createCompletedDispute()
  })

  it('returns opinion for a participant when dispute is completed', async () => {
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(200)
    expect(res.body.opinion.executiveSummary).toBeTruthy()
    expect(res.body.opinion.confidenceScore).toBeGreaterThan(0)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/v1/disputes/${ctx.disputeId}/opinion`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-participant', async () => {
    const outsider = await registerAndLogin(`op-outsider-${uid()}@test.meritview`)
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion`)
      .set('Cookie', outsider)
    expect(res.status).toBe(403)
  })

  it('returns 403 when dispute does not exist (participant check fails)', async () => {
    const res = await request(app)
      .get('/v1/disputes/nonexistent-id/opinion')
      .set('Cookie', ctx.initiatorCookie)
    expect(res.status).toBe(403)
  })

  it('returns 404 when opinion not yet generated', async () => {
    const id = uid()
    const cookie = await registerAndLogin(`op-pending-${id}@test.meritview`)
    const cr = await request(app).post('/v1/disputes').set('Cookie', cookie).send({
      title: 'Pending', category: 'contract', summary: 'Pending opinion test.', counterpartyEmail: 'p@example.com', counterpartyName: 'P',
    })
    await prisma.dispute.update({ where: { id: cr.body.dispute.id }, data: { state: 'under_analysis' } })

    const res = await request(app)
      .get(`/v1/disputes/${cr.body.dispute.id}/opinion`)
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('GET /v1/disputes/:id/opinion/status', () => {
  let ctx: Awaited<ReturnType<typeof createCompletedDispute>>

  beforeEach(async () => {
    ctx = await createCompletedDispute()
  })

  it('returns evaluation status for a participant', async () => {
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('completed')
    expect(res.body.opinionReady).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-participant', async () => {
    const outsider = await registerAndLogin(`op-stat-out-${uid()}@test.meritview`)
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
      .set('Cookie', outsider)
    expect(res.status).toBe(403)
  })
})
