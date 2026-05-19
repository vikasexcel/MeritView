// backend/src/services/evaluation.ts
import { prisma } from '../lib/prisma'
import { runEvaluators } from '../lib/evaluator'
import { aggregateResults } from '../lib/aggregator'
import { BriefContent } from './briefs'

type EvalProgressEvent =
  | { type: 'evaluator_complete'; provider: string; index: number; total: number }
  | { type: 'aggregation_started' }
  | { type: 'opinion_ready'; opinionId: string }

// In-memory progress store keyed by disputeId
const progressListeners = new Map<string, ((event: EvalProgressEvent) => void)[]>()

export function subscribeToProgress(disputeId: string, cb: (event: EvalProgressEvent) => void) {
  if (!progressListeners.has(disputeId)) progressListeners.set(disputeId, [])
  progressListeners.get(disputeId)!.push(cb)
  return () => {
    const listeners = progressListeners.get(disputeId) ?? []
    const idx = listeners.indexOf(cb)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

function emit(disputeId: string, event: EvalProgressEvent) {
  for (const cb of progressListeners.get(disputeId) ?? []) {
    cb(event)
  }
}

function briefToText(content: BriefContent): string {
  const sections = ['facts', 'position', 'arguments', 'acknowledgment', 'desiredOutcome'] as const
  return sections
    .map((s) => (content[s] ? `## ${s}\n${content[s]}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

export async function triggerEvaluation(disputeId: string): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { parties: { include: { brief: true } } },
  })

  if (!dispute) throw new Error(`Dispute ${disputeId} not found`)

  const [partyA, partyB] = dispute.parties
  if (!partyA?.brief || !partyB?.brief) {
    throw new Error(`Both parties must have submitted briefs before evaluation`)
  }

  const partyAText = briefToText(partyA.brief.content as BriefContent)
  const partyBText = briefToText(partyB.brief.content as BriefContent)

  const evaluatorResults = await runEvaluators(disputeId, partyAText, partyBText)

  for (let i = 0; i < evaluatorResults.length; i++) {
    const r = evaluatorResults[i]
    await prisma.evaluatorOutput.create({
      data: {
        disputeId,
        llmProvider: r.provider,
        structuredOutput: r.output as object,
        promptVersion: '1.0',
        tokensUsed: r.tokensUsed,
        cost: 0,
      },
    })
    emit(disputeId, { type: 'evaluator_complete', provider: r.provider, index: i + 1, total: evaluatorResults.length })
  }

  emit(disputeId, { type: 'aggregation_started' })

  const agg = await aggregateResults(disputeId, evaluatorResults)

  const opinion = await prisma.$transaction(async (tx) => {
    const op = await tx.opinion.create({
      data: {
        disputeId,
        executiveSummary: agg.narrative,
        partyAAnalysis: agg.partyAAnalysis as object,
        partyBAnalysis: agg.partyBAnalysis as object,
        comparativeAssessment: {
          winner: agg.overallWinner,
          partyAPoints: agg.partyAPoints,
          partyBPoints: agg.partyBPoints,
        } as object,
        confidenceScore: agg.confidenceScore,
        aggregatorAgreement: agg.aggregatorAgreement,
      },
    })

    await tx.dispute.update({ where: { id: disputeId }, data: { state: 'completed' } })

    await tx.auditEvent.create({
      data: {
        eventType: 'opinion_generated',
        resourceType: 'opinion',
        resourceId: op.id,
        eventData: { disputeId, winner: agg.overallWinner, confidenceScore: agg.confidenceScore },
      },
    })

    return op
  })

  emit(disputeId, { type: 'opinion_ready', opinionId: opinion.id })
}

export async function getEvaluationStatus(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, select: { state: true } })
  const evaluatorOutputs = await prisma.evaluatorOutput.findMany({
    where: { disputeId },
    select: { llmProvider: true, createdAt: true },
  })
  const opinion = await prisma.opinion.findUnique({ where: { disputeId }, select: { id: true } })

  return {
    state: dispute?.state ?? 'unknown',
    evaluatorsCompleted: evaluatorOutputs.length,
    evaluatorsTotal: 3,
    opinionReady: !!opinion,
    opinionId: opinion?.id ?? null,
  }
}
