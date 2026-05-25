# Phase 9: Notifications & Email — Design Spec

**Date:** 2026-05-25  
**Scope:** Backend email notifications for all 5 Phase 9 triggers; no in-app bell (optional stretch, out of scope for MVP).

---

## 1. Overview

Five transactional emails are added to complete Phase 9. All email logic lives in `src/lib/email.ts`. Triggers are wired into existing service/controller call sites — no new routes required. All sends are fire-and-forget (`.catch(console.error)`) to avoid blocking HTTP responses or evaluation pipelines.

---

## 2. Email Functions

Four new functions added to `src/lib/email.ts` (one already exists: `sendInvitationEmail`):

| Function | Recipient | Trigger point |
|----------|-----------|---------------|
| `sendDisputeConfirmationEmail(to, name, disputeTitle, disputeUrl)` | Initiator | `disputes.ts` controller, after `createDispute` |
| `sendInvitationEmail` *(existing)* | Counterparty | `disputes.ts` controller — already wired, tests missing |
| `sendCounterpartyAcceptedEmail(to, name, disputeTitle, disputeUrl)` | Initiator | `services/disputes.ts` `acceptInvitation`, after DB update |
| `sendAnalysisStartedEmail(to, name, disputeTitle)` | Both parties | `services/briefs.ts` `submitBrief`, inside `allSubmitted` block |
| `sendOpinionReadyEmail(to, name, disputeTitle, opinionUrl)` | Both parties | `services/evaluation.ts` `triggerEvaluation`, after opinion saved |

---

## 3. Integration Points

### 3.1 `disputes.ts` controller — `createDispute`
After the existing `sendInvitationEmail` fire-and-forget, add:
```ts
sendDisputeConfirmationEmail(req.user!.email, req.user!.name, dispute.title, `${appUrl}/disputes/${dispute.id}`)
  .catch(err => console.error('[createDispute] Failed to send confirmation email:', err))
```
`req.user` is already populated by auth middleware, so no extra DB query.

### 3.2 `services/disputes.ts` — `acceptInvitation`
After the `$transaction` that sets `in_progress`, fetch initiator email and send:
```ts
const dispute = await prisma.dispute.findUnique({
  where: { id: party.disputeId },
  include: { initiator: { select: { email: true, name: true } } },
})
if (dispute?.initiator) {
  sendCounterpartyAcceptedEmail(dispute.initiator.email, dispute.initiator.name, dispute.title, ...)
    .catch(...)
}
```

### 3.3 `services/briefs.ts` — `submitBrief`
The `allSubmitted` block already fetches `allParties`. Extend that query to include `user { email, name }`, then email both:
```ts
const allParties = await prisma.party.findMany({
  where: { disputeId },
  include: { user: { select: { email: true, name: true } } },
})
```
Then inside `if (allSubmitted)`, fire `sendAnalysisStartedEmail` for each party that has a user.

### 3.4 `services/evaluation.ts` — `triggerEvaluation`
After the `$transaction` that saves the opinion and sets `state = completed`, extend the existing `dispute` fetch (or add a small targeted query) to get both parties' user emails, then send `sendOpinionReadyEmail` to each.

---

## 4. Data Requirements

- `User.name` is already on the schema (`String` field).
- `APP_URL` env var is already used in the disputes controller (`process.env.APP_URL || 'http://localhost:5173'`).
- Opinion URL pattern: `${appUrl}/disputes/${disputeId}/opinion`
- Dispute URL pattern: `${appUrl}/disputes/${disputeId}`

---

## 5. Testing Plan (TDD)

### 5.1 Unit tests — `src/tests/email.test.ts`

Nodemailer is mocked via `vi.mock('nodemailer')`. For each new function, add a `describe` block with:
- Calls `sendMail` with correct `to` and matching `subject`
- HTML body contains the relevant URL (where applicable)
- `from` is truthy
- Does not throw when `sendMail` rejects (logs error)

Also add the same 4 tests for `sendInvitationEmail` (currently untested).

### 5.2 Integration tests — `src/tests/notifications.test.ts`

Mock `../lib/email` via `vi.mock('../lib/email')` and assert the right function is called with the right arguments at each trigger point:

| Test | What is asserted |
|------|-----------------|
| `POST /v1/disputes` | `sendDisputeConfirmationEmail` called once with initiator email + dispute title |
| `POST /v1/disputes` | `sendInvitationEmail` called once with counterparty email + invite URL |
| `POST /v1/invitations/:token/accept` | `sendCounterpartyAcceptedEmail` called once with initiator email |
| Both briefs submitted (service unit test) | `sendAnalysisStartedEmail` called twice (once per party) |
| `triggerEvaluation` (service unit test) | `sendOpinionReadyEmail` called twice (once per party) |

The last two test the service functions directly (not HTTP) to avoid needing the full evaluation pipeline in tests. Services are called with a real DB (same pattern as existing tests) but with email mocked.

---

## 6. Out of Scope

- In-app notification bell (optional MVP stretch)
- Email open/click tracking
- Unsubscribe flow
- HTML template engine (inline HTML is sufficient for MVP, consistent with existing emails)
