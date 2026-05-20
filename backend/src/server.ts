import 'dotenv/config'
import app from './app'
import { prisma } from './prisma/client'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function resumeStuckEvaluations() {
  const stuck = await prisma.dispute.findMany({
    where: { state: 'under_analysis' },
    select: { id: true },
  })
  if (stuck.length === 0) return
  console.log(`[startup] resuming ${stuck.length} stuck evaluation(s)`)
  const { triggerEvaluation } = await import('./services/evaluation')
  for (const { id } of stuck) {
    triggerEvaluation(id).catch((err) =>
      console.error(`[startup] re-trigger failed for ${id}:`, err)
    )
  }
}

async function main() {
  try {
    await prisma.$connect()
    console.log('Database connected')
  } catch (err) {
    console.error('Database connection failed:', err)
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Health check: http://localhost:${PORT}/v1/health`)
  })

  await resumeStuckEvaluations()
}

main()
