// backend/src/controllers/opinions.ts
import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { subscribeToProgress, getEvaluationStatus } from '../services/evaluation'
import { isDisputeParticipant } from '../services/briefs'

interface OpinionParams {
  id: string
}

export async function getOpinion(req: Request<OpinionParams>, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) {
    res.status(404).json({ error: 'dispute not found' })
    return
  }

  const opinion = await prisma.opinion.findUnique({ where: { disputeId } })
  if (!opinion) {
    res.status(404).json({ error: 'opinion not yet available' })
    return
  }

  res.json({ opinion })
}

export async function getOpinionStatus(req: Request<OpinionParams>, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const status = await getEvaluationStatus(disputeId)
  res.json(status)
}

export async function getOpinionPdf(req: Request<OpinionParams>, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  res.status(501).json({ error: 'PDF generation not yet implemented' })
}

export async function streamOpinionProgress(req: Request<OpinionParams>, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  let timer: ReturnType<typeof setTimeout>
  try {
    // Send current status immediately so client doesn't wait
    const currentStatus = await getEvaluationStatus(disputeId)
    send('status', currentStatus)

    if (currentStatus.opinionReady) {
      send('opinion_ready', { opinionId: currentStatus.opinionId })
      res.end()
      return
    }

    const unsubscribe = subscribeToProgress(disputeId, (event) => {
      send(event.type, event)
      if (event.type === 'opinion_ready') {
        clearTimeout(timer)
        unsubscribe()
        res.end()
      }
    })

    req.on('close', () => {
      unsubscribe()
      clearTimeout(timer)
    })

    // Safety timeout — close SSE after 5 minutes
    timer = setTimeout(() => {
      unsubscribe()
      res.end()
    }, 5 * 60 * 1000)
    timer.unref()
  } catch {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'internal' })}\n\n`)
    res.end()
  }
}
