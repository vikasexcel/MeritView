import { Request, Response } from 'express'
import * as paymentsService from '../services/payments'
import { WebhookSignatureError } from '../services/payments'
import { DisputeCategory } from '@prisma/client'

const VALID_CATEGORIES: DisputeCategory[] = ['contract', 'small_claims', 'partnership']

export async function createCheckoutSession(req: Request, res: Response) {
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
  if (summary.trim().length > 500) {
    res.status(400).json({ error: 'summary must be 500 characters or less' })
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
  if (counterpartyEmail.toLowerCase() === (req.user!.email as string).toLowerCase()) {
    res.status(400).json({ error: 'counterparty cannot be yourself' })
    return
  }

  const result = await paymentsService.createCheckoutSession(req.user!.id as string, {
    title: title.trim(),
    category,
    summary: summary.trim(),
    stakes: stakes ? Number(stakes) : undefined,
    counterpartyEmail,
    counterpartyName,
  })

  res.status(201).json(result)
}

export async function getSessionStatus(req: Request, res: Response) {
  const status = await paymentsService.getSessionStatus(req.params.sessionId as string, req.user!.id as string)
  if (!status) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json(status)
}

export async function listPayments(req: Request, res: Response) {
  const payments = await paymentsService.listPayments(req.user!.id as string)
  res.json({ payments })
}

export async function handleWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string
  if (!signature) {
    res.status(400).json({ error: 'missing stripe-signature header' })
    return
  }

  try {
    await paymentsService.handleWebhookEvent(req.body as Buffer, signature)
    res.json({ received: true })
  } catch (err: any) {
    if (err instanceof WebhookSignatureError) {
      // 400 = don't retry
      res.status(400).json({ error: err.message })
    } else {
      // 500 = retry (transient DB error etc.)
      console.error('[webhook] Processing error:', err)
      res.status(500).json({ error: 'Internal error processing webhook' })
    }
  }
}
