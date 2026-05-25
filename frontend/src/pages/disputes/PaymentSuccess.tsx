import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { paymentApi } from '@/lib/paymentApi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function PaymentSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id')

  const [state, setState] = useState<'polling' | 'success' | 'error'>('polling')
  const [countdown, setCountdown] = useState(3)
  const disputeIdRef = useRef<string | null>(null)
  const attemptsRef = useRef(0)
  const MAX_ATTEMPTS = 15

  useEffect(() => {
    if (!sessionId) {
      setState('error')
      return
    }

    const interval = setInterval(async () => {
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_ATTEMPTS) {
        clearInterval(interval)
        setState('error')
        return
      }

      try {
        const res = await paymentApi.getSessionStatus(sessionId)
        const { status, disputeId } = res.data

        if (status === 'succeeded' && disputeId) {
          clearInterval(interval)
          disputeIdRef.current = disputeId
          setState('success')
        } else if (status === 'failed') {
          clearInterval(interval)
          setState('error')
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionId])

  useEffect(() => {
    if (state !== 'success') return
    if (countdown <= 0) {
      navigate(`/disputes/${disputeIdRef.current}`)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [state, countdown, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {state === 'polling' && (
            <>
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-lg font-medium">Confirming your payment...</p>
              <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold">Payment confirmed!</p>
              <p className="text-sm text-muted-foreground">
                Redirecting to your dispute in {countdown}...
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-lg font-semibold">Something went wrong</p>
              <p className="text-sm text-muted-foreground">
                Your payment may have been processed but we could not confirm it. Please check your dashboard or contact support.
              </p>
              <Button asChild variant="outline">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
