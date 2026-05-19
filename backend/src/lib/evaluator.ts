// backend/src/lib/evaluator.ts
import { createLlm, LlmProvider } from './ai'
import { HumanMessage } from '@langchain/core/messages'

export interface EvaluatorResult {
  provider: LlmProvider
  output: EvaluatorOutput
  tokensUsed: number
}

export interface EvaluatorOutput {
  partyAScore: number
  partyBScore: number
  winner: string
  partyAStrengths: string[]
  partyAWeaknesses: string[]
  partyBStrengths: string[]
  partyBWeaknesses: string[]
  reasoning: string
  confidenceScore: number
}

const JUDGE_PROMPT = (partyA: string, partyB: string) => `
You are an impartial dispute resolution evaluator. Read both parties' briefs and provide a structured assessment.

---
PARTY A BRIEF:
${partyA}

---
PARTY B BRIEF:
${partyB}

---
Respond ONLY with a valid JSON object in this exact schema (no markdown, no explanation outside the JSON):
{
  "partyAScore": <1-10 integer>,
  "partyBScore": <1-10 integer>,
  "winner": "<'Party A' | 'Party B' | 'Draw'>",
  "partyAStrengths": ["<strength>"],
  "partyAWeaknesses": ["<weakness>"],
  "partyBStrengths": ["<strength>"],
  "partyBWeaknesses": ["<weakness>"],
  "reasoning": "<2-4 sentence explanation of scoring>",
  "confidenceScore": <0-100 integer>
}
`

const PROVIDERS: LlmProvider[] = ['claude', 'gpt-4', 'gemini']
const MAX_RETRIES = 2

// Runs evaluators in parallel using Promise.allSettled — simpler and equivalent to a LangGraph fan-out for this use case
async function callEvaluator(provider: LlmProvider, partyA: string, partyB: string): Promise<EvaluatorResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }

      const llm = createLlm(provider)
      const response = await llm.invoke([new HumanMessage(JUDGE_PROMPT(partyA, partyB))])
      const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error(`No JSON found in evaluator response from ${provider}`)
      const output: EvaluatorOutput = JSON.parse(jsonMatch[0])
      if (typeof output.partyAScore !== 'number' || typeof output.partyBScore !== 'number') {
        throw new Error(`Invalid evaluator output shape from ${provider}: scores must be numbers`)
      }
      const tokensUsed = (response as any).response_metadata?.tokenUsage?.totalTokens ?? 0
      return { provider, output, tokensUsed }
    } catch (err) {
      lastError = err as Error
    }
  }

  throw lastError ?? new Error(`Evaluator ${provider} failed after ${MAX_RETRIES} retries`)
}

export async function runEvaluators(
  _disputeId: string,
  partyABrief: string,
  partyBBrief: string
): Promise<EvaluatorResult[]> {
  const results = await Promise.allSettled(
    PROVIDERS.map((provider) => callEvaluator(provider, partyABrief, partyBBrief))
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<EvaluatorResult> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successful.length < 2) {
    throw new Error(`Evaluation failed: only ${successful.length} of 3 evaluators succeeded (minimum 2 required)`)
  }

  return successful
}
