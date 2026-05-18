import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [resent, setResent] = useState(false)

  function handleResend() {
    if (!email) return
    // TODO: Implement email verification flow in future phase
    setResent(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to <strong>{email || 'your email address'}</strong>.
          Click the link to activate your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {resent && (
          <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md">
            Verification email resent. Check your inbox.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Didn't receive it? Check your spam folder or resend below.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        {email && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={resent}
          >
            {resent ? 'Email sent' : 'Resend verification email'}
          </Button>
        )}
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground text-center w-full">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  )
}
