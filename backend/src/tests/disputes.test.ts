// backend/src/tests/disputes.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

const AUTH_BASE = '/api/auth'

async function registerAndLogin(email: string) {
  await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email, password: 'Password123!', name: 'Test User' })
  await prisma.user.update({ where: { email }, data: { emailVerified: true } })
  const res = await request(app).post(`${AUTH_BASE}/sign-in/email`).send({ email, password: 'Password123!' })
  const rawCookie = res.headers['set-cookie']
  return Array.isArray(rawCookie) ? rawCookie : rawCookie ? [rawCookie] : []
}

// ──────────────────────────────────────────────────────────
// POST /v1/disputes
// ──────────────────────────────────────────────────────────
describe('POST /v1/disputes', () => {
  let cookie: string[]

  beforeEach(async () => {
    cookie = await registerAndLogin('create-dispute@test.meritview')
  })

  it('creates a dispute and returns 201', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'My Test Dispute',
        category: 'contract',
        summary: 'This is a summary of the dispute between two parties.',
        counterpartyEmail: 'other@example.com',
        counterpartyName: 'Other Person',
      })

    expect(res.status).toBe(201)
    expect(res.body.dispute.title).toBe('My Test Dispute')
    expect(res.body.dispute.state).toBe('awaiting_counterparty')
    expect(res.body.invitationToken).toBeTruthy()
    expect(res.body.inviteUrl).toContain(res.body.invitationToken)
    expect(res.body.dispute.parties).toHaveLength(2)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/v1/disputes').send({
      title: 'My Test Dispute',
      category: 'contract',
      summary: 'summary text here',
      counterpartyEmail: 'other@example.com',
      counterpartyName: 'Other Person',
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing title', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        category: 'contract',
        summary: 'summary text here',
        counterpartyEmail: 'other@example.com',
        counterpartyName: 'Other Person',
      })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid category', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'My Test Dispute',
        category: 'invalid_cat',
        summary: 'summary text here',
        counterpartyEmail: 'other@example.com',
        counterpartyName: 'Other Person',
      })
    expect(res.status).toBe(400)
  })

  it('returns 400 when counterparty is self', async () => {
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Self Dispute',
        category: 'contract',
        summary: 'summary text here',
        counterpartyEmail: 'create-dispute@test.meritview',
        counterpartyName: 'Me',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/yourself/)
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/disputes
// ──────────────────────────────────────────────────────────
describe('GET /v1/disputes', () => {
  let cookie: string[]

  beforeEach(async () => {
    cookie = await registerAndLogin('list-disputes@test.meritview')
  })

  it('returns empty array when user has no disputes', async () => {
    const res = await request(app).get('/v1/disputes').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.disputes).toEqual([])
  })

  it('returns created disputes', async () => {
    await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Listed Dispute',
        category: 'partnership',
        summary: 'A partnership dispute summary here.',
        counterpartyEmail: 'other2@example.com',
        counterpartyName: 'Partner',
      })

    const res = await request(app).get('/v1/disputes').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.disputes.length).toBeGreaterThanOrEqual(1)
    expect(res.body.disputes[0].title).toBe('Listed Dispute')
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/disputes/:id
// ──────────────────────────────────────────────────────────
describe('GET /v1/disputes/:id', () => {
  let cookie: string[]
  let disputeId: string

  beforeEach(async () => {
    cookie = await registerAndLogin('get-dispute@test.meritview')
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Detail Dispute',
        category: 'small_claims',
        summary: 'Summary for detail test dispute.',
        counterpartyEmail: 'other3@example.com',
        counterpartyName: 'Counter',
      })
    disputeId = res.body.dispute.id
  })

  it('returns dispute detail for owner', async () => {
    const res = await request(app).get(`/v1/disputes/${disputeId}`).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.dispute.id).toBe(disputeId)
  })

  it('returns 404 for another user', async () => {
    const otherCookie = await registerAndLogin('get-dispute-other@test.meritview')
    const res = await request(app).get(`/v1/disputes/${disputeId}`).set('Cookie', otherCookie)
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────
// GET /v1/invitations/:token (public)
// ──────────────────────────────────────────────────────────
describe('GET /v1/invitations/:token', () => {
  let invitationToken: string

  beforeEach(async () => {
    const cookie = await registerAndLogin('invite-owner@test.meritview')
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', cookie)
      .send({
        title: 'Invite Test Dispute',
        category: 'contract',
        summary: 'Dispute for invitation acceptance test.',
        counterpartyEmail: 'invitee@example.com',
        counterpartyName: 'Invitee',
      })
    invitationToken = res.body.invitationToken
  })

  it('returns dispute summary for valid token (no auth needed)', async () => {
    const res = await request(app).get(`/v1/invitations/${invitationToken}`)
    expect(res.status).toBe(200)
    expect(res.body.disputeTitle).toBe('Invite Test Dispute')
    expect(res.body.invitationStatus).toBe('pending')
  })

  it('returns 404 for invalid token', async () => {
    const res = await request(app).get('/v1/invitations/nonexistenttoken123')
    expect(res.status).toBe(404)
  })
})

// ──────────────────────────────────────────────────────────
// POST /v1/invitations/:token/accept
// ──────────────────────────────────────────────────────────
describe('POST /v1/invitations/:token/accept', () => {
  let invitationToken: string

  beforeEach(async () => {
    const ownerCookie = await registerAndLogin('accept-owner@test.meritview')
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', ownerCookie)
      .send({
        title: 'Accept Test Dispute',
        category: 'contract',
        summary: 'Dispute for acceptance test.',
        counterpartyEmail: 'accepter@example.com',
        counterpartyName: 'Accepter',
      })
    invitationToken = res.body.invitationToken
  })

  it('accepts invitation when logged in', async () => {
    const accepterCookie = await registerAndLogin('accepter@test.meritview')
    const res = await request(app)
      .post(`/v1/invitations/${invitationToken}/accept`)
      .set('Cookie', accepterCookie)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify party is now accepted
    const party = await prisma.party.findUnique({ where: { invitationToken } })
    expect(party?.invitationStatus).toBe('accepted')
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post(`/v1/invitations/${invitationToken}/accept`)
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────
// POST /v1/invitations/:token/decline
// ──────────────────────────────────────────────────────────
describe('POST /v1/invitations/:token/decline', () => {
  let invitationToken: string

  beforeEach(async () => {
    const ownerCookie = await registerAndLogin('decline-owner@test.meritview')
    const res = await request(app)
      .post('/v1/disputes')
      .set('Cookie', ownerCookie)
      .send({
        title: 'Decline Test Dispute',
        category: 'contract',
        summary: 'Dispute for decline test.',
        counterpartyEmail: 'decliner@example.com',
        counterpartyName: 'Decliner',
      })
    invitationToken = res.body.invitationToken
  })

  it('declines invitation and cancels dispute', async () => {
    const res = await request(app).post(`/v1/invitations/${invitationToken}/decline`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const party = await prisma.party.findUnique({ where: { invitationToken } })
    expect(party?.invitationStatus).toBe('declined')
  })

  it('returns 409 if already responded', async () => {
    await request(app).post(`/v1/invitations/${invitationToken}/decline`)
    const res = await request(app).post(`/v1/invitations/${invitationToken}/decline`)
    expect(res.status).toBe(409)
  })
})
