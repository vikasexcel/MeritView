import { beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@test.meritview' } } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@test.meritview' } } })
  await prisma.$disconnect()
})
