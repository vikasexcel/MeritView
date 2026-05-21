# MeritView — How to Test (User A & User B)

Use **two browsers** (or one normal window + one private/incognito window) so each person stays logged in separately.

- **User A** — creates the dispute (Party A in results)
- **User B** — accepts the invite and joins the same dispute (Party B in results)

**Website:** `http://localhost:5173` (or the link your team gives you)

---

## Step 1 — Create accounts (if you don’t have one)

Do this **once per person**.

1. Open the site → **Register**
2. Enter **name**, **email**, and **password** (8+ characters)
3. Check email and click **Verify** link (if email is not set up, ask the dev team to verify your account)
4. Go to **Login** and sign in
5. You should see the **Dashboard**

Repeat for User B in the **other browser**.

---

## Step 2 — User A creates a dispute

1. Sign in as **User A**
2. Go to **Disputes** → **Start New Dispute**
3. Fill in all steps:
   - **Title** — short name for the dispute
   - **Category** — e.g. Contract
   - **Summary** — what the dispute is about (a few sentences)
   - **Stakes** — optional dollar amount
   - **Counterparty** — User B’s **name** and **email**
4. Click **Create Dispute**
5. Copy the **invite link** shown on screen and send it to **User B** (chat/email)

---

## Step 3 — User B accepts the invite

1. Sign in as **User B** (other browser)
2. Open the **invite link** from User A
3. Read the dispute details
4. Click **Accept**
5. Go to **Disputes** — the same dispute should appear for both users

---

## Step 4 — Write and submit briefs (both users)

Open the dispute → **Write Your Brief**.

### Left side — AI assistant
- Chat here to get **ideas and structure**
- The AI **does not** submit your brief for you

### Right side — Your brief (you write this)
- Fill the five sections yourself:
  - Facts
  - Position
  - Arguments
  - Acknowledgment
  - Desired Outcome
- Use **Save Draft** anytime
- When ready, click **Submit Brief** (locked after submit)

**Order:** Either user can submit first. The second submit starts AI analysis.

---

## Step 5 — View results (both users)

1. After **both** briefs are submitted, open the dispute
2. Click **View Analysis Progress** or **View Results**
3. Wait 1–2 minutes for the AI judges to finish
4. Read:
   - Executive summary
   - Comparative assessment
   - **Party A** = User A
   - **Party B** = User B

---

## Example test case (copy and adapt)

**Title:** Security deposit dispute — early lease exit  

**Summary:** User A rented a unit to User B. User B left early. User A kept the full deposit. User B wants money back. User A claims costs for early exit and utilities.

**User A angle:** Lease terms, notice period, unpaid bills, reletting costs.  
**User B angle:** Paid rent on time, left cleanly, deposit should be returned minus real damages only.

Use different wording in each brief so the AI has two real sides to compare.

---

## Quick checklist

| Step | User A | User B |
|------|--------|--------|
| Account created & verified | ✓ | ✓ |
| Create dispute | ✓ | — |
| Accept invite | — | ✓ |
| Write brief (right side) | ✓ | ✓ |
| Submit brief | ✓ | ✓ |
| View opinion/results | ✓ | ✓ |

---

## Note

If you get stuck at any point, **refresh the page** and try again. If it still fails, tell the dev team what step you were on and what you saw on screen.
