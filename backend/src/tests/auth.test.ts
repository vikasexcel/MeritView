import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '../lib/auth'
import express from 'express'

const BASE = '/api/auth'

async function signUpUser(email: string, password: string, name = 'Test User') {
  return request(app)
    .post(`${BASE}/sign-up/email`)
    .send({ email, password, name })
}

async function signInAndGetCookie(email: string, password: string) {
  const res = await request(app)
    .post(`${BASE}/sign-in/email`)
    .send({ email, password })
  const rawCookie = res.headers['set-cookie']
  const cookie = Array.isArray(rawCookie) ? rawCookie : rawCookie ? [rawCookie] : undefined
  return { cookie, status: res.status, body: res.body }
}

async function verifyUserEmail(email: string) {
  await prisma.user.update({ where: { email }, data: { emailVerified: true } })
}

// ──────────────────────────────────────────────────────────
// Sign Up
// ──────────────────────────────────────────────────────────
describe('POST /api/auth/sign-up/email', () => {
  it('registers a new user successfully', async () => {
    const res = await signUpUser('newuser@test.meritview', 'Password123!', 'New User')

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.email).toBe('newuser@test.meritview')
    expect(res.body.user.emailVerified).toBe(false)
  })

  it('returns 200 for duplicate email to prevent user enumeration', async () => {
    await signUpUser('duplicate@test.meritview', 'Password123!', 'First User')

    const res = await signUpUser('duplicate@test.meritview', 'DifferentPass1!', 'Second User')

    // Better Auth returns 200 (not 422) when requireEmailVerification is on
    expect(res.status).toBe(200)
  })

  it('rejects missing email with 400+', async () => {
    const res = await request(app)
      .post(`${BASE}/sign-up/email`)
      .send({ password: 'Password123!', name: 'No Email' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects missing password with 400+', async () => {
    const res = await request(app)
      .post(`${BASE}/sign-up/email`)
      .send({ email: 'nopass@test.meritview', name: 'No Pass' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects password shorter than 8 characters', async () => {
    const res = await request(app)
      .post(`${BASE}/sign-up/email`)
      .send({ email: 'shortpass@test.meritview', password: 'abc', name: 'Short Pass' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post(`${BASE}/sign-up/email`)
      .send({ email: 'not-an-email', password: 'Password123!', name: 'Bad Email' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ──────────────────────────────────────────────────────────
// Sign In
// ──────────────────────────────────────────────────────────
describe('POST /api/auth/sign-in/email', () => {
  beforeEach(async () => {
    await signUpUser('signin@test.meritview', 'Password123!', 'Sign In User')
  })

  it('rejects sign-in when email is not verified', async () => {
    const { status, body } = await signInAndGetCookie('signin@test.meritview', 'Password123!')

    expect(status).toBeGreaterThanOrEqual(400)
    // Better Auth returns EMAIL_NOT_VERIFIED code
    const message = (body.message ?? body.error ?? '').toLowerCase()
    expect(message).toMatch(/email|verif/i)
  })

  it('signs in successfully after email is verified', async () => {
    await verifyUserEmail('signin@test.meritview')
    const { status, cookie } = await signInAndGetCookie('signin@test.meritview', 'Password123!')

    expect(status).toBe(200)
    expect(cookie).toBeDefined()
  })

  it('rejects wrong password', async () => {
    await verifyUserEmail('signin@test.meritview')
    const { status } = await signInAndGetCookie('signin@test.meritview', 'WrongPass999!')

    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('rejects non-existent user', async () => {
    const { status } = await signInAndGetCookie('nobody@test.meritview', 'Password123!')

    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('rejects missing email field', async () => {
    const res = await request(app)
      .post(`${BASE}/sign-in/email`)
      .send({ password: 'Password123!' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ──────────────────────────────────────────────────────────
// Sign Out
// ──────────────────────────────────────────────────────────
describe('POST /api/auth/sign-out', () => {
  it('signs out a valid session successfully', async () => {
    await signUpUser('signout@test.meritview', 'Password123!', 'Sign Out User')
    await verifyUserEmail('signout@test.meritview')
    const { cookie } = await signInAndGetCookie('signout@test.meritview', 'Password123!')

    const res = await request(app)
      .post(`${BASE}/sign-out`)
      .set('Cookie', cookie ?? [])

    expect(res.status).toBe(200)
  })

  it('returns success with no session cookie (idempotent logout)', async () => {
    const res = await request(app).post(`${BASE}/sign-out`)

    expect(res.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────────
// Get Session
// ──────────────────────────────────────────────────────────
describe('GET /api/auth/get-session', () => {
  it('returns session data for authenticated user', async () => {
    await signUpUser('getsession@test.meritview', 'Password123!', 'Session User')
    await verifyUserEmail('getsession@test.meritview')
    const { cookie } = await signInAndGetCookie('getsession@test.meritview', 'Password123!')

    const res = await request(app)
      .get(`${BASE}/get-session`)
      .set('Cookie', cookie ?? [])

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('getsession@test.meritview')
    expect(res.body.session).toBeDefined()
  })

  it('returns null session for unauthenticated request', async () => {
    const res = await request(app).get(`${BASE}/get-session`)

    expect(res.status).toBe(200)
    expect(res.body.session).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// Auth Middleware
// ──────────────────────────────────────────────────────────
describe('requireAuth middleware', () => {
  it('blocks unauthenticated request with 401', async () => {
    const { requireAuth } = await import('../middleware/auth')
    const testApp = express()
    testApp.all('/api/auth/{*any}', toNodeHandler(auth))
    testApp.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }))

    const res = await request(testApp).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Unauthorized')
  })

  it('allows authenticated request through', async () => {
    await signUpUser('middleware@test.meritview', 'Password123!', 'MW User')
    await verifyUserEmail('middleware@test.meritview')
    const { cookie } = await signInAndGetCookie('middleware@test.meritview', 'Password123!')

    const { requireAuth } = await import('../middleware/auth')
    const testApp = express()
    testApp.all('/api/auth/{*any}', toNodeHandler(auth))
    testApp.get('/protected', requireAuth, (req: any, res: any) => res.json({ email: req.user.email }))

    const res = await request(testApp)
      .get('/protected')
      .set('Cookie', cookie ?? [])

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('middleware@test.meritview')
  })
})

// ──────────────────────────────────────────────────────────
// requireRole Middleware
// ──────────────────────────────────────────────────────────
describe('requireRole middleware', () => {
  it('allows admin user to access admin-only route', async () => {
    await signUpUser('adminuser@test.meritview', 'Password123!', 'Admin User')
    await verifyUserEmail('adminuser@test.meritview')
    await prisma.user.update({ where: { email: 'adminuser@test.meritview' }, data: { role: 'admin' } })
    const { cookie } = await signInAndGetCookie('adminuser@test.meritview', 'Password123!')

    const { requireRole } = await import('../middleware/auth')
    const testApp = express()
    testApp.all('/api/auth/{*any}', toNodeHandler(auth))
    testApp.get('/admin', requireRole('admin'), (_req: any, res: any) => res.json({ ok: true }))

    const res = await request(testApp)
      .get('/admin')
      .set('Cookie', cookie ?? [])

    expect(res.status).toBe(200)
  })

  it('blocks non-admin user from admin-only route with 403', async () => {
    await signUpUser('normalrole@test.meritview', 'Password123!', 'Normal User')
    await verifyUserEmail('normalrole@test.meritview')
    const { cookie } = await signInAndGetCookie('normalrole@test.meritview', 'Password123!')

    const { requireRole } = await import('../middleware/auth')
    const testApp = express()
    testApp.all('/api/auth/{*any}', toNodeHandler(auth))
    testApp.get('/admin', requireRole('admin'), (_req: any, res: any) => res.json({ ok: true }))

    const res = await request(testApp)
      .get('/admin')
      .set('Cookie', cookie ?? [])

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
  })

  it('blocks unauthenticated request from role-protected route with 401', async () => {
    const { requireRole } = await import('../middleware/auth')
    const testApp = express()
    testApp.all('/api/auth/{*any}', toNodeHandler(auth))
    testApp.get('/admin', requireRole('admin'), (_req: any, res: any) => res.json({ ok: true }))

    const res = await request(testApp).get('/admin')
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────
// Forgot Password
// ──────────────────────────────────────────────────────────
describe('POST /api/auth/forget-password', () => {
  it('returns success for existing email', async () => {
    await signUpUser('resetme@test.meritview', 'Password123!', 'Reset User')

    const res = await request(app)
      .post(`${BASE}/forget-password`)
      .send({ email: 'resetme@test.meritview', redirectTo: 'http://localhost:5173/auth/reset-password' })

    expect(res.status).toBe(200)
  })

  it('returns success for non-existent email (prevents user enumeration)', async () => {
    const res = await request(app)
      .post(`${BASE}/forget-password`)
      .send({ email: 'nobody@test.meritview', redirectTo: 'http://localhost:5173/auth/reset-password' })

    expect(res.status).toBe(200)
  })

  it('rejects missing redirectTo parameter', async () => {
    const res = await request(app)
      .post(`${BASE}/forget-password`)
      .send({ email: 'resetme@test.meritview' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ──────────────────────────────────────────────────────────
// Email Verification (send verification)
// ──────────────────────────────────────────────────────────
describe('POST /api/auth/send-verification-email', () => {
  it('sends verification email for registered user', async () => {
    await signUpUser('verifyme@test.meritview', 'Password123!', 'Verify User')

    const res = await request(app)
      .post(`${BASE}/send-verification-email`)
      .send({ email: 'verifyme@test.meritview', callbackURL: '/dashboard' })

    expect(res.status).toBe(200)
  })

  it('rejects missing email parameter', async () => {
    const res = await request(app)
      .post(`${BASE}/send-verification-email`)
      .send({ callbackURL: '/dashboard' })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
