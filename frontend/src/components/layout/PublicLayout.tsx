import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'

export function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
