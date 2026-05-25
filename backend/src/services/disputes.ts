import { prisma } from '../lib/prisma'
import { DisputeCategory } from '@prisma/client'
import crypto from 'crypto'
import { createRefund } from './payments'
import { sendCounterpartyAcceptedEmail } from '../lib/email'

export interface CreateDisputeInput {
  title: string
  category: DisputeCategory
  summary: string
  stakes?: number
  initiatorId: string
}

export async function createDispute(input: CreateDisputeInput) {
  const invitationToken = crypto.randomBytes(32).toString('hex')

  const dispute = await prisma.$transaction(async (tx) => {
    const d = await tx.dispute.create({
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

    await tx.auditEvent.create({
      data: {
        eventType: 'dispute_created',
        actorId: input.initiatorId,
        resourceType: 'dispute',
        resourceId: d.id,
        eventData: { title: input.title, category: input.category },
      },
    })

    return d
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

  const updated = await prisma.party.updateMany({
    where: { invitationToken: token, invitationStatus: 'pending' },
    data: { userId, invitationStatus: 'accepted' },
  })

  if (updated.count === 0) return { error: 'already_responded' as const }

  await prisma.$transaction([
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

  const disputeForEmail = await prisma.dispute.findUnique({
    where: { id: party.disputeId },
    include: { initiator: { select: { email: true, name: true } } },
  })
  if (disputeForEmail?.initiator) {
    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    sendCounterpartyAcceptedEmail(
      disputeForEmail.initiator.email,
      disputeForEmail.initiator.name ?? 'there',
      disputeForEmail.title,
      `${appUrl}/disputes/${disputeForEmail.id}`
    ).catch((err) => console.error('[acceptInvitation] Failed to send counterparty accepted email:', err))
  }

  const updatedParty = await prisma.party.findUnique({ where: { invitationToken: token } })
  return { party: updatedParty! }
}

export async function declineInvitation(token: string, userId?: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null

  const updated = await prisma.party.updateMany({
    where: { invitationToken: token, invitationStatus: 'pending' },
    data: { invitationStatus: 'declined' },
  })

  if (updated.count === 0) return { error: 'already_responded' as const }

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'cancelled' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_declined',
        actorId: userId ?? null,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  createRefund(party.disputeId).catch((err) =>
    console.error('[declineInvitation] Failed to create refund:', err)
  )

  return { ok: true }
}
