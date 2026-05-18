import { Request, Response } from 'express'
import { DisputeCategory } from '@prisma/client'
import * as disputeService from '../services/disputes'
import { sendInvitationEmail } from '../lib/email'

const VALID_CATEGORIES: DisputeCategory[] = ['contract', 'small_claims', 'partnership']

export async function createDispute(req: Request, res: Response) {
  const { title, category, summary, stakes, counterpartyEmail, counterpartyName } = req.body

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'title must be at least 3 characters' })
    return
  }
  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'invalid category' })
    return
  }
  if (!summary || typeof summary !== 'string' || summary.trim().length < 10) {
    res.status(400).json({ error: 'summary must be at least 10 characters' })
    return
  }
  if (!counterpartyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartyEmail)) {
    res.status(400).json({ error: 'invalid counterparty email' })
    return
  }
  if (!counterpartyName || typeof counterpartyName !== 'string' || counterpartyName.trim().length < 1) {
    res.status(400).json({ error: 'counterparty name is required' })
    return
  }

  const userId = req.user!.id

  if (counterpartyEmail.toLowerCase() === req.user!.email.toLowerCase()) {
    res.status(400).json({ error: 'counterparty cannot be yourself' })
    return
  }

  const { dispute, invitationToken } = await disputeService.createDispute({
    title: title.trim(),
    category,
    summary: summary.trim(),
    stakes: stakes ? Number(stakes) : undefined,
    initiatorId: userId,
  })

  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const inviteUrl = `${appUrl}/invite/${invitationToken}`

  await sendInvitationEmail(counterpartyEmail, counterpartyName, dispute.title, inviteUrl)

  res.status(201).json({ dispute, invitationToken, inviteUrl })
}

export async function listDisputes(req: Request, res: Response) {
  const disputes = await disputeService.listDisputes(req.user!.id)
  res.json({ disputes })
}

export async function getDispute(req: Request, res: Response) {
  const dispute = await disputeService.getDispute(req.params.id as string, req.user!.id)
  if (!dispute) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json({ dispute })
}
