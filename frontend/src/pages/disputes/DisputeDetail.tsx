// frontend/src/pages/disputes/DisputeDetail.tsx
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { disputeApi } from '@/lib/disputeApi'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_counterparty: 'Awaiting Response',
  in_progress: 'In Progress',
  under_analysis: 'Under Analysis',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const BRIEF_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

export function DisputeDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const inviteUrl: string | undefined = (location.state as any)?.inviteUrl

  const { data, isLoading, error } = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => disputeApi.get(id!).then((r) => r.data.dispute),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading...</div>
  if (error || !data) return <div className="p-6 text-destructive text-sm">Dispute not found.</div>

  const myParty = data.parties.find((p) => p.userId === user?.id)
  const canWriteBrief = data.state === 'in_progress' && myParty && myParty.briefStatus !== 'submitted'
  const waitingForAnalysis = data.state === 'in_progress' && myParty?.briefStatus === 'submitted'

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
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Brief: {BRIEF_STATUS_LABEL[party.briefStatus] ?? party.briefStatus}
                    </Badge>
                    <Badge variant={party.invitationStatus === 'accepted' ? 'default' : 'secondary'}>
                      {party.invitationStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canWriteBrief && myParty && (
            <Button
              className="w-full"
              onClick={() => navigate(`/disputes/${id}/parties/${myParty.id}/brief`)}
            >
              Write Your Brief
            </Button>
          )}

          {waitingForAnalysis && (
            <div className="text-sm text-center text-muted-foreground py-2 border rounded-md bg-muted/30">
              Waiting for the other party to submit their brief...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
