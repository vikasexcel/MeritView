import { Link, useNavigate } from 'react-router-dom'
import { Scale, Menu, LogOut, User, Settings } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { signOut } from '@/lib/authClient'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Navbar() {
  const navigate = useNavigate()
  const { user, isAuthenticated, clearAuth } = useAuthStore()

  async function handleLogout() {
    await signOut()
    clearAuth()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2 font-semibold text-foreground">
          <Scale className="h-5 w-5 text-primary" />
          <span>MeritView</span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-auto hidden md:flex items-center gap-4">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <button className="focus:outline-none rounded-full">
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user?.name ? getInitials(user.name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              } />
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-1.5 py-1.5">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                  <User className="mr-2 h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-variant="destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign In
              </Link>
              <Link
                to="/register"
                className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
            </>
          )}
        </nav>

        {/* Mobile hamburger */}
        <div className="ml-auto md:hidden">
          <Sheet>
            <SheetTrigger render={
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            } />
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  MeritView
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-2 px-4">
                {isAuthenticated ? (
                  <>
                    <div className="pb-3 mb-2 border-b border-border">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <Link to="/dashboard" className="flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                      <User className="h-4 w-4" />
                      Dashboard
                    </Link>
                    <Link to="/disputes" className="flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                      <Scale className="h-4 w-4" />
                      My Disputes
                    </Link>
                    <Link to="/settings" className="flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-2 py-2 rounded-md text-sm text-destructive hover:bg-accent transition-colors mt-4"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                      Sign In
                    </Link>
                    <Link to="/register" className="px-2 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                      Get Started
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
