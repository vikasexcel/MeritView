import { Request, Response } from 'express'
import * as disputeService from '../services/disputes'

export async function getInvitation(req: Request, res: Response) {
  const party = await disputeService.getPartyByToken(req.params.token as string)
  if (!party) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  res.json({
    disputeTitle: party.dispute.title,
    disputeCategory: party.dispute.category,
    disputeSummary: party.dispute.summary,
    invitationStatus: party.invitationStatus,
    disputeState: party.dispute.state,
  })
}

export async function acceptInvitation(req: Request, res: Response) {
  const result = await disputeService.acceptInvitation(req.params.token as string, req.user!.id)
  if (result === null) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  if ('error' in result) {
    res.status(409).json({ error: result.error })
    return
  }
  res.json({ ok: true, party: result.party })
}

export async function declineInvitation(req: Request, res: Response) {
  const userId = req.user?.id
  const result = await disputeService.declineInvitation(req.params.token as string, userId)
  if (result === null) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  if ('error' in result) {
    res.status(409).json({ error: result.error })
    return
  }
  res.json({ ok: true })
}
