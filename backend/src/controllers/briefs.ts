import { Request, Response } from 'express'
import * as briefService from '../services/briefs'

const VALID_PROVIDERS = ['claude', 'gpt-4', 'gemini']

interface BriefParams {
  id: string
  partyId: string
}

export async function startSession(req: Request<BriefParams>, res: Response) {
  const { id: disputeId, partyId } = req.params
  const { llmProvider = 'claude' } = req.body

  if (!VALID_PROVIDERS.includes(llmProvider)) {
    res.status(400).json({ error: 'invalid llmProvider' })
    return
  }

  const party = await briefService.getPartyForUser(disputeId, partyId, req.user!.id)
  if (!party) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (party.briefStatus === 'submitted') {
    res.status(409).json({ error: 'brief_already_submitted' })
    return
  }

  const session = await briefService.startSession(partyId, disputeId, llmProvider)
  res.status(201).json({ session })
}

export async function saveDraft(req: Request<BriefParams>, res: Response) {
  const { id: disputeId, partyId } = req.params
  const { content } = req.body

  if (!content || typeof content !== 'object') {
    res.status(400).json({ error: 'content object required' })
    return
  }

  const party = await briefService.getPartyForUser(disputeId, partyId, req.user!.id)
  if (!party) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  if (party.briefStatus === 'submitted') {
    res.status(409).json({ error: 'brief_already_submitted' })
    return
  }

  const brief = await briefService.saveDraft(partyId, disputeId, content)
  res.json({ brief })
}

export async function submitBrief(req: Request<BriefParams>, res: Response) {
  const { id: disputeId, partyId } = req.params
  const { content } = req.body

  if (!content || typeof content !== 'object') {
    res.status(400).json({ error: 'content object required' })
    return
  }

  const party = await briefService.getPartyForUser(disputeId, partyId, req.user!.id)
  if (!party) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const result = await briefService.submitBrief(partyId, disputeId, content)

  if ('error' in result) {
    if (result.error === 'min_words') {
      res.status(400).json({ error: 'Brief must be at least 500 words' })
      return
    }
    if (result.error === 'max_words') {
      res.status(400).json({ error: 'Brief exceeds 5000 word limit' })
      return
    }
    if (result.error === 'already_submitted') {
      res.status(409).json({ error: 'Brief already submitted' })
      return
    }
  }

  res.json({ brief: (result as any).brief, bothSubmitted: (result as any).bothSubmitted })
}

export async function getBrief(req: Request<BriefParams>, res: Response) {
  const { id: disputeId, partyId } = req.params

  const isParticipant = await briefService.isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const dispute = await briefService.getDisputeWithBriefs(disputeId)
  if (!dispute) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const requestedParty = dispute.parties.find((p) => p.id === partyId)
  if (!requestedParty) {
    res.status(404).json({ error: 'party not found' })
    return
  }

  const ownParty = dispute.parties.find((p) => p.userId === req.user!.id)
  const isOwnBrief = ownParty?.id === partyId
  const bothSubmitted = dispute.parties.every((p) => p.briefStatus === 'submitted')

  if (!isOwnBrief && !bothSubmitted) {
    res.status(403).json({ error: 'brief not yet accessible' })
    return
  }

  const brief = requestedParty.brief
  if (!brief) {
    res.status(404).json({ error: 'brief not started' })
    return
  }

  res.json({ brief })
}
