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
