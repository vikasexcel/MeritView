import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Scale } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { disputeApi } from '@/lib/disputeApi'

import type { Dispute, DisputeState } from '@/lib/disputeApi'

const STATE_LABELS: Record<DisputeState, string> = {
  draft: 'Draft',
  awaiting_counterparty: 'Awaiting Counterparty',
  in_progress: 'In Progress',
  under_analysis: 'Under Analysis',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const STATE_VARIANTS: Record<DisputeState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  awaiting_counterparty: 'secondary',
  in_progress: 'secondary',
  under_analysis: 'default',
  completed: 'default',
  cancelled: 'destructive',
  refunded: 'outline',
}

function DisputeCard({ dispute }: { dispute: Dispute }) {
  const navigate = useNavigate()
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium leading-snug">{dispute.title}</CardTitle>
          <Badge variant={STATE_VARIANTS[dispute.state]} className="shrink-0 capitalize text-xs">
            {STATE_LABELS[dispute.state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground capitalize">{dispute.category.replace('_', ' ')}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(dispute.createdAt).toLocaleDateString()}
          </span>
        </div>
        <button
          onClick={() => navigate(`/disputes/${dispute.id}`)}
          className="mt-3 text-xs text-primary hover:underline"
        >
          View dispute →
        </button>
      </CardContent>
    </Card>
  )
}

function DisputeCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="mt-3 h-4 w-24" />
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="rounded-full bg-muted p-5">
        <Scale className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">No disputes yet</h3>
        <p className="text-sm text-muted-foreground">Start your first dispute to get an AI-powered resolution.</p>
      </div>
      <Button onClick={() => navigate('/disputes/new')}>
        <Plus className="mr-2 h-4 w-4" />
        Start New Dispute
      </Button>
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['disputes'],
    queryFn: () => disputeApi.list().then((r) => r.data.disputes),
  })

  const disputes = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome back, {user?.name}</p>
        </div>
        <Button onClick={() => navigate('/disputes/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Dispute
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <DisputeCardSkeleton key={i} />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {disputes.map((d) => (
            <DisputeCard key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </div>
  )
}
