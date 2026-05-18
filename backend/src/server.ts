import 'dotenv/config'
import app from './app'
import { prisma } from './prisma/client'

const PORT = parseInt(process.env.PORT || '3000', 10)

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
}

main()
