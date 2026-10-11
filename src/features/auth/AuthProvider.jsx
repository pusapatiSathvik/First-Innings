import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo(() => ({ session, user: session?.user ?? null, loading, configured: Boolean(supabase) }), [session, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

