import { beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'

async function cleanTestData() {
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: '@test.meritview' } },
    select: { id: true },
  })
  const ids = testUsers.map((u) => u.id)

  if (ids.length > 0) {
    // Delete disputes initiated by test users (parties + audit events cascade from disputes)
    await prisma.dispute.deleteMany({ where: { initiatorId: { in: ids } } })
    // Clear actorId on any remaining audit events referencing test users before deleting users
    await prisma.auditEvent.updateMany({ where: { actorId: { in: ids } }, data: { actorId: null } })
  }

  await prisma.user.deleteMany({ where: { email: { contains: '@test.meritview' } } })
}

beforeAll(async () => {
  await cleanTestData()
})

afterAll(async () => {
  await cleanTestData()
  await prisma.$disconnect()
})
