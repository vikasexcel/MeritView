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
