import express from 'express'
import helmet from 'helmet'
import 'dotenv/config'
import { corsMiddleware } from './middleware/cors'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'

const app = express()

app.use(helmet())
app.use(corsMiddleware)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(rateLimiter)

app.use('/v1', healthRouter)

app.use(errorHandler)

export default app
