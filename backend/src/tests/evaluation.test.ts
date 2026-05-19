// backend/src/tests/evaluation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
