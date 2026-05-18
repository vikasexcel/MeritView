import { Routes, Route } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<div className="text-foreground">Dashboard coming soon</div>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
