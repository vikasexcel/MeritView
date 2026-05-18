import { Link } from 'react-router-dom'
import { Scale } from 'lucide-react'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Scale className="h-5 w-5 text-primary" />
          <span>MeritView</span>
        </Link>
        <nav className="ml-auto flex items-center gap-4">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Link
            to="/register"
            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  )
}
