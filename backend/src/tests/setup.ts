import { beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/prisma'

async function cleanTestData() {
  // Use raw SQL to delete in dependency order without FK constraint violations
  await prisma.$executeRaw`
    DELETE FROM "BriefPrepSession" WHERE "disputeId" IN (
      SELECT d.id FROM "Dispute" d
      JOIN "User" u ON u.id = d."initiatorId"
      WHERE u.email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Brief" WHERE "partyId" IN (
      SELECT p.id FROM "Party" p
      JOIN "Dispute" d ON d.id = p."disputeId"
      JOIN "User" u ON u.id = d."initiatorId"
      WHERE u.email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "AuditEvent" WHERE "resourceId" IN (
      SELECT d.id FROM "Dispute" d
      JOIN "User" u ON u.id = d."initiatorId"
      WHERE u.email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    UPDATE "AuditEvent" SET "actorId" = NULL WHERE "actorId" IN (
      SELECT id FROM "User" WHERE email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Party" WHERE "disputeId" IN (
      SELECT d.id FROM "Dispute" d
      JOIN "User" u ON u.id = d."initiatorId"
      WHERE u.email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Payment" WHERE "userId" IN (
      SELECT id FROM "User" WHERE email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Dispute" WHERE "initiatorId" IN (
      SELECT id FROM "User" WHERE email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Session" WHERE "userId" IN (
      SELECT id FROM "User" WHERE email LIKE '%@test.meritview'
    )
  `
  await prisma.$executeRaw`
    DELETE FROM "Account" WHERE "userId" IN (
      SELECT id FROM "User" WHERE email LIKE '%@test.meritview'
    )
  `
  await prisma.user.deleteMany({ where: { email: { contains: '@test.meritview' } } })
}

beforeAll(async () => {
  // Warm up the Neon serverless connection before any tests run
  await prisma.$queryRaw`SELECT 1`
  await cleanTestData()
})

afterAll(async () => {
  await cleanTestData()
  await prisma.$disconnect()
})
