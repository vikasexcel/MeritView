import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Landing } from '@/pages/Landing'
import { NotFound } from '@/pages/NotFound'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { VerifyEmail } from '@/pages/auth/VerifyEmail'
import { InvitationPage } from '@/pages/invitations/InvitationPage'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { Dashboard as DisputesDashboard } from '@/pages/disputes/Dashboard'
import { CreateDispute } from '@/pages/disputes/CreateDispute'
import { DisputeDetail } from '@/pages/disputes/DisputeDetail'
import { BriefWriting } from '@/pages/disputes/BriefWriting'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>

      <Route path="/invite/:token" element={<InvitationPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
        </Route>
        <Route path="/settings" element={<DashboardLayout />}>
          <Route index element={<div className="p-6 text-muted-foreground text-sm">Settings — coming in Phase 10</div>} />
        </Route>
        <Route path="/disputes" element={<DashboardLayout />}>
          <Route index element={<DisputesDashboard />} />
          <Route path="new" element={<CreateDispute />} />
          <Route path=":id" element={<DisputeDetail />} />
          <Route path=":id/parties/:partyId/brief" element={<BriefWriting />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
