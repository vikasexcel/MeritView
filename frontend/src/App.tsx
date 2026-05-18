import { Routes, Route, useNavigate } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Dashboard } from '@/pages/disputes/Dashboard'
import { CreateDispute } from '@/pages/disputes/CreateDispute'
import { DisputeDetail } from '@/pages/disputes/DisputeDetail'
import { InvitationPage } from '@/pages/invitations/InvitationPage'
import { signOut } from '@/lib/authClient'
import { useAuthStore } from '@/store/authStore'
import { buttonVariants } from '@/components/ui/button'

function DashboardHome() {
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()

  async function handleLogout() {
    await signOut()
    clearAuth()
    navigate('/')
  }

  return (
    <div className="p-6">
      <button className={buttonVariants({ variant: 'outline' })} onClick={handleLogout}>
        Sign out
      </button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/invite/:token" element={<InvitationPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
        </Route>
        <Route path="/disputes" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<CreateDispute />} />
          <Route path=":id" element={<DisputeDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
