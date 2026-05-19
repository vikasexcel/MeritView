import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { opinionApi } from '@/lib/disputeApi'
import type { Opinion, PartyAnalysis } from '@/lib/disputeApi'
import { useOpinionStream } from '@/hooks/useOpinionStream'
import type { StreamState } from '@/hooks/useOpinionStream'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ---- Progress screen -------------------------------------------------------

function ProgressScreen({ state }: { state: StreamState }) {
  const evaluatingCompleted = state.phase === 'evaluating' ? (state as any).completed as number : 0
  const pastEvaluating = state.phase === 'aggregating' || state.phase === 'ready'

  const steps = [
    { label: 'Evaluator 1 of 3', done: pastEvaluating || evaluatingCompleted >= 1 },
    { label: 'Evaluator 2 of 3', done: pastEvaluating || evaluatingCompleted >= 2 },
    { label: 'Evaluator 3 of 3', done: pastEvaluating || evaluatingCompleted >= 3 },
    { label: 'Aggregating results', done: state.phase === 'ready' },
  ]

  const headline =
    state.phase === 'connecting' ? 'Connecting...' :
    state.phase === 'evaluating' ? `Evaluator ${(state as any).completed} of ${(state as any).total} complete` :
    state.phase === 'aggregating' ? 'Synthesizing evaluation results...' :
    state.phase === 'ready' ? 'Analysis complete!' :
    'Something went wrong'

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8 mt-12">
      <div className="text-center space-y-2">
        <div className="text-2xl font-semibold">{headline}</div>
        <p className="text-sm text-muted-foreground">
          Three independent AI judges are reviewing both briefs. This takes 1–2 minutes.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${step.done ? 'border-green-500 bg-green-500' : 'border-muted-foreground/30'}`}>
                {step.done && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {state.phase === 'error' && (
        <p className="text-sm text-destructive text-center">
          Connection lost. Please refresh to check the status.
        </p>
      )}
    </div>
  )
}

// ---- Party analysis section -------------------------------------------------

function PartySection({ label, analysis }: { label: string; analysis: PartyAnalysis }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 pt-0">
          <Section heading="Strengths" items={analysis.strengths} variant="positive" />
          <Section heading="Weaknesses" items={analysis.weaknesses} variant="negative" />
          <Section heading="Key Arguments" items={analysis.keyArguments} variant="neutral" />
          <Section heading="Suggested Considerations" items={analysis.suggestedConsiderations} variant="neutral" />
        </CardContent>
      )}
    </Card>
  )
}

function Section({
  heading,
  items,
  variant,
}: {
  heading: string
  items: string[]
  variant: 'positive' | 'negative' | 'neutral'
}) {
  const dot =
    variant === 'positive' ? 'bg-green-500' :
    variant === 'negative' ? 'bg-red-500' :
    'bg-muted-foreground/40'

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-1">{heading}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Confidence indicator ---------------------------------------------------

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Confidence score</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ---- Results page -----------------------------------------------------------

function ResultsPage({ opinion }: { opinion: Opinion }) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Legal disclaimer */}
      <div className="rounded-md border border-yellow-500/40 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3">
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          <span className="font-semibold">Disclaimer:</span> This is an AI-assisted argument analysis, not legal advice. Results should not be used as a substitute for qualified legal counsel.
        </p>
      </div>

      {/* Executive summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{opinion.executiveSummary}</p>
        </CardContent>
      </Card>

      {/* Comparative assessment */}
      <Card>
        <CardHeader>
          <CardTitle>Comparative Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{opinion.comparativeAssessment}</p>
          <ConfidenceBar score={opinion.confidenceScore} />
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">Evaluator agreement</p>
            <p className="text-sm">{opinion.aggregatorAgreement}</p>
          </div>
        </CardContent>
      </Card>

      {/* Party analysis */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Party Analysis</h2>
        <PartySection label="Party A — Analysis" analysis={opinion.partyAAnalysis} />
        <PartySection label="Party B — Analysis" analysis={opinion.partyBAnalysis} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" disabled title="Coming in Phase 8">
          Download PDF
        </Button>
        <Button variant="outline" className="flex-1" disabled title="Coming later">
          Request Re-analysis ($49)
        </Button>
      </div>
    </div>
  )
}

// ---- Page root -------------------------------------------------------------

export function OpinionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const streamState = useOpinionStream(id!, true)
  const isReady = streamState.phase === 'ready'

  const { data, isLoading, error } = useQuery({
    queryKey: ['opinion', id],
    queryFn: () => opinionApi.get(id!).then((r) => r.data.opinion),
    enabled: isReady,
  })

  if (!isReady) {
    return (
      <div>
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/disputes/${id}`)}>
            ← Back to dispute
          </Button>
        </div>
        <ProgressScreen state={streamState} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 text-destructive text-sm">
        Failed to load opinion. Please try refreshing.
      </div>
    )
  }

  return (
    <div>
      <div className="p-4 border-b flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/disputes/${id}`)}>
          ← Back to dispute
        </Button>
        <Badge variant="default">Analysis Complete</Badge>
      </div>
      <ResultsPage opinion={data} />
    </div>
  )
}
