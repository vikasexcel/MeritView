import express from 'express'
import helmet from 'helmet'
import 'dotenv/config'
import { toNodeHandler } from 'better-auth/node'
import { corsMiddleware } from './middleware/cors'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'
import disputesRouter from './routes/disputes'
import invitationsRouter from './routes/invitations'
import briefsRouter from './routes/briefs'
import opinionsRouter from './routes/opinions'
import { auth } from './lib/auth'

const app = express()

app.use(helmet())
app.use(corsMiddleware)

// Better Auth handler must come BEFORE express.json()
app.all('/api/auth/{*any}', toNodeHandler(auth))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(rateLimiter)

app.use('/v1', healthRouter)
app.use('/v1/disputes', disputesRouter)
app.use('/v1/disputes/:id/parties/:partyId/brief', briefsRouter)
app.use('/v1/disputes/:id/opinion', opinionsRouter)
app.use('/v1/invitations', invitationsRouter)

app.use(errorHandler)

export default app
