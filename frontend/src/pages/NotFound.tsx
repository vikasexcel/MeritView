import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-foreground">Page not found</p>
      <Link to="/" className="text-primary hover:underline">
        Back to home
      </Link>
    </div>
  )
}
