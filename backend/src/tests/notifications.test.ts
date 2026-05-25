// src/tests/notifications.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('../lib/email', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendDisputeConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendCounterpartyAcceptedEmail: vi.fn().mockResolvedValue(undefined),
  sendAnalysisStartedEmail: vi.fn().mockResolvedValue(undefined),
  sendOpinionReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

import * as emailLib from '../lib/email'

const AUTH_BASE = '/api/auth'

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    try {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    } catch {
      continue
    }
    const res = await request(app).post(`${AUTH_BASE}/sign-in/email`).send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

describe('POST /v1/disputes — email notifications', () => {
  let cookie: string[]

  beforeEach(async () => {
    vi.clearAllMocks()
    cookie = await registerAndLogin('notif-create@test.meritview')
  })

  it('calls sendDisputeConfirmationEmail with initiator email and dispute title', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Notification Test Dispute',
        category: 'contract',
        summary: 'This is a summary of the notification test dispute.',
        counterpartyEmail: 'counterparty@example.com',
        counterpartyName: 'Counter Party',
      })

    expect(res.status).toBe(201)
    expect(emailLib.sendDisputeConfirmationEmail).toHaveBeenCalledOnce()
    const [to, , title] = (emailLib.sendDisputeConfirmationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('notif-create@test.meritview')
    expect(title).toBe('Notification Test Dispute')
  })

  it('calls sendInvitationEmail with counterparty email and invite URL', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Invitation Email Dispute',
        category: 'contract',
        summary: 'Summary for invitation email test.',
        counterpartyEmail: 'bob@example.com',
        counterpartyName: 'Bob Jones',
      })

    expect(res.status).toBe(201)
    expect(emailLib.sendInvitationEmail).toHaveBeenCalledOnce()
    const [to, name, , url] = (emailLib.sendInvitationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('bob@example.com')
    expect(name).toBe('Bob Jones')
    expect(url).toContain(res.body.invitationToken)
  })
})
