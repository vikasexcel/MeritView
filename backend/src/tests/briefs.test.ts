// backend/src/tests/briefs.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

// Silence nodemailer so integration tests don't need real SMTP credentials
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))

// Mock LangChain so AI chat tests don't need a real API key
vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    stream: vi.fn(async function* () {
      yield { content: 'Here is some AI guidance for your brief.' }
      yield { content: ' Let me help you structure your facts.' }
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

const AUTH_BASE = '/api/auth'

async function registerAndLogin(email: string) {
  // Retry once: Neon serverless can fail the Account FK on cold connections
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app)
      .post(`${AUTH_BASE}/sign-up/email`)
      .send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app)
      .post(`${AUTH_BASE}/sign-in/email`)
      .send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

let _counter = 0
function uid() {
  return `${Date.now()}-${++_counter}`
}

async function createDisputeInProgress() {
  const id = uid()
  const initiatorEmail = `brief-init-${id}@test.meritview`
  const respondentEmail = `brief-resp-${id}@test.meritview`

  const initiatorCookie = await registerAndLogin(initiatorEmail)
  const createRes = await request(app)
    .post('/v1/disputes')
    .set('Cookie', initiatorCookie)
    .send({
      title: 'Brief Test Dispute',
      category: 'contract',
      summary: 'A dispute for testing brief functionality.',
      counterpartyEmail: 'brief-respondent-external@example.com',
      counterpartyName: 'Respondent',
    })

  const { dispute, invitationToken } = createRes.body

  const respondentCookie = await registerAndLogin(respondentEmail)
  await request(app)
    .post(`/v1/invitations/${invitationToken}/accept`)
    .set('Cookie', respondentCookie)

  const initiatorParty = dispute.parties.find((p: any) => p.role === 'initiator')
  const respondentPartyRow = await prisma.party.findFirst({
    where: { disputeId: dispute.id, role: 'respondent' },
  })

  return {
    disputeId: dispute.id as string,
    initiatorCookie,
    respondentCookie,
    initiatorPartyId: initiatorParty.id as string,
    respondentPartyId: respondentPartyRow!.id,
  }
}

// ~600 words total to satisfy the 500-word minimum for submission
const FILLER = 'The details of this matter are important and well documented. '
const VALID_CONTENT = {
  facts:
    'On January 1st we signed a written contract for custom software delivery with a fixed deadline of March 31st. ' +
    'The total contract value was $50,000 with 50% paid upfront. ' +
    'The deadline was March 31st and the work was not delivered on time despite multiple reminders. ' +
    'Three separate emails were sent on February 15th, March 1st, and March 20th requesting status updates. ' +
    'No substantive response was received to any of these communications. ' +
    'We suffered direct financial losses including lost client contracts and staff overtime costs. ' +
    FILLER.repeat(5),
  position:
    'The contractor failed to meet their core contractual obligations and materially breached the agreement. ' +
    'We acted in good faith at every stage and fulfilled all our payment obligations on the agreed schedule. ' +
    'The contractor provided no valid reason for the delay and offered no remediation plan. ' +
    'We are entitled to a full refund and compensation for consequential losses under the contract terms. ' +
    FILLER.repeat(4),
  arguments:
    'Clause 4.2 of the contract specifies liquidated damages of $500 per day for late delivery. ' +
    'We have email records showing three unanswered follow-up communications. ' +
    'A third-party technical audit confirmed the deliverables were less than 30% complete at the deadline. ' +
    'The contractor had agreed in writing to all scope changes and confirmed the original deadline remained valid. ' +
    'Industry standard for this type of project is a 90-day delivery window which was well exceeded. ' +
    FILLER.repeat(4),
  acknowledgment:
    'The contractor may argue that scope changes contributed to delays, which is a reasonable position to consider. ' +
    'While the scope did evolve over the project lifecycle, all changes were documented, approved, and agreed to in writing. ' +
    'Each change order included a timeline assessment and the original delivery date was reconfirmed each time. ' +
    FILLER.repeat(3),
  desiredOutcome:
    'We seek a full refund of the advance payment of $25,000 paid on project commencement. ' +
    'Additionally we request compensation of $15,000 for the financial losses directly caused by the delivery failure. ' +
    'We are open to a structured settlement provided it addresses the full scope of our losses. ' +
    FILLER.repeat(3),
}

// ──────────────────────────────────────────────────────────
// POST /v1/disputes/:id/parties/:partyId/brief/session
// ──────────────────────────────────────────────────────────
describe('POST /brief/session', () => {
  let ctx: Awaited<ReturnType<typeof createDisputeInProgress>>

  beforeEach(async () => {
    ctx = await createDisputeInProgress()
  })

  it('creates a session and returns 201', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/session`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ llmProvider: 'claude' })

    expect(res.status).toBe(201)
    expect(res.body.session.id).toBeTruthy()
    expect(res.body.session.llmProvider).toBe('claude')
    expect(res.body.session.status).toBe('active')
  })

  it('defaults llmProvider to claude', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/session`)
      .set('Cookie', ctx.initiatorCookie)
      .send({})

    expect(res.status).toBe(201)
    expect(res.body.session.llmProvider).toBe('claude')
  })

  it('returns 400 for invalid llmProvider', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/session`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ llmProvider: 'grok' })

    expect(res.status).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/session`)
      .send({ llmProvider: 'claude' })

    expect(res.status).toBe(401)
  })

  it('returns 403 when accessing another party', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/session`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ llmProvider: 'claude' })

    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────────
// PUT /v1/disputes/:id/parties/:partyId/brief/draft
// ──────────────────────────────────────────────────────────
describe('PUT /brief/draft', () => {
  let ctx: Awaited<ReturnType<typeof createDisputeInProgress>>

  beforeEach(async () => {
    ctx = await createDisputeInProgress()
  })

  it('saves a draft and returns 200', async () => {
    const res = await request(app)
      .put(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/draft`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(200)
    expect(res.body.brief.wordCount).toBeGreaterThan(0)
    expect(res.body.brief.status).toBe('in_progress')
  })

  it('can overwrite draft with a second save', async () => {
    const base = `/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/draft`

    await request(app)
      .put(base)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: { ...VALID_CONTENT, facts: 'First version facts here.' } })

    const res = await request(app)
      .put(base)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(200)
    // Only one brief row should exist for this party
    const count = await prisma.brief.count({ where: { partyId: ctx.initiatorPartyId } })
    expect(count).toBe(1)
  })

  it('returns 400 without content', async () => {
    const res = await request(app)
      .put(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/draft`)
      .set('Cookie', ctx.initiatorCookie)
      .send({})

    expect(res.status).toBe(400)
  })

  it('returns 403 when accessing another party', async () => {
    const res = await request(app)
      .put(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/draft`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────────
// POST /v1/disputes/:id/parties/:partyId/brief/submit
// ──────────────────────────────────────────────────────────
describe('POST /brief/submit', () => {
  let ctx: Awaited<ReturnType<typeof createDisputeInProgress>>

  beforeEach(async () => {
    ctx = await createDisputeInProgress()
  })

  it('submits brief and returns 200', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(200)
    expect(res.body.brief.status).toBe('submitted')
    expect(res.body.brief.submittedAt).toBeTruthy()
  })

  it('updates party briefStatus to submitted', async () => {
    await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    const party = await prisma.party.findUnique({ where: { id: ctx.initiatorPartyId } })
    expect(party?.briefStatus).toBe('submitted')
  })

  it('returns 400 when brief is under 500 words', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: { facts: 'Too short.' } })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/500/)
  })

  it('returns 400 when brief exceeds 5000 words', async () => {
    const longText = 'word '.repeat(5001)
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: { facts: longText } })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/5000/)
  })

  it('returns 409 on double submission', async () => {
    const base = `/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`

    await request(app)
      .post(base)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    const res = await request(app)
      .post(base)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(409)
  })

  it('transitions dispute to under_analysis when both parties submit', async () => {
    await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/submit`)
      .set('Cookie', ctx.respondentCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(200)
    expect(res.body.bothSubmitted).toBe(true)

    const dispute = await prisma.dispute.findUnique({ where: { id: ctx.disputeId } })
    expect(dispute?.state).toBe('under_analysis')
  })

  it('returns 403 when accessing another party', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/disputes/:id/parties/:partyId/brief
// ──────────────────────────────────────────────────────────
describe('GET /brief — data isolation', () => {
  let ctx: Awaited<ReturnType<typeof createDisputeInProgress>>

  beforeEach(async () => {
    ctx = await createDisputeInProgress()
  })

  it('returns own brief after saving a draft', async () => {
    await request(app)
      .put(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/draft`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(200)
    expect(res.body.brief.status).toBe('in_progress')
  })

  it('blocks access to opponent brief before both submitted', async () => {
    await request(app)
      .put(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/draft`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    // Respondent tries to read initiator's brief — should be blocked
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief`)
      .set('Cookie', ctx.respondentCookie)

    expect(res.status).toBe(403)
  })

  it('allows both parties to read each other brief after both submit', async () => {
    await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/submit`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ content: VALID_CONTENT })

    await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/submit`)
      .set('Cookie', ctx.respondentCookie)
      .send({ content: VALID_CONTENT })

    // Respondent can now read initiator's brief
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief`)
      .set('Cookie', ctx.respondentCookie)

    expect(res.status).toBe(200)
    expect(res.body.brief.status).toBe('submitted')
  })

  it('returns 404 when brief has not been started', async () => {
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(404)
  })

  it('returns 403 for a completely unrelated user', async () => {
    const outsiderCookie = await registerAndLogin('brief-outsider@test.meritview')

    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief`)
      .set('Cookie', outsiderCookie)

    expect(res.status).toBe(403)
  })
})

// ──────────────────────────────────────────────────────────
// POST /brief/chat (AI streaming)
// ──────────────────────────────────────────────────────────
describe('POST /brief/chat', () => {
  let ctx: Awaited<ReturnType<typeof createDisputeInProgress>>
  let sessionId: string

  beforeEach(async () => {
    ctx = await createDisputeInProgress()
    const sessionRes = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/session`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ llmProvider: 'claude' })
    sessionId = sessionRes.body.session.id
  })

  it('streams a response and returns SSE content-type', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/chat`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ message: 'What happened in this dispute?', sessionId })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('data:')
    expect(res.text).toContain('"done":true')
  })

  it('persists assistant reply in session messages', async () => {
    await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/chat`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ message: 'Tell me about the facts section.', sessionId })

    const session = await prisma.briefPrepSession.findUnique({ where: { id: sessionId } })
    const messages = session!.messages as Array<{ role: string; content: string }>
    expect(messages.length).toBe(2) // user + assistant
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
  })

  it('returns 400 for empty message', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/chat`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ message: '   ', sessionId })

    expect(res.status).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/chat`)
      .send({ message: 'hello', sessionId })

    expect(res.status).toBe(401)
  })

  it('returns 403 when accessing another party', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.respondentPartyId}/brief/chat`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ message: 'hello', sessionId })

    expect(res.status).toBe(403)
  })

  it('returns 404 for unknown session', async () => {
    const res = await request(app)
      .post(`/v1/disputes/${ctx.disputeId}/parties/${ctx.initiatorPartyId}/brief/chat`)
      .set('Cookie', ctx.initiatorCookie)
      .send({ message: 'hello', sessionId: 'nonexistent-session-id' })

    expect(res.status).toBe(404)
  })
})
