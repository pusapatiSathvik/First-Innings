import { useEffect, useState } from 'react'
import { ClipboardList, LogOut, Shield, ShieldCheck, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/useAuth'
import { supabase } from '../lib/supabase'

export function DashboardPage() {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const navigate = useNavigate()
  useEffect(() => { if(!user) return; supabase.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle().then(({data})=>setIsAdmin(Boolean(data))) }, [user])
  async function logout() {
    setBusy(true); setError('')
    const { error: authError } = await supabase.auth.signOut()
    if (authError) { setError(authError.message); setBusy(false) } else navigate('/', { replace: true })
  }
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Player'
  return <div className="min-h-screen bg-ink text-white"><header className="border-b border-white/10"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8"><Brand/><button onClick={logout} disabled={busy} className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/5 disabled:opacity-50"><LogOut size={16}/>{busy?'Signing out…':'Log out'}</button></div></header><main className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><div className="text-sm font-bold uppercase tracking-[.18em] text-lime">Your account</div><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Good to have you here, {name}.</h1><p className="mt-3 max-w-xl text-muted">Manage your tournament registration and team roster from here.</p>{error&&<div role="alert" className="mt-5 text-rose-200">{error}</div>}<section className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2"><Link to="/tournaments" className="rounded-2xl border border-white/10 bg-white/[.03] p-5 transition hover:border-lime/30"><ClipboardList className="text-lime" size={22}/><h2 className="mt-4 font-extrabold">Browse tournaments</h2><p className="mt-1 text-sm text-muted">Find registration that is open and register a team.</p></Link><Link to="/teams" className="rounded-2xl border border-white/10 bg-white/[.03] p-5 transition hover:border-lime/30"><Users className="text-lime" size={22}/><h2 className="mt-4 font-extrabold">My teams</h2><p className="mt-1 text-sm text-muted">Manage invitations, member requests, and roster locks.</p></Link>{isAdmin&&<Link to="/admin" className="rounded-2xl border border-lime/20 bg-lime/5 p-5 transition hover:border-lime/40"><Shield className="text-lime" size={22}/><h2 className="mt-4 font-extrabold">Tournament administration</h2><p className="mt-1 text-sm text-muted">Manage tournaments, teams, fixtures, and the match board.</p></Link>}</section><section className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[.03] p-6"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><ShieldCheck size={21}/></div><div><h2 className="font-extrabold">Account security</h2><p className="mt-2 text-sm leading-6 text-muted">Signed in as <span className="text-slate-200">{user?.email}</span>. Your access is controlled by verified account roles in the database.</p></div></div></section></main></div>
}
