// backend/src/lib/aggregator.ts
import { createLlm } from './ai'
import { HumanMessage } from '@langchain/core/messages'
import { EvaluatorResult } from './evaluator'

export interface AggregateOutput {
  partyAPoints: number
  partyBPoints: number
  overallWinner: string
  confidenceScore: number
  aggregatorAgreement: number
  narrative: string
  partyAAnalysis: { strengths: string[]; weaknesses: string[]; suggestedConsiderations: string[] }
  partyBAnalysis: { strengths: string[]; weaknesses: string[]; suggestedConsiderations: string[] }
}

function scorePoints(results: EvaluatorResult[]): { partyAPoints: number; partyBPoints: number } {
  let partyAPoints = 0
  let partyBPoints = 0

  for (const r of results) {
    const diff = Math.abs(r.output.partyAScore - r.output.partyBScore)
    const aWins = r.output.partyAScore > r.output.partyBScore
    const bWins = r.output.partyBScore > r.output.partyAScore

    if (!aWins && !bWins) {
      // Draw — 1 point each
      partyAPoints += 1
      partyBPoints += 1
    } else if (diff <= 2) {
      // Slight win — 3 pts
      if (aWins) partyAPoints += 3
      else partyBPoints += 3
    } else {
      // Strong win — 5 pts
      if (aWins) partyAPoints += 5
      else partyBPoints += 5
    }
  }

  return { partyAPoints, partyBPoints }
}

function calcAgreement(results: EvaluatorResult[]): number {
  const winners = results.map((r) => r.output.winner)
  const uniqueWinners = new Set(winners)
  if (uniqueWinners.size === 1) return 1.0
  if (uniqueWinners.size === results.length) return 0.0
  const majority = Math.max(...[...uniqueWinners].map((w) => winners.filter((x) => x === w).length))
  return majority / results.length
}

function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))]
}

async function buildNarrative(results: EvaluatorResult[], winner: string): Promise<string> {
  const summaries = results.map((r, i) => `Evaluator ${i + 1} (${r.provider}): ${r.output.reasoning}`).join('\n')

  const prompt = `You are synthesizing dispute evaluation results into a neutral narrative summary.

Evaluator findings:
${summaries}

Overall winner: ${winner}

Write a 3-5 sentence neutral narrative synthesis of these evaluations. Do not use evaluator numbers — write as if presenting a unified analysis. Be factual and objective.`

  try {
    const llm = createLlm('claude')
    const response = await llm.invoke([new HumanMessage(prompt)])
    return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
  } catch {
    return 'Narrative synthesis unavailable.'
  }
}

export async function aggregateResults(
  _disputeId: string, // reserved for logging/tracing by caller
  results: EvaluatorResult[]
): Promise<AggregateOutput> {
  if (results.length === 0) throw new Error('aggregateResults requires at least one result')
  const { partyAPoints, partyBPoints } = scorePoints(results)
  const overallWinner = partyAPoints > partyBPoints ? 'Party A' : partyBPoints > partyAPoints ? 'Party B' : 'Draw'
  const aggregatorAgreement = calcAgreement(results)
  const avgConfidence = Math.round(results.reduce((s, r) => s + r.output.confidenceScore, 0) / results.length)
  const narrative = await buildNarrative(results, overallWinner)

  const partyAStrengths = dedupeStrings(results.flatMap((r) => r.output.partyAStrengths))
  const partyAWeaknesses = dedupeStrings(results.flatMap((r) => r.output.partyAWeaknesses))
  const partyBStrengths = dedupeStrings(results.flatMap((r) => r.output.partyBStrengths))
  const partyBWeaknesses = dedupeStrings(results.flatMap((r) => r.output.partyBWeaknesses))

  return {
    partyAPoints,
    partyBPoints,
    overallWinner,
    confidenceScore: avgConfidence,
    aggregatorAgreement,
    narrative,
    partyAAnalysis: {
      strengths: partyAStrengths,
      weaknesses: partyAWeaknesses,
      suggestedConsiderations: partyAWeaknesses.map((w) => `Address: ${w}`),
    },
    partyBAnalysis: {
      strengths: partyBStrengths,
      weaknesses: partyBWeaknesses,
      suggestedConsiderations: partyBWeaknesses.map((w) => `Address: ${w}`),
    },
  }
}
