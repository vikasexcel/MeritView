import { prisma } from '../lib/prisma'

export interface BriefContent {
  facts?: string
  position?: string
  arguments?: string
  acknowledgment?: string
  desiredOutcome?: string
  [key: string]: string | undefined
}

function countWords(content: BriefContent): number {
  const text = Object.values(content).filter(Boolean).join(' ')
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export async function getPartyForUser(disputeId: string, partyId: string, userId: string) {
  return prisma.party.findFirst({
    where: { id: partyId, disputeId, userId },
  })
}

export async function isDisputeParticipant(disputeId: string, userId: string) {
  const party = await prisma.party.findFirst({
    where: { disputeId, userId },
  })
  return party !== null
}

export async function startSession(partyId: string, disputeId: string, llmProvider: string) {
  return prisma.briefPrepSession.create({
    data: { partyId, disputeId, llmProvider, messages: [], status: 'active' },
  })
}

export async function getActiveSession(partyId: string) {
  return prisma.briefPrepSession.findFirst({
    where: { partyId, status: 'active' },
    orderBy: { createdAt: 'desc' },
  })
}

export async function saveDraft(partyId: string, disputeId: string, content: BriefContent) {
  const wordCount = countWords(content)
  return prisma.brief.upsert({
    where: { partyId },
    create: { partyId, disputeId, content, wordCount, status: 'in_progress' },
    update: { content, wordCount, updatedAt: new Date() },
  })
}

export async function getBrief(partyId: string) {
  return prisma.brief.findUnique({ where: { partyId } })
}

export async function submitBrief(partyId: string, disputeId: string, content: BriefContent) {
  const wordCount = countWords(content)

  if (wordCount > 5000) {
    return { error: 'max_words' as const }
  }

  const existing = await prisma.brief.findUnique({ where: { partyId } })
  if (existing?.status === 'submitted') {
    return { error: 'already_submitted' as const }
  }

  const brief = await prisma.$transaction(async (tx) => {
    const b = await tx.brief.upsert({
      where: { partyId },
      create: { partyId, disputeId, content, wordCount, status: 'submitted', submittedAt: new Date() },
      update: { content, wordCount, status: 'submitted', submittedAt: new Date() },
    })

    await tx.party.update({
      where: { id: partyId },
      data: { briefStatus: 'submitted' },
    })

    await tx.auditEvent.create({
      data: {
        eventType: 'brief_submitted',
        resourceType: 'brief',
        resourceId: b.id,
        eventData: { disputeId, partyId, wordCount },
      },
    })

    return b
  })

  // Check if both parties have submitted — if so, trigger evaluation
  const allParties = await prisma.party.findMany({ where: { disputeId } })
  const allSubmitted = allParties.every((p) => p.briefStatus === 'submitted')

  if (allSubmitted) {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { state: 'under_analysis' },
    })
    await prisma.auditEvent.create({
      data: {
        eventType: 'evaluation_started',
        resourceType: 'dispute',
        resourceId: disputeId,
        eventData: { triggeredBy: 'both_briefs_submitted' },
      },
    })
    // Fire evaluation asynchronously — do not await so HTTP response is not delayed
    console.log(`[briefs] both submitted, triggering evaluation for dispute ${disputeId}`)
    import('../services/evaluation').then(({ triggerEvaluation }) =>
      triggerEvaluation(disputeId).catch((err) =>
        console.error(`[briefs] triggerEvaluation crashed for ${disputeId}:`, err)
      )
    )
  }

  return { brief, bothSubmitted: allSubmitted }
}

export async function getDisputeWithBriefs(disputeId: string) {
  return prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      parties: { include: { brief: true } },
    },
  })
}
