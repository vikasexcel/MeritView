import { useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4 text-center">
      <Scale className="h-12 w-12 text-muted-foreground/40" />
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <p className="text-xl text-muted-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
      </div>
      <Button onClick={() => navigate('/')}>Back to home</Button>
    </div>
  )
}
