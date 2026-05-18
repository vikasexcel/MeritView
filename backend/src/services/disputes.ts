import { prisma } from '../lib/prisma'
import { DisputeCategory } from '@prisma/client'
import crypto from 'crypto'

export interface CreateDisputeInput {
  title: string
  category: DisputeCategory
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
  initiatorId: string
}

export async function createDispute(input: CreateDisputeInput) {
  const invitationToken = crypto.randomBytes(32).toString('hex')

  const dispute = await prisma.dispute.create({
    data: {
      title: input.title,
      category: input.category,
      summary: input.summary,
      stakes: input.stakes ?? null,
      initiatorId: input.initiatorId,
      state: 'awaiting_counterparty',
      parties: {
        create: [
          { userId: input.initiatorId, role: 'initiator', invitationStatus: 'accepted' },
          {
            role: 'respondent',
            invitationToken,
            invitationStatus: 'pending',
          },
        ],
      },
    },
    include: { parties: true },
  })

  await prisma.auditEvent.create({
    data: {
      eventType: 'dispute_created',
      actorId: input.initiatorId,
      resourceType: 'dispute',
      resourceId: dispute.id,
      eventData: { title: input.title, category: input.category },
    },
  })

  return { dispute, invitationToken }
}

export async function listDisputes(userId: string) {
  return prisma.dispute.findMany({
    where: {
      OR: [
        { initiatorId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: { select: { role: true, userId: true, invitationStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDispute(disputeId: string, userId: string) {
  const dispute = await prisma.dispute.findFirst({
    where: {
      id: disputeId,
      OR: [
        { initiatorId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: {
        select: { id: true, role: true, userId: true, invitationStatus: true, briefStatus: true },
      },
    },
  })
  return dispute
}

export async function getPartyByToken(token: string) {
  return prisma.party.findUnique({
    where: { invitationToken: token },
    include: { dispute: true },
  })
}

export async function acceptInvitation(token: string, userId: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null
  if (party.invitationStatus !== 'pending') return { error: 'already_responded' as const }

  const [updatedParty] = await prisma.$transaction([
    prisma.party.update({
      where: { invitationToken: token },
      data: { userId, invitationStatus: 'accepted' },
    }),
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'in_progress' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_accepted',
        actorId: userId,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  return { party: updatedParty }
}

export async function declineInvitation(token: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null
  if (party.invitationStatus !== 'pending') return { error: 'already_responded' as const }

  await prisma.$transaction([
    prisma.party.update({
      where: { invitationToken: token },
      data: { invitationStatus: 'declined' },
    }),
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'cancelled' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_declined',
        actorId: null,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  return { ok: true }
}
