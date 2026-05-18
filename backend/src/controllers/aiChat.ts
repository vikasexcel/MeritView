import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { createLlm, buildLangChainMessages, ChatMessage, LlmProvider } from '../lib/ai'
import * as briefService from '../services/briefs'

interface AiChatParams {
  id: string
  partyId: string
}

export async function streamChat(req: Request<AiChatParams>, res: Response) {
  const { id: disputeId, partyId } = req.params
  const { message, sessionId } = req.body

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message required' })
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

  let session = sessionId
    ? await prisma.briefPrepSession.findUnique({ where: { id: sessionId, partyId } })
    : await prisma.briefPrepSession.findFirst({
        where: { partyId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      })

  if (!session) {
    res.status(404).json({ error: 'session not found' })
    return
  }

  const history = (session.messages as unknown as ChatMessage[]) ?? []
  const messages = buildLangChainMessages(history, message.trim())
  const llm = createLlm(session.llmProvider as LlmProvider, true)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  let fullResponse = ''

  try {
    const stream = await llm.stream(messages)

    for await (const chunk of stream) {
      const text = typeof chunk.content === 'string' ? chunk.content : ''
      if (text) {
        fullResponse += text
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }

    const updatedMessages: ChatMessage[] = [
      ...history,
      { role: 'user', content: message.trim() },
      { role: 'assistant', content: fullResponse },
    ]

    await prisma.briefPrepSession.update({
      where: { id: session.id },
      data: {
        messages: updatedMessages as unknown as Parameters<typeof prisma.briefPrepSession.update>[0]['data']['messages'],
        totalTokens: { increment: updatedMessages.length * 100 },
      },
    })

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  } catch (err) {
    console.error('[streamChat] error:', err)
    res.write(`data: ${JSON.stringify({ error: 'stream failed' })}\n\n`)
    res.end()
  }
}
