import express from 'express'
import helmet from 'helmet'
import 'dotenv/config'
import { toNodeHandler } from 'better-auth/node'
import { corsMiddleware } from './middleware/cors'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'
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

app.use(errorHandler)

export default app
