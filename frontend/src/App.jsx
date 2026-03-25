import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Home from './pages/Home'
import Contact from './pages/Contact'
import Login from './pages/Login'
import AcceptInvite from './pages/AcceptInvite'
import Tournaments from './pages/Tournaments'
import Scorecard from './pages/Scorecard'
import Leaderboard from './pages/Leaderboard'
import History from './pages/History'

import Dashboard from './pages/admin/Dashboard'
import ManageTournament from './pages/admin/ManageTournament'
import ManageCourses from './pages/admin/ManageCourses'
import ManageUsers from './pages/admin/ManageUsers'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/leaderboard/:tournamentId" element={<Leaderboard />} />
            <Route path="/history" element={<History />} />

            {/* Player */}
            <Route element={<ProtectedRoute />}>
              <Route path="/scorecard/:registrationId/:roundId" element={<Scorecard />} />
            </Route>

            {/* Admin */}
            <Route element={<ProtectedRoute requireAdmin />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/tournaments/:tournamentId" element={<ManageTournament />} />
              <Route path="/admin/courses" element={<ManageCourses />} />
              <Route path="/admin/users" element={<ManageUsers />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
