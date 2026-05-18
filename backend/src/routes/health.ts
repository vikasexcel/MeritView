import { Router, Request, Response } from 'express'
import { prisma } from '../prisma/client'

const router = Router()

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() })
  }
})

export default router
