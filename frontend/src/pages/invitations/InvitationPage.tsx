// frontend/src/pages/invitations/InvitationPage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { disputeApi } from '@/lib/disputeApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
