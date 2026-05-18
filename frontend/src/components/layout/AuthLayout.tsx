import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">MeritView</h1>
          <p className="text-muted-foreground text-sm mt-1">Fair dispute resolution</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
