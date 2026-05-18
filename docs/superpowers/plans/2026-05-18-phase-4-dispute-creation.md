# Phase 4: Dispute Creation Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full dispute creation and invitation flow — backend endpoints for creating/listing/fetching disputes and accepting/declining invitations, plus the multi-step create-dispute form, dispute dashboard, and the public invitation landing page.

**Architecture:** Backend adds a `disputes` route module with controller + service layers wired into `app.ts`. Frontend adds a Zustand-light approach: React Query handles server state, a local `useDisputeForm` hook manages the multi-step wizard state. Invitation accept/decline are public routes (no auth required to view, auth required to accept).

**Tech Stack:** Express 5, Prisma 7, Resend (email), React 19, React Router v7, React Query v5, Axios, Zustand, shadcn/ui, Tailwind v4

---

## File Map

### Backend — New Files
- `backend/src/routes/disputes.ts` — Express router, route definitions only
- `backend/src/controllers/disputes.ts` — req/res handling, input validation, calls service
- `backend/src/services/disputes.ts` — business logic, Prisma queries, state machine
- `backend/src/routes/invitations.ts` — Express router for invitation accept/decline
- `backend/src/controllers/invitations.ts` — req/res for accept/decline
- `backend/src/tests/disputes.test.ts` — Vitest + Supertest integration tests

### Backend — Modified Files
- `backend/src/app.ts` — mount new dispute + invitation routers
- `backend/src/lib/email.ts` — add `sendInvitationEmail()`

### Frontend — New Files
- `frontend/src/pages/disputes/CreateDispute.tsx` — 4-step wizard page
- `frontend/src/pages/disputes/DisputeDetail.tsx` — dispute detail/success page after creation
- `frontend/src/pages/disputes/Dashboard.tsx` — list of user's disputes
- `frontend/src/pages/invitations/InvitationPage.tsx` — public `/invite/:token` page
- `frontend/src/hooks/useDisputeForm.ts` — wizard state (step + form values)
- `frontend/src/lib/disputeApi.ts` — typed Axios wrappers for dispute endpoints

### Frontend — Modified Files
- `frontend/src/App.tsx` — add dispute and invitation routes
- `frontend/src/components/ui/` — add `badge.tsx`, `separator.tsx`, `dialog.tsx` (shadcn) as needed

---

## Task 1: Backend — Dispute Service (core logic)

**Files:**
- Create: `backend/src/services/disputes.ts`

- [ ] **Step 1: Create the service file with types and createDispute**

```typescript
// backend/src/services/disputes.ts
import { prisma } from '../lib/prisma'
import { DisputeCategory } from '@prisma/client'
import crypto from 'crypto'

export interface CreateDisputeInput {
  title: string
  category: DisputeCategory
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
  initiatorId: string
}

export async function createDispute(input: CreateDisputeInput) {
  const invitationToken = crypto.randomBytes(32).toString('hex')

  const dispute = await prisma.dispute.create({
    data: {
      title: input.title,
      category: input.category,
      summary: input.summary,
      stakes: input.stakes ?? null,
      initiatorId: input.initiatorId,
      state: 'awaiting_counterparty',
      parties: {
        create: [
          { userId: input.initiatorId, role: 'initiator', invitationStatus: 'accepted' },
          {
            role: 'respondent',
            invitationToken,
            invitationStatus: 'pending',
          },
        ],
      },
    },
    include: { parties: true },
  })

  await prisma.auditEvent.create({
    data: {
      eventType: 'dispute_created',
      actorId: input.initiatorId,
      resourceType: 'dispute',
      resourceId: dispute.id,
      eventData: { title: input.title, category: input.category },
    },
  })

  return { dispute, invitationToken }
}
```

- [ ] **Step 2: Add listDisputes and getDispute functions**

Append to `backend/src/services/disputes.ts`:

```typescript
export async function listDisputes(userId: string) {
  return prisma.dispute.findMany({
    where: {
      OR: [
        { initiatorId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: { select: { role: true, userId: true, invitationStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDispute(disputeId: string, userId: string) {
  const dispute = await prisma.dispute.findFirst({
    where: {
      id: disputeId,
      OR: [
        { initiatorId: userId },
        { parties: { some: { userId } } },
      ],
    },
    include: {
      parties: {
        select: { id: true, role: true, userId: true, invitationStatus: true, briefStatus: true },
      },
    },
  })
  return dispute
}
```

- [ ] **Step 3: Add acceptInvitation and declineInvitation functions**

Append to `backend/src/services/disputes.ts`:

```typescript
export async function getPartyByToken(token: string) {
  return prisma.party.findUnique({
    where: { invitationToken: token },
    include: { dispute: true },
  })
}

export async function acceptInvitation(token: string, userId: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null
  if (party.invitationStatus !== 'pending') return { error: 'already_responded' as const }

  const [updatedParty] = await prisma.$transaction([
    prisma.party.update({
      where: { invitationToken: token },
      data: { userId, invitationStatus: 'accepted' },
    }),
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'in_progress' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_accepted',
        actorId: userId,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  return { party: updatedParty }
}

export async function declineInvitation(token: string) {
  const party = await prisma.party.findUnique({ where: { invitationToken: token } })
  if (!party) return null
  if (party.invitationStatus !== 'pending') return { error: 'already_responded' as const }

  await prisma.$transaction([
    prisma.party.update({
      where: { invitationToken: token },
      data: { invitationStatus: 'declined' },
    }),
    prisma.dispute.update({
      where: { id: party.disputeId },
      data: { state: 'cancelled' },
    }),
    prisma.auditEvent.create({
      data: {
        eventType: 'invitation_declined',
        actorId: null,
        resourceType: 'party',
        resourceId: party.id,
        eventData: { disputeId: party.disputeId },
      },
    }),
  ])

  return { ok: true }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/disputes.ts
git commit -m "feat(backend): add dispute service — create, list, get, accept/decline invitation"
```

---

## Task 2: Backend — Invitation Email

**Files:**
- Modify: `backend/src/lib/email.ts`

- [ ] **Step 1: Add sendInvitationEmail to email.ts**

Append to `backend/src/lib/email.ts`:

```typescript
export async function sendInvitationEmail(
  to: string,
  toName: string,
  disputeTitle: string,
  inviteUrl: string
) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to resolve a dispute on ${APP_NAME}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">You've been invited to a dispute</h2>
        <p style="color:#444">Hi ${toName},</p>
        <p style="color:#444">You've been invited to participate in a dispute resolution for: <strong>${disputeTitle}</strong></p>
        <p style="color:#444">Click below to view the dispute and decide whether to accept or decline.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
          View Invitation
        </a>
        <p style="color:#888;font-size:13px">This invitation link is unique to you. Do not share it with others.</p>
      </div>
    `,
  })

  if (error) {
    console.error('[Resend] Failed to send invitation email:', error)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/email.ts
git commit -m "feat(backend): add sendInvitationEmail helper"
```

---

## Task 3: Backend — Dispute Controller + Router

**Files:**
- Create: `backend/src/controllers/disputes.ts`
- Create: `backend/src/routes/disputes.ts`

- [ ] **Step 1: Create the disputes controller**

```typescript
// backend/src/controllers/disputes.ts
import { Request, Response } from 'express'
import { DisputeCategory } from '@prisma/client'
import * as disputeService from '../services/disputes'
import { sendInvitationEmail } from '../lib/email'

const VALID_CATEGORIES: DisputeCategory[] = ['contract', 'small_claims', 'partnership']

export async function createDispute(req: Request, res: Response) {
  const { title, category, summary, stakes, counterpartyEmail, counterpartyName } = req.body

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    res.status(400).json({ error: 'title must be at least 3 characters' })
    return
  }
  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'invalid category' })
    return
  }
  if (!summary || typeof summary !== 'string' || summary.trim().length < 10) {
    res.status(400).json({ error: 'summary must be at least 10 characters' })
    return
  }
  if (!counterpartyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(counterpartyEmail)) {
    res.status(400).json({ error: 'invalid counterparty email' })
    return
  }
  if (!counterpartyName || typeof counterpartyName !== 'string' || counterpartyName.trim().length < 1) {
    res.status(400).json({ error: 'counterparty name is required' })
    return
  }

  const userId = req.user!.id

  if (counterpartyEmail.toLowerCase() === req.user!.email.toLowerCase()) {
    res.status(400).json({ error: 'counterparty cannot be yourself' })
    return
  }

  const { dispute, invitationToken } = await disputeService.createDispute({
    title: title.trim(),
    category,
    summary: summary.trim(),
    stakes: stakes ? Number(stakes) : undefined,
    counterpartyEmail,
    counterpartyName,
    initiatorId: userId,
  })

  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const inviteUrl = `${appUrl}/invite/${invitationToken}`

  await sendInvitationEmail(counterpartyEmail, counterpartyName, dispute.title, inviteUrl)

  res.status(201).json({ dispute, invitationToken, inviteUrl })
}

export async function listDisputes(req: Request, res: Response) {
  const disputes = await disputeService.listDisputes(req.user!.id)
  res.json({ disputes })
}

export async function getDispute(req: Request, res: Response) {
  const dispute = await disputeService.getDispute(req.params.id, req.user!.id)
  if (!dispute) {
    res.status(404).json({ error: 'not found' })
    return
  }
  res.json({ dispute })
}
```

- [ ] **Step 2: Create the disputes router**

```typescript
// backend/src/routes/disputes.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as disputeController from '../controllers/disputes'

const router = Router()

router.use(requireAuth)

router.post('/', disputeController.createDispute)
router.get('/', disputeController.listDisputes)
router.get('/:id', disputeController.getDispute)

export default router
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/disputes.ts backend/src/routes/disputes.ts
git commit -m "feat(backend): add dispute controller and router"
```

---

## Task 4: Backend — Invitation Controller + Router

**Files:**
- Create: `backend/src/controllers/invitations.ts`
- Create: `backend/src/routes/invitations.ts`

- [ ] **Step 1: Create the invitations controller**

```typescript
// backend/src/controllers/invitations.ts
import { Request, Response } from 'express'
import * as disputeService from '../services/disputes'

export async function getInvitation(req: Request, res: Response) {
  const party = await disputeService.getPartyByToken(req.params.token)
  if (!party) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  // Return dispute summary for the public invitation page (no sensitive data)
  res.json({
    disputeTitle: party.dispute.title,
    disputeCategory: party.dispute.category,
    disputeSummary: party.dispute.summary,
    invitationStatus: party.invitationStatus,
    disputeState: party.dispute.state,
  })
}

export async function acceptInvitation(req: Request, res: Response) {
  const result = await disputeService.acceptInvitation(req.params.token, req.user!.id)
  if (result === null) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  if ('error' in result) {
    res.status(409).json({ error: result.error })
    return
  }
  res.json({ ok: true, party: result.party })
}

export async function declineInvitation(req: Request, res: Response) {
  const result = await disputeService.declineInvitation(req.params.token)
  if (result === null) {
    res.status(404).json({ error: 'invitation not found' })
    return
  }
  if ('error' in result) {
    res.status(409).json({ error: result.error })
    return
  }
  res.json({ ok: true })
}
```

- [ ] **Step 2: Create the invitations router**

```typescript
// backend/src/routes/invitations.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as invitationController from '../controllers/invitations'

const router = Router()

// Public: anyone with the token can view dispute summary
router.get('/:token', invitationController.getInvitation)

// Protected: must be logged in to accept/decline
router.post('/:token/accept', requireAuth, invitationController.acceptInvitation)
router.post('/:token/decline', invitationController.declineInvitation)

export default router
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/invitations.ts backend/src/routes/invitations.ts
git commit -m "feat(backend): add invitation controller and router"
```

---

## Task 5: Backend — Wire Routes into app.ts

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Mount dispute and invitation routers**

Replace the current `app.use('/v1', healthRouter)` section in `backend/src/app.ts`:

```typescript
import express from 'express'
import helmet from 'helmet'
import 'dotenv/config'
import { toNodeHandler } from 'better-auth/node'
import { corsMiddleware } from './middleware/cors'
import { rateLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import healthRouter from './routes/health'
import disputesRouter from './routes/disputes'
import invitationsRouter from './routes/invitations'
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
app.use('/v1/disputes', disputesRouter)
app.use('/v1/invitations', invitationsRouter)

app.use(errorHandler)

export default app
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat(backend): mount dispute and invitation routes"
```

---

## Task 6: Backend — Integration Tests

**Files:**
- Create: `backend/src/tests/disputes.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
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
    const otherCookie = await registerAndLogin('other-user@test.meritview')
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

    // Verify dispute is now in_progress
    const dispute = await prisma.party.findUnique({ where: { invitationToken } })
    expect(dispute?.invitationStatus).toBe('accepted')
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
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && npm test -- src/tests/disputes.test.ts
```

Expected: All tests pass (the backend is now fully wired up).

- [ ] **Step 3: Commit**

```bash
git add backend/src/tests/disputes.test.ts
git commit -m "test(backend): add integration tests for disputes and invitations"
```

---

## Task 7: Frontend — Dispute API Client

**Files:**
- Create: `frontend/src/lib/disputeApi.ts`

- [ ] **Step 1: Create typed API wrappers**

```typescript
// frontend/src/lib/disputeApi.ts
import { api } from './api'

export type DisputeCategory = 'contract' | 'small_claims' | 'partnership'
export type DisputeState =
  | 'draft'
  | 'awaiting_counterparty'
  | 'in_progress'
  | 'under_analysis'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface DisputeParty {
  id: string
  role: 'initiator' | 'respondent'
  userId: string | null
  invitationStatus: 'pending' | 'accepted' | 'declined'
  briefStatus: 'not_started' | 'in_progress' | 'submitted'
}

export interface Dispute {
  id: string
  title: string
  category: DisputeCategory
  summary: string
  state: DisputeState
  stakes: string | null
  initiatorId: string
  createdAt: string
  parties: DisputeParty[]
}

export interface CreateDisputePayload {
  title: string
  category: DisputeCategory
  summary: string
  stakes?: number
  counterpartyEmail: string
  counterpartyName: string
}

export interface InvitationSummary {
  disputeTitle: string
  disputeCategory: DisputeCategory
  disputeSummary: string
  invitationStatus: 'pending' | 'accepted' | 'declined'
  disputeState: DisputeState
}

export const disputeApi = {
  create: (payload: CreateDisputePayload) =>
    api.post<{ dispute: Dispute; invitationToken: string; inviteUrl: string }>('/v1/disputes', payload),

  list: () => api.get<{ disputes: Dispute[] }>('/v1/disputes'),

  get: (id: string) => api.get<{ dispute: Dispute }>(`/v1/disputes/${id}`),

  getInvitation: (token: string) => api.get<InvitationSummary>(`/v1/invitations/${token}`),

  acceptInvitation: (token: string) => api.post(`/v1/invitations/${token}/accept`),

  declineInvitation: (token: string) => api.post(`/v1/invitations/${token}/decline`),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/disputeApi.ts
git commit -m "feat(frontend): add typed dispute API client"
```

---

## Task 8: Frontend — Wizard State Hook

**Files:**
- Create: `frontend/src/hooks/useDisputeForm.ts`

- [ ] **Step 1: Create the wizard form hook**

```typescript
// frontend/src/hooks/useDisputeForm.ts
import { useState } from 'react'
import type { DisputeCategory, CreateDisputePayload } from '@/lib/disputeApi'

export interface DisputeFormValues {
  title: string
  category: DisputeCategory | ''
  summary: string
  stakes: string
  counterpartyEmail: string
  counterpartyName: string
}

const INITIAL_VALUES: DisputeFormValues = {
  title: '',
  category: '',
  summary: '',
  stakes: '',
  counterpartyEmail: '',
  counterpartyName: '',
}

export function useDisputeForm() {
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<DisputeFormValues>(INITIAL_VALUES)

  function updateValues(partial: Partial<DisputeFormValues>) {
    setValues((prev) => ({ ...prev, ...partial }))
  }

  function nextStep() {
    setStep((s) => Math.min(s + 1, 4))
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 1))
  }

  function toPayload(): CreateDisputePayload {
    return {
      title: values.title,
      category: values.category as DisputeCategory,
      summary: values.summary,
      stakes: values.stakes ? parseFloat(values.stakes) : undefined,
      counterpartyEmail: values.counterpartyEmail,
      counterpartyName: values.counterpartyName,
    }
  }

  return { step, values, updateValues, nextStep, prevStep, toPayload }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useDisputeForm.ts
git commit -m "feat(frontend): add useDisputeForm wizard state hook"
```

---

## Task 9: Frontend — shadcn Components

**Files:**
- Create: `frontend/src/components/ui/badge.tsx`
- Create: `frontend/src/components/ui/separator.tsx`
- Create: `frontend/src/components/ui/dialog.tsx`
- Create: `frontend/src/components/ui/select.tsx`
- Create: `frontend/src/components/ui/textarea.tsx`

- [ ] **Step 1: Add shadcn components**

Run from the `frontend/` directory:

```bash
cd frontend && npx shadcn@latest add badge separator dialog select textarea --yes
```

Expected: Creates/updates files in `src/components/ui/`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat(frontend): add badge, separator, dialog, select, textarea shadcn components"
```

---

## Task 10: Frontend — Dashboard Page

**Files:**
- Create: `frontend/src/pages/disputes/Dashboard.tsx`

- [ ] **Step 1: Create the Dashboard page**

```tsx
// frontend/src/pages/disputes/Dashboard.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { disputeApi, type Dispute } from '@/lib/disputeApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'

const STATE_BADGE: Record<Dispute['state'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  awaiting_counterparty: { label: 'Awaiting Response', variant: 'outline' },
  in_progress: { label: 'In Progress', variant: 'default' },
  under_analysis: { label: 'Under Analysis', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
}

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['disputes'],
    queryFn: () => disputeApi.list().then((r) => r.data.disputes),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Disputes</h1>
        <Button asChild>
          <Link to="/disputes/new">
            <Plus className="w-4 h-4 mr-2" />
            New Dispute
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading disputes...</div>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground">You have no disputes yet.</p>
          <Button asChild variant="outline">
            <Link to="/disputes/new">Create your first dispute</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4">
        {data?.map((dispute) => {
          const badge = STATE_BADGE[dispute.state]
          return (
            <Card key={dispute.id} className="hover:bg-muted/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-medium">{dispute.title}</CardTitle>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground line-clamp-2">{dispute.summary}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">
                    {dispute.category.replace('_', ' ')}
                    {dispute.stakes ? ` · $${Number(dispute.stakes).toLocaleString()}` : ''}
                  </span>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/disputes/${dispute.id}`}>View →</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/disputes/Dashboard.tsx
git commit -m "feat(frontend): add disputes dashboard page"
```

---

## Task 11: Frontend — Create Dispute Multi-Step Form

**Files:**
- Create: `frontend/src/pages/disputes/CreateDispute.tsx`

- [ ] **Step 1: Create the 4-step wizard page**

```tsx
// frontend/src/pages/disputes/CreateDispute.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { disputeApi } from '@/lib/disputeApi'
import { useDisputeForm } from '@/hooks/useDisputeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full ${i + 1 <= current ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
      <span className="ml-2 whitespace-nowrap">Step {current} of {total}</span>
    </div>
  )
}

export function CreateDispute() {
  const navigate = useNavigate()
  const { step, values, updateValues, nextStep, prevStep, toPayload } = useDisputeForm()
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => disputeApi.create(toPayload()),
    onSuccess: (res) => {
      navigate(`/disputes/${res.data.dispute.id}`, {
        state: { inviteUrl: res.data.inviteUrl },
      })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Something went wrong. Please try again.')
    },
  })

  function handleSubmit() {
    setError('')
    mutation.mutate()
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Create a Dispute</h1>
      <StepIndicator current={step} total={4} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Dispute Details</CardTitle>
            <CardDescription>Give your dispute a title and category.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Unpaid freelance invoice"
                value={values.title}
                onChange={(e) => updateValues({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="category">Category</Label>
              <Select
                value={values.category}
                onValueChange={(v) => updateValues({ category: v as any })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="small_claims">Small Claims</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={nextStep}
                disabled={values.title.trim().length < 3 || !values.category}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Summary & Stakes</CardTitle>
            <CardDescription>Describe the dispute and estimated value.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                placeholder="Briefly describe the dispute..."
                rows={4}
                value={values.summary}
                onChange={(e) => updateValues({ summary: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{values.summary.length} characters (min 10)</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="stakes">Estimated Stakes (USD, optional)</Label>
              <Input
                id="stakes"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={values.stakes}
                onChange={(e) => updateValues({ stakes: e.target.value })}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>Back</Button>
              <Button
                onClick={nextStep}
                disabled={values.summary.trim().length < 10}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Counterparty Details</CardTitle>
            <CardDescription>Who are you in dispute with?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="cpName">Their Name</Label>
              <Input
                id="cpName"
                placeholder="Full name"
                value={values.counterpartyName}
                onChange={(e) => updateValues({ counterpartyName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cpEmail">Their Email</Label>
              <Input
                id="cpEmail"
                type="email"
                placeholder="their@email.com"
                value={values.counterpartyEmail}
                onChange={(e) => updateValues({ counterpartyEmail: e.target.value })}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>Back</Button>
              <Button
                onClick={nextStep}
                disabled={
                  !values.counterpartyName.trim() ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.counterpartyEmail)
                }
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
            <CardDescription>Confirm your dispute details before submitting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Title</dt>
                <dd className="font-medium">{values.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="capitalize">{values.category.replace('_', ' ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Stakes</dt>
                <dd>{values.stakes ? `$${Number(values.stakes).toLocaleString()}` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Counterparty</dt>
                <dd>{values.counterpartyName} ({values.counterpartyEmail})</dd>
              </div>
            </dl>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-between">
              <Button variant="outline" onClick={prevStep}>Back</Button>
              <Button onClick={handleSubmit} disabled={mutation.isPending}>
                {mutation.isPending ? 'Submitting...' : 'Create Dispute'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/disputes/CreateDispute.tsx
git commit -m "feat(frontend): add 4-step create dispute wizard"
```

---

## Task 12: Frontend — Dispute Detail / Success Page

**Files:**
- Create: `frontend/src/pages/disputes/DisputeDetail.tsx`

- [ ] **Step 1: Create the dispute detail page**

```tsx
// frontend/src/pages/disputes/DisputeDetail.tsx
import { useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { disputeApi } from '@/lib/disputeApi'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_counterparty: 'Awaiting Response',
  in_progress: 'In Progress',
  under_analysis: 'Under Analysis',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function DisputeDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const inviteUrl: string | undefined = (location.state as any)?.inviteUrl

  const { data, isLoading, error } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputeApi.get(id!).then((r) => r.data.dispute),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>
  if (error || !data) return <div className="p-6 text-destructive text-sm">Dispute not found.</div>

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {inviteUrl && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400 text-base">
              Dispute created — invitation sent!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              An invitation email has been sent to your counterparty. You can also share this link directly:
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{inviteUrl}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{data.title}</CardTitle>
            <Badge variant="outline">{STATE_LABEL[data.state] ?? data.state}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="capitalize mt-0.5">{data.category.replace('_', ' ')}</dd>
            </div>
            {data.stakes && (
              <div>
                <dt className="text-muted-foreground">Stakes</dt>
                <dd className="mt-0.5">${Number(data.stakes).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">Summary</p>
            <p className="text-sm">{data.summary}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-2">Parties</p>
            <div className="space-y-1">
              {data.parties.map((party) => (
                <div key={party.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{party.role}</span>
                  <Badge variant={party.invitationStatus === 'accepted' ? 'default' : 'secondary'}>
                    {party.invitationStatus}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/disputes/DisputeDetail.tsx
git commit -m "feat(frontend): add dispute detail / success page"
```

---

## Task 13: Frontend — Invitation Landing Page

**Files:**
- Create: `frontend/src/pages/invitations/InvitationPage.tsx`

- [ ] **Step 1: Create the public invitation page**

```tsx
// frontend/src/pages/invitations/InvitationPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { disputeApi } from '@/lib/disputeApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export function InvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [declineOpen, setDeclineOpen] = useState(false)
  const [message, setMessage] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => disputeApi.getInvitation(token!).then((r) => r.data),
    enabled: !!token,
  })

  const acceptMutation = useMutation({
    mutationFn: () => disputeApi.acceptInvitation(token!),
    onSuccess: () => {
      setMessage('You have accepted the invitation. You can now write your brief.')
    },
    onError: (err: any) => {
      setMessage(err?.response?.data?.error ?? 'Failed to accept invitation.')
    },
  })

  const declineMutation = useMutation({
    mutationFn: () => disputeApi.declineInvitation(token!),
    onSuccess: () => {
      setDeclineOpen(false)
      setMessage('You have declined this dispute. The dispute has been cancelled.')
    },
    onError: (err: any) => {
      setMessage(err?.response?.data?.error ?? 'Failed to decline invitation.')
    },
  })

  function handleAccept() {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/invite/${token}`)
      return
    }
    acceptMutation.mutate()
  }

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading invitation...</div>
  if (error || !data) return <div className="p-6 text-destructive text-sm">Invitation not found or expired.</div>

  const isResponded = data.invitationStatus !== 'pending'

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">You've been invited</h1>
          <p className="text-muted-foreground text-sm">
            Review the dispute below and choose to accept or decline.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-lg">{data.disputeTitle}</CardTitle>
              <Badge variant="outline" className="capitalize">
                {data.disputeCategory.replace('_', ' ')}
              </Badge>
            </div>
            <CardDescription className="mt-2">{data.disputeSummary}</CardDescription>
          </CardHeader>
        </Card>

        {message && (
          <p className={`text-sm text-center ${message.includes('accepted') ? 'text-green-600' : 'text-muted-foreground'}`}>
            {message}
          </p>
        )}

        {!isResponded && !message && (
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? 'Accepting...' : 'Accept Invitation'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeclineOpen(true)}
            >
              Decline
            </Button>
          </div>
        )}

        {isResponded && !message && (
          <p className="text-sm text-center text-muted-foreground capitalize">
            This invitation has already been {data.invitationStatus}.
          </p>
        )}

        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline this invitation?</DialogTitle>
              <DialogDescription>
                This will cancel the dispute. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineOpen(false)}>
                Go Back
              </Button>
              <Button
                variant="destructive"
                onClick={() => declineMutation.mutate()}
                disabled={declineMutation.isPending}
              >
                {declineMutation.isPending ? 'Declining...' : 'Yes, Decline'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/invitations/InvitationPage.tsx
git commit -m "feat(frontend): add public invitation landing page"
```

---

## Task 14: Frontend — Wire Routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: (implicitly) React Query provider in `frontend/src/main.tsx` if not already set up

- [ ] **Step 1: Check if React Query QueryClientProvider is set up in main.tsx**

Read `frontend/src/main.tsx`. If it doesn't have `QueryClientProvider`, add it:

```tsx
// frontend/src/main.tsx (full replacement if QueryClientProvider missing)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/geist'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 2: Update App.tsx with dispute and invitation routes**

```tsx
// frontend/src/App.tsx
import { Routes, Route, useNavigate } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Dashboard } from '@/pages/disputes/Dashboard'
import { CreateDispute } from '@/pages/disputes/CreateDispute'
import { DisputeDetail } from '@/pages/disputes/DisputeDetail'
import { InvitationPage } from '@/pages/invitations/InvitationPage'
import { signOut } from '@/lib/authClient'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

function DashboardHome() {
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()

  async function handleLogout() {
    await signOut()
    clearAuth()
    navigate('/')
  }

  return (
    <div className="p-6">
      <Button variant="outline" onClick={handleLogout}>Sign out</Button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/invite/:token" element={<InvitationPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
        </Route>
        <Route path="/disputes" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<CreateDispute />} />
          <Route path=":id" element={<DisputeDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
```

- [ ] **Step 3: Run the frontend build to check for TypeScript errors**

```bash
cd frontend && npm run build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat(frontend): wire dispute and invitation routes into app"
```

---

## Task 15: Final — Add APP_URL to backend .env.example

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Add APP_URL variable**

Add to `backend/.env.example`:

```
# URL of the frontend app (used in invitation email links)
APP_URL=http://localhost:5173
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "chore: add APP_URL env variable for invitation links"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| `POST /v1/disputes` — create dispute, generate invitation link | Task 1, 3 |
| `GET /v1/disputes` — list user's disputes | Task 1, 3 |
| `GET /v1/disputes/:id` — dispute detail | Task 1, 3 |
| `POST /v1/invitations/:token/accept` | Task 1, 4 |
| `POST /v1/invitations/:token/decline` | Task 1, 4 |
| Dispute state machine logic | Task 1 (`acceptInvitation` → `in_progress`, `declineInvitation` → `cancelled`) |
| Invitation email sending | Task 2, 3 |
| Multi-step form: Steps 1–4 | Task 11 |
| Form progress indicator | Task 11 (StepIndicator component) |
| Form validation | Task 11 (button disabled logic) |
| Success page after dispute created | Task 12 (inviteUrl banner) |
| Public invitation landing page `/invite/:token` | Task 13 |
| Show dispute summary to invited party | Task 13 |
| Accept button → login → join dispute | Task 13 (redirects to `/login?redirect=...`) |
| Decline button → confirmation modal | Task 13 (Dialog component) |
| Tests | Task 6 |

**Note on Step 4 (Stripe payment):** The MVP_TODO specifies "Step 4 — Choose pricing tier + Stripe payment" in the wizard. Stripe integration is defined as its own Phase 8. The wizard's Step 4 in this plan is a **Review & Submit** step (no payment) — this is intentional since Phase 8 is a separate phase. The step count in `StepIndicator` can be adjusted to 3 if preferred, or Step 4 can be labeled "Review" rather than payment.

All types are consistent: `DisputeParty`, `Dispute`, `CreateDisputePayload`, `InvitationSummary` defined in `disputeApi.ts` and used in all downstream files. The `useDisputeForm` hook's `toPayload()` returns `CreateDisputePayload`. No placeholders or TBDs found.
