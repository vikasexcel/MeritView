// backend/src/tests/evaluation.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))

// Mock LangChain so tests never hit OpenRouter
vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        partyAScore: 3,
        partyBScore: 5,
        winner: 'Party B',
        partyAStrengths: ['Clear facts'],
        partyAWeaknesses: ['Thin arguments'],
        partyBStrengths: ['Strong evidence'],
        partyBWeaknesses: ['Minor tone issues'],
        reasoning: 'Party B presented more concrete evidence.',
        confidenceScore: 75,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

describe('runEvaluators', () => {
  it('returns 3 evaluator outputs for valid briefs', async () => {
    const { runEvaluators } = await import('../lib/evaluator')
    const results = await runEvaluators('dispute-1', 'Brief A content here.', 'Brief B content here.')
    expect(results).toHaveLength(3)
    expect(results[0].provider).toBeTruthy()
    expect(results[0].output.winner).toBeTruthy()
    expect(results[0].output.partyAScore).toBeTypeOf('number')
    expect(results[0].output.partyBScore).toBeTypeOf('number')
  })

  it('includes all three providers', async () => {
    const { runEvaluators } = await import('../lib/evaluator')
    const results = await runEvaluators('dispute-1', 'Brief A.', 'Brief B.')
    const providers = results.map((r) => r.provider)
    expect(providers).toContain('claude')
    expect(providers).toContain('gpt-4')
    expect(providers).toContain('gemini')
  })
})

describe('runEvaluators — failure handling', () => {
  it('still returns results when 2 of 3 providers succeed', async () => {
    let callCount = 0
    vi.mocked(vi.importActual('../lib/ai') as any)
    // Re-mock to make one provider fail
    const { createLlm } = await import('../lib/ai')
    vi.mocked(createLlm).mockImplementationOnce(() => ({
      invoke: vi.fn().mockRejectedValue(new Error('Provider failed')),
    }) as any)

    const { runEvaluators } = await import('../lib/evaluator')
    const results = await runEvaluators('dispute-2', 'Brief A.', 'Brief B.')
    // At least 2 must succeed
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('throws when fewer than 2 evaluators succeed', async () => {
    const { createLlm } = await import('../lib/ai')
    // Make all providers fail
    vi.mocked(createLlm).mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(new Error('All failed')),
    }) as any)

    const { runEvaluators } = await import('../lib/evaluator')
    await expect(runEvaluators('dispute-3', 'Brief A.', 'Brief B.')).rejects.toThrow(
      'minimum 2 required'
    )

    // Restore the mock for subsequent tests
    vi.mocked(createLlm).mockImplementation(() => ({
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          partyAScore: 3, partyBScore: 5, winner: 'Party B',
          partyAStrengths: ['Clear facts'], partyAWeaknesses: ['Thin arguments'],
          partyBStrengths: ['Strong evidence'], partyBWeaknesses: ['Minor tone issues'],
          reasoning: 'Party B presented more concrete evidence.', confidenceScore: 75,
        }),
      }),
    }) as any)
  })
})

describe('aggregateResults', () => {
  it('calculates scores correctly — Party B wins 3 vs 5', async () => {
    const { aggregateResults } = await import('../lib/aggregator')
    const mockResults = [
      {
        provider: 'claude' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 3, partyBScore: 5, winner: 'Party B',
          partyAStrengths: ['Good facts'], partyAWeaknesses: ['Weak arguments'],
          partyBStrengths: ['Strong evidence'], partyBWeaknesses: [],
          reasoning: 'Party B wins.', confidenceScore: 80,
        },
      },
      {
        provider: 'gpt-4' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 4, partyBScore: 6, winner: 'Party B',
          partyAStrengths: ['Clear timeline'], partyAWeaknesses: ['Missing docs'],
          partyBStrengths: ['Thorough'], partyBWeaknesses: ['Lengthy'],
          reasoning: 'Party B more thorough.', confidenceScore: 70,
        },
      },
    ]
    const result = await aggregateResults('dispute-1', mockResults)
    expect(result.partyAPoints).toBeLessThan(result.partyBPoints)
    expect(result.overallWinner).toBe('Party B')
    expect(result.confidenceScore).toBeGreaterThan(0)
    expect(result.narrative).toBeTruthy()
    expect(result.aggregatorAgreement).toBeGreaterThan(0)
  })

  it('returns Draw when scores are equal', async () => {
    const { aggregateResults } = await import('../lib/aggregator')
    const mockResults = [
      {
        provider: 'claude' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 5, partyBScore: 5, winner: 'Draw',
          partyAStrengths: [], partyAWeaknesses: [],
          partyBStrengths: [], partyBWeaknesses: [],
          reasoning: 'Equal.', confidenceScore: 60,
        },
      },
      {
        provider: 'gpt-4' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 5, partyBScore: 5, winner: 'Draw',
          partyAStrengths: [], partyAWeaknesses: [],
          partyBStrengths: [], partyBWeaknesses: [],
          reasoning: 'Equal.', confidenceScore: 60,
        },
      },
    ]
    const result = await aggregateResults('dispute-1', mockResults)
    expect(result.overallWinner).toBe('Draw')
    expect(result.partyAAnalysis.strengths).toBeInstanceOf(Array)
    expect(result.partyAAnalysis.weaknesses).toBeInstanceOf(Array)
    expect(result.partyAAnalysis.suggestedConsiderations).toBeInstanceOf(Array)
  })
})

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app)
      .post('/api/auth/sign-up/email')
      .send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

let _counter = 1000
function uid() { return `${Date.now()}-${++_counter}` }

describe('triggerEvaluation', () => {
  it('creates EvaluatorOutputs and Opinion after running', async () => {
    const { triggerEvaluation } = await import('../services/evaluation')

    const id = uid()
    const initiatorEmail = `eval-init-${id}@test.meritview`
    const respondentEmail = `eval-resp-${id}@test.meritview`

    const initiatorCookie = await registerAndLogin(initiatorEmail)
    const createRes = await request(app)
      .post('/v1/disputes')
      .set('Cookie', initiatorCookie)
      .send({
        title: 'Evaluation Test Dispute',
        category: 'contract',
        summary: 'Testing evaluation.',
        counterpartyEmail: 'eval-counterparty@example.com',
        counterpartyName: 'Respondent',
      })

    const { dispute, invitationToken } = createRes.body
    const respondentCookie = await registerAndLogin(respondentEmail)
    await request(app).post(`/v1/invitations/${invitationToken}/accept`).set('Cookie', respondentCookie)

    // Manually set dispute to under_analysis and create submitted briefs
    await prisma.dispute.update({ where: { id: dispute.id }, data: { state: 'under_analysis' } })
    const parties = await prisma.party.findMany({ where: { disputeId: dispute.id } })
    for (const party of parties) {
      await prisma.brief.upsert({
        where: { partyId: party.id },
        create: {
          partyId: party.id, disputeId: dispute.id,
          content: { facts: 'Fact one two three four five six seven eight nine ten.'.repeat(20) },
          wordCount: 600, status: 'submitted', submittedAt: new Date(),
        },
        update: { status: 'submitted', submittedAt: new Date() },
      })
      await prisma.party.update({ where: { id: party.id }, data: { briefStatus: 'submitted' } })
    }

    await triggerEvaluation(dispute.id)

    const opinion = await prisma.opinion.findUnique({ where: { disputeId: dispute.id } })
    expect(opinion).not.toBeNull()
    expect(opinion?.executiveSummary).toBeTruthy()
    expect(opinion?.confidenceScore).toBeGreaterThan(0)

    const evaluatorOutputs = await prisma.evaluatorOutput.findMany({ where: { disputeId: dispute.id } })
    expect(evaluatorOutputs.length).toBeGreaterThanOrEqual(2)

    const updatedDispute = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(updatedDispute?.state).toBe('completed')
  })
})

describe('brief submission triggers evaluation', () => {
  it('triggerEvaluation is importable and callable as a function', async () => {
    const { triggerEvaluation } = await import('../services/evaluation')
    expect(typeof triggerEvaluation).toBe('function')
  })
})
