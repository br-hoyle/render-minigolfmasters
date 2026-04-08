import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Home from './pages/Home'
import Contact from './pages/Contact'
import Login from './pages/Login'
import AcceptInvite from './pages/AcceptInvite'
import Tournaments from './pages/Tournaments'
import Leaderboards from './pages/Leaderboards'
import Registrations from './pages/Registrations'
import Scorecard from './pages/Scorecard'
import Leaderboard from './pages/Leaderboard'
import RoundScores from './pages/RoundScores'
import History from './pages/History'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import TournamentRecap from './pages/TournamentRecap'
import TournamentDetail from './pages/TournamentDetail'
import Courses from './pages/Courses'
import CourseDetail from './pages/CourseDetail'

import Dashboard from './pages/admin/Dashboard'
import ManageTournament from './pages/admin/ManageTournament'
import ManageCourses from './pages/admin/ManageCourses'
import ManageUsers from './pages/admin/ManageUsers'
import AdminRoundScores from './pages/admin/AdminRoundScores'
import AllRegistrations from './pages/admin/AllRegistrations'

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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/leaderboards" element={<Leaderboards />} />
            <Route path="/leaderboard/:tournamentId" element={<Leaderboard />} />
            <Route path="/leaderboard/:tournamentId/round/:roundId" element={<RoundScores />} />
            <Route path="/tournaments/:tournamentId" element={<TournamentDetail />} />
            <Route path="/tournaments/:tournamentId/recap" element={<TournamentRecap />} />
            <Route path="/history" element={<History />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:courseId" element={<CourseDetail />} />

            {/* Player */}
            <Route element={<ProtectedRoute />}>
              <Route path="/registrations" element={<Registrations />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/scorecard/:registrationId" element={<Scorecard />} />
              <Route path="/scorecard/:registrationId/:roundId" element={<Scorecard />} />
            </Route>

            {/* Admin */}
            <Route element={<ProtectedRoute requireAdmin />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/registrations" element={<AllRegistrations />} />
              <Route path="/admin/tournaments/:tournamentId" element={<ManageTournament />} />
              <Route path="/admin/tournaments/:tournamentId/rounds/:roundId/scores" element={<AdminRoundScores />} />
              <Route path="/admin/courses" element={<ManageCourses />} />
              <Route path="/admin/users" element={<ManageUsers />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
