import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TournamentsPage } from './pages/TournamentsPage'
import { TeamsPage } from './pages/TeamsPage'
import { AdminPage } from './pages/AdminPage'
import { AdminGate } from './components/AdminGate'

export function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/login" element={<AuthPage mode="login"/>}/>
    <Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route path="/forgot-password" element={<AuthPage mode="reset"/>}/>
    <Route path="/reset-password" element={<ResetPasswordPage/>}/>
    <Route path="/tournaments" element={<TournamentsPage/>}/>
    <Route element={<ProtectedRoute/>}><Route path="/dashboard" element={<DashboardPage/>}/></Route>
    <Route element={<ProtectedRoute/>}><Route path="/teams" element={<TeamsPage/>}/></Route>
    <Route element={<ProtectedRoute/>}><Route path="/admin" element={<AdminGate><AdminPage/></AdminGate>}/></Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AuthProvider></BrowserRouter>
}
