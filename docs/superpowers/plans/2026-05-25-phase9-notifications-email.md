# Phase 9: Notifications & Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five transactional emails to MeritView — dispute confirmation, counterparty invitation (tests only), counterparty accepted, analysis started, and opinion ready.

**Architecture:** All email functions live in `src/lib/email.ts`. Triggers are wired into the existing controller and service layer (no new routes). All sends are fire-and-forget with `.catch(console.error)`. Tests use TDD: write failing tests first, then implement, then wire integrations.

**Tech Stack:** Node.js/Express, TypeScript, Nodemailer (already installed), Vitest, Supertest, Prisma.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/lib/email.ts` | Modify | Add 4 new email functions |
| `src/tests/email.test.ts` | Modify | Add unit tests for 4 new functions + `sendInvitationEmail` |
| `src/tests/notifications.test.ts` | Create | Integration tests: email called at each trigger point |
| `src/controllers/disputes.ts` | Modify | Fire `sendDisputeConfirmationEmail` after dispute creation |
| `src/services/disputes.ts` | Modify | Fire `sendCounterpartyAcceptedEmail` after invitation accepted |
| `src/services/briefs.ts` | Modify | Fire `sendAnalysisStartedEmail` to both parties when both briefs submitted |
| `src/services/evaluation.ts` | Modify | Fire `sendOpinionReadyEmail` to both parties after opinion saved |

---

## Task 1: Unit tests for `sendInvitationEmail` (missing coverage)

**Files:**
- Modify: `src/tests/email.test.ts`

- [ ] **Step 1: Add import for `sendInvitationEmail`**

Open `src/tests/email.test.ts`. Change line 12 from:
```ts
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email'
```
to:
```ts
import { sendVerificationEmail, sendPasswordResetEmail, sendInvitationEmail } from '../lib/email'
```

- [ ] **Step 2: Append the describe block for `sendInvitationEmail`**

Add this block at the end of `src/tests/email.test.ts` (after the `sendPasswordResetEmail` describe block):

```ts
describe('sendInvitationEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendInvitationEmail(
      'counterparty@example.com',
      'Bob Smith',
      'Contract Dispute',
      'https://app.meritview.com/invite/abc123'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('counterparty@example.com')
    expect(call.subject).toMatch(/invited/i)
  })

  it('includes the invite URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/invite/xyz789'
    await sendInvitationEmail('counterparty@example.com', 'Bob Smith', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendInvitationEmail(
      'counterparty@example.com',
      'Bob Smith',
      'Contract Dispute',
      'https://app.meritview.com/invite/abc'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendInvitationEmail(
        'fail@example.com',
        'Bob',
        'Dispute',
        'https://example.com/invite/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run tests — expect these 4 to pass (they test existing code)**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendInvitationEmail"
```

Expected: all 4 `sendInvitationEmail` tests pass (the function already exists).

- [ ] **Step 4: Commit**

```bash
git add src/tests/email.test.ts
git commit -m "test: add missing unit tests for sendInvitationEmail"
```

---

## Task 2: Unit tests + implementation for `sendDisputeConfirmationEmail`

**Files:**
- Modify: `src/tests/email.test.ts`
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Write the failing tests**

Add this block at the end of `src/tests/email.test.ts`:

```ts
describe('sendDisputeConfirmationEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendDisputeConfirmationEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/dispute/i)
  })

  it('includes the dispute URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1'
    await sendDisputeConfirmationEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendDisputeConfirmationEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendDisputeConfirmationEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
```

Also update the import line to include `sendDisputeConfirmationEmail`:

```ts
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendDisputeConfirmationEmail,
} from '../lib/email'
```

- [ ] **Step 2: Run — expect 4 failures**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendDisputeConfirmationEmail"
```

Expected: `sendDisputeConfirmationEmail is not a function` or similar import error.

- [ ] **Step 3: Implement `sendDisputeConfirmationEmail` in `src/lib/email.ts`**

Add this function at the end of `src/lib/email.ts`:

```ts
export async function sendDisputeConfirmationEmail(
  to: string,
  name: string,
  disputeTitle: string,
  disputeUrl: string
) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Your dispute has been filed on ${APP_NAME}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Dispute filed</h2>
          <p style="color:#444">Hi ${name},</p>
          <p style="color:#444">Your dispute <strong>${disputeTitle}</strong> has been filed on ${APP_NAME}. We've sent an invitation to the other party — you'll be notified when they respond.</p>
          <a href="${disputeUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
            View Dispute
          </a>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Nodemailer] Failed to send dispute confirmation email:', error)
  }
}
```

- [ ] **Step 4: Run — expect 4 tests to pass**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendDisputeConfirmationEmail"
```

Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/tests/email.test.ts
git commit -m "feat: add sendDisputeConfirmationEmail with unit tests"
```

---

## Task 3: Unit tests + implementation for `sendCounterpartyAcceptedEmail`

**Files:**
- Modify: `src/tests/email.test.ts`
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Write the failing tests**

Update the import in `src/tests/email.test.ts` to add `sendCounterpartyAcceptedEmail`:

```ts
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendDisputeConfirmationEmail,
  sendCounterpartyAcceptedEmail,
} from '../lib/email'
```

Add this describe block at the end of `src/tests/email.test.ts`:

```ts
describe('sendCounterpartyAcceptedEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendCounterpartyAcceptedEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/accepted/i)
  })

  it('includes the dispute URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1'
    await sendCounterpartyAcceptedEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendCounterpartyAcceptedEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendCounterpartyAcceptedEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run — expect 4 failures**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendCounterpartyAcceptedEmail"
```

Expected: import error / not a function.

- [ ] **Step 3: Implement `sendCounterpartyAcceptedEmail` in `src/lib/email.ts`**

Add at the end of `src/lib/email.ts`:

```ts
export async function sendCounterpartyAcceptedEmail(
  to: string,
  name: string,
  disputeTitle: string,
  disputeUrl: string
) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `The other party has accepted your dispute invitation on ${APP_NAME}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Invitation accepted</h2>
          <p style="color:#444">Hi ${name},</p>
          <p style="color:#444">The other party has accepted your invitation to resolve <strong>${disputeTitle}</strong>. Your dispute is now in progress — both parties can now submit their briefs.</p>
          <a href="${disputeUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
            View Dispute
          </a>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Nodemailer] Failed to send counterparty accepted email:', error)
  }
}
```

- [ ] **Step 4: Run — expect 4 tests to pass**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendCounterpartyAcceptedEmail"
```

Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/tests/email.test.ts
git commit -m "feat: add sendCounterpartyAcceptedEmail with unit tests"
```

---

## Task 4: Unit tests + implementation for `sendAnalysisStartedEmail`

**Files:**
- Modify: `src/tests/email.test.ts`
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Write the failing tests**

Update the import in `src/tests/email.test.ts`:

```ts
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendDisputeConfirmationEmail,
  sendCounterpartyAcceptedEmail,
  sendAnalysisStartedEmail,
} from '../lib/email'
```

Add this describe block at the end of `src/tests/email.test.ts`:

```ts
describe('sendAnalysisStartedEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/analysis/i)
  })

  it('includes the dispute title in the HTML body', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Contract Dispute')
  })

  it('sends a from address', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendAnalysisStartedEmail('fail@example.com', 'Alice', 'Dispute')
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run — expect 4 failures**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendAnalysisStartedEmail"
```

Expected: import error / not a function.

- [ ] **Step 3: Implement `sendAnalysisStartedEmail` in `src/lib/email.ts`**

Add at the end of `src/lib/email.ts`:

```ts
export async function sendAnalysisStartedEmail(to: string, name: string, disputeTitle: string) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Analysis has begun for your dispute on ${APP_NAME}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Analysis in progress</h2>
          <p style="color:#444">Hi ${name},</p>
          <p style="color:#444">Both parties have submitted their briefs for <strong>${disputeTitle}</strong>. Our AI evaluators are now analysing the submissions. You'll be notified when the opinion is ready.</p>
          <p style="color:#888;font-size:13px">This usually takes a few minutes.</p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Nodemailer] Failed to send analysis started email:', error)
  }
}
```

- [ ] **Step 4: Run — expect 4 tests to pass**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendAnalysisStartedEmail"
```

Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/tests/email.test.ts
git commit -m "feat: add sendAnalysisStartedEmail with unit tests"
```

---

## Task 5: Unit tests + implementation for `sendOpinionReadyEmail`

**Files:**
- Modify: `src/tests/email.test.ts`
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Write the failing tests**

Update the import in `src/tests/email.test.ts`:

```ts
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendDisputeConfirmationEmail,
  sendCounterpartyAcceptedEmail,
  sendAnalysisStartedEmail,
  sendOpinionReadyEmail,
} from '../lib/email'
```

Add this describe block at the end of `src/tests/email.test.ts`:

```ts
describe('sendOpinionReadyEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendOpinionReadyEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1/opinion'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/opinion/i)
  })

  it('includes the opinion URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1/opinion'
    await sendOpinionReadyEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendOpinionReadyEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1/opinion'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendOpinionReadyEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail/opinion'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run — expect 4 failures**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -A2 "sendOpinionReadyEmail"
```

Expected: import error / not a function.

- [ ] **Step 3: Implement `sendOpinionReadyEmail` in `src/lib/email.ts`**

Add at the end of `src/lib/email.ts`:

```ts
export async function sendOpinionReadyEmail(
  to: string,
  name: string,
  disputeTitle: string,
  opinionUrl: string
) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Your opinion is ready on ${APP_NAME}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Opinion ready</h2>
          <p style="color:#444">Hi ${name},</p>
          <p style="color:#444">The AI evaluation for <strong>${disputeTitle}</strong> is complete. Your opinion is now available to view.</p>
          <a href="${opinionUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
            View Opinion
          </a>
          <p style="color:#888;font-size:13px">This is argument analysis, not legal advice.</p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Nodemailer] Failed to send opinion ready email:', error)
  }
}
```

- [ ] **Step 4: Run — expect all email unit tests to pass**

```bash
cd backend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|sendOpinionReadyEmail)"
```

Expected: all `sendOpinionReadyEmail` tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/tests/email.test.ts
git commit -m "feat: add sendOpinionReadyEmail with unit tests"
```

---

## Task 6: Integration tests — dispute creation and invitation emails

**Files:**
- Create: `src/tests/notifications.test.ts`

These tests verify that the controller and services call the right email functions. They mock `../lib/email` so no real email is sent, but they hit a real DB (consistent with the rest of the test suite).

- [ ] **Step 1: Create `src/tests/notifications.test.ts` with the first two test cases (dispute creation)**

```ts
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
```

- [ ] **Step 2: Run — expect both tests to fail (email not yet wired in controller)**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: tests fail because `sendDisputeConfirmationEmail` is not called yet.

- [ ] **Step 3: Wire `sendDisputeConfirmationEmail` into `src/controllers/disputes.ts`**

Add the import at the top of `src/controllers/disputes.ts` (update existing email import):

```ts
import { sendInvitationEmail, sendDisputeConfirmationEmail } from '../lib/email'
```

After the existing `sendInvitationEmail` fire-and-forget call (around line 50), add:

```ts
sendDisputeConfirmationEmail(
  req.user!.email,
  req.user!.name ?? 'there',
  dispute.title,
  `${appUrl}/disputes/${dispute.id}`
).catch((err) => {
  console.error('[createDispute] Failed to send confirmation email:', err)
})
```

The full updated block in `createDispute` (around lines 47–54) will look like:

```ts
const appUrl = process.env.APP_URL || 'http://localhost:5173'
const inviteUrl = `${appUrl}/invite/${invitationToken}`

sendInvitationEmail(counterpartyEmail, counterpartyName, dispute.title, inviteUrl).catch((err) => {
  console.error('[createDispute] Failed to send invitation email:', err)
})

sendDisputeConfirmationEmail(
  req.user!.email,
  req.user!.name ?? 'there',
  dispute.title,
  `${appUrl}/disputes/${dispute.id}`
).catch((err) => {
  console.error('[createDispute] Failed to send confirmation email:', err)
})

res.status(201).json({ dispute, invitationToken, inviteUrl })
```

- [ ] **Step 4: Run — expect both tests to pass**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: both pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tests/notifications.test.ts src/controllers/disputes.ts
git commit -m "feat: wire sendDisputeConfirmationEmail + integration tests for dispute creation emails"
```

---

## Task 7: Integration test + wire `sendCounterpartyAcceptedEmail`

**Files:**
- Modify: `src/tests/notifications.test.ts`
- Modify: `src/services/disputes.ts`

- [ ] **Step 1: Add the failing integration test to `src/tests/notifications.test.ts`**

Add this describe block at the end of the file:

```ts
describe('POST /v1/invitations/:token/accept — email notification', () => {
  it('calls sendCounterpartyAcceptedEmail with initiator email when counterparty accepts', async () => {
    vi.clearAllMocks()

    // Create initiator + dispute
    const initiatorCookie = await registerAndLogin('notif-initiator@test.meritview')
    const createRes = await request(app)
      .post('/v1/disputes')
      .set('Cookie', initiatorCookie)
      .send({
        title: 'Accept Notification Dispute',
        category: 'contract',
        summary: 'Summary for accept notification test.',
        counterpartyEmail: 'respondent@example.com',
        counterpartyName: 'Respondent',
      })
    expect(createRes.status).toBe(201)
    const { invitationToken } = createRes.body

    vi.clearAllMocks()

    // Register respondent and accept
    const respondentCookie = await registerAndLogin('notif-respondent@test.meritview')
    const acceptRes = await request(app)
      .post(`/v1/invitations/${invitationToken}/accept`)
      .set('Cookie', respondentCookie)

    expect(acceptRes.status).toBe(200)
    expect(emailLib.sendCounterpartyAcceptedEmail).toHaveBeenCalledOnce()
    const [to] = (emailLib.sendCounterpartyAcceptedEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to).toBe('notif-initiator@test.meritview')
  })
})
```

- [ ] **Step 2: Run — expect the new test to fail**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | grep -A5 "sendCounterpartyAcceptedEmail"
```

Expected: test fails — function not called.

- [ ] **Step 3: Wire `sendCounterpartyAcceptedEmail` into `src/services/disputes.ts`**

Add the import at the top of `src/services/disputes.ts`:

```ts
import { sendCounterpartyAcceptedEmail } from '../lib/email'
```

In `acceptInvitation`, after the `$transaction` block (after line ~121, before `const updatedParty = ...`), add:

```ts
const disputeForEmail = await prisma.dispute.findUnique({
  where: { id: party.disputeId },
  include: { initiator: { select: { email: true, name: true } } },
})
if (disputeForEmail?.initiator) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  sendCounterpartyAcceptedEmail(
    disputeForEmail.initiator.email,
    disputeForEmail.initiator.name ?? 'there',
    disputeForEmail.title,
    `${appUrl}/disputes/${disputeForEmail.id}`
  ).catch((err) => console.error('[acceptInvitation] Failed to send counterparty accepted email:', err))
}
```

- [ ] **Step 4: Run — expect the test to pass**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all notifications tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/tests/notifications.test.ts src/services/disputes.ts
git commit -m "feat: wire sendCounterpartyAcceptedEmail + integration test"
```

---

## Task 8: Integration test + wire `sendAnalysisStartedEmail`

**Files:**
- Modify: `src/tests/notifications.test.ts`
- Modify: `src/services/briefs.ts`

- [ ] **Step 1: Add the failing integration test to `src/tests/notifications.test.ts`**

Add this describe block at the end of the file. This tests the service directly (not HTTP) to avoid needing the full evaluation pipeline.

First add these imports at the top of `src/tests/notifications.test.ts` (after the existing imports):

```ts
import { submitBrief } from '../services/briefs'
```

Then add the describe block:

```ts
describe('submitBrief — analysis started email', () => {
  it('calls sendAnalysisStartedEmail for both parties when both briefs submitted', async () => {
    vi.clearAllMocks()

    // Create two users
    const initiatorEmail = 'notif-brief-a@test.meritview'
    const respondentEmail = 'notif-brief-b@test.meritview'
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: initiatorEmail, password: 'Password123!', name: 'Party A' })
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: respondentEmail, password: 'Password123!', name: 'Party B' })

    const userA = await prisma.user.findUnique({ where: { email: initiatorEmail } })
    const userB = await prisma.user.findUnique({ where: { email: respondentEmail } })
    expect(userA).toBeTruthy()
    expect(userB).toBeTruthy()

    // Create dispute with two parties directly in DB
    const dispute = await prisma.dispute.create({
      data: {
        title: 'Analysis Email Dispute',
        category: 'contract',
        summary: 'Summary for analysis email test.',
        state: 'in_progress',
        initiatorId: userA!.id,
        parties: {
          create: [
            { userId: userA!.id, role: 'initiator', invitationStatus: 'accepted' },
            { userId: userB!.id, role: 'respondent', invitationStatus: 'accepted' },
          ],
        },
      },
      include: { parties: true },
    })

    const [partyA, partyB] = dispute.parties
    const briefContent = { facts: 'Some facts here', position: 'My position', desiredOutcome: 'Resolution' }

    // Submit brief for party A (should not trigger email yet)
    await submitBrief(partyA.id, dispute.id, briefContent)
    expect(emailLib.sendAnalysisStartedEmail).not.toHaveBeenCalled()

    // Submit brief for party B (should trigger analysis started for both)
    await submitBrief(partyB.id, dispute.id, briefContent)

    // Give fire-and-forget a tick to settle
    await new Promise((r) => setTimeout(r, 50))

    expect(emailLib.sendAnalysisStartedEmail).toHaveBeenCalledTimes(2)
    const calls = (emailLib.sendAnalysisStartedEmail as ReturnType<typeof vi.fn>).mock.calls
    const toAddresses = calls.map((c: unknown[]) => c[0])
    expect(toAddresses).toContain(initiatorEmail)
    expect(toAddresses).toContain(respondentEmail)
  })
})
```

- [ ] **Step 2: Run — expect the new test to fail**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | grep -A5 "sendAnalysisStartedEmail"
```

Expected: test fails — `sendAnalysisStartedEmail` not called.

- [ ] **Step 3: Wire `sendAnalysisStartedEmail` into `src/services/briefs.ts`**

Add the import at the top of `src/services/briefs.ts`:

```ts
import { sendAnalysisStartedEmail } from '../lib/email'
```

In `submitBrief`, the `allParties` query currently is:
```ts
const allParties = await prisma.party.findMany({ where: { disputeId } })
```

Replace it with:
```ts
const allParties = await prisma.party.findMany({
  where: { disputeId },
  include: { user: { select: { email: true, name: true } } },
})
```

Then inside the `if (allSubmitted)` block, after the `auditEvent.create` call and before the `triggerEvaluation` import, add:

```ts
// Fetch dispute title for email
const disputeForEmail = await prisma.dispute.findUnique({ where: { id: disputeId }, select: { title: true } })
if (disputeForEmail) {
  for (const p of allParties) {
    if (p.user) {
      sendAnalysisStartedEmail(p.user.email, p.user.name ?? 'there', disputeForEmail.title)
        .catch((err) => console.error('[submitBrief] Failed to send analysis started email:', err))
    }
  }
}
```

- [ ] **Step 4: Run — expect the test to pass**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/tests/notifications.test.ts src/services/briefs.ts
git commit -m "feat: wire sendAnalysisStartedEmail + integration test"
```

---

## Task 9: Integration test + wire `sendOpinionReadyEmail`

**Files:**
- Modify: `src/tests/notifications.test.ts`
- Modify: `src/services/evaluation.ts`

- [ ] **Step 1: Add the failing integration test to `src/tests/notifications.test.ts`**

Add this import at the top of `src/tests/notifications.test.ts`:

```ts
import { triggerEvaluation } from '../services/evaluation'
```

Add this describe block at the end of the file:

```ts
describe('triggerEvaluation — opinion ready email', () => {
  it('calls sendOpinionReadyEmail for both parties after opinion is saved', async () => {
    vi.clearAllMocks()

    // Mock the evaluator and aggregator to avoid real LLM calls
    vi.mock('../lib/evaluator', () => ({
      EVALUATOR_COUNT: 1,
      runEvaluators: vi.fn().mockResolvedValue([
        {
          provider: 'mock',
          tokensUsed: 0,
          output: {
            partyAScore: 7,
            partyBScore: 5,
            partyAStrengths: ['clear'],
            partyAWeaknesses: ['brief'],
            partyBStrengths: ['concise'],
            partyBWeaknesses: ['vague'],
            partyASuggestedConsiderations: [],
            partyBSuggestedConsiderations: [],
            reasoning: 'mock',
          },
        },
      ]),
    }))

    vi.mock('../lib/aggregator', () => ({
      aggregateResults: vi.fn().mockResolvedValue({
        partyAPoints: 5,
        partyBPoints: 3,
        overallWinner: 'Party A',
        confidenceScore: 80,
        aggregatorAgreement: 0.9,
        narrative: 'Mock narrative',
        partyAAnalysis: { strengths: ['clear'], weaknesses: [], suggestedConsiderations: [] },
        partyBAnalysis: { strengths: [], weaknesses: ['vague'], suggestedConsiderations: [] },
      }),
    }))

    // Create two users and a dispute with submitted briefs
    const userAEmail = 'notif-eval-a@test.meritview'
    const userBEmail = 'notif-eval-b@test.meritview'
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: userAEmail, password: 'Password123!', name: 'Eval A' })
    await request(app).post(`${AUTH_BASE}/sign-up/email`).send({ email: userBEmail, password: 'Password123!', name: 'Eval B' })

    const userA = await prisma.user.findUnique({ where: { email: userAEmail } })
    const userB = await prisma.user.findUnique({ where: { email: userBEmail } })
    expect(userA).toBeTruthy()
    expect(userB).toBeTruthy()

    const dispute = await prisma.dispute.create({
      data: {
        title: 'Opinion Email Dispute',
        category: 'contract',
        summary: 'Summary for opinion email test.',
        state: 'under_analysis',
        initiatorId: userA!.id,
        parties: {
          create: [
            { userId: userA!.id, role: 'initiator', invitationStatus: 'accepted', briefStatus: 'submitted' },
            { userId: userB!.id, role: 'respondent', invitationStatus: 'accepted', briefStatus: 'submitted' },
          ],
        },
      },
      include: { parties: true },
    })

    const briefContent = { facts: 'Facts', position: 'Position', desiredOutcome: 'Settlement' }
    for (const p of dispute.parties) {
      await prisma.brief.create({
        data: { partyId: p.id, disputeId: dispute.id, content: briefContent, wordCount: 10, status: 'submitted', submittedAt: new Date() },
      })
    }

    await triggerEvaluation(dispute.id)

    expect(emailLib.sendOpinionReadyEmail).toHaveBeenCalledTimes(2)
    const calls = (emailLib.sendOpinionReadyEmail as ReturnType<typeof vi.fn>).mock.calls
    const toAddresses = calls.map((c: unknown[]) => c[0])
    expect(toAddresses).toContain(userAEmail)
    expect(toAddresses).toContain(userBEmail)
  })
})
```

- [ ] **Step 2: Run — expect the new test to fail**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | grep -A5 "sendOpinionReadyEmail"
```

Expected: test fails — `sendOpinionReadyEmail` not called.

- [ ] **Step 3: Wire `sendOpinionReadyEmail` into `src/services/evaluation.ts`**

Add the import at the top of `src/services/evaluation.ts`:

```ts
import { sendOpinionReadyEmail } from '../lib/email'
```

In `triggerEvaluation`, after the `$transaction` that saves the opinion (after `const opinion = await prisma.$transaction(...)` and the `emit(disputeId, { type: 'opinion_ready', ... })` line), add:

```ts
// Send opinion ready emails to both parties
const disputeWithParties = await prisma.dispute.findUnique({
  where: { id: disputeId },
  include: { parties: { include: { user: { select: { email: true, name: true } } } } },
})
if (disputeWithParties) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  for (const p of disputeWithParties.parties) {
    if (p.user) {
      sendOpinionReadyEmail(
        p.user.email,
        p.user.name ?? 'there',
        disputeWithParties.title,
        `${appUrl}/disputes/${disputeId}/opinion`
      ).catch((err) => console.error('[triggerEvaluation] Failed to send opinion ready email:', err))
    }
  }
}
```

Place this block after line ~134 (after `emit(disputeId, { type: 'opinion_ready', opinionId: opinion.id })`) and before `progressListeners.delete(disputeId)`.

- [ ] **Step 4: Run — expect all notifications tests to pass**

```bash
cd backend && npm test -- src/tests/notifications.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 5: Run full test suite**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tests/notifications.test.ts src/services/evaluation.ts
git commit -m "feat: wire sendOpinionReadyEmail + integration test"
```

---

## Task 10: Update MVP_TODO.md

**Files:**
- Modify: `docs/MVP_TODO.md`

- [ ] **Step 1: Mark all Phase 9 items as complete**

In `docs/MVP_TODO.md`, replace the Phase 9 section:

```markdown
## Phase 9: Notifications & Email

- [x] Email on dispute creation — confirmation to initiator
- [x] Email invitation to counterparty (with invite link)
- [x] Email when counterparty accepts
- [x] Email when both briefs submitted and analysis begins
- [x] Email to both parties when opinion is ready
- [ ] In-app notification bell (optional MVP stretch)
```

- [ ] **Step 2: Commit**

```bash
git add docs/MVP_TODO.md
git commit -m "chore: mark Phase 9 complete in MVP_TODO"
```
