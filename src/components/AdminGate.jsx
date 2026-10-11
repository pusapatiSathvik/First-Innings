import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export function AdminGate({ children }) {
  const { user } = useAuth()
  const [allowed, setAllowed] = useState(null)
  useEffect(() => {
    let active = true
    if (!supabase || !user) { setAllowed(false); return undefined }
    supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
      .then(({ data, error }) => { if (active) setAllowed(!error && Boolean(data)) })
    return () => { active = false }
  }, [user])
  if (!isSupabaseConfigured) return <div className="grid min-h-screen place-items-center bg-ink p-6 text-amber-100">Configure Supabase to verify administrator access.</div>
  if (allowed === null) return <div className="grid min-h-screen place-items-center bg-ink text-muted">Checking administrator access…</div>
  return allowed ? children : <Navigate to="/dashboard" replace />
}
