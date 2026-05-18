import { Routes, Route, useNavigate } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { signOut } from '@/lib/authClient'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

function DashboardHome() {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()

  async function handleLogout() {
    await signOut()
    clearAuth()
    navigate('/')
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-foreground">Welcome, {user?.name}. Dashboard coming soon.</p>
      <Button variant="outline" onClick={handleLogout}>Sign out</Button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
