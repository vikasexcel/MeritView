import type { auth } from '../lib/auth'

type Session = typeof auth.$Infer.Session.session
type User = typeof auth.$Infer.Session.user

declare global {
  namespace Express {
    interface Request {
      user?: User
      session?: Session
    }
  }
}

export {}
