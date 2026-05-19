// backend/src/tests/evaluation.test.ts
import { describe, it, expect, vi } from 'vitest'

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
