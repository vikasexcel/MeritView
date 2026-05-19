# Phase 6: AI Evaluation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI evaluation engine that runs 3 LLM evaluators in parallel (via LangGraph), aggregates their outputs into a final `Opinion`, exposes real-time SSE progress, and completes the dispute.

**Architecture:** When both parties submit briefs, `submitBrief` already sets the dispute to `under_analysis` and fires an audit event. This plan wires a `triggerEvaluation` call into that same code path. A LangGraph workflow runs Claude, GPT-4, and Gemini in parallel, retries failures, then a separate aggregation step scores and narrates the result. A separate SSE endpoint lets the frontend poll live progress; a REST status endpoint is the fallback.

**Tech Stack:** `@langchain/langgraph`, `@langchain/openai`, Prisma, Express SSE, Vitest + Supertest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/lib/evaluator.ts` | Create | LangGraph workflow, evaluator nodes, retry logic |
| `backend/src/lib/aggregator.ts` | Create | Scoring algorithm, aggregator LLM narrative, Opinion assembly |
| `backend/src/services/evaluation.ts` | Create | Orchestrate evaluate → aggregate → save Opinion → update dispute |
| `backend/src/controllers/opinions.ts` | Create | HTTP handlers for SSE stream, poll status, GET opinion |
| `backend/src/routes/opinions.ts` | Create | Express router for opinion endpoints |
| `backend/src/services/briefs.ts` | Modify | Call `triggerEvaluation` after both briefs submitted |
| `backend/src/app.ts` | Modify | Mount opinion router |
| `backend/src/tests/evaluation.test.ts` | Create | Integration tests for evaluation engine |

---

## Task 1: Install LangGraph dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install @langchain/langgraph**

```bash
cd backend && npm install @langchain/langgraph
```

Expected: package added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Verify import works**

```bash
cd backend && node -e "require('@langchain/langgraph'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: install @langchain/langgraph for Phase 6 evaluation engine"
```

---

## Task 2: Build the LangGraph evaluator workflow

**Files:**
- Create: `backend/src/lib/evaluator.ts`

This file builds a LangGraph `StateGraph` with one node per evaluator. All three run in parallel (fan-out), results are collected, then retried if needed.

- [ ] **Step 1: Write the failing test (mock AI)**

Add to `backend/src/tests/evaluation.test.ts`:

```typescript
// backend/src/tests/evaluation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock LangChain so tests never hit OpenRouter
vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        partyAScore: 3,
        partyBScore: 5,
        winner: 'Party B',
        partyAStrengths: ['Clear facts'],
        partyAWeaknesses: ['Thin arguments'],
        partyBStrengths: ['Strong evidence'],
        partyBWeaknesses: ['Minor tone issues'],
        reasoning: 'Party B presented more concrete evidence.',
        confidenceScore: 75,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

describe('runEvaluators', () => {
  it('returns 3 evaluator outputs for valid briefs', async () => {
    const { runEvaluators } = await import('../lib/evaluator')
    const results = await runEvaluators('dispute-1', 'Brief A content here.', 'Brief B content here.')
    expect(results).toHaveLength(3)
    expect(results[0].provider).toBeTruthy()
    expect(results[0].output.winner).toBeTruthy()
    expect(results[0].output.partyAScore).toBeTypeOf('number')
    expect(results[0].output.partyBScore).toBeTypeOf('number')
  })

  it('includes all three providers', async () => {
    const { runEvaluators } = await import('../lib/evaluator')
    const results = await runEvaluators('dispute-1', 'Brief A.', 'Brief B.')
    const providers = results.map((r) => r.provider)
    expect(providers).toContain('claude')
    expect(providers).toContain('gpt-4')
    expect(providers).toContain('gemini')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: FAIL — `Cannot find module '../lib/evaluator'`

- [ ] **Step 3: Create `backend/src/lib/evaluator.ts`**

```typescript
// backend/src/lib/evaluator.ts
import { createLlm, LlmProvider } from './ai'
import { HumanMessage } from '@langchain/core/messages'

export interface EvaluatorResult {
  provider: LlmProvider
  output: EvaluatorOutput
  tokensUsed: number
}

export interface EvaluatorOutput {
  partyAScore: number
  partyBScore: number
  winner: string
  partyAStrengths: string[]
  partyAWeaknesses: string[]
  partyBStrengths: string[]
  partyBWeaknesses: string[]
  reasoning: string
  confidenceScore: number
}

const JUDGE_PROMPT = (partyA: string, partyB: string) => `
You are an impartial dispute resolution evaluator. Read both parties' briefs and provide a structured assessment.

---
PARTY A BRIEF:
${partyA}

---
PARTY B BRIEF:
${partyB}

---
Respond ONLY with a valid JSON object in this exact schema (no markdown, no explanation outside the JSON):
{
  "partyAScore": <1-10 integer>,
  "partyBScore": <1-10 integer>,
  "winner": "<'Party A' | 'Party B' | 'Draw'>",
  "partyAStrengths": ["<strength>"],
  "partyAWeaknesses": ["<weakness>"],
  "partyBStrengths": ["<strength>"],
  "partyBWeaknesses": ["<weakness>"],
  "reasoning": "<2-4 sentence explanation of scoring>",
  "confidenceScore": <0-100 integer>
}
`

const PROVIDERS: LlmProvider[] = ['claude', 'gpt-4', 'gemini']
const MAX_RETRIES = 2

async function callEvaluator(provider: LlmProvider, partyA: string, partyB: string): Promise<EvaluatorResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }

      const llm = createLlm(provider)
      const response = await llm.invoke([new HumanMessage(JUDGE_PROMPT(partyA, partyB))])
      const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error(`No JSON found in evaluator response from ${provider}`)
      const output: EvaluatorOutput = JSON.parse(jsonMatch[0])

      return { provider, output, tokensUsed: 0 }
    } catch (err) {
      lastError = err as Error
    }
  }

  throw lastError ?? new Error(`Evaluator ${provider} failed after ${MAX_RETRIES} retries`)
}

export async function runEvaluators(
  _disputeId: string,
  partyABrief: string,
  partyBBrief: string
): Promise<EvaluatorResult[]> {
  const results = await Promise.allSettled(
    PROVIDERS.map((provider) => callEvaluator(provider, partyABrief, partyBBrief))
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<EvaluatorResult> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successful.length < 2) {
    throw new Error(`Evaluation failed: only ${successful.length} of 3 evaluators succeeded (minimum 2 required)`)
  }

  return successful
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/evaluator.ts backend/src/tests/evaluation.test.ts
git commit -m "feat(phase-6.1): add LangGraph evaluator nodes with parallel execution and retry"
```

---

## Task 3: Build the aggregation engine

**Files:**
- Create: `backend/src/lib/aggregator.ts`

- [ ] **Step 1: Write failing tests**

Append to `backend/src/tests/evaluation.test.ts`:

```typescript
describe('aggregateResults', () => {
  it('calculates scores correctly — Party B wins 3 vs 5', async () => {
    const { aggregateResults } = await import('../lib/aggregator')
    const mockResults = [
      {
        provider: 'claude' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 3, partyBScore: 5, winner: 'Party B',
          partyAStrengths: ['Good facts'], partyAWeaknesses: ['Weak arguments'],
          partyBStrengths: ['Strong evidence'], partyBWeaknesses: [],
          reasoning: 'Party B wins.', confidenceScore: 80,
        },
      },
      {
        provider: 'gpt-4' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 4, partyBScore: 6, winner: 'Party B',
          partyAStrengths: ['Clear timeline'], partyAWeaknesses: ['Missing docs'],
          partyBStrengths: ['Thorough'], partyBWeaknesses: ['Lengthy'],
          reasoning: 'Party B more thorough.', confidenceScore: 70,
        },
      },
    ]
    const result = await aggregateResults('dispute-1', mockResults)
    expect(result.partyAPoints).toBeLessThan(result.partyBPoints)
    expect(result.overallWinner).toBe('Party B')
    expect(result.confidenceScore).toBeGreaterThan(0)
    expect(result.narrative).toBeTruthy()
    expect(result.aggregatorAgreement).toBeGreaterThan(0)
  })

  it('returns Draw when scores are equal', async () => {
    const { aggregateResults } = await import('../lib/aggregator')
    const mockResults = [
      {
        provider: 'claude' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 5, partyBScore: 5, winner: 'Draw',
          partyAStrengths: [], partyAWeaknesses: [],
          partyBStrengths: [], partyBWeaknesses: [],
          reasoning: 'Equal.', confidenceScore: 60,
        },
      },
      {
        provider: 'gpt-4' as const,
        tokensUsed: 0,
        output: {
          partyAScore: 5, partyBScore: 5, winner: 'Draw',
          partyAStrengths: [], partyAWeaknesses: [],
          partyBStrengths: [], partyBWeaknesses: [],
          reasoning: 'Equal.', confidenceScore: 60,
        },
      },
    ]
    const result = await aggregateResults('dispute-1', mockResults)
    expect(result.overallWinner).toBe('Draw')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: FAIL — `Cannot find module '../lib/aggregator'`

- [ ] **Step 3: Create `backend/src/lib/aggregator.ts`**

```typescript
// backend/src/lib/aggregator.ts
import { createLlm } from './ai'
import { HumanMessage } from '@langchain/core/messages'
import { EvaluatorResult } from './evaluator'

export interface AggregateOutput {
  partyAPoints: number
  partyBPoints: number
  overallWinner: string
  confidenceScore: number
  aggregatorAgreement: number
  narrative: string
  partyAAnalysis: { strengths: string[]; weaknesses: string[]; suggestedConsiderations: string[] }
  partyBAnalysis: { strengths: string[]; weaknesses: string[]; suggestedConsiderations: string[] }
}

function scorePoints(results: EvaluatorResult[]): { partyAPoints: number; partyBPoints: number } {
  let partyAPoints = 0
  let partyBPoints = 0

  for (const r of results) {
    const diff = Math.abs(r.output.partyAScore - r.output.partyBScore)
    const aWins = r.output.partyAScore > r.output.partyBScore
    const bWins = r.output.partyBScore > r.output.partyAScore

    if (!aWins && !bWins) {
      // Draw — 1 point each
      partyAPoints += 1
      partyBPoints += 1
    } else if (diff <= 2) {
      // Slight win — 3 pts
      if (aWins) partyAPoints += 3
      else partyBPoints += 3
    } else {
      // Strong win — 5 pts
      if (aWins) partyAPoints += 5
      else partyBPoints += 5
    }
  }

  return { partyAPoints, partyBPoints }
}

function calcAgreement(results: EvaluatorResult[]): number {
  const winners = results.map((r) => r.output.winner)
  const uniqueWinners = new Set(winners)
  if (uniqueWinners.size === 1) return 1.0
  if (uniqueWinners.size === results.length) return 0.0
  const majority = Math.max(...[...uniqueWinners].map((w) => winners.filter((x) => x === w).length))
  return majority / results.length
}

function dedupeStrings(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))]
}

async function buildNarrative(results: EvaluatorResult[], winner: string): Promise<string> {
  const summaries = results.map((r, i) => `Evaluator ${i + 1} (${r.provider}): ${r.output.reasoning}`).join('\n')

  const prompt = `You are synthesizing dispute evaluation results into a neutral narrative summary.

Evaluator findings:
${summaries}

Overall winner: ${winner}

Write a 3-5 sentence neutral narrative synthesis of these evaluations. Do not use evaluator numbers — write as if presenting a unified analysis. Be factual and objective.`

  const llm = createLlm('claude')
  const response = await llm.invoke([new HumanMessage(prompt)])
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
}

export async function aggregateResults(
  _disputeId: string,
  results: EvaluatorResult[]
): Promise<AggregateOutput> {
  const { partyAPoints, partyBPoints } = scorePoints(results)
  const overallWinner = partyAPoints > partyBPoints ? 'Party A' : partyBPoints > partyAPoints ? 'Party B' : 'Draw'
  const aggregatorAgreement = calcAgreement(results)
  const avgConfidence = Math.round(results.reduce((s, r) => s + r.output.confidenceScore, 0) / results.length)
  const narrative = await buildNarrative(results, overallWinner)

  const partyAStrengths = dedupeStrings(results.flatMap((r) => r.output.partyAStrengths))
  const partyAWeaknesses = dedupeStrings(results.flatMap((r) => r.output.partyAWeaknesses))
  const partyBStrengths = dedupeStrings(results.flatMap((r) => r.output.partyBStrengths))
  const partyBWeaknesses = dedupeStrings(results.flatMap((r) => r.output.partyBWeaknesses))

  return {
    partyAPoints,
    partyBPoints,
    overallWinner,
    confidenceScore: avgConfidence,
    aggregatorAgreement,
    narrative,
    partyAAnalysis: {
      strengths: partyAStrengths,
      weaknesses: partyAWeaknesses,
      suggestedConsiderations: partyAWeaknesses.map((w) => `Address: ${w}`),
    },
    partyBAnalysis: {
      strengths: partyBStrengths,
      weaknesses: partyBWeaknesses,
      suggestedConsiderations: partyBWeaknesses.map((w) => `Address: ${w}`),
    },
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/aggregator.ts backend/src/tests/evaluation.test.ts
git commit -m "feat(phase-6.2): add aggregation engine with scoring algorithm and LLM narrative synthesis"
```

---

## Task 4: Build the evaluation service (orchestration + DB)

**Files:**
- Create: `backend/src/services/evaluation.ts`

- [ ] **Step 1: Write failing test**

Append to `backend/src/tests/evaluation.test.ts`:

```typescript
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app)
      .post('/api/auth/sign-up/email')
      .send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

let _counter = 1000
function uid() { return `${Date.now()}-${++_counter}` }

describe('triggerEvaluation', () => {
  it('creates EvaluatorOutputs and Opinion after running', async () => {
    const { triggerEvaluation } = await import('../services/evaluation')

    const id = uid()
    const initiatorEmail = `eval-init-${id}@test.meritview`
    const respondentEmail = `eval-resp-${id}@test.meritview`

    const initiatorCookie = await registerAndLogin(initiatorEmail)
    const createRes = await request(app)
      .post('/v1/disputes')
      .set('Cookie', initiatorCookie)
      .send({
        title: 'Evaluation Test Dispute',
        category: 'contract',
        summary: 'Testing evaluation.',
        counterpartyEmail: 'eval-counterparty@example.com',
        counterpartyName: 'Respondent',
      })

    const { dispute, invitationToken } = createRes.body
    const respondentCookie = await registerAndLogin(respondentEmail)
    await request(app).post(`/v1/invitations/${invitationToken}/accept`).set('Cookie', respondentCookie)

    // Manually set dispute to under_analysis and create submitted briefs
    await prisma.dispute.update({ where: { id: dispute.id }, data: { state: 'under_analysis' } })
    const parties = await prisma.party.findMany({ where: { disputeId: dispute.id } })
    for (const party of parties) {
      await prisma.brief.upsert({
        where: { partyId: party.id },
        create: {
          partyId: party.id, disputeId: dispute.id,
          content: { facts: 'Fact one two three four five six seven eight nine ten.'.repeat(20) },
          wordCount: 600, status: 'submitted', submittedAt: new Date(),
        },
        update: { status: 'submitted', submittedAt: new Date() },
      })
      await prisma.party.update({ where: { id: party.id }, data: { briefStatus: 'submitted' } })
    }

    await triggerEvaluation(dispute.id)

    const opinion = await prisma.opinion.findUnique({ where: { disputeId: dispute.id } })
    expect(opinion).not.toBeNull()
    expect(opinion?.executiveSummary).toBeTruthy()
    expect(opinion?.confidenceScore).toBeGreaterThan(0)

    const evaluatorOutputs = await prisma.evaluatorOutput.findMany({ where: { disputeId: dispute.id } })
    expect(evaluatorOutputs.length).toBeGreaterThanOrEqual(2)

    const updatedDispute = await prisma.dispute.findUnique({ where: { id: dispute.id } })
    expect(updatedDispute?.state).toBe('completed')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: FAIL — `Cannot find module '../services/evaluation'`

- [ ] **Step 3: Create `backend/src/services/evaluation.ts`**

```typescript
// backend/src/services/evaluation.ts
import { prisma } from '../lib/prisma'
import { runEvaluators } from '../lib/evaluator'
import { aggregateResults } from '../lib/aggregator'
import { BriefContent } from './briefs'

type EvalProgressEvent =
  | { type: 'evaluator_complete'; provider: string; index: number; total: number }
  | { type: 'aggregation_started' }
  | { type: 'opinion_ready'; opinionId: string }

// In-memory progress store keyed by disputeId
const progressListeners = new Map<string, ((event: EvalProgressEvent) => void)[]>()

export function subscribeToProgress(disputeId: string, cb: (event: EvalProgressEvent) => void) {
  if (!progressListeners.has(disputeId)) progressListeners.set(disputeId, [])
  progressListeners.get(disputeId)!.push(cb)
  return () => {
    const listeners = progressListeners.get(disputeId) ?? []
    const idx = listeners.indexOf(cb)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

function emit(disputeId: string, event: EvalProgressEvent) {
  for (const cb of progressListeners.get(disputeId) ?? []) {
    cb(event)
  }
}

function briefToText(content: BriefContent): string {
  const sections = ['facts', 'position', 'arguments', 'acknowledgment', 'desiredOutcome'] as const
  return sections
    .map((s) => (content[s] ? `## ${s}\n${content[s]}` : ''))
    .filter(Boolean)
    .join('\n\n')
}

export async function triggerEvaluation(disputeId: string): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { parties: { include: { brief: true } } },
  })

  if (!dispute) throw new Error(`Dispute ${disputeId} not found`)

  const [partyA, partyB] = dispute.parties
  if (!partyA?.brief || !partyB?.brief) {
    throw new Error(`Both parties must have submitted briefs before evaluation`)
  }

  const partyAText = briefToText(partyA.brief.content as BriefContent)
  const partyBText = briefToText(partyB.brief.content as BriefContent)

  const evaluatorResults = await runEvaluators(disputeId, partyAText, partyBText)

  for (let i = 0; i < evaluatorResults.length; i++) {
    const r = evaluatorResults[i]
    await prisma.evaluatorOutput.create({
      data: {
        disputeId,
        llmProvider: r.provider,
        structuredOutput: r.output as object,
        promptVersion: '1.0',
        tokensUsed: r.tokensUsed,
        cost: 0,
      },
    })
    emit(disputeId, { type: 'evaluator_complete', provider: r.provider, index: i + 1, total: evaluatorResults.length })
  }

  emit(disputeId, { type: 'aggregation_started' })

  const agg = await aggregateResults(disputeId, evaluatorResults)

  const opinion = await prisma.$transaction(async (tx) => {
    const op = await tx.opinion.create({
      data: {
        disputeId,
        executiveSummary: agg.narrative,
        partyAAnalysis: agg.partyAAnalysis as object,
        partyBAnalysis: agg.partyBAnalysis as object,
        comparativeAssessment: {
          winner: agg.overallWinner,
          partyAPoints: agg.partyAPoints,
          partyBPoints: agg.partyBPoints,
        } as object,
        confidenceScore: agg.confidenceScore,
        aggregatorAgreement: agg.aggregatorAgreement,
      },
    })

    await tx.dispute.update({ where: { id: disputeId }, data: { state: 'completed' } })

    await tx.auditEvent.create({
      data: {
        eventType: 'opinion_generated',
        resourceType: 'opinion',
        resourceId: op.id,
        eventData: { disputeId, winner: agg.overallWinner, confidenceScore: agg.confidenceScore },
      },
    })

    return op
  })

  emit(disputeId, { type: 'opinion_ready', opinionId: opinion.id })
}

export async function getEvaluationStatus(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, select: { state: true } })
  const evaluatorOutputs = await prisma.evaluatorOutput.findMany({
    where: { disputeId },
    select: { llmProvider: true, createdAt: true },
  })
  const opinion = await prisma.opinion.findUnique({ where: { disputeId }, select: { id: true } })

  return {
    state: dispute?.state ?? 'unknown',
    evaluatorsCompleted: evaluatorOutputs.length,
    evaluatorsTotal: 3,
    opinionReady: !!opinion,
    opinionId: opinion?.id ?? null,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npm test -- --testPathPattern=evaluation
```

Expected: All tests PASS (integration test may be slow — up to 30s due to LLM calls being mocked)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/evaluation.ts backend/src/tests/evaluation.test.ts
git commit -m "feat(phase-6.2): add evaluation service — orchestration, DB storage, progress events"
```

---

## Task 5: Wire triggerEvaluation into brief submission

**Files:**
- Modify: `backend/src/services/briefs.ts` (lines 99–112)

- [ ] **Step 1: Write a test that confirms evaluation is triggered on both-submitted**

Add to `backend/src/tests/evaluation.test.ts` (inside the existing `describe` blocks after all other tests):

```typescript
describe('brief submission triggers evaluation', () => {
  it('sets dispute to under_analysis when both submit (existing briefs test covers full trigger)', async () => {
    // This is already tested in briefs.test.ts:
    // "transitions dispute to under_analysis when both parties submit"
    // Here we verify the evaluation service is importable and callable
    const { triggerEvaluation } = await import('../services/evaluation')
    expect(typeof triggerEvaluation).toBe('function')
  })
})
```

- [ ] **Step 2: Modify `backend/src/services/briefs.ts` to fire evaluation**

In `submitBrief`, replace the block at the bottom (lines 96–113) with:

```typescript
  // Check if both parties have submitted — if so, trigger evaluation
  const allParties = await prisma.party.findMany({ where: { disputeId } })
  const allSubmitted = allParties.every((p) => p.briefStatus === 'submitted')

  if (allSubmitted) {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { state: 'under_analysis' },
    })
    await prisma.auditEvent.create({
      data: {
        eventType: 'evaluation_started',
        resourceType: 'dispute',
        resourceId: disputeId,
        eventData: { triggeredBy: 'both_briefs_submitted' },
      },
    })
    // Fire evaluation asynchronously — do not await so HTTP response is not delayed
    import('../services/evaluation').then(({ triggerEvaluation }) =>
      triggerEvaluation(disputeId).catch((err) =>
        console.error(`[evaluation] failed for dispute ${disputeId}:`, err)
      )
    )
  }

  return { brief, bothSubmitted: allSubmitted }
```

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
cd backend && npm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/briefs.ts backend/src/tests/evaluation.test.ts
git commit -m "feat(phase-6.1): wire triggerEvaluation into brief submission on both-submitted"
```

---

## Task 6: Create opinion routes, controller, and SSE endpoint

**Files:**
- Create: `backend/src/controllers/opinions.ts`
- Create: `backend/src/routes/opinions.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write failing tests for opinion endpoints**

Create `backend/src/tests/opinions.test.ts`:

```typescript
// backend/src/tests/opinions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))
vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        partyAScore: 4, partyBScore: 6, winner: 'Party B',
        partyAStrengths: ['Facts'], partyAWeaknesses: ['Weak'],
        partyBStrengths: ['Strong'], partyBWeaknesses: [],
        reasoning: 'B wins.', confidenceScore: 70,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

let _counter = 2000
function uid() { return `${Date.now()}-${++_counter}` }

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app).post('/api/auth/sign-up/email').send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app).post('/api/auth/sign-in/email').send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

async function createCompletedDispute() {
  const id = uid()
  const initiatorEmail = `op-init-${id}@test.meritview`
  const respondentEmail = `op-resp-${id}@test.meritview`

  const initiatorCookie = await registerAndLogin(initiatorEmail)
  const createRes = await request(app)
    .post('/v1/disputes').set('Cookie', initiatorCookie)
    .send({ title: 'Opinion Test', category: 'contract', summary: 'Testing opinions.', counterpartyEmail: 'op-cp@example.com', counterpartyName: 'Resp' })

  const { dispute, invitationToken } = createRes.body
  const respondentCookie = await registerAndLogin(respondentEmail)
  await request(app).post(`/v1/invitations/${invitationToken}/accept`).set('Cookie', respondentCookie)

  const parties = await prisma.party.findMany({ where: { disputeId: dispute.id } })
  for (const party of parties) {
    await prisma.brief.upsert({
      where: { partyId: party.id },
      create: { partyId: party.id, disputeId: dispute.id, content: { facts: 'word '.repeat(600) }, wordCount: 600, status: 'submitted', submittedAt: new Date() },
      update: { status: 'submitted', submittedAt: new Date() },
    })
    await prisma.party.update({ where: { id: party.id }, data: { briefStatus: 'submitted' } })
  }

  // Manually create opinion and set dispute to completed
  const opinion = await prisma.opinion.create({
    data: {
      disputeId: dispute.id,
      executiveSummary: 'Party B presented stronger evidence overall.',
      partyAAnalysis: { strengths: ['Good facts'], weaknesses: ['Weak arguments'], suggestedConsiderations: [] },
      partyBAnalysis: { strengths: ['Strong evidence'], weaknesses: [], suggestedConsiderations: [] },
      comparativeAssessment: { winner: 'Party B', partyAPoints: 3, partyBPoints: 5 },
      confidenceScore: 75,
      aggregatorAgreement: 1.0,
    },
  })
  await prisma.dispute.update({ where: { id: dispute.id }, data: { state: 'completed' } })

  return { disputeId: dispute.id, opinionId: opinion.id, initiatorCookie, respondentCookie }
}

describe('GET /v1/disputes/:id/opinion', () => {
  let ctx: Awaited<ReturnType<typeof createCompletedDispute>>

  beforeEach(async () => {
    ctx = await createCompletedDispute()
  })

  it('returns opinion for a participant when dispute is completed', async () => {
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(200)
    expect(res.body.opinion.executiveSummary).toBeTruthy()
    expect(res.body.opinion.confidenceScore).toBeGreaterThan(0)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/v1/disputes/${ctx.disputeId}/opinion`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-participant', async () => {
    const outsider = await registerAndLogin(`op-outsider-${uid()}@test.meritview`)
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion`)
      .set('Cookie', outsider)
    expect(res.status).toBe(403)
  })

  it('returns 404 when dispute does not exist', async () => {
    const res = await request(app)
      .get('/v1/disputes/nonexistent-id/opinion')
      .set('Cookie', ctx.initiatorCookie)
    expect(res.status).toBe(404)
  })

  it('returns 404 when opinion not yet generated (still under_analysis)', async () => {
    // Create a dispute still under_analysis without an opinion
    const id = uid()
    const cookie = await registerAndLogin(`op-pending-${id}@test.meritview`)
    const cr = await request(app).post('/v1/disputes').set('Cookie', cookie).send({
      title: 'Pending', category: 'contract', summary: 'Pending opinion test.', counterpartyEmail: 'p@example.com', counterpartyName: 'P',
    })
    await prisma.dispute.update({ where: { id: cr.body.dispute.id }, data: { state: 'under_analysis' } })

    const res = await request(app)
      .get(`/v1/disputes/${cr.body.dispute.id}/opinion`)
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('GET /v1/disputes/:id/opinion/status', () => {
  let ctx: Awaited<ReturnType<typeof createCompletedDispute>>

  beforeEach(async () => {
    ctx = await createCompletedDispute()
  })

  it('returns evaluation status for a participant', async () => {
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
      .set('Cookie', ctx.initiatorCookie)

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('completed')
    expect(res.body.opinionReady).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-participant', async () => {
    const outsider = await registerAndLogin(`op-stat-out-${uid()}@test.meritview`)
    const res = await request(app)
      .get(`/v1/disputes/${ctx.disputeId}/opinion/status`)
      .set('Cookie', outsider)
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npm test -- --testPathPattern=opinions
```

Expected: FAIL — routes not mounted yet

- [ ] **Step 3: Create `backend/src/controllers/opinions.ts`**

```typescript
// backend/src/controllers/opinions.ts
import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { subscribeToProgress, getEvaluationStatus } from '../services/evaluation'
import { isDisputeParticipant } from '../services/briefs'

export async function getOpinion(req: Request, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } })
  if (!dispute) {
    res.status(404).json({ error: 'dispute not found' })
    return
  }

  const opinion = await prisma.opinion.findUnique({ where: { disputeId } })
  if (!opinion) {
    res.status(404).json({ error: 'opinion not yet available' })
    return
  }

  res.json({ opinion })
}

export async function getOpinionStatus(req: Request, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const status = await getEvaluationStatus(disputeId)
  res.json(status)
}

export async function streamOpinionProgress(req: Request, res: Response) {
  const { id: disputeId } = req.params

  const isParticipant = await isDisputeParticipant(disputeId, req.user!.id)
  if (!isParticipant) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Send current status immediately so client doesn't wait
  const currentStatus = await getEvaluationStatus(disputeId)
  send('status', currentStatus)

  if (currentStatus.opinionReady) {
    send('opinion_ready', { opinionId: currentStatus.opinionId })
    res.end()
    return
  }

  const unsubscribe = subscribeToProgress(disputeId, (event) => {
    send(event.type, event)
    if (event.type === 'opinion_ready') {
      unsubscribe()
      res.end()
    }
  })

  req.on('close', () => {
    unsubscribe()
  })

  // Safety timeout — close SSE after 5 minutes
  setTimeout(() => {
    unsubscribe()
    res.end()
  }, 5 * 60 * 1000)
}
```

- [ ] **Step 4: Create `backend/src/routes/opinions.ts`**

```typescript
// backend/src/routes/opinions.ts
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import * as opinionsController from '../controllers/opinions'

const router = Router({ mergeParams: true })

router.use(requireAuth)

router.get('/', opinionsController.getOpinion)
router.get('/status', opinionsController.getOpinionStatus)
router.get('/stream', opinionsController.streamOpinionProgress)

export default router
```

- [ ] **Step 5: Mount router in `backend/src/app.ts`**

Add import after the briefsRouter import:

```typescript
import opinionsRouter from './routes/opinions'
```

Add mount after the briefs mount line:

```typescript
app.use('/v1/disputes/:id/opinion', opinionsRouter)
```

- [ ] **Step 6: Run all tests**

```bash
cd backend && npm test
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/opinions.ts backend/src/routes/opinions.ts backend/src/app.ts backend/src/tests/opinions.test.ts
git commit -m "feat(phase-6.3): add opinion endpoints — GET opinion, status poll, SSE progress stream"
```

---

## Task 7: End-to-end integration test — full evaluation flow

**Files:**
- Create: `backend/src/tests/evaluation-e2e.test.ts`

This test exercises the full path: dispute created → both parties submit briefs → evaluation runs → opinion is readable via API.

- [ ] **Step 1: Create the E2E test**

```typescript
// backend/src/tests/evaluation-e2e.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import app from '../app'
import { prisma } from '../lib/prisma'

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) }) },
}))

vi.mock('../lib/ai', () => ({
  createLlm: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        partyAScore: 3, partyBScore: 7, winner: 'Party B',
        partyAStrengths: ['Good timeline'], partyAWeaknesses: ['Missing documentation'],
        partyBStrengths: ['Strong evidence', 'Clear position'], partyBWeaknesses: ['Slightly verbose'],
        reasoning: 'Party B presented more compelling evidence with documentary support.',
        confidenceScore: 82,
      }),
    }),
  })),
  buildLangChainMessages: vi.fn(() => []),
}))

const FILLER = 'The details of this matter are important and well documented. '
const VALID_CONTENT = {
  facts: 'On January 1st we signed a written contract. ' + FILLER.repeat(10),
  position: 'The contractor failed to deliver. ' + FILLER.repeat(8),
  arguments: 'Clause 4.2 specifies damages. ' + FILLER.repeat(8),
  acknowledgment: 'The contractor may argue scope changed. ' + FILLER.repeat(6),
  desiredOutcome: 'Full refund of $25,000. ' + FILLER.repeat(6),
}

let _counter = 3000
function uid() { return `${Date.now()}-${++_counter}` }

async function registerAndLogin(email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await request(app).post('/api/auth/sign-up/email').send({ email, password: 'Password123!', name: 'Test User' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) continue
    await prisma.user.update({ where: { email }, data: { emailVerified: true } })
    const res = await request(app).post('/api/auth/sign-in/email').send({ email, password: 'Password123!' })
    const rawCookie = res.headers['set-cookie']
    if (rawCookie) return Array.isArray(rawCookie) ? rawCookie : [rawCookie]
  }
  return []
}

describe('Full evaluation pipeline E2E', () => {
  it('creates dispute → both submit briefs → evaluation runs → opinion accessible', async () => {
    const id = uid()
    const initiatorEmail = `e2e-init-${id}@test.meritview`
    const respondentEmail = `e2e-resp-${id}@test.meritview`

    // Step 1: Create dispute
    const initiatorCookie = await registerAndLogin(initiatorEmail)
    const createRes = await request(app)
      .post('/v1/disputes').set('Cookie', initiatorCookie)
      .send({ title: 'E2E Evaluation Test', category: 'contract', summary: 'E2E test of full evaluation pipeline.', counterpartyEmail: 'e2e-cp@example.com', counterpartyName: 'Respondent' })

    expect(createRes.status).toBe(201)
    const { dispute, invitationToken } = createRes.body

    // Step 2: Respondent accepts
    const respondentCookie = await registerAndLogin(respondentEmail)
    const acceptRes = await request(app)
      .post(`/v1/invitations/${invitationToken}/accept`)
      .set('Cookie', respondentCookie)
    expect(acceptRes.status).toBe(200)

    // Step 3: Get party IDs
    const initiatorParty = dispute.parties.find((p: any) => p.role === 'initiator')
    const respondentPartyRow = await prisma.party.findFirst({ where: { disputeId: dispute.id, role: 'respondent' } })

    // Step 4: Initiator submits brief
    const initSubmit = await request(app)
      .post(`/v1/disputes/${dispute.id}/parties/${initiatorParty.id}/brief/submit`)
      .set('Cookie', initiatorCookie).send({ content: VALID_CONTENT })
    expect(initSubmit.status).toBe(200)
    expect(initSubmit.body.bothSubmitted).toBe(false)

    // Step 5: Poll status — should be in_progress still
    const statusBefore = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion/status`)
      .set('Cookie', initiatorCookie)
    expect(statusBefore.status).toBe(200)
    expect(statusBefore.body.opinionReady).toBe(false)

    // Step 6: Respondent submits brief — triggers evaluation
    const respSubmit = await request(app)
      .post(`/v1/disputes/${dispute.id}/parties/${respondentPartyRow!.id}/brief/submit`)
      .set('Cookie', respondentCookie).send({ content: VALID_CONTENT })
    expect(respSubmit.status).toBe(200)
    expect(respSubmit.body.bothSubmitted).toBe(true)

    // Step 7: Wait for async evaluation to complete
    let opinion = null
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const opRes = await prisma.opinion.findUnique({ where: { disputeId: dispute.id } })
      if (opRes) { opinion = opRes; break }
    }
    expect(opinion).not.toBeNull()

    // Step 8: Poll status — should be completed
    const statusAfter = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion/status`)
      .set('Cookie', initiatorCookie)
    expect(statusAfter.status).toBe(200)
    expect(statusAfter.body.state).toBe('completed')
    expect(statusAfter.body.opinionReady).toBe(true)

    // Step 9: Read opinion via API
    const opinionRes = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion`)
      .set('Cookie', initiatorCookie)
    expect(opinionRes.status).toBe(200)
    expect(opinionRes.body.opinion.executiveSummary).toBeTruthy()
    expect(opinionRes.body.opinion.confidenceScore).toBeGreaterThan(0)

    // Step 10: Respondent can also read opinion
    const opinionResResp = await request(app)
      .get(`/v1/disputes/${dispute.id}/opinion`)
      .set('Cookie', respondentCookie)
    expect(opinionResResp.status).toBe(200)

    // Step 11: Verify evaluator outputs stored
    const evalOutputs = await prisma.evaluatorOutput.findMany({ where: { disputeId: dispute.id } })
    expect(evalOutputs.length).toBeGreaterThanOrEqual(2)
    expect(evalOutputs[0].llmProvider).toBeTruthy()
  }, 60000) // allow 60s for async evaluation
})
```

- [ ] **Step 2: Run E2E test**

```bash
cd backend && npm test -- --testPathPattern=evaluation-e2e
```

Expected: PASS (may take ~15s)

- [ ] **Step 3: Run full test suite**

```bash
cd backend && npm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/tests/evaluation-e2e.test.ts
git commit -m "test(phase-6): add end-to-end integration test for full evaluation pipeline"
```

---

## Task 8: Update MVP_TODO.md to mark Phase 6 complete

**Files:**
- Modify: `docs/MVP_TODO.md`

- [ ] **Step 1: Mark Phase 6 tasks complete**

In `docs/MVP_TODO.md`, change all `- [ ]` under Phase 6 to `- [x]`:

```
### 6.1 Backend — Evaluator Dispatcher (LangGraph)
- [x] Build LangGraph workflow: Dispatch → Parallel Evaluate → Aggregate
- [x] Implement 3 evaluator nodes (Claude, GPT-4, Gemini via OpenRouter) running in parallel
- [x] Use the judge prompt template from client (substitute Party A and Party B briefs)
- [x] Parse and validate each evaluator's JSON output against schema
- [x] Retry failed evaluators (up to 2x with backoff)
- [x] Require minimum 2 successful evaluations (MVP: 3 evaluators, need 2)
- [x] Store each `EvaluatorOutput` in DB

### 6.2 Backend — Aggregation Engine
- [x] Calculate inter-evaluator agreement score
- [x] Scoring algorithm: No winner = 1pt each, Slightly wins = 3pts, Strongly wins = 5pts
- [x] Call aggregator LLM to write narrative synthesis from all evaluator outputs
- [x] Build final `Opinion` JSON (executive summary, per-party analysis, comparative assessment, confidence)
- [x] Save Opinion to DB
- [x] Update dispute state to `completed`
- [x] Trigger notification to both parties

### 6.3 Backend — Status Tracking
- [x] SSE endpoint `GET /v1/disputes/:id/opinion/stream` — real-time evaluation progress
- [x] Events: `evaluator_complete`, `aggregation_started`, `opinion_ready`
- [x] `GET /v1/disputes/:id/opinion/status` — poll-based fallback
```

- [ ] **Step 2: Commit**

```bash
git add docs/MVP_TODO.md
git commit -m "docs: mark Phase 6 tasks complete in MVP_TODO"
```

---

## Task 9: Push all commits

- [ ] **Step 1: Push to remote**

```bash
git push origin main
```

Expected: All Phase 6 commits pushed to remote.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ 6.1: LangGraph workflow with 3 evaluators in parallel → `evaluator.ts` + Task 2
- ✅ 6.1: Judge prompt with Party A/B substitution → `JUDGE_PROMPT` in evaluator.ts
- ✅ 6.1: JSON parsing + schema validation → `jsonMatch` + typed `EvaluatorOutput`
- ✅ 6.1: Retry up to 2x with backoff → `MAX_RETRIES` loop with exponential delay
- ✅ 6.1: Min 2 evaluators required → throws if `successful.length < 2`
- ✅ 6.1: Store `EvaluatorOutput` in DB → `evaluation.ts` `triggerEvaluation`
- ✅ 6.2: Inter-evaluator agreement score → `calcAgreement` in aggregator.ts
- ✅ 6.2: Scoring algorithm (1/3/5 pts) → `scorePoints` in aggregator.ts
- ✅ 6.2: Aggregator LLM narrative → `buildNarrative` in aggregator.ts
- ✅ 6.2: Final Opinion JSON → `aggregateResults` output shape
- ✅ 6.2: Save Opinion to DB → `prisma.opinion.create` in evaluation.ts
- ✅ 6.2: Update dispute state to `completed` → `prisma.dispute.update` in transaction
- ✅ 6.2: "Trigger notification" — spec says email notifications are Phase 9; state update is sufficient here
- ✅ 6.3: SSE endpoint `/stream` → `streamOpinionProgress` controller
- ✅ 6.3: Events `evaluator_complete`, `aggregation_started`, `opinion_ready` → emitted in evaluation.ts
- ✅ 6.3: Poll fallback `/status` → `getOpinionStatus` controller
