import { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })

  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  req.user = session.user
  req.session = session.session
  next()
}

export function requireRole(role: 'user' | 'admin') {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, async () => {
      const userWithRole = req.user as (typeof req.user & { role?: string }) | undefined
      if (userWithRole?.role !== role) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      next()
    })
  }
}
