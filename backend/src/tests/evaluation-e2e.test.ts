// backend/src/tests/evaluation-e2e.test.ts
import { describe, it, expect, vi } from 'vitest'
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
        partyAScore: 3, partyBScore: 7, winner: 'Party B',
        partyAStrengths: ['Good timeline'], partyAWeaknesses: ['Missing documentation'],
        partyBStrengths: ['Strong evidence', 'Clear position'], partyBWeaknesses: ['Slightly verbose'],
        reasoning: 'Party B presented more compelling evidence with documentary support.',
        confidenceScore: 82,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

const FILLER = 'The details of this matter are important and well documented. '
const VALID_CONTENT = {
  facts: 'On January 1st we signed a written contract. ' + FILLER.repeat(12),
  position: 'The contractor failed to deliver. ' + FILLER.repeat(10),
  arguments: 'Clause 4.2 specifies damages. ' + FILLER.repeat(10),
  acknowledgment: 'The contractor may argue scope changed. ' + FILLER.repeat(8),
  desiredOutcome: 'Full refund of $25,000. ' + FILLER.repeat(8),
}

let _counter = 3000
function uid() { return `${Date.now()}-${++_counter}` }

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app).post('/api/auth/sign-up/email').send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app).post('/api/auth/sign-in/email').send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

describe('Full evaluation pipeline E2E', () => {
  it('creates dispute → both submit briefs → evaluation runs → opinion accessible', async () => {
    const id = uid()
    const initiatorEmail = `e2e-init-${id}@test.meritview`
    const respondentEmail = `e2e-resp-${id}@test.meritview`

    // Step 1: Create dispute
    const initiatorCookie = await registerAndLogin(initiatorEmail)
    const createRes = await request(app)
      .post('/v1/disputes').set('Cookie', initiatorCookie)
      .send({ title: 'E2E Evaluation Test', category: 'contract', summary: 'E2E test of full evaluation pipeline.', counterpartyEmail: 'e2e-cp@example.com', counterpartyName: 'Respondent' })

    expect(createRes.status).toBe(201)
    const { dispute, invitationToken } = createRes.body

    // Step 2: Respondent accepts
    const respondentCookie = await registerAndLogin(respondentEmail)
    const acceptRes = await request(app)
      .post(`/v1/invitations/${invitationToken}/accept`)
      .set('Cookie', respondentCookie)
    expect(acceptRes.status).toBe(200)

    // Step 3: Get party IDs
    const initiatorParty = dispute.parties.find((p: any) => p.role === 'initiator')
    const respondentPartyRow = await prisma.party.findFirst({ where: { disputeId: dispute.id, role: 'respondent' } })

    // Step 4: Initiator submits brief
    const initSubmit = await request(app)
      .post(`/v1/disputes/${dispute.id}/parties/${initiatorParty.id}/brief/submit`)
      .set('Cookie', initiatorCookie).send({ content: VALID_CONTENT })
    expect(initSubmit.status).toBe(200)
    expect(initSubmit.body.bothSubmitted).toBe(false)

    // Step 5: Poll status — should not be ready yet
    const statusBefore = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion/status`)
      .set('Cookie', initiatorCookie)
    expect(statusBefore.status).toBe(200)
    expect(statusBefore.body.opinionReady).toBe(false)

    // Step 6: Respondent submits brief — triggers async evaluation
    const respSubmit = await request(app)
      .post(`/v1/disputes/${dispute.id}/parties/${respondentPartyRow!.id}/brief/submit`)
      .set('Cookie', respondentCookie).send({ content: VALID_CONTENT })
    expect(respSubmit.status).toBe(200)
    expect(respSubmit.body.bothSubmitted).toBe(true)

    // Step 7: Wait for async evaluation to complete (poll DB, up to 30s)
    let opinion = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const opRes = await prisma.opinion.findUnique({ where: { disputeId: dispute.id } })
      if (opRes) { opinion = opRes; break }
    }
    expect(opinion).not.toBeNull()

    // Step 8: Poll status via API — should be completed
    const statusAfter = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion/status`)
      .set('Cookie', initiatorCookie)
    expect(statusAfter.status).toBe(200)
    expect(statusAfter.body.state).toBe('completed')
    expect(statusAfter.body.opinionReady).toBe(true)

    // Step 9: Read opinion via API — initiator
    const opinionRes = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion`)
      .set('Cookie', initiatorCookie)
    expect(opinionRes.status).toBe(200)
    expect(opinionRes.body.opinion.executiveSummary).toBeTruthy()
    expect(opinionRes.body.opinion.confidenceScore).toBeGreaterThan(0)

    // Step 10: Read opinion via API — respondent
    const opinionResResp = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion`)
      .set('Cookie', respondentCookie)
    expect(opinionResResp.status).toBe(200)

    // Step 11: Verify evaluator outputs stored
    const evalOutputs = await prisma.evaluatorOutput.findMany({ where: { disputeId: dispute.id } })
    expect(evalOutputs.length).toBeGreaterThanOrEqual(2)
    expect(evalOutputs[0].llmProvider).toBeTruthy()
  }, 60000) // allow 60s for async evaluation
})
